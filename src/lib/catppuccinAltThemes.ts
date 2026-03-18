import { parse } from "jsonc-parser";
import type * as monaco from "monaco-editor";
import { vscodeJsonToMonacoThemeData } from "./vscodeThemeMonacoData";
// Bundled Catppuccin-style alt themes (same as VS Code JSONC exports)
import altLightRaw from "../themes/alt-light.jsonc?raw";
import altDarkRaw from "../themes/alt-dark.jsonc?raw";

function parseTheme(text: string): Record<string, unknown> {
  const errors: import("jsonc-parser").ParseError[] = [];
  const r = parse(text, errors, { allowTrailingComma: true }) as Record<string, unknown> | null;
  if (!r || typeof r !== "object") {
    throw new Error("Failed to parse bundled theme");
  }
  return r;
}

const lightRoot = parseTheme(altLightRaw);
const darkRoot = parseTheme(altDarkRaw);

export const CAT_LIGHT_COLORS = (lightRoot.colors || {}) as Record<string, string>;
export const CAT_DARK_COLORS = (darkRoot.colors || {}) as Record<string, string>;

export const MONACO_CAT_LIGHT: monaco.editor.IStandaloneThemeData =
  vscodeJsonToMonacoThemeData(lightRoot);
export const MONACO_CAT_DARK: monaco.editor.IStandaloneThemeData =
  vscodeJsonToMonacoThemeData(darkRoot);

export const MONACO_THEME_ID_LIGHT = "catppuccin-alt-light";
export const MONACO_THEME_ID_DARK = "catppuccin-alt-dark";

function pick(
  c: Record<string, string>,
  keys: string[],
  fallback: string,
): string {
  for (const k of keys) {
    const v = c[k];
    if (v && typeof v === "string" && v.length > 0) return v;
  }
  return fallback;
}

/** Map VS Code workbench colors → app CSS variables (header, sidebar, preview chrome). */
export function applyAppChromeFromVscodeColors(c: Record<string, string>): void {
  const el = document.documentElement;
  const bg = pick(
    c,
    ["titleBar.activeBackground", "activityBar.background"],
    "#303446",
  );
  const surface = pick(c, ["sideBar.background"], bg);
  const surfaceElev = pick(c, ["list.hoverBackground", "dropdown.background"], surface);
  const fg = pick(
    c,
    ["titleBar.activeForeground", "sideBar.foreground"],
    "#c6d0f5",
  );
  const fgSec = pick(c, ["descriptionForeground", "breadcrumb.foreground"], fg);
  const fgMuted = pick(c, ["disabledForeground", "list.highlightForeground"], fgSec);
  const border = pick(c, ["panel.border", "sideBar.border"], "#626880");
  if (border === "#00000000" || border.toLowerCase() === "transparent") {
    const b2 = pick(c, ["panel.border", "dropdown.border"], "#626880");
    el.style.setProperty("--app-border", b2 !== "#00000000" ? b2 : "#51576d");
  } else {
    el.style.setProperty("--app-border", border);
  }
  const chip = pick(c, ["breadcrumb.background", "dropdown.background"], surface);
  const inputBg = pick(c, ["input.background", "dropdown.background"], surfaceElev);
  const link = pick(
    c,
    ["activityBar.foreground", "button.background", "textLink.foreground"],
    "#8caaee",
  );
  const editorBg = pick(c, ["editor.background"], "#303446");

  el.style.setProperty("--app-bg", bg);
  el.style.setProperty("--app-surface", surface);
  el.style.setProperty("--app-surface-elevated", surfaceElev);
  el.style.setProperty("--app-surface-hover", pick(c, ["list.hoverBackground"], surfaceElev));
  el.style.setProperty(
    "--app-surface-active",
    pick(c, ["list.activeSelectionBackground"], surfaceElev),
  );
  el.style.setProperty("--app-surface-toolbar", `${surface}cc`);
  el.style.setProperty("--app-btn-ghost-hover", pick(c, ["list.hoverBackground"], surfaceElev));
  el.style.setProperty("--app-fg", fg);
  el.style.setProperty("--app-fg-secondary", fgSec);
  el.style.setProperty("--app-fg-muted", fgMuted);
  el.style.setProperty("--app-fg-subtle", fgMuted);
  el.style.setProperty("--app-border-strong", pick(c, ["focusBorder"], border));
  el.style.setProperty("--app-input-bg", inputBg);
  el.style.setProperty("--app-input-fg", pick(c, ["input.foreground"], fg));
  el.style.setProperty("--app-chip-bg", chip);
  el.style.setProperty("--app-chip-divider", border);
  el.style.setProperty("--app-grip", border);
  el.style.setProperty("--app-card-border", border);
  el.style.setProperty("--app-icon-muted", fgMuted);
  el.style.setProperty("--app-close-hover-fg", fg);
  el.style.setProperty("--app-active-fg", pick(c, ["list.activeSelectionForeground"], fg));
  el.style.setProperty("--app-link", link);

  el.style.setProperty("--preview-pane-bg", editorBg);
  el.style.setProperty("--preview-floating-bg", pick(c, ["editorWidget.background"], chip));
  el.style.setProperty("--preview-floating-border", border);
  el.style.setProperty("--preview-floating-text", fg);
  el.style.setProperty("--preview-floating-hover", surfaceElev);
  el.style.setProperty("--preview-empty", fgMuted);

  el.style.setProperty("--app-grip-hover", link);
  el.style.setProperty("--app-grip-active", link);
  el.style.setProperty("--app-header-badge-bg", link);
  el.style.setProperty(
    "--app-header-badge-fg",
    pick(c, ["badge.foreground", "button.foreground"], "#232634"),
  );
  el.style.setProperty("--app-status-edited-dot", pick(c, ["charts.blue"], link));
  el.style.setProperty("--app-status-edited-text", link);
  el.style.setProperty("--app-status-saved-dot", pick(c, ["charts.green"], "#a6d189"));
  el.style.setProperty("--app-status-saved-text", pick(c, ["charts.green"], "#a6d189"));
}
