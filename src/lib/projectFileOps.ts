/**
 * Rename/remove paths inside the app workspace (plugin-fs on iOS, Rust on desktop).
 */
import { invoke } from "@tauri-apps/api/core";
import { rename, remove, BaseDirectory } from "@tauri-apps/plugin-fs";
import { desktopRemove, desktopRenamePath } from "./desktopProjectFs";

async function resolveDocumentScopedRel(
  absPath: string,
): Promise<{ rel: string; baseDir: BaseDirectory } | null> {
  const root = await invoke<string | null>("workspace_documents_dir");
  if (!root) return null;
  const normRoot = root.replace(/\/$/, "");
  const normPath = absPath.replace(/\/$/, "");
  if (normPath === normRoot || normPath.startsWith(`${normRoot}/`)) {
    const rel =
      normPath === normRoot ? "" : normPath.slice(normRoot.length + 1);
    if (rel && !rel.startsWith("..") && !rel.includes("/../")) {
      const useDoc = await invoke<boolean>("workspace_projects_use_document_dir");
      const baseDir = useDoc ? BaseDirectory.Document : BaseDirectory.AppLocalData;
      return { rel, baseDir };
    }
  }
  return null;
}

export async function projectRenamePath(
  oldAbs: string,
  newAbs: string,
  projectsUseDocumentDir: boolean,
): Promise<void> {
  if (!projectsUseDocumentDir) {
    await desktopRenamePath(oldAbs, newAbs);
    return;
  }
  const oldScoped = await resolveDocumentScopedRel(oldAbs);
  const newScoped = await resolveDocumentScopedRel(newAbs);
  if (
    oldScoped &&
    newScoped &&
    oldScoped.baseDir === newScoped.baseDir
  ) {
    await rename(oldScoped.rel, newScoped.rel, {
      oldPathBaseDir: oldScoped.baseDir,
      newPathBaseDir: newScoped.baseDir,
    });
    return;
  }
  await rename(oldAbs, newAbs);
}

export async function projectRemovePath(
  absPath: string,
  projectsUseDocumentDir: boolean,
  options?: { recursive?: boolean },
): Promise<void> {
  const recursive = options?.recursive ?? false;
  if (!projectsUseDocumentDir) {
    await desktopRemove(absPath, recursive);
    return;
  }
  const scoped = await resolveDocumentScopedRel(absPath);
  if (scoped) {
    await remove(scoped.rel, {
      baseDir: scoped.baseDir,
      recursive,
    });
    return;
  }
  await remove(absPath, { recursive });
}
