<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import * as monaco from "monaco-editor";
  import { listen } from "@tauri-apps/api/event";
  import { open, save, message, ask } from "@tauri-apps/plugin-dialog";
  import {
    readTextFile,
    readFile,
    writeTextFile,
    writeFile,
    readDir,
    BaseDirectory,
  } from "@tauri-apps/plugin-fs";
  import { join } from "@tauri-apps/api/path";
  import Header from "./components/Header.svelte";
  import ExportTypstModal from "./components/ExportTypstModal.svelte";
  import type { ExportTypstKindPayload } from "./lib/exportTypstKindPayload";
  import Sidebar from "./components/Sidebar.svelte";
  import SettingsModal from "./components/SettingsModal.svelte";
  import IosProjectHub from "./components/IosProjectHub.svelte";
  import EditorPreviewSplit from "./components/EditorPreviewSplit.svelte";
  import SaveAsModal from "./components/SaveAsModal.svelte";
  import ExplorerRenameModal from "./components/ExplorerRenameModal.svelte";
  import IosImportZipProjectModal from "./components/IosImportZipProjectModal.svelte";
  import PaneResizeGrip from "./components/PaneResizeGrip.svelte";
  import {
    monacoLanguageIdFromPath,
    isBinaryAssetPath,
    isPdfPath,
    isTypstPath,
    isSvgSourcePath,
    isMarkdownPreviewPath,
    isHtmlPreviewPath,
  } from "./lib/editorLanguage";
  import {
    renderMarkdownToSafeHtml,
    sanitizeHtmlForPreview,
  } from "./lib/markdownPreview";
  import {
    createAssetPreviewUrl,
    revokeAssetPreviewUrl,
  } from "./lib/assetPreviewUrl";
  import type { EmbedPdfDiskSaveApi } from "./lib/embedPdfAppChrome";
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
    projectFolderNameFromTitle,
    type IosProjectSummary,
  } from "./lib/iosProjects";
  import {
    loadFolderExplorerTree,
    remapFolderExplorerPaths,
    type FolderExplorerNode,
  } from "./lib/folderExplorerTree";
  import {
    projectRenamePath as renamePathOnDisk,
    projectRemovePath,
  } from "./lib/projectFileOps";
  import {
    desktopReadTextFile,
    desktopReadDir,
    desktopRecentRemove,
    desktopRecentProjectsList,
    desktopCreateProject,
    desktopUpdateProjectMetaTitle,
    desktopProjectTouchUpdatedMeta,
    desktopExportProjectZip,
    desktopProjectRowForPath,
    desktopRecentTouch,
    desktopImportTypIntoProject,
  } from "./lib/desktopProjectFs";
  import { exportStagingRelPath } from "./lib/appExportStaging";
  import { ensureDefaultTypstExtension, nextNonCollidingFileName } from "./lib/appTypstFileNames";
  import { normalizeFsPath, isExplorerPathInsideProject } from "./lib/appExplorerPaths";
  import { humanizeImportZipBasename } from "./lib/appImportZip";
  import {
    writeTextFileAtProjectPath,
    writeBinaryFileAtProjectPath,
  } from "./lib/appProjectWrite";
  import {
    invokeCompileTypst,
    compileDiagnosticFromUnknownError,
    type CompileDiagnostic,
  } from "./lib/appCompileTypst";
  import {
    SPLIT_RATIO_KEY,
    EDITOR_PANE_MIN,
    PREVIEW_PANE_MIN,
    SPLIT_GRIP_PX,
    APP_MIN_WIDTH_PX,
    APP_MIN_HEIGHT_PX,
    SIDEBAR_W_KEY,
    readStoredSplitRatio,
    readStoredSidebarWidth,
  } from "./lib/appLayoutStorage";
  import { editorSplitRatioFromPointer, sidebarWidthFromPointer } from "./lib/appPaneResizeGeometry";
  import {
    dispatchAppMenuId,
    runShortcutAction,
    type AppCommandContext,
  } from "./lib/appCommands";
  import { runTypstExportFromModal } from "./lib/appTypstExport";
  import pkg from "../package.json";

  let appName = $state(pkg.name);

  type OpenEditorTab = {
    path: string;
    name: string;
    content: string;
    isDirty?: boolean;
    lastSaved?: Date | null;
    isBinary?: boolean;
    assetUrl?: string;
    assetKind?: "image" | "pdf";
    /** iOS blob URL is stale after Save until refreshed; defer refresh so the viewer is not remounted (preserves undo). */
    pdfPreviewNeedsDiskSync?: boolean;
  };
  let openFiles = $state<OpenEditorTab[]>([]);
  /** EmbedPDF export handle while a PDF tab’s viewer is mounted. */
  let pdfDiskSaveApi = $state<EmbedPdfDiskSaveApi | null>(null);

  function revokeBlobUrlsInTabs(tabs: OpenEditorTab[]) {
    for (const t of tabs) revokeAssetPreviewUrl(t.assetUrl);
  }

  let currentFilePath = $state<string | null>(null);
  let currentFolder = $state<string | null>(null);
  let iosProjectsList = $state<IosProjectSummary[]>([]);
  /** `true` on iOS (ZIP import only); `false` on desktop (folder picker works). */
  let projectsUseDocumentDir = $state(true);
  /** Active project folder (absolute path); null on project hub */
  let iosProjectPath = $state<string | null>(null);
  let iosProjectFolderId = $state<string | null>(null);
  let iosProjectTitle = $state("");
  let isProjectHub = $derived(!iosProjectPath);
  /** Native menus: New / Save / Save As / Toggle Sidebar only when a project folder is open. */
  let workspaceNativeMenusEnabled = $derived(!isProjectHub);

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

  let explorerRenameModalOpen = $state(false);
  let explorerRenameFromPath = $state<string | null>(null);
  let explorerRenameNewName = $state("");
  let explorerRenameError = $state("");

  function touchProjectMetaUpdated() {
    if (!iosProjectPath) return;
    if (projectsUseDocumentDir) {
      if (iosProjectFolderId) void iosTouchProjectUpdated(iosProjectFolderId);
    } else {
      void desktopProjectTouchUpdatedMeta(iosProjectPath);
    }
  }

  async function writeFileAtPath(absPath: string, data: string): Promise<void> {
    return writeTextFileAtProjectPath(absPath, data, projectsUseDocumentDir);
  }

  async function writeBinaryFileAtPath(absPath: string, data: Uint8Array): Promise<void> {
    return writeBinaryFileAtProjectPath(absPath, data, projectsUseDocumentDir);
  }

  function markCurrentPdfDirty() {
    const path = currentFilePath;
    if (!path) return;
    openFiles = openFiles.map((f) =>
      f.path === path && f.assetKind === "pdf" ? { ...f, isDirty: true } : f,
    );
  }

  /** Blob preview URLs on iOS do not track disk writes; reload after save so reopen/switch-tab sees updates. */
  async function refreshPdfAssetPreviewUrl(absPath: string) {
    const tab = openFiles.find((f) => f.path === absPath && f.assetKind === "pdf");
    if (!tab?.assetUrl) return;
    const preview = await createAssetPreviewUrl(absPath, projectsUseDocumentDir);
    const assetUrl = preview?.url;
    if (!assetUrl) return;
    revokeAssetPreviewUrl(tab.assetUrl);
    openFiles = openFiles.map((f) =>
      f.path === absPath ? { ...f, assetUrl, pdfPreviewNeedsDiskSync: false } : f,
    );
  }

  /**
   * EmbedPDF keeps edits in the mounted viewer. Text tabs keep unsaved work in `openFiles[].content`;
   * when leaving a dirty PDF for another tab, persist the annotated PDF into a new blob on the tab
   * so the viewer can reload from that memory (disk is unchanged until Save).
   * When leaving a saved PDF whose blob still needs a disk resync (iOS), refresh then so the next open is correct.
   */
  async function snapshotCurrentPdfBeforeLeaving(nextPath: string | null) {
    const prev = currentFilePath;
    if (prev == null) return;
    if (nextPath !== null && prev === nextPath) return;
    const tab = openFiles.find((f) => f.path === prev);
    if (!tab?.isBinary || tab.assetKind !== "pdf") return;

    if (tab.isDirty) {
      if (!pdfDiskSaveApi) return;
      try {
        const buf = await pdfDiskSaveApi.saveToBuffer();
        revokeAssetPreviewUrl(tab.assetUrl);
        const blob = new Blob([new Uint8Array(buf)], { type: "application/pdf" });
        const assetUrl = URL.createObjectURL(blob);
        openFiles = openFiles.map((f) =>
          f.path === prev ? { ...f, assetUrl, pdfPreviewNeedsDiskSync: false } : f,
        );
      } catch (e) {
        console.error("snapshotCurrentPdfBeforeLeaving:", e);
      }
      return;
    }

    if (tab.pdfPreviewNeedsDiskSync) {
      await refreshPdfAssetPreviewUrl(prev);
    }
  }

  function runEditUndo() {
    const tab = currentTab;
    if (tab?.assetKind === "pdf" && pdfDiskSaveApi) {
      pdfDiskSaveApi.undo();
      return;
    }
    const ed = monacoMenuRef.current;
    ed?.focus();
    ed?.trigger("keyboard", "undo", null);
  }

  function runEditRedo() {
    const tab = currentTab;
    if (tab?.assetKind === "pdf" && pdfDiskSaveApi) {
      pdfDiskSaveApi.redo();
      return;
    }
    const ed = monacoMenuRef.current;
    ed?.focus();
    ed?.trigger("keyboard", "redo", null);
  }

  function handlePdfDiskApiReady(api: EmbedPdfDiskSaveApi | null) {
    pdfDiskSaveApi = api;
  }

  /** Persist the active editor to disk (iOS project mode) before switching files or leaving. */
  async function iosFlushCurrentEditor(): Promise<void> {
    if (!iosProjectPath) return;
    const path = currentFilePath;
    if (!path || !path.startsWith(iosProjectPath)) return;
    if (openFiles.find((f) => f.path === path)?.isBinary) return;
    const text = content;
    try {
      await writeFileAtPath(path, text);
      openFiles = openFiles.map((f) =>
        f.path === path
          ? { ...f, content: text, isDirty: false, lastSaved: new Date() }
          : f,
      );
      touchProjectMetaUpdated();
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
    base = ensureDefaultTypstExtension(base);
    const intent = saveAsIntent;

    /** Inside an iOS project, New File creates a new file on disk immediately (template). */
    if (
      intent === "newFile" &&
      iosProjectPath &&
      saveAsDocsRoot === iosProjectPath
    ) {
      await iosFlushCurrentEditor();
      try {
        const entries = projectsUseDocumentDir
          ? await readDir(iosProjectPath)
          : await desktopReadDir(iosProjectPath);
        const nameSet = new Set(
          entries.map((e) => e.name).filter(Boolean) as string[],
        );
        const fileName = nextNonCollidingFileName(base, nameSet);
        const selected = await join(iosProjectPath, fileName);
        const initial = defaultNewFileContent();
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
        await snapshotCurrentPdfBeforeLeaving(selected);
        currentFilePath = selected;
        content = initial;
        editor?.setValue(initial);
        touchProjectMetaUpdated();
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
      await snapshotCurrentPdfBeforeLeaving(null);
      currentFilePath = null;
      content = defaultNewFileContent();
      editor?.setValue(content);
      if (currentFolder) void loadFolderFiles(currentFolder);
      touchProjectMetaUpdated();
    } else {
      await snapshotCurrentPdfBeforeLeaving(selected);
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
      touchProjectMetaUpdated();
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
  let compileDiagnostics = $state<CompileDiagnostic[]>([]);
  let compileWarnings = $state<CompileDiagnostic[]>([]);
  let exportBusy = $state(false);
  let exportTypstModalOpen = $state(false);

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
    compileWarnings = [];
  });
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
  let folderFiles = $state<FolderExplorerNode[]>([]);

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
      typstFontFaces = await listTypstFontFaces(
        currentFolder,
        currentFilePath && isTypstPath(currentFilePath) ? currentFilePath : null,
      );
    } catch {
      typstFontFaces = [];
    }
  }

  $effect(() => {
    void currentFolder;
    void currentFilePath;
    void refreshTypstFontFaces();
  });

  function openSettings(tab: "shortcuts" | "packageCache" | "fonts" | "faq" = "shortcuts") {
    settingsInitialTab = tab;
    isShortcutsModalOpen = true;
  }
  let appZoom = $state(1);

  let currentTab = $derived(
    currentFilePath ? openFiles.find((f) => f.path === currentFilePath) : undefined,
  );
  let editorLanguageId = $derived(monacoLanguageIdFromPath(currentFilePath ?? "untitled.typ"));
  let isCurrentBinary = $derived(!!currentTab?.isBinary);
  /** Typst export (PDF / SVG / PNG / HTML): only from an open `.typ` source tab. */
  let exportTypstAllowed = $derived(
    !isProjectHub &&
      !isCurrentBinary &&
      !!currentFilePath &&
      isTypstPath(currentFilePath),
  );

  /** Grey out native File → Export… on macOS/Windows when not on a `.typ` tab. */
  $effect(() => {
    const enabled = exportTypstAllowed;
    void invoke("set_export_typst_menu_enabled", { enabled }).catch(() => {
      /* web dev / mobile: command missing or N/A */
    });
  });

  /** Grey out New / Save / Save As / Toggle Sidebar when no project is open. */
  $effect(() => {
    const enabled = workspaceNativeMenusEnabled;
    void invoke("set_workspace_dependent_menus_enabled", { enabled }).catch(() => {
      /* web dev / mobile */
    });
  });
  /** Raster / PDF: full-width preview only (no Monaco). */
  let isPreviewOnlyMedia = $derived(
    !!currentTab?.isBinary &&
      (currentTab?.assetKind === "image" || currentTab?.assetKind === "pdf"),
  );

  let currentFileDirty = $derived(currentTab?.isDirty ?? false);
  let currentFileLastSaved = $derived(currentTab?.lastSaved ?? null);

  let filePreviewMode = $derived.by(() => {
    const path = currentFilePath;
    const tab = currentTab;
    if (!path) {
      return {
        kind: "none" as const,
        hint: "Open a document or asset from the sidebar.",
      };
    }
    if (tab?.isBinary) {
      if (tab.assetKind === "pdf" && tab.assetUrl) {
        return { kind: "pdf" as const, url: tab.assetUrl };
      }
      if (tab.assetKind === "image" && tab.assetUrl) {
        return { kind: "image" as const, url: tab.assetUrl, label: tab.name };
      }
      return {
        kind: "none" as const,
        hint: "Could not load a preview URL for this file. Reopen the folder or use the desktop app.",
      };
    }
    if (isSvgSourcePath(path)) {
      return { kind: "svg-inline" as const, svg: content };
    }
    if (isMarkdownPreviewPath(path)) {
      return {
        kind: "markdown" as const,
        html: renderMarkdownToSafeHtml(content),
      };
    }
    if (isHtmlPreviewPath(path)) {
      return {
        kind: "html" as const,
        html: sanitizeHtmlForPreview(content),
      };
    }
    if (isTypstPath(path)) {
      return {
        kind: "typst" as const,
        error,
        pages: previewPages,
        pageCount: previewPageCount,
        diagnostics: compileDiagnostics,
        warnings: compileWarnings,
        stale: showingStalePreview,
      };
    }
    return {
      kind: "none" as const,
      hint: "Live preview: Typst for .typ, Markdown for .md, HTML for .html/.htm. Use PNG, JPEG, WebP, GIF, SVG, or PDF for assets.",
    };
  });

  async function handleOpenFile() {
    if (iosProjectPath) {
      await message("Use Import to add .typ files to this project.", {
        title: "Open file",
        kind: "info",
      });
      return;
    }
    await message("Open a project from the home screen, or create a new one.", {
      title: "Projects",
      kind: "info",
    });
  }

  async function iosHandleImportTyp() {
    if (!iosProjectPath) return;
    if (projectsUseDocumentDir && !iosProjectFolderId) return;
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
        const newPath = projectsUseDocumentDir
          ? await iosImportTypIntoProject(iosProjectFolderId!, path, base)
          : await desktopImportTypIntoProject(iosProjectPath, path, base);
        await loadFolderFiles(iosProjectPath);
        await openFileByPath(newPath);
      }
      error = "";
    } catch (err) {
      error = `Import failed: ${err}`;
    }
  }

  async function iosHandleExportProject() {
    if (!iosProjectPath) return;
    try {
      const defaultPath = projectsUseDocumentDir
        ? `${iosProjectFolderId}.zip`
        : `${iosProjectPath.replace(/\/+$/, "").split("/").pop() ?? "project"}.zip`;
      const path = await save({
        defaultPath,
        filters: [{ name: "ZIP archive", extensions: ["zip"] }],
      });
      if (path === null) return;
      if (projectsUseDocumentDir) {
        const stage = await invoke<{
          stagingId: string;
          fileNames: string[];
        }>("export_ios_project_zip_stage", {
          folderId: iosProjectFolderId!,
        });
        try {
          const rel = exportStagingRelPath(
            stage.stagingId,
            stage.fileNames[0] ?? "project.zip",
          );
          const data = await readFile(rel, { baseDir: BaseDirectory.Document });
          await writeFile(path, data);
        } finally {
          await invoke("export_typst_stage_cleanup", {
            stagingId: stage.stagingId,
          }).catch(() => {});
        }
      } else {
        await desktopExportProjectZip(iosProjectPath, path);
      }
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
      await snapshotCurrentPdfBeforeLeaving(path);
      let existing = openFiles.find((f) => f.path === path);
      if (existing?.assetKind === "pdf" && existing.pdfPreviewNeedsDiskSync) {
        await refreshPdfAssetPreviewUrl(path);
        existing = openFiles.find((f) => f.path === path);
      }
      if (existing) {
        content = existing.content;
        currentFilePath = path;
        if (existing.isBinary) {
          previewVisible = true;
        } else {
          editor?.setValue(content);
        }
        return;
      }

      const name = path.split("/").pop() || path;

      if (isBinaryAssetPath(path)) {
        const preview = await createAssetPreviewUrl(path, projectsUseDocumentDir);
        const assetUrl = preview?.url;
        openFiles = [
          ...openFiles,
          {
            path,
            name,
            content: "",
            isDirty: false,
            lastSaved: null,
            isBinary: true,
            assetKind: isPdfPath(path) ? "pdf" : "image",
            assetUrl,
          },
        ];
        content = "";
        currentFilePath = path;
        previewVisible = true;
        return;
      }

      const text = projectsUseDocumentDir
        ? await readTextFile(path)
        : await desktopReadTextFile(path);
      openFiles = [...openFiles, { path, name, content: text, isDirty: false, lastSaved: null }];
      content = text;
      currentFilePath = path;
      editor?.setValue(text);
    } catch (err) {
      error = `Error reading file: ${err}`;
    }
  }

  async function handleCloseFile(path: string) {
    if (iosProjectPath && currentFilePath === path) {
      await iosFlushCurrentEditor();
    }
    const index = openFiles.findIndex((f) => f.path === path);
    if (index !== -1) {
      const closing = openFiles[index];
      revokeAssetPreviewUrl(closing?.assetUrl);
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
    folderFiles = await loadFolderExplorerTree(folderPath, projectsUseDocumentDir);
  }

  async function refreshIosProjects() {
    try {
      if (projectsUseDocumentDir) {
        iosProjectsList = await iosListProjects();
      } else {
        const rows = await desktopRecentProjectsList();
        iosProjectsList = rows.map((r) => ({
          folderId: r.folderId,
          title: r.title,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          absPath: r.absPath,
        }));
      }
    } catch {
      iosProjectsList = [];
    }
  }

  async function hubImportFolderShortcut() {
    if (iosProjectPath) {
      await message("Open the menu → All projects, then import from the home screen.", {
        title: "Import project",
        kind: "info",
      });
      return;
    }
    if (projectsUseDocumentDir) await runImportProjectFromZip();
    else await runOpenDesktopProjectFolder();
  }

  async function runOpenDesktopProjectFolder() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Open project folder",
      });
      if (!selected || Array.isArray(selected)) return;
      await desktopRecentTouch(selected);
      const row = await desktopProjectRowForPath(selected);
      await enterIosProject({
        folderId: row.folderId,
        title: row.title,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        absPath: row.absPath,
      });
    } catch (e) {
      await message(String(e), { title: "Open folder", kind: "error" });
    }
  }

  async function enterIosProject(p: IosProjectSummary) {
    iosProjectPath = p.absPath;
    iosProjectFolderId = p.folderId;
    iosProjectTitle = p.title;
    currentFolder = p.absPath;
    revokeBlobUrlsInTabs(openFiles);
    openFiles = [];
    currentFilePath = null;
    await loadFolderFiles(p.absPath);
    const mainPath = `${p.absPath.replace(/\/+$/, "")}/main.typ`;
    try {
      const text = projectsUseDocumentDir
        ? await readTextFile(mainPath)
        : await desktopReadTextFile(mainPath);
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
        entries = projectsUseDocumentDir
          ? await readDir(p.absPath)
          : await desktopReadDir(p.absPath);
      } catch {
        /* ignore */
      }
      const typ = entries.find((e) => !e.isDirectory && e.name?.endsWith(".typ"));
      if (typ?.name) {
        await openFileByPath(`${p.absPath}/${typ.name}`);
      } else {
        content = defaultNewFileContent();
        editor?.setValue(content);
      }
    }
    if (!projectsUseDocumentDir) {
      await desktopRecentTouch(p.absPath);
      void refreshIosProjects();
    }
  }

  async function leaveIosProject() {
    await iosFlushCurrentEditor();
    iosProjectPath = null;
    iosProjectFolderId = null;
    iosProjectTitle = "";
    currentFolder = null;
    revokeBlobUrlsInTabs(openFiles);
    openFiles = [];
    currentFilePath = null;
    content = "";
    folderFiles = [];
    editor?.setValue("");
    void refreshIosProjects();
  }

  /** Desktop: close folder/tabs and show the start page (New / Open / Open folder). */
  /** @returns null on success, error message on failure */
  let iosImportFolderOpen = $state(false);
  let iosImportFolderPath = $state<string | null>(null);
  let iosImportFolderTitle = $state("");
  let iosImportFolderError = $state("");

  async function runImportProjectFromZip() {
    try {
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
      const title = iosImportFolderTitle.trim() || "Untitled";
      const r = await invoke<{ folderId: string; absPath: string }>(
        "import_ios_project_from_zip",
        { zipPath: path, title },
      );
      const t = title;
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
    if (!projectsUseDocumentDir) {
      const parent = await open({
        directory: true,
        multiple: false,
        title: "Choose where to create the project folder",
      });
      if (parent === null || Array.isArray(parent)) return null;
      const folderName = projectFolderNameFromTitle(title);
      try {
        const row = await desktopCreateProject(
          parent,
          folderName,
          title.trim() || "Untitled",
        );
        await desktopRecentTouch(row.absPath);
        await refreshIosProjects();
        await enterIosProject({
          folderId: row.folderId,
          title: row.title,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          absPath: row.absPath,
        });
        return null;
      } catch (e) {
        return String(e);
      }
    }
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
    if (!projectsUseDocumentDir) {
      try {
        const projPath =
          iosProjectsList.find((x) => x.folderId === folderId)?.absPath ??
          folderId;
        await desktopUpdateProjectMetaTitle(projPath, title);
        if (iosProjectFolderId === folderId) {
          iosProjectTitle = title.trim() || "Untitled";
        }
        await refreshIosProjects();
        return null;
      } catch (e) {
        return String(e);
      }
    }
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
        folderFiles = remapFolderExplorerPaths(folderFiles, (p) =>
          p.startsWith(oldAbs) ? newAbs + p.slice(oldAbs.length) : p,
        );
      }
      await refreshIosProjects();
      return null;
    } catch (e) {
      return String(e);
    }
  }

  async function iosOnDeleteProject(folderId: string) {
    if (!projectsUseDocumentDir) {
      const ok = await ask(
        "Remove this folder from recent projects? Nothing will be deleted on disk.",
        { title: "Remove from recents", kind: "info" },
      );
      if (!ok) return;
      try {
        await desktopRecentRemove(folderId);
        if (iosProjectFolderId === folderId) void leaveIosProject();
        await refreshIosProjects();
      } catch (e) {
        error = String(e);
      }
      return;
    }
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

  function openExplorerRenameModal(path: string) {
    const name = path.split(/[/\\]/).pop() || "";
    explorerRenameFromPath = path;
    explorerRenameNewName = name;
    explorerRenameError = "";
    explorerRenameModalOpen = true;
  }

  function closeExplorerRenameModal() {
    explorerRenameModalOpen = false;
    explorerRenameFromPath = null;
    explorerRenameNewName = "";
    explorerRenameError = "";
  }

  async function confirmExplorerRenameModal() {
    if (!explorerRenameFromPath || !iosProjectPath) return;
    const oldPath = explorerRenameFromPath;
    if (iosProjectPath && currentFilePath === oldPath) {
      await iosFlushCurrentEditor();
    }
    const name = explorerRenameNewName.trim();
    if (!name || name === "." || name === "..") {
      explorerRenameError = "Enter a valid file name.";
      return;
    }
    if (name.includes("/") || name.includes("\\")) {
      explorerRenameError = "Name cannot contain path separators.";
      return;
    }
    try {
      const parentIdx = Math.max(
        oldPath.lastIndexOf("/"),
        oldPath.lastIndexOf("\\"),
      );
      const parent =
        parentIdx >= 0 ? oldPath.slice(0, parentIdx) : iosProjectPath;
      const newPath = await join(parent, name);
      const root = normalizeFsPath(iosProjectPath);
      const newNorm = normalizeFsPath(newPath);
      if (newNorm !== root && !newNorm.startsWith(`${root}/`)) {
        explorerRenameError = "Invalid path.";
        return;
      }
      if (newPath === oldPath) {
        closeExplorerRenameModal();
        return;
      }
      await renamePathOnDisk(oldPath, newPath, projectsUseDocumentDir);
      openFiles = openFiles.map((f) =>
        f.path === oldPath ? { ...f, path: newPath, name } : f,
      );
      if (currentFilePath === oldPath) {
        currentFilePath = newPath;
      }
      closeExplorerRenameModal();
      await loadFolderFiles(iosProjectPath);
      touchProjectMetaUpdated();
      error = "";
    } catch (e) {
      explorerRenameError = String(e);
    }
  }

  async function handleExplorerDeleteFile(path: string) {
    if (!iosProjectPath) return;
    if (!isExplorerPathInsideProject(iosProjectPath, path)) return;
    const base = path.split(/[/\\]/).pop() || path;
    const dirty = openFiles.find((f) => f.path === path)?.isDirty;
    const ok = await ask(
      `Delete “${base}”? This cannot be undone.${dirty ? " Unsaved changes will be lost." : ""}`,
      {
        title: "Delete file",
        kind: "warning",
      },
    );
    if (!ok) return;
    try {
      await projectRemovePath(path, projectsUseDocumentDir, { recursive: false });
      await handleCloseFile(path);
      await loadFolderFiles(iosProjectPath);
      touchProjectMetaUpdated();
      error = "";
    } catch (e) {
      await message(String(e), { title: "Delete failed", kind: "error" });
    }
  }

  async function handleSave() {
    const tab = currentFilePath
      ? openFiles.find((f) => f.path === currentFilePath)
      : undefined;

    // Global shortcuts run in capture phase; flush Monaco before writing so disk matches the editor (iPad/WebKit timing).
    const edFlush = monacoMenuRef.current;
    if (edFlush && tab && !tab.isBinary && currentFilePath) {
      const live = edFlush.getValue();
      if (live !== content) {
        content = live;
        openFiles = openFiles.map((f) =>
          f.path === currentFilePath ? { ...f, content: live, isDirty: true } : f,
        );
      }
    }

    if (tab?.isBinary && tab.assetKind === "pdf" && currentFilePath) {
      if (!pdfDiskSaveApi) {
        error = "PDF viewer is still loading. Try Save again in a moment.";
        return;
      }
      try {
        const buf = await pdfDiskSaveApi.saveToBuffer();
        await writeBinaryFileAtPath(currentFilePath, new Uint8Array(buf));
        openFiles = openFiles.map((f) =>
          f.path === currentFilePath
            ? {
                ...f,
                isDirty: false,
                lastSaved: new Date(),
                pdfPreviewNeedsDiskSync: true,
              }
            : f,
        );
        error = "";
        touchProjectMetaUpdated();
      } catch (err) {
        error = `Error saving PDF: ${err}`;
      }
      return;
    }
    if (tab?.isBinary) {
      return;
    }
    if (currentFilePath) {
      try {
        await writeFileAtPath(currentFilePath, content);
        openFiles = openFiles.map((f) =>
          f.path === currentFilePath
            ? { ...f, isDirty: false, lastSaved: new Date(), content }
            : f,
        );
        error = "";
        touchProjectMetaUpdated();
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
      const tab = currentFilePath
        ? openFiles.find((f) => f.path === currentFilePath)
        : undefined;
      if (tab?.assetKind === "pdf") {
        if (!pdfDiskSaveApi) {
          await message("PDF viewer is still loading. Try again in a moment.", {
            title: "Save As",
            kind: "info",
          });
          return;
        }
        const defaultName = tab.name.toLowerCase().endsWith(".pdf")
          ? tab.name
          : `${tab.name.replace(/\.[^/.]+$/, "") || "document"}.pdf`;
        const selected = await save({
          defaultPath: defaultName,
          filters: [{ name: "PDF", extensions: ["pdf"] }],
        });
        if (!selected) return;
        const buf = await pdfDiskSaveApi.saveToBuffer();
        await writeFile(selected, new Uint8Array(buf));
        const name = selected.split(/[/\\]/).pop() || selected;
        revokeAssetPreviewUrl(tab.assetUrl);
        const preview = await createAssetPreviewUrl(selected, projectsUseDocumentDir);
        const assetUrl = preview?.url;
        currentFilePath = selected;
        openFiles = openFiles.map((f) =>
          f.path === tab.path
            ? {
                ...f,
                path: selected,
                name,
                assetUrl,
                isDirty: false,
                lastSaved: new Date(),
                pdfPreviewNeedsDiskSync: false,
              }
            : f,
        );
        error = "";
        touchProjectMetaUpdated();
        if (currentFolder) void loadFolderFiles(currentFolder);
        return;
      }

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

  async function compile(text: string, pathSnapshot: string | null) {
    try {
      const result = await invokeCompileTypst(text, pathSnapshot, currentFolder);
      if (currentFilePath !== pathSnapshot || content !== text) return;
      compileWarnings = result.warnings ?? [];
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
      compileWarnings = [];
      compileDiagnostics = [compileDiagnosticFromUnknownError(err)];
    }
  }

  function openExportTypstModal() {
    if (!exportTypstAllowed) return;
    exportTypstModalOpen = true;
  }

  async function handleExportTypstPayload(payload: ExportTypstKindPayload) {
    exportTypstModalOpen = false;
    if (exportBusy) return;
    await runTypstExportFromModal({
      payload,
      projectsUseDocumentDir,
      content,
      currentFilePath,
      projectFolderPath: currentFolder,
      setExportBusy: (v) => {
        exportBusy = v;
      },
    });
  }

  $effect(() => {
    const pathSnapshot = currentFilePath;
    void currentFolder;
    if (!pathSnapshot || !isTypstPath(pathSnapshot)) return;
    const text = content;
    const timeoutId = setTimeout(() => {
      void compile(text, pathSnapshot);
    }, 300);
    return () => clearTimeout(timeoutId);
  });

  function handleEditorSplitResize(clientX: number) {
    if (!isResizing || !editorPreviewRegion) return;
    const r = editorSplitRatioFromPointer(clientX, editorPreviewRegion.getBoundingClientRect());
    if (r != null) splitRatio = r;
  }

  function handleSidebarResize(clientX: number) {
    if (!isResizingSidebar || !mainLayout) return;
    sidebarWidth = sidebarWidthFromPointer(clientX, mainLayout.getBoundingClientRect());
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
    if (openFiles.find((f) => f.path === currentFilePath)?.isBinary) return;
    if (content !== newValue) {
      content = newValue;
      if (currentFilePath) {
        openFiles = openFiles.map((f) =>
          f.path === currentFilePath ? { ...f, isDirty: true, content: newValue } : f,
        );
      }
    }
  }

  async function runNewFileShortcut() {
    if (!iosProjectPath) {
      await message(
        "Create or open a project from the home screen first. Then use New File to add a .typ in that project.",
        { title: "New file", kind: "info" },
      );
      return;
    }
    const mobile = await openMobileSaveAsModal("newFile");
    if (mobile) return;
    await handleSaveAs();
    if (currentFilePath) {
      const name = currentFilePath.split("/").pop() || "untitled.typ";
      if (!openFiles.find((f) => f.path === currentFilePath)) {
        openFiles = [
          ...openFiles,
          {
            path: currentFilePath,
            name,
            content: defaultNewFileContent(),
            isDirty: false,
            lastSaved: new Date(),
          },
        ];
      }
      content = defaultNewFileContent();
      editor?.setValue(content);
    }
  }

  function buildCommandContext(): AppCommandContext {
    return {
      monacoMenuRef,
      handleOpenFile,
      hubImportFolderShortcut,
      leaveIosProject,
      runOpenDesktopProjectFolder,
      iosHandleImportTyp,
      iosHandleExportProject,
      runImportProjectFromZip,
      handleSave,
      handleSaveAs,
      openExportTypstModal,
      appZoomIn,
      appZoomOut,
      resetAppZoom,
      toggleSidebar: () => {
        sidebarVisible = !sidebarVisible;
      },
      openSettings,
      runEditUndo,
      runEditRedo,
      nextPage,
      prevPage,
      runNewFileShortcut,
    };
  }

  async function handleShortcutCommand(action: ShortcutAction) {
    await runShortcutAction(action, buildCommandContext());
  }

  function dispatchMenuId(id: string) {
    dispatchAppMenuId(id, buildCommandContext());
  }

  let showInAppMenu = $state(false);

  onMount(() => {
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

    // Must resolve workspace mode before loading the hub list: default state is iOS-style
    // (`true`). On macOS/Windows/Linux, `false` means "open folders on disk" + Rust-backed
    // `recent-desktop-projects.json`. Calling `refreshIosProjects()` too early used the wrong
    // branch and made recents look empty after every restart.
    void (async () => {
      try {
        projectsUseDocumentDir = await invoke<boolean>("workspace_projects_use_document_dir");
      } catch {
        /* web / odd host: keep default */
      }
      await refreshIosProjects();
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
    const o = $shortcutOverrides;
    void editor;
    syncAppShortcuts(o, {
      "file.new": () => handleShortcutCommand("file.new"),
      "file.open": handleOpenFile,
      "file.openFolder": () => void hubImportFolderShortcut(),
      "file.save": handleSave,
      "file.saveAs": handleSaveAs,
      "file.exportTypst": openExportTypstModal,
      "edit.undo": runEditUndo,
      "edit.redo": runEditRedo,
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
  });

  $effect(() => {
    if (!editor) return;
    applyMonacoShortcutOverrides(editor, monaco, $shortcutOverrides);
  });
</script>


<div
  class="h-full max-h-full w-full bg-[var(--app-bg)] overflow-clip {isResizing || isResizingSidebar
    ? 'cursor-col-resize select-none'
    : ''}"
>
  <!-- Transform scale (not CSS zoom) so the whole shell scales in Firefox / all WebViews; Monaco stays 14px. -->
  <div
    class="h-fullmax-h-full flex flex-col text-[var(--app-fg)] overflow-clip {isResizing || isResizingSidebar
      ? 'cursor-col-resize select-none'
      : ''}"
    style:--app-zoom={appZoom}
    style:width="calc(100% / var(--app-zoom))"
    style:height="calc(100% / var(--app-zoom))"
    style:transform={`scale(${appZoom})`}
    style:transform-origin="top left"
    style:min-width="calc({APP_MIN_WIDTH_PX}px / var(--app-zoom))"
    style:min-height="calc({APP_MIN_HEIGHT_PX}px / var(--app-zoom))"
  >
  <Header
    {appName}
    {showInAppMenu}
    onInAppMenuAction={dispatchMenuId}
    inAppMenuLanding={isProjectHub}
    hubAllowsFolderImport={false}
    hubDirectFolders={!projectsUseDocumentDir}
    iosMenuHub={isProjectHub}
    iosMenuProject={!!iosProjectPath}
    showNativeBackToHub={!showInAppMenu && !isProjectHub}
    onBackToProjects={() => void leaveIosProject()}
    onShowShortcuts={() => openSettings("shortcuts")}
    colorMode={themePreference}
    onColorModeChange={handleThemePreferenceChange}
    colorModeOptions={THEME_PREFERENCE_OPTIONS}
    filePath={currentFilePath}
    isDirty={currentFileDirty}
    lastSaved={currentFileLastSaved}
    showPanelToggles={!isProjectHub}
    {sidebarVisible}
    onToggleSidebar={() => (sidebarVisible = !sidebarVisible)}
    {previewVisible}
    onTogglePreview={() => (previewVisible = !previewVisible)}
    suppressPreviewToggle={isPreviewOnlyMedia}
    showExportTypst={exportTypstAllowed}
    // exportTypstEnabled={exportTypstAllowed}
    {exportBusy}
    onOpenExportTypst={openExportTypstModal}
    onShowCommandPalette={!isProjectHub
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
    onFontsChanged={() => void refreshTypstFontFaces()}
  />

  <ExportTypstModal
    open={exportTypstModalOpen}
    onClose={() => (exportTypstModalOpen = false)}
    onConfirm={handleExportTypstPayload}
  />

  <SaveAsModal
    open={saveAsModalOpen}
    intent={saveAsIntent}
    iosProjectPath={iosProjectPath}
    iosProjectTitle={iosProjectTitle}
    {appName}
    bind:filename={saveAsFilename}
    onClose={closeSaveAsModal}
    onConfirm={confirmSaveAsModal}
  />

  <ExplorerRenameModal
    open={explorerRenameModalOpen}
    fromPath={explorerRenameFromPath}
    bind:newName={explorerRenameNewName}
    error={explorerRenameError}
    onClose={closeExplorerRenameModal}
    onConfirm={confirmExplorerRenameModal}
  />

  <IosImportZipProjectModal
    open={iosImportFolderOpen}
    bind:title={iosImportFolderTitle}
    error={iosImportFolderError}
    onClose={() => {
      iosImportFolderOpen = false;
      iosImportFolderPath = null;
      iosImportFolderError = "";
    }}
    onImport={iosConfirmImportFolderAsProject}
  />

  <div
    bind:this={mainLayout}
    class="flex flex-1 w-full min-h-0 overflow-clip relative"
  >
    {#if isProjectHub}
      <IosProjectHub
        {appName}
        projects={iosProjectsList}
        onRefresh={refreshIosProjects}
        onOpenProject={(p) => void enterIosProject(p)}
        onCreateProject={iosCreateProjectFlow}
        onRenameProject={iosOnRenameProject}
        onDeleteProject={iosOnDeleteProject}
        onImportZip={() => void runImportProjectFromZip()}
        onImportFolderFromDisk={undefined}
        onOpenFolderOnDisk={projectsUseDocumentDir
          ? undefined
          : () => void runOpenDesktopProjectFolder()}
      />
    {:else}
    {#if sidebarVisible}
      <Sidebar
        width={sidebarWidth}
        {openFiles}
        activeFile={currentFilePath}
        {currentFolder}
        {folderFiles}
        onSelectFile={openFileByPath}
        onRefreshFolder={handleRefreshFolderExplorer}
        onExplorerRenameFile={openExplorerRenameModal}
        onExplorerDeleteFile={handleExplorerDeleteFile}
        iosProjectTitle={iosProjectPath ? iosProjectTitle : null}
        onIosBackToProjects={() => void leaveIosProject()}
      />
      <PaneResizeGrip
        active={isResizingSidebar}
        onPointerDown={handleSidebarGripPointerDown}
        ariaLabel="Resize sidebar"
        title="Drag to resize sidebar"
      />
    {/if}

    <EditorPreviewSplit
      bind:editorPreviewRegion
      isPreviewOnlyMedia={isPreviewOnlyMedia}
      {previewVisible}
      editorPaneMin={EDITOR_PANE_MIN}
      previewPaneMin={PREVIEW_PANE_MIN}
      splitGripPx={SPLIT_GRIP_PX}
      {splitRatio}
      isResizingSplit={isResizing}
      onSplitGripPointerDown={handleEditorSplitPointerDown}
      filePreviewMode={filePreviewMode}
      resolvedAppearance={resolvedAppearance}
      onPdfDirty={markCurrentPdfDirty}
      onPdfDiskApiReady={handlePdfDiskApiReady}
      bind:currentPage
      bind:scale
      bind:translateX
      bind:translateY
      editor={editor}
      typstFontFaces={typstFontFaces}
      showTypstToolbar={!isCurrentBinary && !!(currentFilePath && isTypstPath(currentFilePath))}
      {content}
      editorLanguageId={editorLanguageId}
      readOnly={isCurrentBinary}
      monacoThemeResolved={monacoThemeResolved}
      onContentChange={onEditorContentChange}
      onMonacoReady={(ed) => {
        editor = ed;
        monacoMenuRef.current = ed;
      }}
      onMonacoDispose={() => {
        editor = undefined;
        monacoMenuRef.current = undefined;
      }}
    />
    {/if}
  </div>
  </div>
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    overflow: hidden;
    overscroll-behavior: hidden;
  }
</style>
