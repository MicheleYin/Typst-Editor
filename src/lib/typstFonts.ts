/** One face returned by Rust (`list_typst_font_faces`). */
export type TypstFontFace = {
  family: string;
  variant: string;
  sourcePath: string | null;
  bundled: boolean;
};

export type TypstFontConfig = {
  directories: string[];
  files: string[];
};

export async function listTypstFontFaces(): Promise<TypstFontFace[]> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<TypstFontFace[]>("list_typst_font_faces");
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

/** Stable CSS font-family name for @font-face (picker preview). */
export function pickerFaceCssId(face: TypstFontFace): string {
  const s = `${face.sourcePath ?? ""}\0${face.family}\0${face.variant}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return `typst-pick-${Math.abs(h).toString(36)}`;
}
