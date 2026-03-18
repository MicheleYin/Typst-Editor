use std::fs;
use std::path::Path;
use std::path::PathBuf;

use chrono::Datelike;
use tauri::command;
use tauri::path::BaseDirectory;
use tauri::Manager;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::Emitter;
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .build(),
        )
        .setup(|app| {
            let handle = app.handle();
            if let Err(e) = migrate_font_config_to_local_storage(&handle) {
                eprintln!("typst-editor: font config migration: {e}");
            }
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
            let pkg_cache = MenuItem::with_id(handle, "help-package-cache", "Package Cache…", true, None::<&str>)?;
            let help_fonts = MenuItem::with_id(handle, "help-fonts", "Fonts…", true, None::<&str>)?;
            let shortcuts = MenuItem::with_id(handle, "help-shortcuts", "Keyboard Shortcuts", true, Some("CmdOrCtrl+K CmdOrCtrl+S"))?;
            let help_menu = Submenu::with_items(
                handle,
                "Help",
                true,
                &[
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

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
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
