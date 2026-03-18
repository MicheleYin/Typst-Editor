use tauri::command;
use tauri::menu::{Menu, Submenu, MenuItem, PredefinedMenuItem};
use tauri::Emitter;
use typst::diag::FileError;
use typst::foundations::{Bytes, Datetime};
use typst::syntax::{FileId, Source};
use typst::text::{Font, FontBook};
use typst::{Library, LibraryExt, World};
use typst::utils::LazyHash;
use chrono::Datelike;

struct SimpleWorld {
    library: LazyHash<Library>,
    book: LazyHash<FontBook>,
    fonts: Vec<Font>,
    source: Source,
}

impl SimpleWorld {
    fn new(content: String) -> Self {
        let fonts: Vec<Font> = typst_assets::fonts()
            .map(|data| Font::new(Bytes::new(data.to_vec()), 0).expect("failed to load font"))
            .collect();
        println!("Loaded {} fonts", fonts.len());

        Self {
            library: LazyHash::new(Library::default()),
            book: LazyHash::new(FontBook::from_fonts(&fonts)),
            fonts,
            source: Source::detached(content),
        }
    }
}

impl World for SimpleWorld {
    fn library(&self) -> &LazyHash<Library> {
        &self.library
    }

    fn book(&self) -> &LazyHash<FontBook> {
        &self.book
    }

    fn main(&self) -> FileId {
        self.source.id()
    }

    fn source(&self, id: FileId) -> Result<Source, FileError> {
        if id == self.source.id() {
            Ok(self.source.clone())
        } else {
            Err(FileError::NotFound(id.vpath().as_rootless_path().to_path_buf()))
        }
    }

    fn font(&self, index: usize) -> Option<Font> {
        self.fonts.get(index).cloned()
    }

    fn file(&self, id: FileId) -> Result<Bytes, FileError> {
        Err(FileError::NotFound(id.vpath().as_rootless_path().to_path_buf()))
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
struct CompilationResult {
    pages: Vec<String>,
    page_count: usize,
}

#[command]
fn compile_typst(content: String) -> Result<CompilationResult, String> {
    let world = SimpleWorld::new(content);
    let document: typst::layout::PagedDocument = typst::compile(&world).output.map_err(|errs| {
        errs.iter()
            .map(|e| e.message.to_string())
            .collect::<Vec<_>>()
            .join("\n")
    })?;

    let pages: Vec<String> = document
        .pages
        .iter()
        .map(|page| typst_svg::svg(page))
        .collect();

    let page_count = pages.len();

    Ok(CompilationResult { pages, page_count })
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
            
            // File Menu
            let new_file = MenuItem::with_id(handle, "file-new", "New File", true, Some("CmdOrCtrl+N"))?;
            let open_file = MenuItem::with_id(handle, "file-open", "Open File...", true, Some("CmdOrCtrl+O"))?;
            let open_folder = MenuItem::with_id(handle, "file-open-folder", "Open Folder...", true, Some("CmdOrCtrl+Shift+O"))?;
            let save_file = MenuItem::with_id(handle, "file-save", "Save", true, Some("CmdOrCtrl+S"))?;
            let save_as = MenuItem::with_id(handle, "file-save-as", "Save As...", true, Some("CmdOrCtrl+Shift+S"))?;
            
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
            let shortcuts = MenuItem::with_id(handle, "help-shortcuts", "Keyboard Shortcuts", true, Some("CmdOrCtrl+K CmdOrCtrl+S"))?;
            let help_menu = Submenu::with_items(
                handle,
                "Help",
                true,
                &[
                    &shortcuts,
                    &PredefinedMenuItem::about(handle, None, None)?,
                ],
            )?;

            let menu = Menu::with_items(
                handle,
                &[
                    #[cfg(target_os = "macos")]
                    &Submenu::with_items(
                        handle,
                        "Typst Editor",
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
                let _ = app_handle.emit("menu-event", id);
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![compile_typst, typst_engine_version])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
