/** Built-in Monaco editor themes (VS Code–compatible). */
export const MONACO_THEME_OPTIONS = [
  { id: "vs-dark", label: "Dark" },
  { id: "vs", label: "Light" },
  { id: "hc-black", label: "High contrast dark" },
  { id: "hc-light", label: "High contrast light" },
] as const;

export type MonacoThemeId = (typeof MONACO_THEME_OPTIONS)[number]["id"];

export const THEME_AUTO = "auto" as const;
export type ThemePreference = typeof THEME_AUTO | MonacoThemeId;

/** Header / storage: Auto first, then fixed themes */
export const THEME_PREFERENCE_OPTIONS: { id: ThemePreference; label: string }[] = [
  { id: THEME_AUTO, label: "Auto (system)" },
  { id: "vs-dark", label: "Dark" },
  { id: "vs", label: "Light" },
  { id: "hc-black", label: "High contrast dark" },
  { id: "hc-light", label: "High contrast light" },
];

export type AppAppearance = "dark" | "light" | "hc-dark" | "hc-light";

const LEGACY_MONACO_KEY = "typst-editor-monaco-theme";
const PREFERENCE_KEY = "typst-editor-theme-preference";

const VALID_MONACO = new Set<string>(MONACO_THEME_OPTIONS.map((t) => t.id));

export function isValidMonacoTheme(id: string): id is MonacoThemeId {
  return VALID_MONACO.has(id);
}

function monacoToAppearance(id: MonacoThemeId): AppAppearance {
  switch (id) {
    case "vs":
      return "light";
    case "vs-dark":
      return "dark";
    case "hc-black":
      return "hc-dark";
    case "hc-light":
      return "hc-light";
  }
}

/** Resolved UI + Monaco when preference is Auto */
export function resolveAppearance(
  pref: ThemePreference,
  systemPrefersDark: boolean,
): AppAppearance {
  if (pref === THEME_AUTO) {
    return systemPrefersDark ? "dark" : "light";
  }
  return monacoToAppearance(pref);
}

export function resolveMonacoThemeId(
  pref: ThemePreference,
  systemPrefersDark: boolean,
): MonacoThemeId {
  if (pref === THEME_AUTO) {
    return systemPrefersDark ? "vs-dark" : "vs";
  }
  return pref;
}

export function readStoredThemePreference(): ThemePreference {
  try {
    const v = localStorage.getItem(PREFERENCE_KEY);
    if (v === THEME_AUTO) return THEME_AUTO;
    if (v && isValidMonacoTheme(v)) return v;
    const legacy = localStorage.getItem(LEGACY_MONACO_KEY);
    if (legacy && isValidMonacoTheme(legacy)) return legacy;
  } catch {
    /* ignore */
  }
  return THEME_AUTO;
}

export function persistThemePreference(pref: ThemePreference): void {
  try {
    localStorage.setItem(PREFERENCE_KEY, pref);
    if (pref !== THEME_AUTO) {
      localStorage.setItem(LEGACY_MONACO_KEY, pref);
    }
  } catch {
    /* ignore */
  }
}

export function isValidThemePreference(id: string): id is ThemePreference {
  return id === THEME_AUTO || isValidMonacoTheme(id);
}
