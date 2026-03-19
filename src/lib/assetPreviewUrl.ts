import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { BaseDirectory } from "@tauri-apps/api/path";
import { readFile } from "@tauri-apps/plugin-fs";
import { isPdfPath } from "./editorLanguage";

function mimeForAssetPath(filePath: string): string {
  if (isPdfPath(filePath)) return "application/pdf";
  const base = filePath.split("/").pop() ?? filePath;
  const i = base.lastIndexOf(".");
  const ext = i >= 0 ? base.slice(i + 1).toLowerCase() : "";
  const map: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    bmp: "image/bmp",
    ico: "image/x-icon",
  };
  return map[ext] ?? "application/octet-stream";
}

/**
 * URL for <img> / <iframe> preview of a project asset.
 * Desktop: Tauri asset protocol. iOS Documents: blob URL (must revoke when done).
 */
export async function createAssetPreviewUrl(
  absPath: string,
  projectsUseDocumentDir: boolean,
): Promise<{ url: string } | null> {
  if (!projectsUseDocumentDir) {
    try {
      return { url: convertFileSrc(absPath) };
    } catch {
      return null;
    }
  }

  try {
    const root = await invoke<string | null>("workspace_documents_dir");
    if (!root) return null;
    const normRoot = root.replace(/\/$/, "");
    const normPath = absPath.replace(/\/$/, "");
    if (normPath !== normRoot && !normPath.startsWith(`${normRoot}/`)) {
      return null;
    }
    const rel =
      normPath === normRoot ? "" : normPath.slice(normRoot.length + 1);
    if (!rel || rel.includes("/../") || rel.includes("\\..\\")) {
      return null;
    }
    const bytes = await readFile(rel, { baseDir: BaseDirectory.Document });
    const blob = new Blob([bytes], { type: mimeForAssetPath(absPath) });
    return { url: URL.createObjectURL(blob) };
  } catch {
    return null;
  }
}

export function revokeAssetPreviewUrl(url: string | undefined): void {
  if (url?.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}
