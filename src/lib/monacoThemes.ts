export const COLOR_MODE_AUTO = "auto" as const;
export const COLOR_MODE_LIGHT = "light" as const;
export const COLOR_MODE_DARK = "dark" as const;

export type ColorMode =
  | typeof COLOR_MODE_AUTO
  | typeof COLOR_MODE_LIGHT
  | typeof COLOR_MODE_DARK;

export const COLOR_MODE_OPTIONS: { id: ColorMode; label: string }[] = [
  { id: COLOR_MODE_AUTO, label: "Auto" },
  { id: COLOR_MODE_LIGHT, label: "Light" },
  { id: COLOR_MODE_DARK, label: "Dark" },
];

const STORAGE_KEY = "typst-editor-color-mode";

/** Migrate old theme preference keys to light / dark / auto */
export function readStoredColorMode(): ColorMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === COLOR_MODE_AUTO || v === COLOR_MODE_LIGHT || v === COLOR_MODE_DARK) {
      return v;
    }
    const legacy = localStorage.getItem("typst-editor-theme-preference");
    if (legacy === "auto" || !legacy) return COLOR_MODE_AUTO;
    if (legacy === "vs" || legacy === "hc-light") return COLOR_MODE_LIGHT;
    if (legacy === "vs-dark" || legacy === "hc-black") return COLOR_MODE_DARK;
    if (legacy.startsWith("vscode-")) return COLOR_MODE_AUTO;
  } catch {
    /* ignore */
  }
  return COLOR_MODE_AUTO;
}

export function persistColorMode(mode: ColorMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function resolveEffectiveLightDark(
  mode: ColorMode,
  systemPrefersDark: boolean,
): "light" | "dark" {
  if (mode === COLOR_MODE_AUTO) {
    return systemPrefersDark ? "dark" : "light";
  }
  return mode;
}
