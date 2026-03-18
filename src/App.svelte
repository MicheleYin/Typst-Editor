<script lang="ts">
  import { onMount, tick } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import * as monaco from "monaco-editor";
  import { listen } from "@tauri-apps/api/event";
  import { GripVertical } from "lucide-svelte";
  import { open, save } from "@tauri-apps/plugin-dialog";
  import { readTextFile, writeTextFile, readDir } from "@tauri-apps/plugin-fs";
  import Header from "./components/Header.svelte";
  import Sidebar from "./components/Sidebar.svelte";
  import Modal from "./components/Modal.svelte";
  import ShortcutEditor from "./components/ShortcutEditor.svelte";
  import InitialPage from "./components/InitialPage.svelte";
  import SvgPreview from "./components/SvgPreview.svelte";
  import MonacoEditorPane from "./components/MonacoEditorPane.svelte";
  import {
    syncAppShortcuts,
    applyMonacoShortcutOverrides,
    shortcutOverrides,
    type ShortcutAction,
  } from "./lib/shortcuts";
  import { fetchAppDisplayName, defaultNewFileContent } from "./lib/appMeta";
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
  const EDITOR_SPLIT_KEY = "typst-editor-editor-split-px";
  /** Preferred minimum editor width when there is enough space */
  const EDITOR_SPLIT_MIN = 200;
  /** Allow editor to shrink this narrow so preview keeps min width */
  const EDITOR_SPLIT_ABS_MIN = 72;
  const PREVIEW_MIN_W = 280;
  const SPLIT_GRIP_PX = 4;
  /** Matches layout: sidebar + editor/preview region needs at least this (web fallback; Tauri uses minWidth) */
  const APP_MIN_WIDTH_PX = 760;
  const APP_MIN_HEIGHT_PX = 480;

  function maxEditorPxForRegion(regionWidth: number): number {
    return regionWidth - SPLIT_GRIP_PX - PREVIEW_MIN_W;
  }

  /** Shrink editor width if needed so preview column can stay at least PREVIEW_MIN_W */
  function clampEditorSplitToRegion() {
    if (!editorPreviewRegion || !previewVisible) return;
    const maxEd = maxEditorPxForRegion(editorPreviewRegion.getBoundingClientRect().width);
    if (editorWidthPx <= maxEd) return;
    editorWidthPx = Math.round(Math.max(0, Math.min(editorWidthPx, maxEd)));
  }
  function readStoredEditorSplitPx(): number {
    try {
      const v = parseInt(localStorage.getItem(EDITOR_SPLIT_KEY) ?? "", 10);
      if (Number.isFinite(v) && v >= EDITOR_SPLIT_MIN) return v;
    } catch {
      /* ignore */
    }
    return 520;
  }
  let editorWidthPx = $state(readStoredEditorSplitPx());
  let isResizing = $state(false);
  let editor = $state<monaco.editor.IStandaloneCodeEditor | undefined>(undefined);

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
      }>("compile_typst", { content: text });
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

  $effect(() => {
    const text = content;
    const pathSnapshot = currentFilePath;
    const timeoutId = setTimeout(() => {
      void compile(text, pathSnapshot);
    }, 300);
    return () => clearTimeout(timeoutId);
  });

  /** Keep editor split valid when sidebar width or visibility changes */
  $effect(() => {
    sidebarVisible;
    sidebarWidth;
    previewVisible;
    tick().then(() => clampEditorSplitToRegion());
  });

  /** When the editor+preview region resizes, shrink editor so preview keeps min width */
  $effect(() => {
    const el = editorPreviewRegion;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      clampEditorSplitToRegion();
    });
    ro.observe(el);
    previewVisible;
    clampEditorSplitToRegion();
    return () => ro.disconnect();
  });

  function handleEditorSplitResize(e: MouseEvent) {
    if (!isResizing || !editorPreviewRegion) return;
    const rect = editorPreviewRegion.getBoundingClientRect();
    const maxEditor = maxEditorPxForRegion(rect.width);
    if (maxEditor <= 0) return;
    const lowWanted =
      maxEditor >= EDITOR_SPLIT_MIN ? EDITOR_SPLIT_MIN : EDITOR_SPLIT_ABS_MIN;
    const lo = Math.min(lowWanted, maxEditor);
    const x = e.clientX - rect.left;
    editorWidthPx = Math.round(Math.min(maxEditor, Math.max(lo, x)));
  }

  function handleSidebarResize(e: MouseEvent) {
    if (!isResizingSidebar || !mainLayout) return;
    const { left, width: totalW } = mainLayout.getBoundingClientRect();
    const editorPreviewMin = PREVIEW_MIN_W + SPLIT_GRIP_PX + EDITOR_SPLIT_MIN;
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
        localStorage.setItem(EDITOR_SPLIT_KEY, String(editorWidthPx));
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
        isShortcutsModalOpen = true;
        break;
    }
  }

  onMount(() => {
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
          isShortcutsModalOpen = true;
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
      "settings.shortcuts": () => {
        isShortcutsModalOpen = true;
      },
    });
    applyMonacoShortcutOverrides(editor, monaco, o);
  });
