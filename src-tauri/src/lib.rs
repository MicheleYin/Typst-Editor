use std::fs;
use std::path::Path;
use std::path::PathBuf;

use chrono::Datelike;
use tauri::command;
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
    fn new(content: String, main_path: Option<String>, package_cache: PathBuf) -> Self {
        let fonts: Vec<Font> = typst_assets::fonts()
            .map(|data| Font::new(Bytes::new(data.to_vec()), 0).expect("failed to load font"))
            .collect();
        println!("Loaded {} fonts", fonts.len());

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
    let world = EditorWorld::new(content, main_path, package_cache);
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
    let world = EditorWorld::new(content, main_path, package_cache);
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
        .setup(|app| {
            let handle = app.handle();
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

            // Edit Menu
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
                    &PredefinedMenuItem::select_all(handle, None)?,
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
            let shortcuts = MenuItem::with_id(handle, "help-shortcuts", "Keyboard Shortcuts", true, Some("CmdOrCtrl+K CmdOrCtrl+S"))?;
            let help_menu = Submenu::with_items(
                handle,
                "Help",
                true,
                &[
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
            clear_typst_package_cache
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
