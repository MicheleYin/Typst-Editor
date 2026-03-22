/** One face returned by Rust (`list_typst_font_faces`). */
export type TypstFontFace = {
  family: string;
  variant: string;
  sourcePath: string | null;
  /** New Computer Modern etc. from typst-assets */
  bundledTypst: boolean;
  /** From app bundle `resources/fonts/bundled` */
  bundledApp: boolean;
  /** `.ttf` / `.otf` / etc. under the opened project folder (or next to the main `.typ` if no folder). */
  fromProject?: boolean;
};

export type TypstFontConfig = {
  directories: string[];
  files: string[];
};

export type TypstFontStorageInfo = {
  importedDir: string;
  appBundledFontsDir: string | null;
};

export async function listTypstFontFaces(
  projectFolderPath: string | null,
  mainPath: string | null,
): Promise<TypstFontFace[]> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<TypstFontFace[]>("list_typst_font_faces", {
    projectFolderPath,
    mainPath,
  });
}

export async function getTypstFontConfig(): Promise<TypstFontConfig> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<TypstFontConfig>("get_typst_font_config");
}

export async function setTypstFontConfig(config: TypstFontConfig): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("set_typst_font_config", { config });
}

export async function importTypstFontConfigJson(jsonPath: string): Promise<TypstFontConfig> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<TypstFontConfig>("import_typst_font_config_json", { jsonPath });
}

export async function getTypstFontStorageInfo(): Promise<TypstFontStorageInfo> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<TypstFontStorageInfo>("get_typst_font_storage_info");
}

/** Copy fonts from disk into app local data (sandbox-safe). */
export async function addTypstFontsImport(
  paths: string[],
  fromFolder: boolean,
): Promise<TypstFontConfig> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<TypstFontConfig>("add_typst_fonts_import", { paths, fromFolder });
}

export async function removeTypstImportedFont(path: string): Promise<TypstFontConfig> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<TypstFontConfig>("remove_typst_imported_font", { path });
}

/** Stable CSS font-family name for @font-face (picker preview). */
export function pickerFaceCssId(face: TypstFontFace): string {
  const s = `${face.sourcePath ?? ""}\0${face.family}\0${face.variant}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return `typst-pick-${Math.abs(h).toString(36)}`;
}

export function displayFontPath(p: string): string {
  const normalized = p.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || p;
}
