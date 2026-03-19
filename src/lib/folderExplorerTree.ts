/**
 * Recursive folder listing for the sidebar explorer (desktop + plugin-fs).
 */
import { join } from "@tauri-apps/api/path";
import { readDir } from "@tauri-apps/plugin-fs";
import { desktopReadDir } from "./desktopProjectFs";

export type FolderExplorerNode = {
  name: string;
  path: string;
  isDirectory: boolean;
  /** Present only when `isDirectory`; sorted (dirs first, then files). */
  children?: FolderExplorerNode[];
};

/** Skip heavy / non-source subtrees (same idea as many IDEs). */
const SKIP_DIR_NAMES = new Set([
  "node_modules",
  "target",
  "dist",
  "build",
  ".svn",
  ".hg",
]);

async function listSortedEntries(
  folderPath: string,
  projectsUseDocumentDir: boolean,
): Promise<{ name: string; path: string; isDirectory: boolean }[]> {
  const raw = projectsUseDocumentDir
    ? await readDir(folderPath)
    : await desktopReadDir(folderPath);
  const mapped = await Promise.all(
    raw
      .filter((e): e is typeof e & { name: string } => !!e.name && !e.name.startsWith("."))
      .filter((e) => !SKIP_DIR_NAMES.has(e.name))
      .map(async (e) => {
        const path = await join(folderPath, e.name);
        return { name: e.name, path, isDirectory: e.isDirectory };
      }),
  );
  return mapped.sort((a, b) => {
    if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
    return a.isDirectory ? -1 : 1;
  });
}

export async function loadFolderExplorerTree(
  folderPath: string,
  projectsUseDocumentDir: boolean,
): Promise<FolderExplorerNode[]> {
  let entries: { name: string; path: string; isDirectory: boolean }[];
  try {
    entries = await listSortedEntries(folderPath, projectsUseDocumentDir);
  } catch {
    return [];
  }

  const nodes: FolderExplorerNode[] = [];
  for (const e of entries) {
    if (e.isDirectory) {
      let children: FolderExplorerNode[] = [];
      try {
        children = await loadFolderExplorerTree(e.path, projectsUseDocumentDir);
      } catch {
        children = [];
      }
      nodes.push({ ...e, children });
    } else {
      nodes.push({ ...e });
    }
  }
  return nodes;
}

export function remapFolderExplorerPaths(
  nodes: FolderExplorerNode[],
  mapPath: (p: string) => string,
): FolderExplorerNode[] {
  return nodes.map((n) => ({
    ...n,
    path: mapPath(n.path),
    children: n.children?.length
      ? remapFolderExplorerPaths(n.children, mapPath)
      : undefined,
  }));
}
