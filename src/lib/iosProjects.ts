/**
 * iOS-only: projects live under app Documents/Projects/<folderName>/
 * (folder name matches the project title; only unsafe path chars removed).
 */
import { invoke } from "@tauri-apps/api/core";
import {
  readTextFile,
  writeTextFile,
  readDir,
  mkdir,
  remove,
  BaseDirectory,
} from "@tauri-apps/plugin-fs";

export const IOS_PROJECT_META = ".typst-editor-project.json";
export const IOS_PROJECTS_DIR = "Projects";

export type IosProjectMeta = {
  version: 1;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type IosProjectSummary = {
  folderId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  absPath: string;
};

async function documentsRoot(): Promise<string> {
  const r = await invoke<string | null>("workspace_documents_dir");
  if (!r) throw new Error("Not available");
  return r.replace(/\/$/, "");
}

/** Chars not allowed in a single path segment (preserves spaces & casing). */
const INVALID_PROJECT_FOLDER_CHARS = /[/\\:\x00*?"<>|]/g;

/** Folder name = trimmed title with only forbidden path characters removed. */
export function projectFolderNameFromTitle(title: string): string {
  let s = title
    .trim()
    .replace(INVALID_PROJECT_FOLDER_CHARS, "")
    .trim();
  if (!s) s = "Untitled";
  if (s.length > 200) s = s.slice(0, 200).trimEnd();
  return s || "Untitled";
}

async function projectFolderNameTaken(
  name: string,
  options?: { exceptFolderId?: string },
): Promise<boolean> {
  let entries;
  try {
    entries = await readDir(IOS_PROJECTS_DIR, { baseDir: BaseDirectory.Document });
  } catch {
    return false;
  }
  const lower = name.toLowerCase();
  const except = options?.exceptFolderId?.toLowerCase() ?? null;
  return entries.some(
    (e) =>
      e.isDirectory &&
      e.name &&
      e.name.toLowerCase() === lower &&
      e.name.toLowerCase() !== except,
  );
}

/**
 * @returns error message or null if OK to create
 */
export async function iosValidateNewProjectTitle(
  title: string,
  projects: IosProjectSummary[],
): Promise<string | null> {
  const t = title.trim() || "Untitled";
  const lower = t.toLowerCase();
  if (projects.some((p) => p.title.trim().toLowerCase() === lower)) {
    return "A project with this name already exists.";
  }
  const folderName = projectFolderNameFromTitle(t);
  if (await projectFolderNameTaken(folderName)) {
    return `A folder named "${folderName}" already exists. Use a different title.`;
  }
  return null;
}

export async function iosListProjects(): Promise<IosProjectSummary[]> {
  await mkdir(IOS_PROJECTS_DIR, { baseDir: BaseDirectory.Document, recursive: true });
  let entries;
  try {
    entries = await readDir(IOS_PROJECTS_DIR, { baseDir: BaseDirectory.Document });
  } catch {
    return [];
  }
  const root = await documentsRoot();
  const out: IosProjectSummary[] = [];
  for (const e of entries) {
    if (!e.isDirectory || !e.name) continue;
    const relMeta = `${IOS_PROJECTS_DIR}/${e.name}/${IOS_PROJECT_META}`;
    try {
      const raw = await readTextFile(relMeta, { baseDir: BaseDirectory.Document });
      const m = JSON.parse(raw) as IosProjectMeta;
      if (m.version !== 1) continue;
      out.push({
        folderId: e.name,
        title: (m.title || "Untitled").trim() || "Untitled",
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
        absPath: `${root}/${IOS_PROJECTS_DIR}/${e.name}`,
      });
    } catch {
      /* not a project folder */
    }
  }
  out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return out;
}

/** Creates project folder; call iosValidateNewProjectTitle first. main.typ starts empty. */
export async function iosCreateProject(title: string): Promise<IosProjectSummary> {
  const t = title.trim() || "Untitled";
  const folderName = projectFolderNameFromTitle(t);
  await mkdir(IOS_PROJECTS_DIR, { baseDir: BaseDirectory.Document, recursive: true });
  const base = `${IOS_PROJECTS_DIR}/${folderName}`;
  await mkdir(base, { baseDir: BaseDirectory.Document, recursive: true });
  const now = new Date().toISOString();
  const meta: IosProjectMeta = {
    version: 1,
    title: t,
    createdAt: now,
    updatedAt: now,
  };
  await writeTextFile(
    `${base}/${IOS_PROJECT_META}`,
    JSON.stringify(meta, null, 2),
    { baseDir: BaseDirectory.Document },
  );
  await writeTextFile(`${base}/main.typ`, "", { baseDir: BaseDirectory.Document });
  const root = await documentsRoot();
  return {
    folderId: folderName,
    title: t,
    createdAt: now,
    updatedAt: now,
    absPath: `${root}/${base}`,
  };
}

/** Title-only metadata update (folder id unchanged). Prefer `iosRenameProject` in the UI. */
export async function iosUpdateProjectTitle(folderId: string, title: string): Promise<void> {
  const metaPath = `${IOS_PROJECTS_DIR}/${folderId}/${IOS_PROJECT_META}`;
  const raw = await readTextFile(metaPath, { baseDir: BaseDirectory.Document });
  const m = JSON.parse(raw) as IosProjectMeta;
  m.title = title.trim() || "Untitled";
  m.updatedAt = new Date().toISOString();
  await writeTextFile(metaPath, JSON.stringify(m, null, 2), {
    baseDir: BaseDirectory.Document,
  });
}

/** Validate rename: unique title among others; target folder must not exist (case-insensitive, except self). */
export async function iosValidateRenameProject(
  newTitle: string,
  currentFolderId: string,
  projects: IosProjectSummary[],
): Promise<string | null> {
  const t = newTitle.trim() || "Untitled";
  const lower = t.toLowerCase();
  const folderName = projectFolderNameFromTitle(t);
  for (const p of projects) {
    if (p.folderId === currentFolderId) continue;
    if (p.title.trim().toLowerCase() === lower) {
      return "A project with this name already exists.";
    }
  }
  if (
    folderName !== currentFolderId &&
    folderName.toLowerCase() !== currentFolderId.toLowerCase()
  ) {
    if (await projectFolderNameTaken(folderName, { exceptFolderId: currentFolderId })) {
      return `A folder named "${folderName}" already exists. Use a different title.`;
    }
  }
  return null;
}

export async function iosRenameProject(
  folderId: string,
  newTitle: string,
): Promise<{ folderId: string; absPath: string; title: string }> {
  return await invoke("rename_ios_project", {
    folderId,
    newTitle: newTitle.trim() || "Untitled",
  });
}

export async function iosTouchProjectUpdated(folderId: string): Promise<void> {
  const metaPath = `${IOS_PROJECTS_DIR}/${folderId}/${IOS_PROJECT_META}`;
  try {
    const raw = await readTextFile(metaPath, { baseDir: BaseDirectory.Document });
    const m = JSON.parse(raw) as IosProjectMeta;
    m.updatedAt = new Date().toISOString();
    await writeTextFile(metaPath, JSON.stringify(m, null, 2), {
      baseDir: BaseDirectory.Document,
    });
  } catch {
    /* ignore */
  }
}

export async function iosDeleteProject(folderId: string): Promise<void> {
  await remove(`${IOS_PROJECTS_DIR}/${folderId}`, {
    baseDir: BaseDirectory.Document,
    recursive: true,
  });
}

/** Copy a .typ file from an absolute path (e.g. document picker) into the project. */
export async function iosImportTypIntoProject(
  folderId: string,
  sourceAbsPath: string,
  preferredName: string,
): Promise<string> {
  const text = await readTextFile(sourceAbsPath);
  let name = preferredName.endsWith(".typ") ? preferredName : `${preferredName}.typ`;
  if (name.startsWith(".")) name = `imported-${name.replace(/^\./, "")}`;
  const base = `${IOS_PROJECTS_DIR}/${folderId}`;
  const existing = await readDir(base, { baseDir: BaseDirectory.Document });
  const names = new Set(existing.map((e) => e.name).filter(Boolean));
  if (names.has(name)) {
    const stem = name.replace(/\.typ$/i, "");
    let n = 2;
    while (names.has(`${stem}-${n}.typ`)) n += 1;
    name = `${stem}-${n}.typ`;
  }
  await writeTextFile(`${base}/${name}`, text, { baseDir: BaseDirectory.Document });
  await iosTouchProjectUpdated(folderId);
  const root = await documentsRoot();
  return `${root}/${base}/${name}`;
}
