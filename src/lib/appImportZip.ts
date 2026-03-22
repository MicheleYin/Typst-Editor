export function humanizeImportZipBasename(absPath: string): string {
  const base = absPath.replace(/\/+$/, "").split("/").pop() || "";
  const withoutZip = base.replace(/\.zip$/i, "");
  const s = withoutZip.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return "Imported";
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
