<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import * as monaco from "monaco-editor";
  import { listen } from "@tauri-apps/api/event";
  import { GripVertical } from "lucide-svelte";
  import { open, save, message, ask } from "@tauri-apps/plugin-dialog";
  import {
    readTextFile,
    writeTextFile,
    readDir,
    BaseDirectory,
  } from "@tauri-apps/plugin-fs";
  import { join } from "@tauri-apps/api/path";
  import Header from "./components/Header.svelte";
  import Sidebar from "./components/Sidebar.svelte";
  import SettingsModal from "./components/SettingsModal.svelte";
  import InitialPage from "./components/InitialPage.svelte";
  import IosProjectHub from "./components/IosProjectHub.svelte";
  import SvgPreview from "./components/SvgPreview.svelte";
  import MonacoEditorPane from "./components/MonacoEditorPane.svelte";
  import EditorQuickActions from "./components/EditorQuickActions.svelte";
  import {
    syncAppShortcuts,
    applyMonacoShortcutOverrides,
    shortcutOverrides,
    type ShortcutAction,
  } from "./lib/shortcuts";
  import { fetchAppDisplayName, defaultNewFileContent } from "./lib/appMeta";
  import {
    readStoredThemePreference,
    persistThemePreference,
    THEME_PREFERENCE_OPTIONS,
    resolveAppearance,
    resolveMonacoCatThemeId,
    isValidThemePreference,
    type ThemePreference,
  } from "./lib/monacoThemes";
  import { listTypstFontFaces, type TypstFontFace } from "./lib/typstFonts";
  import {
    iosListProjects,
    iosCreateProject,
    iosValidateNewProjectTitle,
    iosRenameProject,
    IOS_PROJECTS_DIR,
    iosDeleteProject,
    iosImportTypIntoProject,
    iosTouchProjectUpdated,
    type IosProjectSummary,
  } from "./lib/iosProjects";
  import pkg from "../package.json";

  let appName = $state(pkg.name);

  let openFiles = $state<{ path: string; name: string; content: string; isDirty?: boolean; lastSaved?: Date | null }[]>([]);
  let currentFilePath = $state<string | null>(null);
  let currentFolder = $state<string | null>(null);
  let fileUiMode = $state<"desktop" | "ios-projects">("desktop");
  let iosProjectsList = $state<IosProjectSummary[]>([]);
  /** Active iOS project folder (absolute path); null on project picker hub */
  let iosProjectPath = $state<string | null>(null);
  let iosProjectFolderId = $state<string | null>(null);
  let iosProjectTitle = $state("");
  let isIosProjectHub = $derived(fileUiMode === "ios-projects" && !iosProjectPath);
  let isLandingPage = $derived(
    fileUiMode === "desktop" &&
      openFiles.length === 0 &&
      !currentFilePath &&
      !currentFolder,
  );

  let content = $state("");
  let pages = $state<string[]>([]);
  let pageCount = $state(0);
  let currentPage = $state(0);
  let error = $state("");

  /** iOS/Android: WKWebView has no working window.prompt — use modal instead */
  let saveAsModalOpen = $state(false);
  let saveAsFilename = $state("untitled.typ");
  let saveAsDocsRoot = $state<string | null>(null);
  let saveAsIntent = $state<"saveAs" | "newFile">("saveAs");

  /** Write via Document base dir when path is under app Documents (more reliable on iOS). */
  async function writeFileAtPath(absPath: string, data: string): Promise<void> {
    const root = await invoke<string | null>("workspace_documents_dir");
    if (root) {
      const normRoot = root.replace(/\/$/, "");
      const normPath = absPath.replace(/\/$/, "");
      if (normPath === normRoot || normPath.startsWith(`${normRoot}/`)) {
        const rel =
          normPath === normRoot ? "" : normPath.slice(normRoot.length + 1);
        if (rel && !rel.startsWith("..") && !rel.includes("/../")) {
          await writeTextFile(rel, data, { baseDir: BaseDirectory.Document });
          return;
        }
      }
    }
    await writeTextFile(absPath, data);
  }

  /** Persist the active editor to disk (iOS project mode) before switching files or leaving. */
  async function iosFlushCurrentEditor(): Promise<void> {
    if (fileUiMode !== "ios-projects" || !iosProjectPath) return;
    const path = currentFilePath;
    if (!path || !path.startsWith(iosProjectPath)) return;
    const text = content;
    try {
      await writeFileAtPath(path, text);
      openFiles = openFiles.map((f) =>
        f.path === path
          ? { ...f, content: text, isDirty: false, lastSaved: new Date() }
          : f,
      );
      if (iosProjectFolderId) void iosTouchProjectUpdated(iosProjectFolderId);
    } catch (e) {
      console.error("iosFlushCurrentEditor:", e);
    }
  }

  function closeSaveAsModal() {
    saveAsModalOpen = false;
    saveAsDocsRoot = null;
  }

  async function confirmSaveAsModal() {
    if (!saveAsDocsRoot) return;
    let base = saveAsFilename.trim();
    if (!base) {
      error = "Enter a file name.";
      return;
    }
    if (!base.endsWith(".typ")) base = `${base}.typ`;
    const intent = saveAsIntent;

    /** Inside an iOS project, New File creates a new .typ on disk immediately (template). */
    if (
      intent === "newFile" &&
      iosProjectPath &&
      saveAsDocsRoot === iosProjectPath
    ) {
      await iosFlushCurrentEditor();
      try {
        const entries = await readDir(iosProjectPath);
        const nameSet = new Set(
          entries.map((e) => e.name).filter(Boolean) as string[],
        );
        let fileName = base;
        if (nameSet.has(fileName)) {
          const stem = fileName.replace(/\.typ$/i, "");
          let n = 2;
          while (nameSet.has(`${stem}-${n}.typ`)) n += 1;
          fileName = `${stem}-${n}.typ`;
        }
        const selected = await join(iosProjectPath, fileName);
        const initial = defaultNewFileContent(appName);
        await writeFileAtPath(selected, initial);
        error = "";
        closeSaveAsModal();
        await loadFolderFiles(iosProjectPath);
        if (openFiles.find((f) => f.path === selected)) {
          openFiles = openFiles.map((f) =>
            f.path === selected
              ? {
                  ...f,
                  name: fileName,
                  content: initial,
                  isDirty: false,
                  lastSaved: new Date(),
                }
              : f,
          );
        } else {
          openFiles = [
            ...openFiles,
            {
              path: selected,
              name: fileName,
              content: initial,
              isDirty: false,
              lastSaved: new Date(),
            },
          ];
        }
        currentFilePath = selected;
        content = initial;
        editor?.setValue(initial);
        if (iosProjectFolderId) void iosTouchProjectUpdated(iosProjectFolderId);
      } catch (e) {
        error = `Error creating file: ${e}`;
      }
      return;
    }

    let selected: string;
    try {
      selected = await join(saveAsDocsRoot, base);
    } catch (e) {
      error = `Invalid file name: ${e}`;
      return;
    }
    try {
      await writeFileAtPath(selected, content);
    } catch (e) {
      error = `Error saving: ${e}`;
      return;
    }
    error = "";
    closeSaveAsModal();

    if (intent === "newFile") {
      const name = base;
      if (!openFiles.find((f) => f.path === selected)) {
        openFiles = [
          ...openFiles,
          {
            path: selected,
            name,
            content,
            isDirty: false,
            lastSaved: new Date(),
          },
        ];
      } else {
        openFiles = openFiles.map((f) =>
          f.path === selected
            ? { ...f, content, isDirty: false, lastSaved: new Date() }
            : f,
        );
      }
      currentFilePath = null;
      content = defaultNewFileContent(appName);
      editor?.setValue(content);
      if (currentFolder) void loadFolderFiles(currentFolder);
      if (iosProjectFolderId) void iosTouchProjectUpdated(iosProjectFolderId);
    } else {
      currentFilePath = selected;
      const name = base;
      if (openFiles.find((f) => f.path === selected)) {
        openFiles = openFiles.map((f) =>
          f.path === selected
            ? { ...f, isDirty: false, lastSaved: new Date(), content }
            : f,
        );
      } else {
        openFiles = [
          ...openFiles,
          { path: selected, name, content, isDirty: false, lastSaved: new Date() },
        ];
      }
      if (currentFolder) void loadFolderFiles(currentFolder);
      if (iosProjectFolderId) void iosTouchProjectUpdated(iosProjectFolderId);
    }
  }

  async function openMobileSaveAsModal(intent: "saveAs" | "newFile") {
    const root = await invoke<string | null>("workspace_documents_dir");
    if (!root) return false;
    saveAsDocsRoot = iosProjectPath ?? root;
    saveAsIntent = intent;
    saveAsFilename = "untitled.typ";
    saveAsModalOpen = true;
    return true;
  }
  /** Last successful compile for the current file (stale preview on error). */
  let lastValidPages = $state<string[]>([]);
  let lastValidPageCount = $state(0);
  type CompileDiagnostic = {
    file: string | null;
    line: number | null;
    column: number | null;
    message: string;
    hints: string[];
    trace: { message: string; line: number | null; column: number | null; file: string | null }[];
  };
  let compileDiagnostics = $state<CompileDiagnostic[]>([]);
  let pdfExporting = $state(false);

  let previewPages = $derived(
    compileDiagnostics.length > 0 && lastValidPages.length > 0
      ? lastValidPages
      : pages,
  );
  let previewPageCount = $derived(
    compileDiagnostics.length > 0 && lastValidPages.length > 0
      ? lastValidPageCount
      : pageCount,
  );
  let showingStalePreview = $derived(
    compileDiagnostics.length > 0 && lastValidPages.length > 0,
  );

  $effect(() => {
    void currentFilePath;
    lastValidPages = [];
    lastValidPageCount = 0;
    pages = [];
    pageCount = 0;
    compileDiagnostics = [];
  });
  const SPLIT_RATIO_KEY = "typst-editor-editor-preview-ratio";
  /** Minimum pane widths; above that, editor and preview share extra space by flex ratio (default 50/50). */
  const EDITOR_PANE_MIN = 100;
  const PREVIEW_PANE_MIN = 100;
  const SPLIT_GRIP_PX = 4;
  /** Matches layout: sidebar + editor/preview region needs at least this (web fallback; Tauri uses minWidth) */
  /** Sidebar + editor + grip + preview + mins need ~500px */
  const APP_MIN_WIDTH_PX = 400;
  const APP_MIN_HEIGHT_PX = 300;

  function readStoredSplitRatio(): number {
    try {
      const v = parseFloat(localStorage.getItem(SPLIT_RATIO_KEY) ?? "");
      if (Number.isFinite(v) && v >= 0.08 && v <= 0.92) return v;
    } catch {
      /* ignore */
    }
    return 0.5;
  }
  /** Editor share of flex grow (0–1); preview gets (1 - ratio). Default 0.5 → equal split after mins. */
  let splitRatio = $state(readStoredSplitRatio());
  let isResizing = $state(false);
  let editor = $state<monaco.editor.IStandaloneCodeEditor | undefined>(undefined);
  /**
   * Tauri `listen("menu-event")` runs in a closure that can read stale `$state` for `editor`.
   * Keep a plain object ref updated from onReady so Edit → Select All always sees the instance.
   */
  const monacoMenuRef: {
    current: monaco.editor.IStandaloneCodeEditor | undefined;
  } = { current: undefined };

  function selectAllInMonaco(ed: monaco.editor.IStandaloneCodeEditor) {
    const model = ed.getModel();
    if (!model) return;
    const lastLine = model.getLineCount();
    const endCol = model.getLineMaxColumn(lastLine);
    ed.focus();
    ed.setSelection(new monaco.Selection(1, 1, lastLine, endCol));
  }
  let systemPrefersDark = $state(
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : true,
  );
  let themePreference = $state<ThemePreference>(readStoredThemePreference());
  let resolvedAppearance = $derived(
    resolveAppearance(themePreference, systemPrefersDark),
  );
  let monacoThemeResolved = $derived(resolveMonacoCatThemeId(resolvedAppearance));

  function handleThemePreferenceChange(id: string) {
    if (!isValidThemePreference(id)) return;
    themePreference = id;
    persistThemePreference(id);
  }

  $effect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.appAppearance = resolvedAppearance;
  });

  let scale = $state(1);
  let translateX = $state(0);
  let translateY = $state(0);
  let folderFiles = $state<{ name: string; path: string; isDirectory: boolean }[]>([]);

  const SIDEBAR_W_KEY = "typst-editor-sidebar-width";
  const SIDEBAR_MIN = 160;
  const SIDEBAR_MAX = 560;
  function readStoredSidebarWidth(): number {
    try {
      const v = parseInt(localStorage.getItem(SIDEBAR_W_KEY) ?? "", 10);
      if (Number.isFinite(v)) {
        return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, v));
      }
    } catch {
      /* ignore */
    }
    return 260;
  }
  let sidebarWidth = $state(readStoredSidebarWidth());
  let sidebarVisible = $state(true);
  let previewVisible = $state(true);
  let isResizingSidebar = $state(false);
  let mainLayout: HTMLDivElement | undefined = $state();
  let editorPreviewRegion: HTMLDivElement | undefined = $state();
  let isShortcutsModalOpen = $state(false);
  let settingsInitialTab = $state<"shortcuts" | "packageCache" | "fonts" | "faq">("shortcuts");
  let typstFontFaces = $state<TypstFontFace[]>([]);

  async function refreshTypstFontFaces() {
    try {
      typstFontFaces = await listTypstFontFaces();
    } catch {
      typstFontFaces = [];
    }
  }

  function openSettings(tab: "shortcuts" | "packageCache" | "fonts" | "faq" = "shortcuts") {
    settingsInitialTab = tab;
    isShortcutsModalOpen = true;
  }
  let appZoom = $state(1);

  let currentFileDirty = $derived(
    openFiles.find((f) => f.path === currentFilePath)?.isDirty ?? false,
  );
  let currentFileLastSaved = $derived(
    openFiles.find((f) => f.path === currentFilePath)?.lastSaved ?? null,
  );

  async function handleOpenFile() {
    if (fileUiMode === "ios-projects" && iosProjectPath) {
      await message("Use Import to add .typ files to this project.", {
        title: "Open file",
        kind: "info",
      });
      return;
    }
    try {
      const docsRoot = await invoke<string | null>("workspace_documents_dir");
      const selected = await open({
        multiple: false,
        filters: [{ name: "Typst", extensions: ["typ"] }],
        ...(docsRoot ? { defaultPath: docsRoot } : {}),
      });
      if (selected && !Array.isArray(selected)) {
        await openFileByPath(selected);
      }
    } catch (err) {
      error = `Error opening file: ${err}`;
    }
  }

  async function iosHandleImportTyp() {
    if (!iosProjectFolderId || !iosProjectPath) return;
    try {
      const selected = await open({
        multiple: true,
        filters: [{ name: "Typst", extensions: ["typ"] }],
      });
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      for (const path of paths) {
        await iosFlushCurrentEditor();
        const base = path.split("/").pop() || "imported.typ";
        const newPath = await iosImportTypIntoProject(iosProjectFolderId, path, base);
        await loadFolderFiles(iosProjectPath);
        await openFileByPath(newPath);
      }
      error = "";
    } catch (err) {
      error = `Import failed: ${err}`;
    }
  }

  async function iosHandleExportProject() {
    if (!iosProjectFolderId) return;
    try {
      const defaultPath = `${iosProjectFolderId}.zip`;
      const path = await save({
        defaultPath,
        filters: [{ name: "ZIP archive", extensions: ["zip"] }],
      });
      if (path === null) return;
      await invoke("export_ios_project_zip", {
        folderId: iosProjectFolderId,
        outputPath: path,
      });
      await message("All project files were saved to the ZIP.", {
        title: "Export project",
        kind: "info",
      });
      error = "";
    } catch (err) {
      await message(String(err), {
        title: "Export project failed",
        kind: "error",
      });
    }
  }

  async function openFileByPath(path: string) {
    try {
      if (
        fileUiMode === "ios-projects" &&
        iosProjectPath &&
        currentFilePath &&
        currentFilePath !== path
      ) {
        await iosFlushCurrentEditor();
      }
      const existing = openFiles.find((f) => f.path === path);
      if (existing) {
        content = existing.content;
        currentFilePath = path;
        editor?.setValue(content);
        return;
      }

      const text = await readTextFile(path);
      const name = path.split("/").pop() || path;
      openFiles = [...openFiles, { path, name, content: text, isDirty: false, lastSaved: null }];
      content = text;
      currentFilePath = path;
      editor?.setValue(text);
    } catch (err) {
      error = `Error reading file: ${err}`;
    }
  }

  async function handleCloseFile(path: string) {
    if (
      fileUiMode === "ios-projects" &&
      iosProjectPath &&
      currentFilePath === path
    ) {
      await iosFlushCurrentEditor();
    }
    const index = openFiles.findIndex((f) => f.path === path);
    if (index !== -1) {
      const newFiles = [...openFiles];
      newFiles.splice(index, 1);
      openFiles = newFiles;

      if (currentFilePath === path) {
        if (openFiles.length > 0) {
          const nextFile = openFiles[Math.max(0, index - 1)];
          await openFileByPath(nextFile.path);
        } else {
          currentFilePath = null;
          content = "";
          editor?.setValue("");
        }
      }
    }
  }

  async function loadFolderFiles(folderPath: string) {
    const entries = await readDir(folderPath);
    folderFiles = entries
      .filter((e) => !e.name?.startsWith("."))
      .map((e) => ({
        name: e.name || "",
        path: `${folderPath}/${e.name}`,
        isDirectory: e.isDirectory,
      }))
      .sort((a, b) => {
        if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
        return a.isDirectory ? -1 : 1;
      });
  }

  async function openAppDocumentsFolder() {
    const root = await invoke<string | null>("workspace_documents_dir");
    if (!root) return false;
    currentFolder = root;
    await loadFolderFiles(root);
    return true;
  }

  async function handleOpenFolder() {
    if (fileUiMode === "ios-projects") {
      await message("Open a project from the home screen, or create a new one.", {
        title: "Folders",
        kind: "info",
      });
      return;
    }
    try {
      if (await openAppDocumentsFolder()) return;
      const selected = await open({ directory: true, multiple: false });
      if (selected) {
        currentFolder = selected;
        await loadFolderFiles(selected);
      }
    } catch (err) {
      error = `Error opening folder: ${err}`;
    }
  }

  async function refreshIosProjects() {
    if (fileUiMode !== "ios-projects") return;
    try {
      iosProjectsList = await iosListProjects();
    } catch {
      iosProjectsList = [];
    }
  }

  async function enterIosProject(p: IosProjectSummary) {
    iosProjectPath = p.absPath;
    iosProjectFolderId = p.folderId;
    iosProjectTitle = p.title;
    currentFolder = p.absPath;
    openFiles = [];
    currentFilePath = null;
    await loadFolderFiles(p.absPath);
    const mainPath = `${p.absPath}/main.typ`;
    try {
      const text = await readTextFile(mainPath);
      openFiles = [
        {
          path: mainPath,
          name: "main.typ",
          content: text,
          isDirty: false,
          lastSaved: new Date(),
        },
      ];
      content = text;
      currentFilePath = mainPath;
      editor?.setValue(text);
    } catch {
      let entries: { name?: string; isDirectory: boolean }[] = [];
      try {
        entries = await readDir(p.absPath);
      } catch {
        /* ignore */
      }
      const typ = entries.find((e) => !e.isDirectory && e.name?.endsWith(".typ"));
      if (typ?.name) {
        await openFileByPath(`${p.absPath}/${typ.name}`);
      } else {
        content = defaultNewFileContent(appName);
        editor?.setValue(content);
      }
    }
  }

  async function leaveIosProject() {
    await iosFlushCurrentEditor();
    iosProjectPath = null;
    iosProjectFolderId = null;
    iosProjectTitle = "";
    currentFolder = null;
    openFiles = [];
    currentFilePath = null;
    content = "";
    folderFiles = [];
    editor?.setValue("");
    void refreshIosProjects();
  }

  /** @returns null on success, error message on failure */
  let iosImportFolderOpen = $state(false);
  let iosImportFolderPath = $state<string | null>(null);
  let iosImportFolderTitle = $state("");
  let iosImportFolderError = $state("");

  /** Default project title from a picked .zip path (iOS has no folder picker in Tauri). */
  function humanizeImportZipBasename(absPath: string): string {
    const base = absPath.replace(/\/+$/, "").split("/").pop() || "";
    const withoutZip = base.replace(/\.zip$/i, "");
    const s = withoutZip.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
    if (!s) return "Imported";
    return s.replace(/\b\w/g, (c) => c.toUpperCase());
  }

  async function iosRunImportFolderPicker() {
    try {
      // Tauri dialog returns FolderPickerNotImplemented for directory:true on iOS/Android.
      const selected = await open({
        multiple: false,
        pickerMode: "document",
        filters: [{ name: "ZIP archive", extensions: ["zip", "ZIP"] }],
      });
      if (!selected || Array.isArray(selected)) return;
      iosImportFolderPath = selected;
      iosImportFolderTitle = humanizeImportZipBasename(selected);
      iosImportFolderError = "";
      iosImportFolderOpen = true;
    } catch (e) {
      await message(String(e), { title: "Import project", kind: "error" });
    }
  }

  async function iosConfirmImportFolderAsProject() {
    const path = iosImportFolderPath;
    if (!path) return;
    await refreshIosProjects();
    const err = await iosValidateNewProjectTitle(
      iosImportFolderTitle,
      iosProjectsList,
    );
    if (err) {
      iosImportFolderError = err;
      return;
    }
    iosImportFolderError = "";
    try {
      const r = await invoke<{ folderId: string; absPath: string }>(
        "import_ios_project_from_zip",
        {
          zipPath: path,
          title: iosImportFolderTitle.trim() || "Untitled",
        },
      );
      const t = iosImportFolderTitle.trim() || "Untitled";
      iosImportFolderOpen = false;
      iosImportFolderPath = null;
      await enterIosProject({
        folderId: r.folderId,
        title: t,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        absPath: r.absPath,
      });
      void refreshIosProjects();
    } catch (e) {
      iosImportFolderError = String(e);
    }
  }

  async function iosCreateProjectFlow(title: string): Promise<string | null> {
    await refreshIosProjects();
    const err = await iosValidateNewProjectTitle(title, iosProjectsList);
    if (err) return err;
    try {
      const p = await iosCreateProject(title);
      await refreshIosProjects();
      await enterIosProject(p);
      return null;
    } catch (e) {
      return String(e);
    }
  }

  async function iosOnRenameProject(
    folderId: string,
    title: string,
  ): Promise<string | null> {
    try {
      const rootRaw = await invoke<string | null>("workspace_documents_dir");
      const root = rootRaw?.replace(/\/$/, "");
      if (!root) return "Documents not available.";
      const norm = (p: string) => p.replace(/\/+$/, "");
      const oldAbs = norm(`${root}/${IOS_PROJECTS_DIR}/${folderId}`);
      const r = await iosRenameProject(folderId, title);
      const newAbs = norm(r.absPath);
      if (iosProjectFolderId === folderId) {
        iosProjectFolderId = r.folderId;
        iosProjectPath = newAbs;
        iosProjectTitle = r.title;
        currentFolder = newAbs;
        openFiles = openFiles.map((f) => ({
          ...f,
          path: f.path.startsWith(oldAbs)
            ? newAbs + f.path.slice(oldAbs.length)
            : f.path,
        }));
        if (currentFilePath?.startsWith(oldAbs)) {
          currentFilePath = newAbs + currentFilePath.slice(oldAbs.length);
        }
        folderFiles = folderFiles.map((ff) => ({
          ...ff,
          path: ff.path.startsWith(oldAbs)
            ? newAbs + ff.path.slice(oldAbs.length)
            : ff.path,
        }));
      }
      await refreshIosProjects();
      return null;
    } catch (e) {
      return String(e);
    }
  }

  async function iosOnDeleteProject(folderId: string) {
    const ok = await ask(
      "Delete this project and all files inside? This cannot be undone.",
      { title: "Delete project", kind: "warning" },
    );
    if (!ok) return;
    try {
      await iosDeleteProject(folderId);
      if (iosProjectFolderId === folderId) void leaveIosProject();
      await refreshIosProjects();
    } catch (e) {
      error = String(e);
    }
  }

  async function handleRefreshFolderExplorer() {
    if (!currentFolder) return;
    try {
      await loadFolderFiles(currentFolder);
    } catch (err) {
      error = `Error refreshing folder: ${err}`;
    }
  }

  async function handleSave() {
    if (currentFilePath) {
      try {
        await writeFileAtPath(currentFilePath, content);
        openFiles = openFiles.map((f) =>
          f.path === currentFilePath
            ? { ...f, isDirty: false, lastSaved: new Date(), content }
            : f,
        );
        error = "";
        if (iosProjectFolderId) void iosTouchProjectUpdated(iosProjectFolderId);
      } catch (err) {
        error = `Error saving file: ${err}`;
      }
    } else {
      const mobile = await openMobileSaveAsModal("saveAs");
      if (!mobile) await handleSaveAs();
    }
  }

  async function handleSaveAs() {
    try {
      const mobile = await openMobileSaveAsModal("saveAs");
      if (mobile) return;
      const selected = await save({
        filters: [{ name: "Typst", extensions: ["typ"] }],
      });
      if (selected) {
        await writeTextFile(selected, content);
        currentFilePath = selected;
        const name = selected.split("/").pop() || selected;
        if (openFiles.find((f) => f.path === selected)) {
          openFiles = openFiles.map((f) =>
            f.path === selected
              ? { ...f, isDirty: false, lastSaved: new Date(), content }
              : f,
          );
        } else {
          openFiles = [
            ...openFiles,
            { path: selected, name, content, isDirty: false, lastSaved: new Date() },
          ];
        }
        error = "";
      }
    } catch (err) {
      error = `Error saving as: ${err}`;
    }
  }

  $effect(() => {
    if (currentFilePath && content) {
      const path = currentFilePath;
      const text = content;
      const debounceMs =
        fileUiMode === "ios-projects" && iosProjectPath ? 500 : 1000;
      const timeoutId = setTimeout(async () => {
        try {
          await writeFileAtPath(path, text);
          if (
            fileUiMode === "ios-projects" &&
            iosProjectPath &&
            path.startsWith(iosProjectPath)
          ) {
            openFiles = openFiles.map((f) =>
              f.path === path
                ? {
                    ...f,
                    content: text,
                    isDirty: false,
                    lastSaved: new Date(),
                  }
                : f,
            );
            if (iosProjectFolderId) void iosTouchProjectUpdated(iosProjectFolderId);
          }
        } catch (err) {
          console.error("Auto-sync failed:", err);
        }
      }, debounceMs);
      return () => clearTimeout(timeoutId);
    }
  });

  async function compile(
    text: string,
    pathSnapshot: string | null,
  ) {
    try {
      const result = await invoke<{
        success: boolean;
        pages: string[];
        pageCount: number;
        diagnostics: CompileDiagnostic[];
      }>("compile_typst", {
        content: text,
        mainPath: pathSnapshot ?? null,
      });
      if (currentFilePath !== pathSnapshot || content !== text) return;
      if (result.success) {
        pages = result.pages;
        pageCount = result.pageCount;
        lastValidPages = [...result.pages];
        lastValidPageCount = result.pageCount;
        compileDiagnostics = [];
        if (currentPage >= pageCount && pageCount > 0) {
          currentPage = pageCount - 1;
        } else if (pageCount === 0) {
          currentPage = 0;
        }
      } else {
        compileDiagnostics = result.diagnostics ?? [];
      }
    } catch (err) {
      if (currentFilePath !== pathSnapshot || content !== text) return;
      compileDiagnostics = [
        {
          message: String(err),
          file: null,
          line: null,
          column: null,
          hints: [],
          trace: [],
        },
      ];
    }
  }

  async function handleExportPdf() {
    if (pdfExporting) return;
    pdfExporting = true;
    try {
      const defaultPath = currentFilePath
        ? currentFilePath.replace(/\.typ$/i, "") + ".pdf"
        : "document.pdf";
      const path = await save({
        defaultPath,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (path === null) return;
      await invoke("export_typst_pdf", {
        content,
        mainPath: currentFilePath ?? null,
        outputPath: path,
      });
      await message(`PDF saved successfully.`, {
        title: "Export PDF",
        kind: "info",
      });
    } catch (e) {
      await message(String(e), {
        title: "PDF export failed",
        kind: "error",
      });
    } finally {
      pdfExporting = false;
    }
  }

  $effect(() => {
    const text = content;
    const pathSnapshot = currentFilePath;
    const timeoutId = setTimeout(() => {
      void compile(text, pathSnapshot);
    }, 300);
    return () => clearTimeout(timeoutId);
  });

  function handleEditorSplitResize(clientX: number) {
    if (!isResizing || !editorPreviewRegion) return;
    const rect = editorPreviewRegion.getBoundingClientRect();
    const innerW = rect.width - SPLIT_GRIP_PX;
    if (innerW <= 0) return;
    const minR = EDITOR_PANE_MIN / innerW;
    const maxR = 1 - PREVIEW_PANE_MIN / innerW;
    if (minR >= maxR) return;
    const x = clientX - rect.left;
    splitRatio = Math.min(maxR, Math.max(minR, x / innerW));
  }

  function handleSidebarResize(clientX: number) {
    if (!isResizingSidebar || !mainLayout) return;
    const { left, width: totalW } = mainLayout.getBoundingClientRect();
    const editorPreviewMin = SPLIT_GRIP_PX + EDITOR_PANE_MIN + PREVIEW_PANE_MIN;
    const max = Math.max(
      SIDEBAR_MIN,
      Math.min(SIDEBAR_MAX, totalW - editorPreviewMin),
    );
    sidebarWidth = Math.round(
      Math.min(max, Math.max(SIDEBAR_MIN, clientX - left)),
    );
  }

  /** Document-level pointer listeners: iOS/touch need this; passive:false avoids scroll stealing the drag */
  function beginPointerResize(kind: "sidebar" | "editor", e: PointerEvent) {
    e.preventDefault();
    applyResizeSelectionShield();
    if (kind === "sidebar") {
      isResizingSidebar = true;
    } else {
      isResizing = true;
    }
    const onMove = (ev: PointerEvent) => {
      ev.preventDefault();
      if (kind === "sidebar") {
        handleSidebarResize(ev.clientX);
      } else {
        handleEditorSplitResize(ev.clientX);
      }
    };
    const onEnd = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onEnd);
      document.removeEventListener("pointercancel", onEnd);
      stopAllResizing();
    };
    document.addEventListener("pointermove", onMove, { passive: false, capture: true });
    document.addEventListener("pointerup", onEnd, { capture: true });
    document.addEventListener("pointercancel", onEnd, { capture: true });
  }

  function applyResizeSelectionShield() {
    (document.activeElement as HTMLElement | null)?.blur?.();
    document.body.style.userSelect = "none";
    document.body.style.webkitUserSelect = "none";
  }

  function clearResizeSelectionShield() {
    document.body.style.removeProperty("user-select");
    document.body.style.removeProperty("-webkit-user-select");
  }

  function stopAllResizing() {
    const wasEditorSplit = isResizing;
    if (isResizingSidebar) {
      try {
        localStorage.setItem(SIDEBAR_W_KEY, String(sidebarWidth));
      } catch {
        /* ignore */
      }
    }
    if (wasEditorSplit && previewVisible) {
      try {
        localStorage.setItem(SPLIT_RATIO_KEY, String(splitRatio));
      } catch {
        /* ignore */
      }
    }
    isResizing = false;
    isResizingSidebar = false;
    clearResizeSelectionShield();
  }

  function handleEditorSplitPointerDown(e: PointerEvent) {
    beginPointerResize("editor", e);
  }

  function handleSidebarGripPointerDown(e: PointerEvent) {
    beginPointerResize("sidebar", e);
  }

  function appZoomIn() {
    appZoom = Math.min(appZoom + 0.1, 3);
  }
  function appZoomOut() {
    appZoom = Math.max(appZoom - 0.1, 0.5);
  }
  function resetAppZoom() {
    appZoom = 1;
  }

  function nextPage() {
    if (currentPage < pageCount - 1) currentPage++;
  }

  function prevPage() {
    if (currentPage > 0) currentPage--;
  }

  function onEditorContentChange(newValue: string) {
    if (content !== newValue) {
      content = newValue;
      if (currentFilePath) {
        openFiles = openFiles.map((f) =>
          f.path === currentFilePath ? { ...f, isDirty: true, content: newValue } : f,
        );
      }
    }
  }

  async function handleShortcutCommand(action: ShortcutAction) {
    switch (action) {
      case "file.new": {
        const mobile = await openMobileSaveAsModal("newFile");
        if (mobile) break;
        await handleSaveAs();
        if (currentFilePath) {
          const name = currentFilePath.split("/").pop() || "untitled.typ";
          if (!openFiles.find((f) => f.path === currentFilePath)) {
            openFiles = [
              ...openFiles,
              {
                path: currentFilePath,
                name,
                content: defaultNewFileContent(appName),
                isDirty: false,
                lastSaved: new Date(),
              },
            ];
          }
          content = defaultNewFileContent(appName);
          editor?.setValue(content);
        }
        break;
      }
      case "file.open":
        handleOpenFile();
        break;
      case "file.openFolder":
        handleOpenFolder();
        break;
      case "file.save":
        handleSave();
        break;
      case "file.saveAs":
        handleSaveAs();
        break;
      case "view.zoomIn":
        appZoomIn();
        break;
      case "view.zoomOut":
        appZoomOut();
        break;
      case "view.resetZoom":
        resetAppZoom();
        break;
      case "view.nextPage":
        nextPage();
        break;
      case "view.prevPage":
        prevPage();
        break;
      case "view.toggleSidebar":
        sidebarVisible = !sidebarVisible;
        break;
      case "settings.shortcuts":
        openSettings("shortcuts");
        break;
    }
  }

  /** Same actions as Tauri desktop `menu-event` + Edit items for in-app menu (mobile). */
  function dispatchMenuId(id: string) {
    console.log("[typst-editor:menu] dispatchMenuId:", id);
    switch (id) {
      case "file-new":
        void handleShortcutCommand("file.new");
        break;
      case "file-open":
        void handleOpenFile();
        break;
      case "file-open-folder":
        void handleOpenFolder();
        break;
      case "ios-import-typ":
        void iosHandleImportTyp();
        break;
      case "ios-export-project":
        void iosHandleExportProject();
        break;
      case "ios-back-projects":
        void leaveIosProject();
        break;
      case "ios-import-folder-project":
        void iosRunImportFolderPicker();
        break;
      case "file-save":
        void handleSave();
        break;
      case "file-save-as":
        void handleSaveAs();
        break;
      case "file-export-pdf":
        void handleExportPdf();
        break;
      case "view-zoom-in":
        appZoomIn();
        break;
      case "view-zoom-out":
        appZoomOut();
        break;
      case "view-reset-zoom":
        resetAppZoom();
        break;
      case "view-toggle-sidebar":
        sidebarVisible = !sidebarVisible;
        break;
      case "help-faq":
        openSettings("faq");
        break;
      case "help-shortcuts":
        openSettings("shortcuts");
        break;
      case "help-package-cache":
        openSettings("packageCache");
        break;
      case "help-fonts":
        openSettings("fonts");
        break;
      case "edit-select-all": {
        requestAnimationFrame(() => {
          const ed = monacoMenuRef.current;
          const ae = document.activeElement as HTMLElement | null;
          const inMonaco = ae?.closest?.(".monaco-editor") != null;
          if (inMonaco && ed) {
            selectAllInMonaco(ed);
          } else if (ae instanceof HTMLInputElement || ae instanceof HTMLTextAreaElement) {
            ae.select();
          } else if (ae?.isContentEditable) {
            const sel = document.getSelection();
            const range = document.createRange();
            range.selectNodeContents(ae);
            sel?.removeAllRanges();
            sel?.addRange(range);
          } else if (ed) {
            selectAllInMonaco(ed);
          }
        });
        break;
      }
      case "edit-undo": {
        const ed = monacoMenuRef.current;
        ed?.focus();
        ed?.trigger("keyboard", "undo", null);
        break;
      }
      case "edit-redo": {
        const ed = monacoMenuRef.current;
        ed?.focus();
        ed?.trigger("keyboard", "redo", null);
        break;
      }
      case "edit-cut": {
        const ed = monacoMenuRef.current;
        ed?.focus();
        ed?.trigger("keyboard", "editor.action.clipboardCutAction", null);
        break;
      }
      case "edit-copy": {
        const ed = monacoMenuRef.current;
        ed?.focus();
        ed?.trigger("keyboard", "editor.action.clipboardCopyAction", null);
        break;
      }
      case "edit-paste": {
        const ed = monacoMenuRef.current;
        ed?.focus();
        ed?.trigger("keyboard", "editor.action.clipboardPasteAction", null);
        break;
      }
      default:
        console.log("[typst-editor:menu] unhandled menu id:", id);
    }
  }

  let showInAppMenu = $state(false);

  onMount(() => {
    void refreshTypstFontFaces();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    systemPrefersDark = mq.matches;
    const onScheme = () => {
      systemPrefersDark = mq.matches;
    };
    mq.addEventListener("change", onScheme);

    void (async () => {
      try {
        const n = await fetchAppDisplayName();
        appName = n;
        document.title = n;
      } catch {
        document.title = appName;
      }
    })();

    void invoke<boolean>("app_has_native_menu")
      .then((native) => {
        showInAppMenu = !native;
      })
      .catch(() => {
        /* web dev / older host: keep native assumption (no in-app menu) */
      });

    void (async () => {
      try {
        const mode = await invoke<string>("app_file_ui_mode");
        if (mode === "ios-projects") {
          fileUiMode = "ios-projects";
          await refreshIosProjects();
          return;
        }
      } catch {
        /* web dev */
      }
      fileUiMode = "desktop";
      try {
        const root = await invoke<string | null>("workspace_documents_dir");
        if (root) {
          currentFolder = root;
          try {
            await loadFolderFiles(root);
          } catch (e) {
            console.warn("typst-editor: could not list Documents", e);
          }
        }
      } catch {
        /* ignore */
      }
    })();

    const unlistenMenu = listen("menu-event", (event) => {
      dispatchMenuId(event.payload as string);
    });

    /** Debug: selection logging */
    let selectDebugTimer: ReturnType<typeof setTimeout> | undefined;
    const logSelectionState = (reason: string) => {
      const ae = document.activeElement as HTMLElement | null;
      const domSel = document.getSelection();
      const inMonaco = ae?.closest?.(".monaco-editor") != null;
      const ed = editor;
      let monacoSel: string | undefined;
      let monacoHasFocus: boolean | undefined;
      try {
        if (ed) {
          const m = ed.getSelection();
          monacoSel = m
            ? `L${m.startLineNumber}:C${m.startColumn} → L${m.endLineNumber}:C${m.endColumn}`
            : "(null)";
          monacoHasFocus = ed.hasTextFocus();
        }
      } catch {
        monacoSel = "(error reading monaco selection)";
      }
      console.log("[typst-editor:select-debug]", reason, {
        activeElement: ae ? `${ae.tagName}.${ae.className?.toString?.().slice(0, 80) || ""}` : null,
        inMonaco,
        monacoHasFocus,
        monacoSelection: monacoSel,
        domSelectionLength: domSel?.toString().length ?? 0,
        domSelectionPreview: (domSel?.toString() ?? "").slice(0, 120),
      });
    };
    const onSelectionChange = () => {
      if (selectDebugTimer) clearTimeout(selectDebugTimer);
      selectDebugTimer = setTimeout(() => logSelectionState("selectionchange"), 80);
    };
    document.addEventListener("selectionchange", onSelectionChange);

    const handleShortcutTrigger = (e: CustomEvent<string>) => {
      handleShortcutCommand(e.detail);
    };
    window.addEventListener("shortcut-trigger", handleShortcutTrigger as EventListener);

    return () => {
      mq.removeEventListener("change", onScheme);
      document.removeEventListener("selectionchange", onSelectionChange);
      if (selectDebugTimer) clearTimeout(selectDebugTimer);
      unlistenMenu.then((u) => u());
      window.removeEventListener("shortcut-trigger", handleShortcutTrigger as EventListener);
    };
  });

  $effect(() => {
    if (!editor) return;
    const o = $shortcutOverrides;
    syncAppShortcuts(o, {
      "file.new": () => handleShortcutCommand("file.new"),
      "file.open": handleOpenFile,
      "file.openFolder": handleOpenFolder,
      "file.save": handleSave,
      "file.saveAs": handleSaveAs,
      "view.zoomIn": appZoomIn,
      "view.zoomOut": appZoomOut,
      "view.resetZoom": resetAppZoom,
      "view.toggleSidebar": () => {
        sidebarVisible = !sidebarVisible;
      },
      "view.nextPage": nextPage,
      "view.prevPage": prevPage,
      "settings.shortcuts": () => openSettings("shortcuts"),
    });
    applyMonacoShortcutOverrides(editor, monaco, o);
  });
