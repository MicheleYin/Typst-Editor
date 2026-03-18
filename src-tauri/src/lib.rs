use std::fs;
use std::io::copy;
use std::path::Path;
use std::path::PathBuf;

use chrono::Datelike;
use tauri::command;
use tauri::path::BaseDirectory;
#[cfg(desktop)]
use tauri::Emitter;
use tauri::Manager;
// Native app menus are desktop-only in Tauri (`cfg(desktop)`). iOS/iPadOS builds omit
// `set_menu` / `on_menu_event`; use web shortcuts + in-app UI on iPad for the same actions.
#[cfg(desktop)]
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use typst::diag::{FileError, FileResult, SourceDiagnostic};
use typst::foundations::{Bytes, Datetime};
use typst::layout::PagedDocument;
use typst::syntax::{FileId, Source, Span, VirtualPath};
use typst::text::{Font, FontBook};
use typst::utils::LazyHash;
use typst::{Library, LibraryExt, World, WorldExt};
use typst_pdf::{pdf, PdfOptions};
use typst_kit::download::{Downloader, ProgressSink};
use typst_kit::package::PackageStorage;

/// Subfolder under the app cache directory (sandbox-safe on App Store).
const TYPST_PACKAGES_CACHE_DIR: &str = "typst-packages";

const FONT_CONFIG_FILE: &str = "typst-editor-fonts.json";
/// Copied user fonts (App Store sandbox–safe).
const FONT_USER_IMPORT_SUBDIR: &str = "typst-editor-fonts/imported";
/// Shipped via `bundle.resources` (see `tauri.conf.json`); resolved under `resource_dir`.
const APP_BUNDLED_FONTS_RESOURCE: &str = "resources/fonts/bundled";

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct TypstFontConfig {
    /// Legacy; migrated into `files` under app storage. Always empty after migration.
    #[serde(default)]
    directories: Vec<String>,
    /// Font files under `app_local_data/.../imported/` (absolute paths in container).
    #[serde(default)]
    files: Vec<String>,
}

fn font_config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|p| p.join(FONT_CONFIG_FILE))
        .map_err(|e| e.to_string())
}

fn load_typst_font_config(app: &tauri::AppHandle) -> TypstFontConfig {
    let Ok(path) = font_config_path(app) else {
        return TypstFontConfig::default();
    };
    let Ok(s) = fs::read_to_string(&path) else {
        return TypstFontConfig::default();
    };
    serde_json::from_str(&s).unwrap_or_default()
}

fn save_typst_font_config(app: &tauri::AppHandle, c: &TypstFontConfig) -> Result<(), String> {
    let path = font_config_path(app)?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    fs::write(
        &path,
        serde_json::to_string_pretty(c).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}

fn is_font_extension(p: &Path) -> bool {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| matches!(e.to_ascii_lowercase().as_str(), "ttf" | "otf" | "ttc" | "otc"))
        .unwrap_or(false)
}

fn walk_font_files(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(rd) = fs::read_dir(dir) else {
        return;
    };
    for entry in rd.flatten() {
        let p = entry.path();
        if p.is_dir() {
            walk_font_files(&p, out);
        } else if is_font_extension(&p) {
            out.push(p);
        }
    }
}

/// Fonts from `typst-assets` (New Computer Modern, etc.).
fn bundled_typst_font_faces() -> Vec<Font> {
    typst_assets::fonts()
        .filter_map(|data| Font::new(Bytes::new(data.to_vec()), 0))
        .collect()
}

fn user_font_import_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map(|p| p.join(FONT_USER_IMPORT_SUBDIR))
        .map_err(|e| e.to_string())
}

fn app_bundled_fonts_resource_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    let d = app
        .path()
        .resolve(APP_BUNDLED_FONTS_RESOURCE, BaseDirectory::Resource)
        .ok()?;
    d.is_dir().then_some(d)
}

fn unique_dest_in_dir(dir: &Path, orig_name: &str) -> Result<PathBuf, String> {
    let candidate = dir.join(orig_name);
    if !candidate.exists() {
        return Ok(candidate);
    }
    let path = Path::new(orig_name);
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("font");
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("ttf");
    for i in 1u32..10_000 {
        let cand = dir.join(format!("{stem}_{i}.{ext}"));
        if !cand.exists() {
            return Ok(cand);
        }
    }
    Err("could not pick unique font file name".into())
}

fn copy_font_into_user_storage(src: &Path, import_dir: &Path) -> Result<PathBuf, String> {
    let name = src
        .file_name()
        .ok_or_else(|| "font path has no file name".to_string())?;
    let dest = unique_dest_in_dir(import_dir, &name.to_string_lossy())?;
    fs::copy(src, &dest).map_err(|e| format!("copy font: {e}"))?;
    Ok(dest)
}

/// One-time / upgrade migration: copy fonts from arbitrary paths into app local data.
fn migrate_font_config_to_local_storage(app: &tauri::AppHandle) -> Result<(), String> {
    let import_dir = user_font_import_dir(app)?;
    fs::create_dir_all(&import_dir).map_err(|e| e.to_string())?;
    let import_canon = fs::canonicalize(&import_dir).unwrap_or_else(|_| import_dir.clone());

    let mut config = load_typst_font_config(app);
    let needs_migrate = !config.directories.is_empty()
        || config.files.iter().any(|f| {
            let p = PathBuf::from(f);
            if !p.is_file() || !is_font_extension(&p) {
                return false;
            }
            fs::canonicalize(&p)
                .map(|c| !c.starts_with(&import_canon))
                .unwrap_or(true)
        });

    if !needs_migrate {
        config.files.retain(|f| {
            let p = PathBuf::from(f);
            p.is_file() && is_font_extension(&p)
        });
        config.directories.clear();
        save_typst_font_config(app, &config)?;
        return Ok(());
    }

    let mut new_files: Vec<String> = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for f in &config.files {
        let p = PathBuf::from(f);
        if !p.is_file() || !is_font_extension(&p) {
            continue;
        }
        let dest = match fs::canonicalize(&p) {
            Ok(c) if c.starts_with(&import_canon) => c,
            _ => copy_font_into_user_storage(&p, &import_dir)?,
        };
        let ds = dest.to_string_lossy().into_owned();
        if seen.insert(ds.clone()) {
            new_files.push(ds);
        }
    }
    for d in &config.directories {
        let base = PathBuf::from(d);
        if !base.is_dir() {
            continue;
        }
        let mut found = Vec::new();
        walk_font_files(&base, &mut found);
        for p in found {
            if let Ok(dest) = copy_font_into_user_storage(&p, &import_dir) {
                let ds = dest.to_string_lossy().into_owned();
                if seen.insert(ds.clone()) {
                    new_files.push(ds);
                }
            }
        }
    }

    new_files.sort();
    new_files.dedup();
    config.files = new_files;
    config.directories.clear();
    save_typst_font_config(app, &config)?;
    Ok(())
}

