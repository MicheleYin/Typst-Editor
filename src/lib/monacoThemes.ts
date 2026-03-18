/**
 * App chrome follows `data-app-appearance` (theme.css).
 * Monaco uses Catppuccin-alt themes (catppuccinAltThemes).
 */
export const MONACO_THEME_ID_DARK = "catppuccin-alt-dark" as const;
export const MONACO_THEME_ID_LIGHT = "catppuccin-alt-light" as const;

export const THEME_AUTO = "auto" as const;
export type MonacoCatThemeId =
  | typeof MONACO_THEME_ID_DARK
  | typeof MONACO_THEME_ID_LIGHT;

export type ThemePreference = typeof THEME_AUTO | "vs-dark" | "vs";

export const THEME_PREFERENCE_OPTIONS: { id: ThemePreference; label: string }[] = [
  { id: THEME_AUTO, label: "Auto (system)" },
  { id: "vs-dark", label: "Dark" },
  { id: "vs", label: "Light" },
];

export type AppAppearance = "dark" | "light";

const PREFERENCE_KEY = "typst-editor-theme-preference";
const COLOR_MODE_KEY = "typst-editor-color-mode";
const LEGACY_MONACO_KEY = "typst-editor-monaco-theme";

const VALID_PREF = new Set<string>(THEME_PREFERENCE_OPTIONS.map((o) => o.id));

export function isValidThemePreference(id: string): id is ThemePreference {
  return VALID_PREF.has(id);
}

function monacoPrefToAppearance(id: Exclude<ThemePreference, typeof THEME_AUTO>): AppAppearance {
  return id === "vs" ? "light" : "dark";
}

export function resolveAppearance(
  pref: ThemePreference,
  systemPrefersDark: boolean,
): AppAppearance {
  if (pref === THEME_AUTO) {
    return systemPrefersDark ? "dark" : "light";
  }
  return monacoPrefToAppearance(pref);
}

export function resolveMonacoCatThemeId(appearance: AppAppearance): MonacoCatThemeId {
  return appearance === "light" ? MONACO_THEME_ID_LIGHT : MONACO_THEME_ID_DARK;
}

export function readStoredThemePreference(): ThemePreference {
  try {
    const v = localStorage.getItem(PREFERENCE_KEY);
    if (v === THEME_AUTO) return THEME_AUTO;
    if (v && isValidThemePreference(v)) return v;
    if (v === "hc-black" || v === "hc-light") return v === "hc-black" ? "vs-dark" : "vs";

    const cm = localStorage.getItem(COLOR_MODE_KEY);
    if (cm === "light") return "vs";
    if (cm === "dark") return "vs-dark";
    if (cm === "auto" || !cm) {
      const legacy = localStorage.getItem("typst-editor-theme-preference");
      if (legacy === "vs") return "vs";
      if (legacy === "vs-dark") return "vs-dark";
      if (legacy === "hc-light") return "vs";
      if (legacy === "hc-black") return "vs-dark";
      if (legacy === "auto" || !legacy) return THEME_AUTO;
    }

    const legacyM = localStorage.getItem(LEGACY_MONACO_KEY);
    if (legacyM === "vs") return "vs";
    if (legacyM === "vs-dark") return "vs-dark";
    if (legacyM === "hc-light") return "vs";
    if (legacyM === "hc-black") return "vs-dark";
  } catch {
    /* ignore */
  }
  return THEME_AUTO;
}

export function persistThemePreference(pref: ThemePreference): void {
  try {
    localStorage.setItem(PREFERENCE_KEY, pref);
    localStorage.setItem(
      COLOR_MODE_KEY,
      pref === THEME_AUTO ? "auto" : pref === "vs" ? "light" : "dark",
    );
    if (pref !== THEME_AUTO) {
      localStorage.setItem(LEGACY_MONACO_KEY, pref);
    }
  } catch {
    /* ignore */
  }
}
