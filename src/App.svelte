<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import * as monaco from "monaco-editor";
  import { listen } from "@tauri-apps/api/event";
  import { GripVertical } from "lucide-svelte";
  import { open, save, message } from "@tauri-apps/plugin-dialog";
  import { readTextFile, writeTextFile, readDir } from "@tauri-apps/plugin-fs";
  import Header from "./components/Header.svelte";
  import Sidebar from "./components/Sidebar.svelte";
  import SettingsModal from "./components/SettingsModal.svelte";
  import InitialPage from "./components/InitialPage.svelte";
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
    readStoredColorMode,
    persistColorMode,
    COLOR_MODE_OPTIONS,
    resolveEffectiveLightDark,
    type ColorMode,
  } from "./lib/monacoThemes";
  import {
    applyAppChromeFromVscodeColors,
    CAT_LIGHT_COLORS,
    CAT_DARK_COLORS,
    MONACO_THEME_ID_LIGHT,
    MONACO_THEME_ID_DARK,
  } from "./lib/catppuccinAltThemes";
  import { listTypstFontFaces, type TypstFontFace } from "./lib/typstFonts";
  import pkg from "../package.json";

  let appName = $state(pkg.name);

  let openFiles = $state<{ path: string; name: string; content: string; isDirty?: boolean; lastSaved?: Date | null }[]>([]);
  let currentFilePath = $state<string | null>(null);
  let currentFolder = $state<string | null>(null);
  let isLandingPage = $derived(openFiles.length === 0 && !currentFilePath && !currentFolder);

  let content = $state("");
  let pages = $state<string[]>([]);
  let pageCount = $state(0);
  let currentPage = $state(0);
  let error = $state("");
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
  const EDITOR_PANE_MIN = 160;
  const PREVIEW_PANE_MIN = 160;
  const SPLIT_GRIP_PX = 4;
  /** Matches layout: sidebar + editor/preview region needs at least this (web fallback; Tauri uses minWidth) */
  /** Sidebar + editor + grip + preview + mins need ~500px */
  const APP_MIN_WIDTH_PX = 520;
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
  let systemPrefersDark = $state(
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : true,
  );
  let colorMode = $state<ColorMode>(readStoredColorMode());
  let effectiveLightDark = $derived(
    resolveEffectiveLightDark(colorMode, systemPrefersDark),
  );
  let monacoThemeResolved = $derived(
    effectiveLightDark === "dark" ? MONACO_THEME_ID_DARK : MONACO_THEME_ID_LIGHT,
  );

  function handleColorModeChange(id: string) {
    if (id !== "auto" && id !== "light" && id !== "dark") return;
    colorMode = id as ColorMode;
    persistColorMode(colorMode);
  }

  $effect(() => {
    applyAppChromeFromVscodeColors(
      effectiveLightDark === "dark" ? CAT_DARK_COLORS : CAT_LIGHT_COLORS,
    );
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
  let settingsInitialTab = $state<"shortcuts" | "packageCache" | "fonts">("shortcuts");
  let typstFontFaces = $state<TypstFontFace[]>([]);

  async function refreshTypstFontFaces() {
    try {
      typstFontFaces = await listTypstFontFaces();
    } catch {
      typstFontFaces = [];
    }
  }

  function openSettings(tab: "shortcuts" | "packageCache" | "fonts" = "shortcuts") {
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
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "Typst", extensions: ["typ"] }],
      });
      if (selected && !Array.isArray(selected)) {
        await openFileByPath(selected);
      }
    } catch (err) {
      error = `Error opening file: ${err}`;
    }
  }

  async function openFileByPath(path: string) {
    try {
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

  function handleCloseFile(path: string) {
    const index = openFiles.findIndex((f) => f.path === path);
    if (index !== -1) {
      const newFiles = [...openFiles];
      newFiles.splice(index, 1);
      openFiles = newFiles;

      if (currentFilePath === path) {
        if (openFiles.length > 0) {
          const nextFile = openFiles[Math.max(0, index - 1)];
          openFileByPath(nextFile.path);
        } else {
          currentFilePath = null;
          content = "";
          editor?.setValue("");
        }
      }
    }
  }

  async function handleOpenFolder() {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected) {
        currentFolder = selected;
        const entries = await readDir(selected);
        folderFiles = entries
          .filter((e) => !e.name?.startsWith("."))
          .map((e) => ({
            name: e.name || "",
            path: `${selected}/${e.name}`,
            isDirectory: e.isDirectory,
          }))
          .sort((a, b) => {
            if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
            return a.isDirectory ? -1 : 1;
          });
      }
    } catch (err) {
      error = `Error opening folder: ${err}`;
    }
  }

  async function handleSave() {
    if (currentFilePath) {
      try {
        await writeTextFile(currentFilePath, content);
        openFiles = openFiles.map((f) =>
          f.path === currentFilePath
            ? { ...f, isDirty: false, lastSaved: new Date(), content }
            : f,
        );
      } catch (err) {
        error = `Error saving file: ${err}`;
      }
    } else {
      await handleSaveAs();
    }
  }

  async function handleSaveAs() {
    try {
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
      }
    } catch (err) {
      error = `Error saving as: ${err}`;
    }
  }

  $effect(() => {
    if (currentFilePath && content) {
      const timeoutId = setTimeout(async () => {
        try {
          await writeTextFile(currentFilePath!, content);
        } catch (err) {
          console.error("Auto-sync failed:", err);
        }
      }, 1000);
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

  function handleEditorSplitResize(e: MouseEvent) {
    if (!isResizing || !editorPreviewRegion) return;
    const rect = editorPreviewRegion.getBoundingClientRect();
    const innerW = rect.width - SPLIT_GRIP_PX;
    if (innerW <= 0) return;
    const minR = EDITOR_PANE_MIN / innerW;
    const maxR = 1 - PREVIEW_PANE_MIN / innerW;
    if (minR >= maxR) return;
    const x = e.clientX - rect.left;
    splitRatio = Math.min(maxR, Math.max(minR, x / innerW));
  }

  function handleSidebarResize(e: MouseEvent) {
    if (!isResizingSidebar || !mainLayout) return;
    const { left, width: totalW } = mainLayout.getBoundingClientRect();
    const editorPreviewMin = SPLIT_GRIP_PX + EDITOR_PANE_MIN + PREVIEW_PANE_MIN;
    const max = Math.max(
      SIDEBAR_MIN,
      Math.min(SIDEBAR_MAX, totalW - editorPreviewMin),
    );
    sidebarWidth = Math.round(
      Math.min(max, Math.max(SIDEBAR_MIN, e.clientX - left)),
    );
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

  function handleEditorSplitMouseDown(e: MouseEvent) {
    e.preventDefault();
    applyResizeSelectionShield();
    isResizing = true;
  }

  function handleSidebarGripMouseDown(e: MouseEvent) {
    e.preventDefault();
    applyResizeSelectionShield();
    isResizingSidebar = true;
  }

  function onWindowMouseMove(e: MouseEvent) {
    if (isResizing) {
      e.preventDefault();
      handleEditorSplitResize(e);
    } else if (isResizingSidebar) {
      e.preventDefault();
      handleSidebarResize(e);
    }
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
      case "file.new":
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

    const unlistenMenu = listen("menu-event", (event) => {
      const id = event.payload as string;
      console.log("[typst-editor:menu] menu-event payload:", id);
      switch (id) {
        case "file-new":
          handleShortcutCommand("file.new");
          break;
        case "file-open":
          handleOpenFile();
          break;
        case "file-open-folder":
          handleOpenFolder();
          break;
        case "file-save":
          handleSave();
          break;
        case "file-save-as":
          handleSaveAs();
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
        case "help-shortcuts":
          openSettings("shortcuts");
          break;
        case "help-package-cache":
          openSettings("packageCache");
          break;
        case "help-fonts":
          openSettings("fonts");
          break;
        default:
          console.log(
            "[typst-editor:menu] unhandled menu id (Edit predefined actions like Select All usually bypass this):",
            id,
          );
      }
    });

    /** Debug: native Edit → Select All uses OS responder chain, not menu-event. */
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

<svelte:window
  onmousemove={isResizing || isResizingSidebar ? onWindowMouseMove : null}
  onmouseup={stopAllResizing}
/>

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
    onShowShortcuts={() => openSettings("shortcuts")}
    {colorMode}
    onColorModeChange={handleColorModeChange}
    colorModeOptions={COLOR_MODE_OPTIONS}
    filePath={currentFilePath}
    isDirty={currentFileDirty}
    lastSaved={currentFileLastSaved}
    showPanelToggles={!isLandingPage}
    {sidebarVisible}
    onToggleSidebar={() => (sidebarVisible = !sidebarVisible)}
    {previewVisible}
    onTogglePreview={() => (previewVisible = !previewVisible)}
    showExportPdf={!isLandingPage}
    {pdfExporting}
    onExportPdf={handleExportPdf}
  />

  <SettingsModal
    isOpen={isShortcutsModalOpen}
    onClose={() => {
      isShortcutsModalOpen = false;
      void refreshTypstFontFaces();
    }}
    initialTab={settingsInitialTab}
  />

  <div
    bind:this={mainLayout}
    class="flex flex-1 w-full min-h-0 overflow-hidden relative"
  >
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
      />
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        onmousedown={handleSidebarGripMouseDown}
        class="w-1 cursor-col-resize bg-[var(--app-grip)] hover:bg-[var(--app-grip-hover)] transition-colors shrink-0 flex items-center justify-center z-10 relative group {isResizingSidebar
          ? 'bg-[var(--app-grip-active)]'
          : ''}"
        title="Drag to resize sidebar"
      >
        <div
          class="absolute h-10 w-6 flex items-center justify-center rounded-md bg-[var(--app-bg)] border border-[var(--app-border)] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
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
            }}
            onDispose={() => {
              editor = undefined;
            }}
          />
        </div>
      </div>

      {#if previewVisible}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          onmousedown={handleEditorSplitMouseDown}
          class="w-1 cursor-col-resize bg-[var(--app-grip)] hover:bg-[var(--app-grip-hover)] transition-colors flex items-center justify-center z-10 relative group shrink-0 {isResizing
            ? 'bg-[var(--app-grip-active)]'
            : ''}"
        >
          <div
            class="absolute h-10 w-6 flex items-center justify-center rounded-md bg-[var(--app-bg)] border border-[var(--app-border)] opacity-0 group-hover:opacity-100 transition-opacity"
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
  </div>
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    overflow: hidden;
  }
</style>
