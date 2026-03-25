import type * as monaco from "monaco-editor";

function parseHex(c: string): { r: number; g: number; b: number } | null {
  let h = c.trim();
  if (h.startsWith("#")) h = h.slice(1);
  if (h.length === 8) h = h.slice(0, 6);
  if (h.length === 3) {
    h = h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]!;
  }
  if (h.length !== 6) return null;
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function isLightBackground(hex: string): boolean {
  const rgb = parseHex(hex);
  if (!rgb) return false;
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  const L = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return L > 0.5;
}

function normalizeScopes(scope: unknown): string[] {
  if (scope == null) return [];
  if (typeof scope === "string") {
    return scope.split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (Array.isArray(scope)) {
    return scope.flatMap((s) => normalizeScopes(s));
  }
  return [];
}

function stripHash(c: string): string {
  return c.replace(/^#/, "");
}

type TokenColor = { scope?: unknown; settings?: { foreground?: string } };

function findForeground(tokenColors: TokenColor[], patterns: RegExp[]): string | undefined {
  for (const tc of tokenColors) {
    for (const s of normalizeScopes(tc.scope)) {
      for (const re of patterns) {
        if (re.test(s)) {
          const fg = tc.settings?.foreground;
          if (fg && typeof fg === "string") return fg;
        }
      }
    }
  }
  return undefined;
}

/** VS Code theme JSON → Monaco standalone theme (Typst Monarch token mapping). */
export function vscodeJsonToMonacoThemeData(
  raw: unknown,
): monaco.editor.IStandaloneThemeData {
  const o = raw as Record<string, unknown>;
  const type = o.type === "light" || o.type === "dark" ? o.type : undefined;
  const colors =
    o.colors && typeof o.colors === "object" && !Array.isArray(o.colors)
      ? { ...(o.colors as Record<string, string>) }
      : {};
  const tokenColors: TokenColor[] = Array.isArray(o.tokenColors)
    ? (o.tokenColors as TokenColor[])
    : [];

  const bg =
    colors["editor.background"] ||
    (type === "light" ? "#ffffff" : "#1e1e1e");
  const fg = colors["editor.foreground"] || (type === "light" ? "#333333" : "#d4d4d4");

  const light =
    type === "light" || (type !== "dark" && isLightBackground(bg));
  const base: "vs" | "vs-dark" = light ? "vs" : "vs-dark";

  const pick = (patterns: RegExp[], fallback: string) =>
    stripHash(findForeground(tokenColors, patterns) || fallback);

  const rules: monaco.editor.ITokenThemeRule[] = [
    { token: "keyword", foreground: pick([/\bkeyword\b/, /storage\.type/], fg) },
    { token: "comment", foreground: pick([/comment/], light ? "#008000" : "#6A9955") },
    { token: "string", foreground: pick([/string(?!\.)/, /^string$/], light ? "#a31515" : "#ce9178") },
    { token: "string.quote", foreground: pick([/string/, /markup\.math/], pick([/string/], fg)) },
    { token: "string.invalid", foreground: pick([/invalid/], "#f44747") },
    { token: "number", foreground: pick([/constant\.numeric/], light ? "#098658" : "#b5cea8") },
    { token: "regexp", foreground: pick([/string\.regexp/], "#d16969") },
    { token: "type", foreground: pick([/entity\.name\.type/, /support\.type/], light ? "#267f99" : "#4EC9B0") },
    { token: "class", foreground: pick([/entity\.name\.class/], pick([/type/], fg)) },
    { token: "operator", foreground: pick([/keyword\.operator/], fg) },
    { token: "namespace", foreground: pick([/entity\.name\.namespace/], fg) },
    { token: "preproc", foreground: pick([/meta\.preprocessor/], light ? "#0000ff" : "#569cd6") },
    { token: "meta", foreground: pick([/^meta($|\.)/], fg) },
    { token: "delimiter", foreground: fg.replace(/^#/, "") },
    { token: "delimiter.bracket", foreground: pick([/punctuation/], fg) },
  ];

  appendSemanticTokenColorsFromVscodeTheme(o.semanticTokenColors, rules);
  rules.push(...defaultLspSemanticTokenThemeRules(light, fg));
  rules.push(...tinymistSemanticTokenThemeRules(light, fg));

  return { base, inherit: true, rules, colors };
}

/** VS Code `semanticTokenColors` → Monaco token rules (`token` = semantic selector). */
function appendSemanticTokenColorsFromVscodeTheme(
  semantic: unknown,
  rules: monaco.editor.ITokenThemeRule[],
): void {
  if (!semantic || typeof semantic !== "object" || Array.isArray(semantic)) return;
  for (const [key, val] of Object.entries(semantic as Record<string, unknown>)) {
    if (!key.trim()) continue;
    if (typeof val === "string") {
      rules.push({ token: key, foreground: stripHash(val) });
    } else if (val && typeof val === "object") {
      const v = val as { foreground?: string; fontStyle?: string };
      if (v.foreground) {
        rules.push({
          token: key,
          foreground: stripHash(v.foreground),
          fontStyle: v.fontStyle,
        });
      }
    }
  }
}

/**
 * TinyMist / LSP semantic highlighting uses standard type names from the server legend.
 * Without matching theme rules, Monaco keeps default text color (looks like “no highlight”).
 */
function defaultLspSemanticTokenThemeRules(
  light: boolean,
  editorFg: string,
): monaco.editor.ITokenThemeRule[] {
  const fg = stripHash(editorFg);
  const keyword = light ? "0000ff" : "c586c0";
  const comment = light ? "008000" : "6a9955";
  const stringC = light ? "a31515" : "ce9178";
  const numberC = light ? "098658" : "b5cea8";
  const typeC = light ? "267f99" : "4ec9b0";
  const fnC = light ? "795e26" : "dcdcaa";
  const param = light ? "001080" : "9cdcfe";

  return [
    { token: "namespace", foreground: typeC },
    { token: "type", foreground: typeC },
    { token: "class", foreground: typeC },
    { token: "enum", foreground: typeC },
    { token: "interface", foreground: typeC },
    { token: "struct", foreground: typeC },
    { token: "typeParameter", foreground: typeC },
    { token: "parameter", foreground: param },
    { token: "variable", foreground: fg },
    { token: "property", foreground: param },
    { token: "enumMember", foreground: light ? "0070c1" : "4fc1ff" },
    { token: "decorator", foreground: fnC },
    { token: "event", foreground: fnC },
    { token: "function", foreground: fnC },
    { token: "method", foreground: fnC },
    { token: "macro", foreground: fnC },
    { token: "keyword", foreground: keyword },
    { token: "modifier", foreground: keyword },
    { token: "comment", foreground: comment },
    { token: "string", foreground: stringC },
    { token: "number", foreground: numberC },
    { token: "regexp", foreground: stringC },
    { token: "operator", foreground: fg },
  ];
}

/**
 * TinyMist adds non-standard semantic token type names (see `tinymist-query` semantic_tokens.rs).
 * Without these, most Typst markup maps to types Monaco has no color rule for → looks unhighlighted.
 */
function tinymistSemanticTokenThemeRules(
  light: boolean,
  editorFg: string,
): monaco.editor.ITokenThemeRule[] {
  const fg = stripHash(editorFg);
  const stringC = light ? "a31515" : "ce9178";
  const heading = light ? "267f99" : "4ec9b0";
  const link = light ? "0000ff" : "3794ff";
  const label = light ? "795e26" : "dcdcaa";
  const error = light ? "b00000" : "f44747";
  const pol = light ? "001080" : "9cdcfe";

  return [
    { token: "bool", foreground: light ? "0000ff" : "569cd6" },
    { token: "punct", foreground: fg },
    { token: "escape", foreground: stringC },
    { token: "link", foreground: link },
    { token: "raw", foreground: stringC },
    { token: "label", foreground: label },
    { token: "ref", foreground: link },
    { token: "heading", foreground: heading },
    { token: "marker", foreground: light ? "001080" : "9cdcfe" },
    { token: "term", foreground: fg },
    { token: "delim", foreground: light ? "0431fa" : "d4d4d4" },
    { token: "pol", foreground: pol },
    { token: "error", foreground: error },
    { token: "text", foreground: fg },
    { token: "*.strong", fontStyle: "bold" },
    { token: "*.emph", fontStyle: "italic" },
    { token: "*.math", foreground: stringC },
  ];
}
