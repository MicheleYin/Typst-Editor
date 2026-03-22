import { invoke } from "@tauri-apps/api/core";
import { writeTextFile, writeFile, BaseDirectory } from "@tauri-apps/plugin-fs";
import { desktopWriteTextFile, desktopWriteBinaryFile } from "./desktopProjectFs";

/** Write text: iOS sandbox via plugin-fs; desktop project folders via Rust. */
export async function writeTextFileAtProjectPath(
  absPath: string,
  data: string,
  projectsUseDocumentDir: boolean,
): Promise<void> {
  if (!projectsUseDocumentDir) {
    await desktopWriteTextFile(absPath, data);
    return;
  }
  const root = await invoke<string | null>("workspace_documents_dir");
  if (root) {
    const normRoot = root.replace(/\/$/, "");
    const normPath = absPath.replace(/\/$/, "");
    if (normPath === normRoot || normPath.startsWith(`${normRoot}/`)) {
      const rel = normPath === normRoot ? "" : normPath.slice(normRoot.length + 1);
      if (rel && !rel.startsWith("..") && !rel.includes("/../")) {
        const useDoc = await invoke<boolean>("workspace_projects_use_document_dir");
        await writeTextFile(rel, data, {
          baseDir: useDoc ? BaseDirectory.Document : BaseDirectory.AppLocalData,
        });
        return;
      }
    }
  }
  await writeTextFile(absPath, data);
}

export async function writeBinaryFileAtProjectPath(
  absPath: string,
  data: Uint8Array,
  projectsUseDocumentDir: boolean,
): Promise<void> {
  if (!projectsUseDocumentDir) {
    await desktopWriteBinaryFile(absPath, data);
    return;
  }
  const root = await invoke<string | null>("workspace_documents_dir");
  if (root) {
    const normRoot = root.replace(/\/$/, "");
    const normPath = absPath.replace(/\/$/, "");
    if (normPath === normRoot || normPath.startsWith(`${normRoot}/`)) {
      const rel = normPath === normRoot ? "" : normPath.slice(normRoot.length + 1);
      if (rel && !rel.startsWith("..") && !rel.includes("/../")) {
        const useDoc = await invoke<boolean>("workspace_projects_use_document_dir");
        await writeFile(rel, data, {
          baseDir: useDoc ? BaseDirectory.Document : BaseDirectory.AppLocalData,
        });
        return;
      }
    }
  }
  await writeFile(absPath, data);
}
