/**
 * Desktop: read/write arbitrary project folders via Rust (not plugin-fs scopes).
 */
import { invoke } from "@tauri-apps/api/core";

export type DesktopProjectRow = {
  folderId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  absPath: string;
};

export async function desktopRecentProjectsList(): Promise<DesktopProjectRow[]> {
  const rows = await invoke<
    {
      folderId: string;
      title: string;
      createdAt: string;
      updatedAt: string;
      absPath: string;
    }[]
  >("desktop_recent_projects_list");
  return rows.map((r) => ({
    folderId: r.folderId,
    title: r.title,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    absPath: r.absPath,
  }));
}

export async function desktopRecentTouch(path: string): Promise<void> {
  await invoke("desktop_recent_project_touch", { path });
}

export async function desktopProjectRowForPath(
  path: string,
): Promise<DesktopProjectRow> {
  const r = await invoke<{
    folderId: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    absPath: string;
  }>("desktop_project_row_for_path", { path });
  return {
    folderId: r.folderId,
    title: r.title,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    absPath: r.absPath,
  };
}

export async function desktopRecentRemove(path: string): Promise<void> {
  await invoke("desktop_recent_project_remove", { path });
}

export async function desktopReadTextFile(path: string): Promise<string> {
  return invoke<string>("desktop_fs_read_text_file", { path });
}

export async function desktopWriteTextFile(
  path: string,
  contents: string,
): Promise<void> {
  await invoke("desktop_fs_write_text_file", { path, contents });
}

export async function desktopWriteBinaryFile(
  path: string,
  contents: Uint8Array,
): Promise<void> {
  await invoke("desktop_fs_write_binary_file", {
    path,
    contents: Array.from(contents),
  });
}

export async function desktopReadDir(
  path: string,
): Promise<{ name: string; isDirectory: boolean }[]> {
  const entries = await invoke<{ name: string; isDirectory: boolean }[]>(
    "desktop_fs_read_dir",
    { path },
  );
  return entries;
}

export async function desktopRemove(path: string, recursive: boolean): Promise<void> {
  await invoke("desktop_fs_remove", { path, recursive });
}

export async function desktopRenamePath(from: string, to: string): Promise<void> {
  await invoke("desktop_fs_rename", { from, to });
}

export async function desktopCopyFile(from: string, to: string): Promise<void> {
  await invoke("desktop_fs_copy_file", { from, to });
}

export async function desktopCreateProject(
  parentDir: string,
  folderName: string,
  title: string,
): Promise<DesktopProjectRow> {
  const r = await invoke<{
    folderId: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    absPath: string;
  }>("desktop_create_project", { parentDir, folderName, title });
  return {
    folderId: r.folderId,
    title: r.title,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    absPath: r.absPath,
  };
}

export async function desktopUpdateProjectMetaTitle(
  projectPath: string,
  newTitle: string,
): Promise<void> {
  await invoke("desktop_update_project_meta_title", { projectPath, newTitle });
}

export async function desktopProjectTouchUpdatedMeta(
  projectPath: string,
): Promise<void> {
  await invoke("desktop_project_touch_updated_meta", { projectPath });
}

export async function desktopExportProjectZip(
  projectDir: string,
  outputPath: string,
): Promise<void> {
  await invoke("export_desktop_project_zip", { projectDir, outputPath });
}

/** Copy a .typ from disk into an open desktop project folder. */
export async function desktopImportTypIntoProject(
  projectAbsPath: string,
  sourceAbsPath: string,
  preferredName: string,
): Promise<string> {
  const text = await desktopReadTextFile(sourceAbsPath);
  let name = preferredName.endsWith(".typ") ? preferredName : `${preferredName}.typ`;
  if (name.startsWith(".")) name = `imported-${name.replace(/^\./, "")}`;
  const existing = await desktopReadDir(projectAbsPath);
  const names = new Set(existing.map((e) => e.name).filter(Boolean));
  if (names.has(name)) {
    const stem = name.replace(/\.typ$/i, "");
    let n = 2;
    while (names.has(`${stem}-${n}.typ`)) n += 1;
    name = `${stem}-${n}.typ`;
  }
  const dest = `${projectAbsPath.replace(/\/+$/, "")}/${name}`;
  await desktopWriteTextFile(dest, text);
  await desktopProjectTouchUpdatedMeta(projectAbsPath);
  return dest;
}
