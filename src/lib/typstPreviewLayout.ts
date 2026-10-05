export type TypstPreviewLayout = "paginated" | "scroll";

const STORAGE_KEY = "typst-editor-preview-layout";

export function readTypstPreviewLayout(): TypstPreviewLayout {
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "scroll" ? "scroll" : "paginated";
}

export function persistTypstPreviewLayout(layout: TypstPreviewLayout): void {
  localStorage.setItem(STORAGE_KEY, layout);
}
