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

  return { base, inherit: true, rules, colors };
}