fn collect_app_bundle_font_paths(app: &tauri::AppHandle) -> Vec<PathBuf> {
    let Some(dir) = app_bundled_fonts_resource_dir(app) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    walk_font_files(&dir, &mut out);
    out.sort();
    out.dedup();
    out
}

/// Load every face from font files on disk.
fn fonts_from_paths(paths: &[PathBuf]) -> Vec<(PathBuf, Font)> {
    let mut v = Vec::new();
    for path in paths {
        let Ok(bytes) = fs::read(path) else {
            eprintln!("typst-editor: could not read font {:?}", path);
            continue;
        };
        for font in Font::iter(Bytes::new(bytes)) {
            v.push((path.clone(), font));
        }
    }
    v
}

fn collect_imported_font_paths(config: &TypstFontConfig) -> Vec<PathBuf> {
    let mut paths: Vec<PathBuf> = config
        .files
        .iter()
        .map(PathBuf::from)
        .filter(|p| p.is_file() && is_font_extension(p))
        .collect();
    paths.sort();
    paths.dedup();
    paths
}

/// typst-assets → app `resources/fonts/bundled` → user imports (local data).
fn all_world_fonts(app: &tauri::AppHandle) -> Vec<Font> {
    let mut fonts: Vec<Font> = bundled_typst_font_faces();
    let n_typst = fonts.len();
    let app_paths = collect_app_bundle_font_paths(app);
    let app_pairs = fonts_from_paths(&app_paths);
    let n_app = app_pairs.len();
    fonts.extend(app_pairs.into_iter().map(|(_, f)| f));
    let config = load_typst_font_config(app);
    let user_paths = collect_imported_font_paths(&config);
    let user = fonts_from_paths(&user_paths);
    let n_user = user.len();
    fonts.extend(user.into_iter().map(|(_, f)| f));
    eprintln!("typst-editor: {n_typst} typst-assets + {n_app} app-bundled + {n_user} imported faces");
    fonts
}

fn typst_package_cache_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_cache_dir()
        .map(|p| p.join(TYPST_PACKAGES_CACHE_DIR))
        .map_err(|e| e.to_string())
}

fn ensure_typst_package_cache(app: &tauri::AppHandle) -> PathBuf {
    match typst_package_cache_root(app) {
        Ok(p) => {
            let _ = fs::create_dir_all(&p);
            p
        }
        Err(e) => {
            eprintln!("typst-editor: app cache dir unavailable ({e}), using temp dir");
            let p = std::env::temp_dir().join("typst-editor-typst-packages");
            let _ = fs::create_dir_all(&p);
            p
        }
    }
}

