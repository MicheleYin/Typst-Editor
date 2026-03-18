/** Typst `#set text(font: …)` name + CSS stack so the picker can preview in the browser. */
export type TypstFontOption = {
  typst: string;
  /** CSS font-family for the preview row */
  previewFamily: string;
  /** Optional note when preview is an approximation */
  hint?: string;
};

export type TypstFontGroup = { title: string; fonts: TypstFontOption[] };

export const TYPST_FONT_GROUPS: TypstFontGroup[] = [
  {
    title: "Classic / default",
    fonts: [
      {
        typst: "New Computer Modern",
        previewFamily: '"STIX Two Text", "Times New Roman", serif',
        hint: "Preview ≈ STIX (Typst default serif)",
      },
      {
        typst: "Linux Libertine",
        previewFamily: '"Libertinus Serif", "Linux Libertine", serif',
      },
    ],
  },
  {
    title: "Serif",
    fonts: [
      { typst: "Libertinus Serif", previewFamily: '"Libertinus Serif", serif' },
      { typst: "Source Serif 4", previewFamily: '"Source Serif 4", serif' },
      { typst: "Noto Serif", previewFamily: '"Noto Serif", serif' },
      { typst: "Lora", previewFamily: '"Lora", serif' },
      { typst: "Merriweather", previewFamily: '"Merriweather", serif' },
      { typst: "EB Garamond", previewFamily: '"EB Garamond", serif' },
      { typst: "Literata", previewFamily: '"Literata", serif' },
      { typst: "STIX Two Text", previewFamily: '"STIX Two Text", serif' },
    ],
  },
  {
    title: "Sans",
    fonts: [
      { typst: "IBM Plex Sans", previewFamily: '"IBM Plex Sans", sans-serif' },
      { typst: "Inter", previewFamily: '"Inter", sans-serif' },
      { typst: "Noto Sans", previewFamily: '"Noto Sans", sans-serif' },
      { typst: "Open Sans", previewFamily: '"Open Sans", sans-serif' },
      { typst: "Roboto", previewFamily: '"Roboto", sans-serif' },
      { typst: "Fira Sans", previewFamily: '"Fira Sans", sans-serif' },
      { typst: "Ubuntu", previewFamily: '"Ubuntu", sans-serif' },
      { typst: "Libertinus Sans", previewFamily: '"Libertinus Sans", sans-serif' },
      { typst: "DejaVu Sans", previewFamily: '"DejaVu Sans", "Liberation Sans", "Helvetica Neue", sans-serif' },
    ],
  },
  {
    title: "Monospace",
    fonts: [
      { typst: "DejaVu Sans Mono", previewFamily: '"DejaVu Sans Mono", "Liberation Mono", monospace' },
      { typst: "JetBrains Mono", previewFamily: '"JetBrains Mono", monospace' },
      { typst: "Fira Code", previewFamily: '"Fira Code", monospace' },
      { typst: "Roboto Mono", previewFamily: '"Roboto Mono", monospace' },
      { typst: "Inconsolata", previewFamily: '"Inconsolata", monospace' },
    ],
  },
];
