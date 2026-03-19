/** Monaco built-in language id for a file path (extension-based). */
export function monacoLanguageIdFromPath(filePath: string): string {
  const base = filePath.split("/").pop() ?? filePath;
  const i = base.lastIndexOf(".");
  const ext = i >= 0 ? base.slice(i + 1).toLowerCase() : "";

  const map: Record<string, string> = {
    typ: "typst",
    json: "json",
    jsonc: "json",
    md: "markdown",
    // MDX: use Markdown highlighting for basic editing (no JSX-aware lexer here).
    mdx: "markdown",
    markdown: "markdown",
    svg: "xml",
    xml: "xml",
    xsd: "xml",
    rss: "xml",
    atom: "xml",
    html: "html",
    htm: "html",
    css: "css",
    scss: "scss",
    less: "less",
    sass: "scss",
    js: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    rs: "rust",
    py: "python",
    go: "go",
    java: "java",
    kt: "kotlin",
    kts: "kotlin",
    swift: "swift",
    c: "cpp",
    h: "cpp",
    cc: "cpp",
    cpp: "cpp",
    hpp: "cpp",
    cs: "csharp",
    fs: "fsharp",
    fsx: "fsharp",
    rb: "ruby",
    php: "php",
    sql: "sql",
    yaml: "yaml",
    yml: "yaml",
    toml: "ini",
    ini: "ini",
    cfg: "ini",
    conf: "ini",
    sh: "shell",
    bash: "shell",
    zsh: "shell",
    fish: "shell",
    ps1: "powershell",
    dockerfile: "dockerfile",
    vue: "html",
    svelte: "html",
    graphql: "graphql",
    gql: "graphql",
    mdwn: "markdown",
    tex: "plaintext",
    bib: "plaintext",
    log: "plaintext",
    txt: "plaintext",
    gitignore: "shell",
    env: "ini",
  };

  return map[ext] ?? "plaintext";
}

const BINARY_IMAGE_EXT = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "bmp",
  "ico",
]);

export function isBinaryAssetPath(filePath: string): boolean {
  const base = filePath.split("/").pop() ?? filePath;
  const i = base.lastIndexOf(".");
  const ext = i >= 0 ? base.slice(i + 1).toLowerCase() : "";
  return BINARY_IMAGE_EXT.has(ext) || ext === "pdf";
}

export function isRasterImagePath(filePath: string): boolean {
  const base = filePath.split("/").pop() ?? filePath;
  const i = base.lastIndexOf(".");
  const ext = i >= 0 ? base.slice(i + 1).toLowerCase() : "";
  return BINARY_IMAGE_EXT.has(ext);
}

export function isPdfPath(filePath: string): boolean {
  const base = filePath.split("/").pop() ?? filePath;
  return base.toLowerCase().endsWith(".pdf");
}

export function isTypstPath(filePath: string): boolean {
  return filePath.toLowerCase().endsWith(".typ");
}

export function isSvgSourcePath(filePath: string): boolean {
  return filePath.toLowerCase().endsWith(".svg");
}

export function isMarkdownPath(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return (
    lower.endsWith(".md") ||
    lower.endsWith(".markdown") ||
    lower.endsWith(".mdwn") ||
    lower.endsWith(".mdx")
  );
}
