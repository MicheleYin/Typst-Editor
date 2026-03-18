import { parse } from "jsonc-parser";
import type * as monaco from "monaco-editor";
import { vscodeJsonToMonacoThemeData } from "./vscodeThemeMonacoData";
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

export const MONACO_CAT_LIGHT: monaco.editor.IStandaloneThemeData =
  vscodeJsonToMonacoThemeData(lightRoot);
export const MONACO_CAT_DARK: monaco.editor.IStandaloneThemeData =
  vscodeJsonToMonacoThemeData(darkRoot);

export const MONACO_THEME_ID_LIGHT = "catppuccin-alt-light";
export const MONACO_THEME_ID_DARK = "catppuccin-alt-dark";
