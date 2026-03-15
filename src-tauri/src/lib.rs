use tauri::command;
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![compile_typst])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
