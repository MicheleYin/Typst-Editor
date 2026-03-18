<script lang="ts">
  import { onMount } from "svelte";
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

  const DEFAULT_CONTENT = `// Welcome to the Typst Editor!

= Introduction
In this editor, you can write *Typst* code and see the live preview on the right.

== Features
- Monaco Editor integration
- Live SVG preview
- Basic syntax highlighting

#set text(fill: blue)
#lorem(20)

$ x^2 + y^2 = r^2 $
`;

  let openFiles = $state<{ path: string; name: string; content: string; isDirty?: boolean; lastSaved?: Date | null }[]>([]);
  let currentFilePath = $state<string | null>(null);
  let currentFolder = $state<string | null>(null);
  let isLandingPage = $derived(openFiles.length === 0 && !currentFilePath && !currentFolder);

  let content = $state("");
  let pages = $state<string[]>([]);
  let pageCount = $state(0);
  let currentPage = $state(0);
  let error = $state("");
  let editorWidth = $state(50);
  let isResizing = $state(false);
  let container: HTMLDivElement;
  let editor = $state<monaco.editor.IStandaloneCodeEditor | undefined>(undefined);

  let scale = $state(1);
  let translateX = $state(0);
  let translateY = $state(0);
  let folderFiles = $state<{ name: string; path: string; isDirectory: boolean }[]>([]);
  let sidebarWidth = $state(260);
  let sidebarVisible = $state(true);
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

  async function compile(text: string) {
    try {
      const result = await invoke<{ pages: string[]; page_count: number }>("compile_typst", {
        content: text,
      });
      pages = result.pages;
      pageCount = result.page_count;
      if (currentPage >= pageCount && pageCount > 0) {
        currentPage = pageCount - 1;
      } else if (pageCount === 0) {
        currentPage = 0;
      }
      error = "";
    } catch (err) {
      error = err as string;
    }
  }

  $effect(() => {
    const currentContent = content;
    const timeoutId = setTimeout(() => {
      compile(currentContent);
    }, 300);
    return () => clearTimeout(timeoutId);
  });

  function handleResize(e: MouseEvent) {
    if (isResizing && container) {
      const rect = container.getBoundingClientRect();
      const newWidth = ((e.clientX - rect.left) / rect.width) * 100;
      if (newWidth > 10 && newWidth < 90) {
        editorWidth = newWidth;
      }
    }
  }

  function stopResizing() {
    isResizing = false;
  }

  function handleMouseDown() {
    isResizing = true;
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
                content: DEFAULT_CONTENT,
                isDirty: false,
                lastSaved: new Date(),
              },
            ];
          }
          content = DEFAULT_CONTENT;
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
    const unlistenMenu = listen("menu-event", (event) => {
      const id = event.payload as string;
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
      }
    });

    const handleShortcutTrigger = (e: CustomEvent<string>) => {
      handleShortcutCommand(e.detail);
    };
    window.addEventListener("shortcut-trigger", handleShortcutTrigger as EventListener);

    return () => {
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
  onmousemove={isResizing ? handleResize : null}
  onmouseup={stopResizing}
/>

<div
  bind:this={container}
  class="flex flex-col h-screen bg-[#1e1e1e] text-white overflow-hidden {isResizing
    ? 'cursor-col-resize select-none'
    : ''}"
  style="zoom: {appZoom};"
>
  <Header
    onShowShortcuts={() => (isShortcutsModalOpen = true)}
    filePath={currentFilePath}
    isDirty={currentFileDirty}
    lastSaved={currentFileLastSaved}
  />

  <Modal
    isOpen={isShortcutsModalOpen}
    onClose={() => (isShortcutsModalOpen = false)}
    title="Keyboard Shortcuts"
  >
    <ShortcutEditor />
  </Modal>

  <div class="flex flex-1 w-full overflow-hidden relative">
    {#if isLandingPage}
      <InitialPage
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
    {/if}

    <div
      style:width="{editorWidth}%"
      class="h-full border-r border-[#333] relative min-w-0 flex flex-col"
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

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      onmousedown={handleMouseDown}
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

    <div style:width="{100 - editorWidth}%" class="h-full min-w-0 flex flex-col">
      <SvgPreview
        {error}
        {pages}
        bind:currentPage
        {pageCount}
        bind:scale
        bind:translateX
        bind:translateY
      />
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