fn dir_disk_usage(path: &Path) -> std::io::Result<(u64, u32)> {
    let mut size = 0u64;
    let mut files = 0u32;
    if !path.exists() {
        return Ok((0, 0));
    }
    fn walk(path: &Path, size: &mut u64, files: &mut u32) -> std::io::Result<()> {
        for entry in fs::read_dir(path)? {
            let entry = entry?;
            let ty = entry.file_type()?;
            if ty.is_dir() {
                walk(&entry.path(), size, files)?;
            } else if ty.is_file() {
                *files += 1;
                *size += entry.metadata()?.len();
            }
        }
        Ok(())
    }
    walk(path, &mut size, &mut files)?;
    Ok((size, files))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct PackageCacheInfo {
    path: String,
    size_bytes: u64,
    file_count: u32,
    location_note: String,
}

#[command]
fn get_typst_package_cache_info(app: tauri::AppHandle) -> Result<PackageCacheInfo, String> {
    let root = typst_package_cache_root(&app)?;
    let (size_bytes, file_count) = dir_disk_usage(&root).map_err(|e| e.to_string())?;
    Ok(PackageCacheInfo {
        path: root.to_string_lossy().into_owned(),
        size_bytes,
        file_count,
        location_note: "App cache directory (sandbox container when distributed via App Store).".into(),
    })
}

#[command]
fn clear_typst_package_cache(app: tauri::AppHandle) -> Result<(), String> {
    let root = typst_package_cache_root(&app)?;
    if root.exists() {
        fs::remove_dir_all(&root).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    Ok(())
}

struct EditorWorld {
    library: LazyHash<Library>,
    book: LazyHash<FontBook>,
    fonts: Vec<Font>,
    main_source: Source,
    /// Parent directory of the saved main file (for local `#import "…"` and assets).
    project_root: Option<PathBuf>,
    package_storage: PackageStorage,
}

impl EditorWorld {
    fn new(content: String, main_path: Option<String>, package_cache: PathBuf, fonts: Vec<Font>) -> Self {

        let (main_source, project_root) = match main_path {
            Some(ref p) if !p.is_empty() => {
                let path = PathBuf::from(p);
                if let Some(parent) = path.parent().filter(|x| !x.as_os_str().is_empty()) {
                    if let Some(vp) = VirtualPath::within_root(&path, parent) {
                        let id = FileId::new(None, vp);
                        (Source::new(id, content), Some(parent.to_path_buf()))
                    } else {
                        (Source::detached(content), None)
                    }
                } else {
                    (Source::detached(content), None)
                }
            }
            _ => (Source::detached(content), None),
        };

        let package_storage = PackageStorage::new(
            Some(package_cache),
            None,
            Downloader::new("typst-editor/0.1 (Typst packages.typst.org)"),
        );

        Self {
            library: LazyHash::new(Library::default()),
            book: LazyHash::new(FontBook::from_fonts(&fonts)),
            fonts,
            main_source,
            project_root,
            package_storage,
        }
    }

    fn resolve_path(&self, id: FileId) -> FileResult<PathBuf> {
        if let Some(spec) = id.package() {
            let base = self
                .package_storage
                .prepare_package(spec, &mut ProgressSink)?;
            id.vpath()
                .resolve(&base)
                .ok_or_else(|| FileError::NotFound(base.join(id.vpath().as_rootless_path())))
        } else if let Some(root) = &self.project_root {
            id.vpath()
                .resolve(root)
                .ok_or_else(|| FileError::NotFound(root.join(id.vpath().as_rootless_path())))
        } else {
            Err(FileError::NotFound(id.vpath().as_rootless_path().to_path_buf()))
        }
    }
}

impl World for EditorWorld {
    fn library(&self) -> &LazyHash<Library> {
        &self.library
    }

    fn book(&self) -> &LazyHash<FontBook> {
        &self.book
    }

    fn main(&self) -> FileId {
        self.main_source.id()
    }

    fn source(&self, id: FileId) -> FileResult<Source> {
        if id == self.main_source.id() {
            return Ok(self.main_source.clone());
        }
        let path = self.resolve_path(id)?;
        let text = std::fs::read_to_string(&path).map_err(|e| FileError::from_io(e, &path))?;
        Ok(Source::new(id, text))
    }

    fn font(&self, index: usize) -> Option<Font> {
        self.fonts.get(index).cloned()
    }

    fn file(&self, id: FileId) -> FileResult<Bytes> {
        if id == self.main_source.id() {
            return Err(FileError::NotSource);
        }
        let path = self.resolve_path(id)?;
        let data = std::fs::read(&path).map_err(|e| FileError::from_io(e, &path))?;
        Ok(Bytes::new(data))
    }

    fn today(&self, offset: Option<i64>) -> Option<Datetime> {
        let now = chrono::Local::now();
        let offset = offset.unwrap_or(0);
        let date = now + chrono::Duration::hours(offset);
        Datetime::from_ymd(
            date.year(),
            date.month() as u8,
            date.day() as u8,
        )
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct CompileTraceEntry {
    message: String,
    line: Option<u32>,
    column: Option<u32>,
    file: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct CompileDiagnosticJson {
    file: Option<String>,
    line: Option<u32>,
    column: Option<u32>,
    message: String,
    hints: Vec<String>,
    trace: Vec<CompileTraceEntry>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct CompileResponse {
    success: bool,
    pages: Vec<String>,
    page_count: usize,
    diagnostics: Vec<CompileDiagnosticJson>,
}

fn span_location(world: &EditorWorld, span: Span) -> (Option<String>, Option<u32>, Option<u32>) {
    if span.is_detached() {
        return (None, None, None);
    }
    let Some(fid) = span.id() else {
        return (None, None, None);
    };
    let file = Some(
        fid.vpath()
            .as_rootless_path()
            .display()
            .to_string(),
    );
    let Ok(src) = world.source(fid) else {
        return (file, None, None);
    };
    let Some(range) = world.range(span) else {
        return (file, None, None);
    };
    let Some((line0, col0)) = src.lines().byte_to_line_column(range.start) else {
        return (file, None, None);
    };
    (
        file,
        Some(line0 as u32 + 1),
        Some(col0 as u32 + 1),
    )
}

fn diagnostic_to_json(world: &EditorWorld, d: &SourceDiagnostic) -> CompileDiagnosticJson {
    let (file, line, column) = span_location(world, d.span);
    let hints: Vec<String> = d.hints.iter().map(|h| h.to_string()).collect();
    let trace: Vec<CompileTraceEntry> = d
        .trace
        .iter()
        .map(|t| {
            let (f, l, c) = span_location(world, t.span);
            CompileTraceEntry {
                message: t.v.to_string(),
                line: l,
                column: c,
                file: f,
            }
        })
        .collect();
    CompileDiagnosticJson {
        file,
        line,
        column,
        message: d.message.to_string(),
        hints,
        trace,
    }
}

/// Rich compile result: on failure, `diagnostics` is filled; `pages` stay empty.
/// `main_path`: absolute path to the saved `.typ` file when known; enables local imports
/// and image paths. Online `@preview/...` packages work with or without `main_path`.
#[command]
fn compile_typst(app: tauri::AppHandle, content: String, main_path: Option<String>) -> CompileResponse {
    let package_cache = ensure_typst_package_cache(&app);
    let fonts = all_world_fonts(&app);
    let world = EditorWorld::new(content, main_path, package_cache, fonts);
    let warned = typst::compile::<PagedDocument>(&world);
    match warned.output {
        Ok(document) => {
            let pages: Vec<String> = document
                .pages
                .iter()
                .map(|page| typst_svg::svg(page))
                .collect();
            let page_count = pages.len();
            CompileResponse {
                success: true,
                pages,
                page_count,
                diagnostics: vec![],
            }
        }
        Err(errs) => {
            let diagnostics: Vec<_> = errs
                .iter()
                .map(|e| diagnostic_to_json(&world, e))
                .collect();
            CompileResponse {
                success: false,
                pages: vec![],
                page_count: 0,
                diagnostics,
            }
        }
    }
}

/// Compile current document to PDF and write bytes to `output_path`.
#[command]
fn export_typst_pdf(
    app: tauri::AppHandle,
    content: String,
    main_path: Option<String>,
    output_path: String,
) -> Result<(), String> {
    let package_cache = ensure_typst_package_cache(&app);
    let fonts = all_world_fonts(&app);
    let world = EditorWorld::new(content, main_path, package_cache, fonts);
    let warned = typst::compile::<PagedDocument>(&world);
    let document = match warned.output {
        Ok(doc) => doc,
        Err(errs) => {
            let msg = errs
                .iter()
                .map(|e| diagnostic_to_json(&world, e).message)
                .collect::<Vec<_>>()
                .join("\n");
            return Err(if msg.is_empty() {
                "Compilation failed.".into()
            } else {
                msg
            });
        }
    };
    let bytes = pdf(&document, &PdfOptions::default()).map_err(|errs| {
        errs
            .iter()
            .map(|e| e.message.to_string())
            .collect::<Vec<_>>()
            .join("\n")
    })?;
    let out = PathBuf::from(output_path);
    if let Some(parent) = out.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    fs::write(&out, bytes).map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct TypstFontFaceJson {
    family: String,
    variant: String,
    source_path: Option<String>,
    /// New Computer Modern etc. from `typst-assets` (no disk path).
    bundled_typst: bool,
    /// From `bundle.resources` → `fonts/bundled`.
    bundled_app: bool,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct TypstFontStorageInfo {
    imported_dir: String,
    /// Resolved resource path when present (dev may be missing if folder empty).
    app_bundled_fonts_dir: Option<String>,
}

#[command]
fn get_typst_font_storage_info(app: tauri::AppHandle) -> Result<TypstFontStorageInfo, String> {
    Ok(TypstFontStorageInfo {
        imported_dir: user_font_import_dir(&app)?.to_string_lossy().into_owned(),
        app_bundled_fonts_dir: app_bundled_fonts_resource_dir(&app)
            .map(|p| p.to_string_lossy().into_owned()),
    })
}

#[command]
fn list_typst_font_faces(app: tauri::AppHandle) -> Result<Vec<TypstFontFaceJson>, String> {
    let config = load_typst_font_config(&app);
    let user_paths = collect_imported_font_paths(&config);
    let user_pairs = fonts_from_paths(&user_paths);
    let app_paths = collect_app_bundle_font_paths(&app);
    let app_pairs = fonts_from_paths(&app_paths);
    let mut out: Vec<TypstFontFaceJson> = Vec::new();
    for f in bundled_typst_font_faces() {
        let info = f.info();
        out.push(TypstFontFaceJson {
            family: info.family.as_str().to_string(),
            variant: format!("{:?}", info.variant),
            source_path: None,
            bundled_typst: true,
            bundled_app: false,
        });
    }
    for (path, f) in app_pairs {
        let info = f.info();
        out.push(TypstFontFaceJson {
            family: info.family.as_str().to_string(),
            variant: format!("{:?}", info.variant),
            source_path: Some(path.to_string_lossy().into_owned()),
            bundled_typst: false,
            bundled_app: true,
        });
    }
    for (path, f) in user_pairs {
        let info = f.info();
        out.push(TypstFontFaceJson {
            family: info.family.as_str().to_string(),
            variant: format!("{:?}", info.variant),
            source_path: Some(path.to_string_lossy().into_owned()),
            bundled_typst: false,
            bundled_app: false,
        });
    }
    Ok(out)
}

#[command]
fn get_typst_font_config(app: tauri::AppHandle) -> Result<TypstFontConfig, String> {
    Ok(load_typst_font_config(&app))
}

#[command]
fn set_typst_font_config(app: tauri::AppHandle, config: TypstFontConfig) -> Result<(), String> {
    let import_dir = user_font_import_dir(&app)?;
    let import_canon = fs::canonicalize(&import_dir).unwrap_or(import_dir);
    let mut sanitized = TypstFontConfig::default();
    for f in config.files {
        let p = PathBuf::from(&f);
        if !p.is_file() || !is_font_extension(&p) {
            continue;
        }
        if let Ok(c) = fs::canonicalize(&p) {
            if c.starts_with(&import_canon) {
                sanitized.files.push(f);
            }
        }
    }
    save_typst_font_config(&app, &sanitized)
}

#[command]
fn add_typst_fonts_import(
    app: tauri::AppHandle,
    paths: Vec<String>,
    from_folder: bool,
) -> Result<TypstFontConfig, String> {
    let import_dir = user_font_import_dir(&app)?;
    fs::create_dir_all(&import_dir).map_err(|e| e.to_string())?;
    let import_canon = fs::canonicalize(&import_dir).unwrap_or_else(|_| import_dir.clone());
    let mut config = load_typst_font_config(&app);

    if from_folder {
        for dir in paths {
            let p = PathBuf::from(&dir);
            if !p.is_dir() {
                continue;
            }
            let mut found = Vec::new();
            walk_font_files(&p, &mut found);
            for f in found {
                if let Ok(dest) = copy_font_into_user_storage(&f, &import_dir) {
                    let ds = dest.to_string_lossy().into_owned();
                    if !config.files.contains(&ds) {
                        config.files.push(ds);
                    }
                }
            }
        }
    } else {
        for f in paths {
            let p = PathBuf::from(&f);
            if !p.is_file() || !is_font_extension(&p) {
                continue;
            }
            let ds = if fs::canonicalize(&p)
                .map(|c| c.starts_with(&import_canon))
                .unwrap_or(false)
            {
                fs::canonicalize(&p)
                    .map(|c| c.to_string_lossy().into_owned())
                    .unwrap_or_else(|_| p.to_string_lossy().into_owned())
            } else {
                copy_font_into_user_storage(&p, &import_dir)?
                    .to_string_lossy()
                    .into_owned()
            };
            if !config.files.contains(&ds) {
                config.files.push(ds);
            }
        }
    }
    config.directories.clear();
    config.files.sort();
    config.files.dedup();
    save_typst_font_config(&app, &config)?;
    Ok(config)
}

#[command]
fn remove_typst_imported_font(app: tauri::AppHandle, path: String) -> Result<TypstFontConfig, String> {
    let import_dir = user_font_import_dir(&app)?;
    let import_canon = fs::canonicalize(&import_dir).map_err(|e| e.to_string())?;
    let p = PathBuf::from(&path);
    let canon = fs::canonicalize(&p).map_err(|e| e.to_string())?;
    if !canon.starts_with(&import_canon) {
        return Err("path is not under the app font import folder".into());
    }
    let _ = fs::remove_file(&canon);
    let mut config = load_typst_font_config(&app);
    config.files.retain(|f| {
        fs::canonicalize(f)
            .map(|c| c != canon)
            .unwrap_or(true)
    });
    save_typst_font_config(&app, &config)?;
    Ok(config)
}

#[command]
fn import_typst_font_config_json(app: tauri::AppHandle, json_path: String) -> Result<TypstFontConfig, String> {
    let s = fs::read_to_string(&json_path).map_err(|e| e.to_string())?;
    let imported: TypstFontConfig = serde_json::from_str(&s).map_err(|e| e.to_string())?;
    let import_dir = user_font_import_dir(&app)?;
    fs::create_dir_all(&import_dir).map_err(|e| e.to_string())?;
    let import_canon = fs::canonicalize(&import_dir).unwrap_or_else(|_| import_dir.clone());
    let mut cur = load_typst_font_config(&app);

    for d in imported.directories {
        let base = PathBuf::from(&d);
        if !base.is_dir() {
            continue;
        }
        let mut found = Vec::new();
        walk_font_files(&base, &mut found);
        for p in found {
            if let Ok(dest) = copy_font_into_user_storage(&p, &import_dir) {
                let ds = dest.to_string_lossy().into_owned();
                if !cur.files.contains(&ds) {
                    cur.files.push(ds);
                }
            }
        }
    }
    for f in imported.files {
        let p = PathBuf::from(&f);
        if !p.is_file() || !is_font_extension(&p) {
            continue;
        }
        let ds = if fs::canonicalize(&p)
            .map(|c| c.starts_with(&import_canon))
            .unwrap_or(false)
        {
            fs::canonicalize(&p)
                .map(|c| c.to_string_lossy().into_owned())
                .unwrap_or_else(|_| p.to_string_lossy().into_owned())
        } else if let Ok(dest) = copy_font_into_user_storage(&p, &import_dir) {
            dest.to_string_lossy().into_owned()
        } else {
            continue;
        };
        if !cur.files.contains(&ds) {
            cur.files.push(ds);
        }
    }
    cur.directories.clear();
    cur.files.sort();
    cur.files.dedup();
    save_typst_font_config(&app, &cur)?;
    Ok(cur)
}

/// Linked Typst compiler version from Cargo.lock (see `build.rs`).
#[command]
fn typst_engine_version() -> String {
    env!("TYPST_ENGINE_VERSION").to_string()
}

/// When false, the web layer should show an in-app menu (iOS / Android).
#[command]
fn app_has_native_menu() -> bool {
    cfg!(desktop)
}

/// iOS uses a project-based file UI; everything else uses desktop open/save/folder.
#[command]
fn app_file_ui_mode() -> &'static str {
    #[cfg(target_os = "ios")]
    {
        "ios-projects"
    }
    #[cfg(not(target_os = "ios"))]
    {
        "desktop"
    }
}

/// On iOS, the app sandbox Documents directory (Files app → On My iPhone → app).
/// Ensures the directory exists. Returns `None` on other platforms.
#[command]
fn workspace_documents_dir(app: tauri::AppHandle) -> Result<Option<String>, String> {
    #[cfg(target_os = "ios")]
    {
        let p = app
            .path()
            .document_dir()
            .map_err(|e| e.to_string())?;
        fs::create_dir_all(&p).map_err(|e| e.to_string())?;
        Ok(Some(p.to_string_lossy().into_owned()))
    }
    #[cfg(not(target_os = "ios"))]
    {
        Ok(None)
    }
}

#[cfg(target_os = "ios")]
fn validate_ios_project_folder_id(id: &str) -> Result<(), String> {
    if id.is_empty() || id.len() > 200 {
        return Err("Invalid project folder.".into());
    }
    if id.contains("..") || id.contains('/') || id.contains('\\') {
        return Err("Invalid project folder.".into());
    }
    Ok(())
}

#[cfg(target_os = "ios")]
fn zip_project_directory(project_dir: &Path, output_path: &Path) -> Result<(), String> {
    let out_file = fs::File::create(output_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(out_file);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    let out_canon = fs::canonicalize(output_path).map_err(|e| e.to_string())?;

    fn add_dir(
        zip: &mut zip::ZipWriter<fs::File>,
        project_root: &Path,
        dir: &Path,
        options: zip::write::SimpleFileOptions,
        out_canon: &Path,
    ) -> Result<(), String> {
        for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.is_dir() {
                add_dir(zip, project_root, &path, options, out_canon)?;
            } else if path.is_file() {
                if let Ok(c) = fs::canonicalize(&path) {
                    if c == *out_canon {
                        continue;
                    }
                }
                let rel = path
                    .strip_prefix(project_root)
                    .map_err(|e| e.to_string())?;
                let name = rel.to_string_lossy().replace('\\', "/");
                if name.is_empty() {
                    continue;
                }
                zip.start_file(name, options)
                    .map_err(|e| e.to_string())?;
                let mut f = fs::File::open(&path).map_err(|e| e.to_string())?;
                std::io::copy(&mut f, zip).map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    }

    add_dir(&mut zip, project_dir, project_dir, options, &out_canon)?;
    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

/// Zip all files under `Documents/Projects/<folderId>/` (iOS only).
#[command]
fn export_ios_project_zip(
    app: tauri::AppHandle,
    folder_id: String,
    output_path: String,
) -> Result<(), String> {
    #[cfg(target_os = "ios")]
    {
        validate_ios_project_folder_id(&folder_id)?;
        let doc = app
            .path()
            .document_dir()
            .map_err(|e| e.to_string())?;
        let project = doc.join("Projects").join(&folder_id);
        if !project.is_dir() {
            return Err("Project folder not found.".into());
        }
        let out = PathBuf::from(output_path.trim());
        if out.as_os_str().is_empty() {
            return Err("Invalid export path.".into());
        }
        zip_project_directory(&project, &out)
    }
    #[cfg(not(target_os = "ios"))]
    {
        let _ = (app, folder_id, output_path);
        Err("Export project is only available in the iOS app.".into())
    }
}

/// Folder name = title with only path-forbidden characters removed (spaces & casing kept).
#[cfg(target_os = "ios")]
fn project_folder_name_from_title(title: &str) -> String {
    let t = title.trim();
    let s: String = t
        .chars()
        .filter(|c| {
            !matches!(c, '/' | '\\' | ':' | '\0' | '*' | '?' | '"' | '<' | '>' | '|')
                && !c.is_control()
        })
        .collect();
    let s = s.trim();
    if s.is_empty() {
        return "Untitled".to_string();
    }
    let s: String = s.chars().take(200).collect();
    if s.is_empty() {
        "Untitled".into()
    } else {
        s
    }
}

#[cfg(target_os = "ios")]
fn projects_dir_has_folder_ci(
    projects: &Path,
    name_lower: &str,
    exclude_name_ci_equal: Option<&str>,
) -> bool {
    let Ok(rd) = fs::read_dir(projects) else {
        return false;
    };
    for e in rd.flatten() {
        if !e.path().is_dir() {
            continue;
        }
        let n = e.file_name().to_string_lossy().into_owned();
        let nl = n.to_lowercase();
        if exclude_name_ci_equal.is_some_and(|ex| ex.to_lowercase() == nl) {
            continue;
        }
        if nl == name_lower {
            return true;
        }
    }
    false
}

#[cfg(target_os = "ios")]
const IMPORT_SKIP_DIR_NAMES: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    ".svn",
    "__pycache__",
];

#[cfg(target_os = "ios")]
fn copy_ios_import_tree(src: &Path, dst_base: &Path, src_root: &Path) -> Result<(), String> {
    for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let src_path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if src_path.is_dir() && IMPORT_SKIP_DIR_NAMES.iter().any(|s| *s == name.as_str()) {
            continue;
        }
        let rel = src_path
            .strip_prefix(src_root)
            .map_err(|e| e.to_string())?;
        let dst_path = dst_base.join(rel);
        if src_path.is_dir() {
            fs::create_dir_all(&dst_path).map_err(|e| e.to_string())?;
            copy_ios_import_tree(&src_path, dst_base, src_root)?;
        } else if src_path.is_file() {
            if let Some(p) = dst_path.parent() {
                fs::create_dir_all(p).map_err(|e| e.to_string())?;
            }
            fs::copy(&src_path, &dst_path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[cfg(target_os = "ios")]
fn ios_import_project_conflicts(
    doc: &Path,
    folder_name: &str,
    title_lower: &str,
) -> Result<Option<String>, String> {
    let projects = doc.join("Projects");
    if projects_dir_has_folder_ci(&projects, &folder_name.to_lowercase(), None) {
        return Ok(Some(format!(
            "A folder named \"{folder_name}\" already exists. Use a different title."
        )));
    }
    if projects.is_dir() {
        for e in fs::read_dir(&projects).map_err(|e| e.to_string())? {
            let p = e.map_err(|e| e.to_string())?.path();
            if !p.is_dir() {
                continue;
            }
            let meta = p.join(".typst-editor-project.json");
            if let Ok(s) = fs::read_to_string(&meta) {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(&s) {
                    if let Some(t) = v.get("title").and_then(|x| x.as_str()) {
                        if t.trim().to_lowercase() == title_lower {
                            return Ok(Some(
                                "A project with this name already exists.".into(),
                            ));
                        }
                    }
                }
            }
        }
    }
    Ok(None)
}

/// iOS document picker returns `file:///...` URLs; Rust must map them to paths before `open()`.
#[cfg(target_os = "ios")]
fn ios_path_from_document_picker(raw: &str) -> Result<PathBuf, String> {
    let raw = raw.trim();
    if raw.is_empty() {
        return Err("Empty path.".into());
    }
    let path = if raw.starts_with("file:") {
        let url = url::Url::parse(raw).map_err(|e| format!("Invalid file URL: {e}"))?;
        url.to_file_path().map_err(|_| {
            String::from("Could not resolve filesystem path from picked file.")
        })?
    } else {
        PathBuf::from(raw)
    };
    match fs::canonicalize(&path) {
        Ok(p) => Ok(p),
        Err(_) if path.is_file() || path.is_dir() => Ok(path),
        Err(e) => Err(format!("Could not access path: {e}")),
    }
}

/// Copy a user-picked folder into `Documents/Projects/<folder name>/` as a new project (iOS only).
#[command]
fn import_ios_project_from_folder(
    app: tauri::AppHandle,
    source_path: String,
    title: String,
) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "ios")]
    {
        let raw = source_path.trim();
        if raw.is_empty() {
            return Err("No folder selected.".into());
        }
        let source = ios_path_from_document_picker(raw)?;
        if !source.is_dir() {
            return Err("Please choose a folder.".into());
        }
        let title_owned = {
            let t = title.trim();
            if t.is_empty() {
                "Untitled".to_string()
            } else {
                t.to_string()
            }
        };
        let folder_name = project_folder_name_from_title(&title_owned);
        let doc = app
            .path()
            .document_dir()
            .map_err(|e| e.to_string())?;
        fs::create_dir_all(doc.join("Projects")).map_err(|e| e.to_string())?;
        if let Some(msg) =
            ios_import_project_conflicts(&doc, &folder_name, &title_owned.to_lowercase())?
        {
            return Err(msg);
        }
        let dest = doc.join("Projects").join(&folder_name);
        fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
        let copy_result = copy_ios_import_tree(&source, &dest, &source);
        if let Err(e) = copy_result {
            let _ = fs::remove_dir_all(&dest);
            return Err(format!("Copy failed: {e}"));
        }
        if !dest.join("main.typ").is_file() {
            fs::write(dest.join("main.typ"), [])
                .map_err(|e| format!("Could not add main.typ: {e}"))?;
        }
        let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        let meta = serde_json::json!({
            "version": 1,
            "title": title_owned,
            "createdAt": now,
            "updatedAt": now,
        });
        fs::write(
            dest.join(".typst-editor-project.json"),
            serde_json::to_string_pretty(&meta).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        Ok(serde_json::json!({
            "folderId": folder_name,
            "absPath": dest.to_string_lossy(),
        }))
    }
    #[cfg(not(target_os = "ios"))]
    {
        let _ = (app, source_path, title);
        Err("Folder import is only available in the iOS app.".into())
    }
}

#[cfg(target_os = "ios")]
fn ios_zip_strip_prefix(names: &[String]) -> usize {
    let trimmed: Vec<&str> = names
        .iter()
        .map(|s| s.trim().trim_start_matches('/').trim_end_matches('/'))
        .filter(|s| !s.is_empty())
        .collect();
    if trimmed.is_empty() {
        return 0;
    }
    let first = trimmed[0];
    let Some((root, _)) = first.split_once('/') else {
        return 0;
    };
    for n in &trimmed {
        if *n == root || n.starts_with(&format!("{root}/")) {
            continue;
        }
        return 0;
    }
    root.len() + 1
}

#[cfg(target_os = "ios")]
fn ios_zip_output_path(dest: &Path, rel: &str) -> Option<PathBuf> {
    let rel = rel.replace('\\', "/");
    let rel = rel.trim_matches('/');
    if rel.is_empty() {
        return None;
    }
    for p in rel.split('/') {
        if p.is_empty() || p == "." || p == ".." {
            return None;
        }
        if IMPORT_SKIP_DIR_NAMES.iter().any(|s| *s == p) {
            return None;
        }
    }
    Some(dest.join(rel))
}

/// Import a ZIP (e.g. from Files: long-press folder → Compress) into `Documents/Projects/<folder>/`.
/// iOS: Tauri does not support `directory: true` folder pickers on mobile; ZIP is the supported path.
#[command]
fn import_ios_project_from_zip(
    app: tauri::AppHandle,
    zip_path: String,
    title: String,
) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "ios")]
    {
        use zip::ZipArchive;

        let raw = zip_path.trim();
        if raw.is_empty() {
            return Err("No file selected.".into());
        }
        let zpath = ios_path_from_document_picker(raw)?;
        if !zpath.is_file() {
            return Err("Please choose a .zip file.".into());
        }
        let title_owned = {
            let t = title.trim();
            if t.is_empty() {
                "Untitled".to_string()
            } else {
                t.to_string()
            }
        };
        let folder_name = project_folder_name_from_title(&title_owned);
        let doc = app
            .path()
            .document_dir()
            .map_err(|e| e.to_string())?;
        fs::create_dir_all(doc.join("Projects")).map_err(|e| e.to_string())?;
        if let Some(msg) =
            ios_import_project_conflicts(&doc, &folder_name, &title_owned.to_lowercase())?
        {
            return Err(msg);
        }
        let dest = doc.join("Projects").join(&folder_name);

        let names: Vec<String> = {
            let file = fs::File::open(&zpath).map_err(|e| e.to_string())?;
            let mut archive = ZipArchive::new(file).map_err(|e| format!("Invalid ZIP: {e}"))?;
            (0..archive.len())
                .map(|i| {
                    archive
                        .by_index(i)
                        .map(|e| e.name().to_string())
                        .map_err(|e| e.to_string())
                })
                .collect::<Result<_, _>>()?
        };
        let strip = ios_zip_strip_prefix(&names);

        let file = fs::File::open(&zpath).map_err(|e| e.to_string())?;
        let mut archive = ZipArchive::new(file).map_err(|e| format!("Invalid ZIP: {e}"))?;
        fs::create_dir_all(&dest).map_err(|e| e.to_string())?;

        for i in 0..archive.len() {
            let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
            let raw_name = entry.name().to_string();
            let rel = if strip > 0 && raw_name.len() >= strip {
                raw_name[strip..].to_string()
            } else {
                raw_name.clone()
            };
            let rel = rel.trim_start_matches('/').to_string();
            let rel_trim = rel.trim_end_matches('/').to_string();
            if rel_trim.is_empty() {
                continue;
            }
            let is_dir = rel.ends_with('/') || entry.is_dir();
            let Some(out_path) = ios_zip_output_path(&dest, &rel_trim) else {
                continue;
            };
            if is_dir {
                fs::create_dir_all(&out_path).map_err(|e| format!("Extract failed: {e}"))?;
                continue;
            }
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent).map_err(|e| format!("Extract failed: {e}"))?;
            }
            let mut out_f = fs::File::create(&out_path).map_err(|e| format!("Extract failed: {e}"))?;
            copy(&mut entry, &mut out_f).map_err(|e| format!("Extract failed: {e}"))?;
        }

        if !dest.join("main.typ").is_file() {
            fs::write(dest.join("main.typ"), [])
                .map_err(|e| format!("Could not add main.typ: {e}"))?;
        }
        let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        let meta = serde_json::json!({
            "version": 1,
            "title": title_owned,
            "createdAt": now,
            "updatedAt": now,
        });
        fs::write(
            dest.join(".typst-editor-project.json"),
            serde_json::to_string_pretty(&meta).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        Ok(serde_json::json!({
            "folderId": folder_name,
            "absPath": dest.to_string_lossy(),
        }))
    }
    #[cfg(not(target_os = "ios"))]
    {
        let _ = (app, zip_path, title);
        Err("ZIP project import is only available in the iOS app.".into())
    }
}

/// Rename `Projects/<folderId>/` to match `new_title` folder name and update metadata (iOS only).
#[command]
fn rename_ios_project(
    app: tauri::AppHandle,
    folder_id: String,
    new_title: String,
) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "ios")]
    {
        let folder_id = folder_id.trim();
        if folder_id.is_empty()
            || folder_id.contains("..")
            || folder_id.contains('/')
            || folder_id.contains('\\')
        {
            return Err("Invalid project.".into());
        }
        let title_owned = {
            let t = new_title.trim();
            if t.is_empty() {
                "Untitled".to_string()
            } else {
                t.to_string()
            }
        };
        let new_name = project_folder_name_from_title(&title_owned);
        let doc = app
            .path()
            .document_dir()
            .map_err(|e| e.to_string())?;
        let projects_dir = doc.join("Projects");
        let old_path = projects_dir.join(folder_id);
        if !old_path.is_dir() {
            return Err("Project not found.".into());
        }

        let title_lower = title_owned.to_lowercase();
        if let Ok(rd) = fs::read_dir(&projects_dir) {
            for e in rd.flatten() {
                let p = e.path();
                if !p.is_dir() {
                    continue;
                }
                if p.file_name().and_then(|n| n.to_str()) == Some(folder_id) {
                    continue;
                }
                let meta = p.join(".typst-editor-project.json");
                if let Ok(s) = fs::read_to_string(&meta) {
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&s) {
                        if let Some(t) = v.get("title").and_then(|x| x.as_str()) {
                            if t.trim().to_lowercase() == title_lower {
                                return Err("A project with this name already exists.".into());
                            }
                        }
                    }
                }
            }
        }

        let project_dir = if folder_id == new_name.as_str() {
            old_path.clone()
        } else if folder_id.to_lowercase() == new_name.to_lowercase() {
            // Case-only change on case-insensitive volume: keep path, update title in meta
            old_path.clone()
        } else if projects_dir_has_folder_ci(
            &projects_dir,
            &new_name.to_lowercase(),
            Some(folder_id),
        ) {
            return Err(format!(
                "A folder named \"{new_name}\" already exists. Use a different title."
            ));
        } else {
            let new_path = projects_dir.join(&new_name);
            fs::rename(&old_path, &new_path)
                .map_err(|e| format!("Could not rename folder: {e}"))?;
            new_path
        };

        let out_folder_id = project_dir
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(new_name.as_str())
            .to_string();

        let meta_path = project_dir.join(".typst-editor-project.json");
        let meta_s = fs::read_to_string(&meta_path).map_err(|e| e.to_string())?;
        let mut m: serde_json::Value =
            serde_json::from_str(&meta_s).map_err(|e| e.to_string())?;
        if let Some(obj) = m.as_object_mut() {
            obj.insert(
                "title".into(),
                serde_json::Value::String(title_owned.clone()),
            );
            obj.insert(
                "updatedAt".into(),
                serde_json::Value::String(
                    chrono::Utc::now()
                        .to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
                ),
            );
        }
        fs::write(
            &meta_path,
            serde_json::to_string_pretty(&m).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;

        Ok(serde_json::json!({
            "folderId": out_folder_id,
            "absPath": project_dir.to_string_lossy(),
            "title": title_owned,
        }))
    }
    #[cfg(not(target_os = "ios"))]
    {
        let _ = (app, folder_id, new_title);
        Err("Rename project is only available in the iOS app.".into())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)] // `mut` only needed when `desktop` enables window-state plugin
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init());

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_window_state::Builder::default().build());
    }

    builder
        .setup(|app| {
            let handle = app.handle();
            if let Err(e) = migrate_font_config_to_local_storage(&handle) {
                eprintln!("typst-editor: font config migration: {e}");
            }
            #[cfg(desktop)]
            {
            let app_menu_title = handle.package_info().name.clone();

            // File Menu
            let new_file = MenuItem::with_id(handle, "file-new", "New File", true, Some("CmdOrCtrl+N"))?;
            let open_file = MenuItem::with_id(handle, "file-open", "Open File...", true, Some("CmdOrCtrl+O"))?;
            let open_folder = MenuItem::with_id(handle, "file-open-folder", "Open Folder...", true, Some("CmdOrCtrl+Shift+O"))?;
            let save_file = MenuItem::with_id(handle, "file-save", "Save", true, Some("CmdOrCtrl+S"))?;
            let save_as = MenuItem::with_id(handle, "file-save-as", "Save As...", true, Some("CmdOrCtrl+Shift+S"))?;
            let export_pdf = MenuItem::with_id(handle, "file-export-pdf", "Export PDF…", true, Some("CmdOrCtrl+Shift+E"))?;
            
            let file_menu = Submenu::with_items(
                handle,
                "File",
                true,
                &[
                    &new_file,
                    &open_file,
                    &open_folder,
                    &PredefinedMenuItem::separator(handle)?,
                    &save_file,
                    &save_as,
                    &PredefinedMenuItem::separator(handle)?,
                    &export_pdf,
                ],
            )?;

            // Edit Menu — Select All is custom so it reaches Monaco (native predefined does not in WKWebView).
            let edit_select_all =
                MenuItem::with_id(handle, "edit-select-all", "Select All", true, Some("CmdOrCtrl+A"))?;
            let edit_menu = Submenu::with_items(
                handle,
                "Edit",
                true,
                &[
                    &PredefinedMenuItem::undo(handle, None)?,
                    &PredefinedMenuItem::redo(handle, None)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::cut(handle, None)?,
                    &PredefinedMenuItem::copy(handle, None)?,
                    &PredefinedMenuItem::paste(handle, None)?,
                    &edit_select_all,
                ],
            )?;

            // View Menu
            let zoom_in = MenuItem::with_id(handle, "view-zoom-in", "Zoom In", true, Some("CmdOrCtrl+="))?;
            let zoom_out = MenuItem::with_id(handle, "view-zoom-out", "Zoom Out", true, Some("CmdOrCtrl+-"))?;
            let reset_zoom = MenuItem::with_id(handle, "view-reset-zoom", "Reset Zoom", true, Some("CmdOrCtrl+0"))?;
            let toggle_sidebar = MenuItem::with_id(handle, "view-toggle-sidebar", "Toggle Sidebar", true, Some("CmdOrCtrl+B"))?;

            let view_menu = Submenu::with_items(
                handle,
                "View",
                true,
                &[
                    &zoom_in,
                    &zoom_out,
                    &reset_zoom,
                    &PredefinedMenuItem::separator(handle)?,
                    &toggle_sidebar,
                ],
            )?;

            // Help Menu
            let help_faq = MenuItem::with_id(handle, "help-faq", "FAQ", true, None::<&str>)?;
            let pkg_cache = MenuItem::with_id(handle, "help-package-cache", "Package Cache…", true, None::<&str>)?;
            let help_fonts = MenuItem::with_id(handle, "help-fonts", "Fonts…", true, None::<&str>)?;
            let shortcuts = MenuItem::with_id(handle, "help-shortcuts", "Keyboard Shortcuts", true, Some("CmdOrCtrl+K CmdOrCtrl+S"))?;
            let help_menu = Submenu::with_items(
                handle,
                "Help",
                true,
                &[
                    &help_faq,
                    &help_fonts,
                    &pkg_cache,
                    &shortcuts,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::about(handle, None, None)?,
                ],
            )?;

            let menu = Menu::with_items(
                handle,
                &[
                    #[cfg(target_os = "macos")]
                    &Submenu::with_items(
                        handle,
                        &app_menu_title,
                        true,
                        &[
                            &PredefinedMenuItem::about(handle, None, None)?,
                            &PredefinedMenuItem::separator(handle)?,
                            &PredefinedMenuItem::services(handle, None)?,
                            &PredefinedMenuItem::separator(handle)?,
                            &PredefinedMenuItem::hide(handle, None)?,
                            &PredefinedMenuItem::hide_others(handle, None)?,
                            &PredefinedMenuItem::show_all(handle, None)?,
                            &PredefinedMenuItem::separator(handle)?,
                            &PredefinedMenuItem::quit(handle, None)?,
                        ],
                    )?,
                    &file_menu,
                    &edit_menu,
                    &view_menu,
                    &help_menu,
                ],
            )?;

            handle.set_menu(menu)?;

            app.on_menu_event(move |app_handle, event| {
                let id = event.id().as_ref();
                eprintln!(
                    "[typst-editor:menu] on_menu_event id={:?} (predefined items often use native selectors and may not appear here)",
                    id
                );
                let _ = app_handle.emit("menu-event", id);
            });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_has_native_menu,
            app_file_ui_mode,
            workspace_documents_dir,
            export_ios_project_zip,
            import_ios_project_from_folder,
            import_ios_project_from_zip,
            rename_ios_project,
            compile_typst,
            export_typst_pdf,
            typst_engine_version,
            get_typst_package_cache_info,
            clear_typst_package_cache,
            list_typst_font_faces,
            get_typst_font_config,
            set_typst_font_config,
            import_typst_font_config_json,
            get_typst_font_storage_info,
            add_typst_fonts_import,
            remove_typst_imported_font,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
