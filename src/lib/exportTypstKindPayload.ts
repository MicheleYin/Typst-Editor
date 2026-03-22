/** Payload for Rust `export_typst` / `export_typst_stage` (shared by modal and export runner). */
export type ExportTypstKindPayload =
  | { kind: "pdf"; pdfProfile: string; tagged: boolean }
  | { kind: "svg" }
  | { kind: "png"; ppi: number }
  | { kind: "html" };
