export function normalizeFsPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+$/, "");
}

export function isExplorerPathInsideProject(
  projectRoot: string | null,
  filePath: string,
): boolean {
  if (!projectRoot) return false;
  const root = normalizeFsPath(projectRoot);
  const norm = normalizeFsPath(filePath);
  return norm.startsWith(`${root}/`);
}