</script>

<svelte:window
  onmousemove={isResizing || isResizingSidebar ? onWindowMouseMove : null}
  onmouseup={stopAllResizing}
/>

<div
  class="flex flex-col h-screen bg-[#1e1e1e] text-white overflow-hidden {isResizing ||
  isResizingSidebar
    ? 'cursor-col-resize select-none'
    : ''}"
  style:zoom={appZoom}
  style:min-width="{APP_MIN_WIDTH_PX}px"
  style:min-height="{APP_MIN_HEIGHT_PX}px"
>
  <Header
    {appName}
    onShowShortcuts={() => (isShortcutsModalOpen = true)}
    filePath={currentFilePath}
    isDirty={currentFileDirty}
    lastSaved={currentFileLastSaved}
    showPanelToggles={!isLandingPage}
    {sidebarVisible}
    onToggleSidebar={() => (sidebarVisible = !sidebarVisible)}
    {previewVisible}
    onTogglePreview={() => (previewVisible = !previewVisible)}
  />

  <Modal
    isOpen={isShortcutsModalOpen}
    onClose={() => (isShortcutsModalOpen = false)}
    title="Keyboard Shortcuts"
  >
    <ShortcutEditor />
  </Modal>

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
        class="w-1 cursor-col-resize bg-[#333] hover:bg-blue-500 transition-colors shrink-0 flex items-center justify-center z-10 relative group {isResizingSidebar
          ? 'bg-blue-600'
          : ''}"
        title="Drag to resize sidebar"
      >
        <div
          class="absolute h-10 w-6 flex items-center justify-center rounded-md bg-[#1e1e1e] border border-[#333] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
        >
          <GripVertical size={16} class="text-gray-400" />
        </div>
      </div>
    {/if}

    <div
      bind:this={editorPreviewRegion}
      class="flex flex-1 min-h-0 min-w-0"
    >
      <div
        class="h-full relative min-w-0 flex flex-col border-r border-[#333] overflow-hidden {previewVisible
          ? 'shrink-0'
          : 'flex-1'}"
        style:width={previewVisible ? `${editorWidthPx}px` : undefined}
      >
        <MonacoEditorPane
          initialValue={content}
          {appZoom}
          onContentChange={onEditorContentChange}
          onReady={(ed) => {
            editor = ed;
          }}
          onDispose={() => {
            editor = undefined;
          }}
        />
      </div>

      {#if previewVisible}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          onmousedown={handleEditorSplitMouseDown}
          class="w-1 cursor-col-resize bg-[#333] hover:bg-blue-500 transition-colors flex items-center justify-center z-10 relative group shrink-0 {isResizing
            ? 'bg-blue-600'
            : ''}"
        >
          <div
            class="absolute h-10 w-6 flex items-center justify-center rounded-md bg-[#1e1e1e] border border-[#333] opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <GripVertical size={16} class="text-gray-400" />
          </div>
        </div>

        <div
          class="h-full flex flex-col flex-1 overflow-hidden shrink-0"
          style:min-width="{PREVIEW_MIN_W}px"
        >
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