</script>


<div
  class="flex flex-col h-screen bg-[var(--app-bg)] text-[var(--app-fg)] overflow-hidden {isResizing ||
  isResizingSidebar
    ? 'cursor-col-resize select-none'
    : ''}"
  style:zoom={appZoom}
  style:min-width="{APP_MIN_WIDTH_PX}px"
  style:min-height="{APP_MIN_HEIGHT_PX}px"
>
  <Header
    {appName}
    {showInAppMenu}
    onInAppMenuAction={dispatchMenuId}
    inAppMenuLanding={isLandingPage || isIosProjectHub}
    iosMenuHub={isIosProjectHub}
    iosMenuProject={fileUiMode === "ios-projects" && !!iosProjectPath}
    onShowShortcuts={() => openSettings("shortcuts")}
    colorMode={themePreference}
    onColorModeChange={handleThemePreferenceChange}
    colorModeOptions={THEME_PREFERENCE_OPTIONS}
    filePath={currentFilePath}
    isDirty={currentFileDirty}
    lastSaved={currentFileLastSaved}
    showPanelToggles={!isLandingPage && !isIosProjectHub}
    {sidebarVisible}
    onToggleSidebar={() => (sidebarVisible = !sidebarVisible)}
    {previewVisible}
    onTogglePreview={() => (previewVisible = !previewVisible)}
    showExportPdf={!isLandingPage && !isIosProjectHub}
    {pdfExporting}
    onExportPdf={handleExportPdf}
    onShowCommandPalette={!isLandingPage && !isIosProjectHub
      ? () => {
          const ed = editor;
          if (!ed) return;
          ed.focus();
          ed.trigger("keyboard", "editor.action.quickCommand", null);
        }
      : undefined}
  />

  <SettingsModal
    isOpen={isShortcutsModalOpen}
    onClose={() => {
      isShortcutsModalOpen = false;
      void refreshTypstFontFaces();
    }}
    initialTab={settingsInitialTab}
  />

  {#if saveAsModalOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="fixed inset-0 z-[400] flex items-end justify-center sm:items-center p-4 bg-black/50"
      onclick={() => closeSaveAsModal()}
      role="presentation"
    >
      <div
        class="w-full max-w-md rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] shadow-xl p-4 space-y-4"
        role="dialog"
        aria-labelledby="save-as-title"
        tabindex="0"
        onclick={(e) => e.stopPropagation()}
      >
        <h2 id="save-as-title" class="text-lg font-semibold text-[var(--app-fg)]">
          {saveAsIntent === "newFile" && iosProjectPath
            ? "New file"
            : saveAsIntent === "newFile"
              ? "Save document as…"
              : "Save as…"}
        </h2>
        <p class="text-sm text-[var(--app-fg-secondary)]">
          {#if saveAsIntent === "newFile" && iosProjectPath}
            Creates a new .typ in this project and saves it immediately. Your current file is
            saved first if it has unsaved changes.
          {:else if iosProjectPath}
            Saved inside project “{iosProjectTitle}” (app Documents only).
          {:else}
            File name in app Documents (shown in Files → On My iPhone → {appName})
          {/if}
        </p>
        <input
          type="text"
          bind:value={saveAsFilename}
          class="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-elevated)] px-3 py-2.5 text-[var(--app-fg)] text-base"
          placeholder="untitled.typ"
          autocomplete="off"
          autocapitalize="off"
          enterkeyhint="done"
        />
        <div class="flex justify-end gap-2 pt-2">
          <button
            type="button"
            class="px-4 py-2 rounded-lg text-sm font-medium text-[var(--app-fg-secondary)] hover:bg-[var(--app-btn-ghost-hover)]"
            onclick={() => closeSaveAsModal()}
          >
            Cancel
          </button>
          <button
            type="button"
            class="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white"
            onclick={() => void confirmSaveAsModal()}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  {/if}

  {#if iosImportFolderOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="fixed inset-0 z-[400] flex items-end sm:items-center justify-center p-4 bg-black/50"
      onclick={() => {
        iosImportFolderOpen = false;
        iosImportFolderPath = null;
        iosImportFolderError = "";
      }}
      role="presentation"
    >
      <div
        class="w-full max-w-md rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] shadow-xl p-4 space-y-4"
        role="dialog"
        aria-labelledby="import-folder-title"
        tabindex="0"
        onclick={(e) => e.stopPropagation()}
      >
        <h2 id="import-folder-title" class="text-lg font-semibold text-[var(--app-fg)]">
          Import project from ZIP
        </h2>
        <p class="text-xs text-[var(--app-fg-secondary)]">
          The archive is extracted into a new project (same skips as desktop:
          <code class="text-[10px]">.git</code>, <code class="text-[10px]">node_modules</code>, etc.).
          If the ZIP has a single top-level folder, that wrapper is stripped. Missing
          <code class="text-[10px]">main.typ</code> is added. Pick a unique project title.
        </p>
        <input
          type="text"
          bind:value={iosImportFolderTitle}
          placeholder="Project title"
          class="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-elevated)] px-3 py-2.5 text-[var(--app-fg)] text-base"
          autocomplete="off"
        />
        {#if iosImportFolderError}
          <p class="text-sm text-red-600 dark:text-red-400" role="alert">
            {iosImportFolderError}
          </p>
        {/if}
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="px-4 py-2 rounded-lg text-sm text-[var(--app-fg-secondary)]"
            onclick={() => {
              iosImportFolderOpen = false;
              iosImportFolderPath = null;
              iosImportFolderError = "";
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            class="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white"
            onclick={() => void iosConfirmImportFolderAsProject()}
          >
            Import
          </button>
        </div>
      </div>
    </div>
  {/if}

  <div
    bind:this={mainLayout}
    class="flex flex-1 w-full min-h-0 overflow-hidden relative"
  >
    {#if isIosProjectHub}
      <IosProjectHub
        {appName}
        projects={iosProjectsList}
        onRefresh={refreshIosProjects}
        onOpenProject={(p) => void enterIosProject(p)}
        onCreateProject={iosCreateProjectFlow}
        onRenameProject={iosOnRenameProject}
        onDeleteProject={iosOnDeleteProject}
        onImportFolder={() => void iosRunImportFolderPicker()}
      />
    {:else}
      {#if isLandingPage}
        <InitialPage
          {appName}
          onNewFile={() => handleShortcutCommand("file.new")}
          onOpenFile={handleOpenFile}
          onOpenFolder={handleOpenFolder}
        />
      {/if}

    {#if sidebarVisible}
      <Sidebar
        width={sidebarWidth}
        {openFiles}
        activeFile={currentFilePath}
        {currentFolder}
        {folderFiles}
        onSelectFile={openFileByPath}
        onCloseFile={handleCloseFile}
        onRefreshFolder={handleRefreshFolderExplorer}
        iosProjectTitle={iosProjectPath ? iosProjectTitle : null}
        onIosBackToProjects={() => void leaveIosProject()}
      />
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        onpointerdown={handleSidebarGripPointerDown}
        class="touch-none shrink-0 z-10 relative group flex w-2 items-stretch justify-center cursor-col-resize"
        title="Drag to resize sidebar"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
      >
        <div
          class="w-px self-stretch min-h-[120px] max-h-[80vh] my-auto rounded-full transition-colors bg-[var(--app-grip)] hover:bg-[var(--app-grip-hover)] {isResizingSidebar
            ? 'bg-[var(--app-grip-active)]'
            : ''}"
        ></div>
        <div
          class="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-10 w-6 flex items-center justify-center rounded-md bg-[var(--app-bg)] border border-[var(--app-border)] opacity-0 sm:group-hover:opacity-100 transition-opacity max-sm:hidden"
        >
          <GripVertical size={16} class="text-[var(--app-icon-muted)]" />
        </div>
      </div>
    {/if}

    <div
      bind:this={editorPreviewRegion}
      class="flex-1 min-h-0 min-w-0 {previewVisible ? 'grid' : 'flex'}"
      style:grid-template-columns={previewVisible
        ? `minmax(${EDITOR_PANE_MIN}px, ${Math.max(1, Math.round(splitRatio * 1000))}fr) ${SPLIT_GRIP_PX}px minmax(${PREVIEW_PANE_MIN}px, ${Math.max(1, Math.round((1 - splitRatio) * 1000))}fr)`
        : undefined}
    >
      <div
        class="h-full relative min-w-0 flex flex-col border-r border-[var(--app-border)] overflow-hidden {previewVisible
          ? 'min-h-0'
          : 'flex-1 min-h-0'}"
      >
        <EditorQuickActions editor={editor} typstFontFaces={typstFontFaces} />
        <div class="flex-1 min-h-0 min-w-0 flex flex-col">
          <MonacoEditorPane
            initialValue={content}
            {appZoom}
            monacoTheme={monacoThemeResolved}
            onContentChange={onEditorContentChange}
            onReady={(ed) => {
              editor = ed;
              monacoMenuRef.current = ed;
            }}
            onDispose={() => {
              editor = undefined;
              monacoMenuRef.current = undefined;
            }}
          />
        </div>
      </div>

      {#if previewVisible}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          onpointerdown={handleEditorSplitPointerDown}
          class="touch-none shrink-0 z-10 relative group flex w-2 items-stretch justify-center cursor-col-resize"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize editor and preview"
        >
          <div
            class="w-px self-stretch min-h-[120px] max-h-[80vh] my-auto rounded-full transition-colors bg-[var(--app-grip)] hover:bg-[var(--app-grip-hover)] {isResizing
              ? 'bg-[var(--app-grip-active)]'
              : ''}"
          ></div>
          <div
            class="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-10 w-6 flex items-center justify-center rounded-md bg-[var(--app-bg)] border border-[var(--app-border)] opacity-0 sm:group-hover:opacity-100 transition-opacity max-sm:hidden"
          >
            <GripVertical size={16} class="text-[var(--app-icon-muted)]" />
          </div>
        </div>

        <div class="h-full flex flex-col min-w-0 min-h-0 overflow-hidden">
          <SvgPreview
            {error}
            pages={previewPages}
            bind:currentPage
            pageCount={previewPageCount}
            diagnostics={compileDiagnostics}
            stalePreview={showingStalePreview}
            bind:scale
            bind:translateX
            bind:translateY
          />
        </div>
      {/if}
    </div>
    {/if}
  </div>
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    overflow: hidden;
  }
</style>
