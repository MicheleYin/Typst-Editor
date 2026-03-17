<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import * as monaco from "monaco-editor";
  import {
    GripVertical,
    ZoomIn,
    ZoomOut,
    RotateCcw,
    ChevronLeft,
    ChevronRight,
  } from "lucide-svelte";
  import { open, save } from "@tauri-apps/plugin-dialog";
  import { readTextFile, writeTextFile, readDir } from "@tauri-apps/plugin-fs";
  import * as typstLanguage from "./typst-language";
  import Header from "./components/Header.svelte";
  import Sidebar from "./components/Sidebar.svelte";
  import ActivityBar from "./components/ActivityBar.svelte";

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

  let content = $state(DEFAULT_CONTENT);
  let pages = $state<string[]>([]);
  let pageCount = $state(0);
  let currentPage = $state(0);
  let error = $state("");
  let editorWidth = $state(50); // percentage
  let isResizing = $state(false);
  let container: HTMLDivElement;
  let editorContainer: HTMLDivElement;
  let editor: monaco.editor.IStandaloneCodeEditor;

  // Zoom/Pan state
  let scale = $state(1);
  let translateX = $state(0);
  let translateY = $state(0);
  let isPanning = $state(false);
  let startX = 0;
  let startY = 0;
  let currentFilePath = $state<string | null>(null);
  let openFiles = $state<{ path: string; name: string; content: string }[]>([]);
  let currentFolder = $state<string | null>(null);
  let folderFiles = $state<{ name: string; path: string; isDirectory: boolean }[]>([]);
  let sidebarWidth = $state(260); // pixels
  let sidebarVisible = $state(true);
  let activeSidebarTab = $state("explorer");

  function toggleSidebar(tabId: string) {
    if (activeSidebarTab === tabId && sidebarVisible) {
      sidebarVisible = false;
    } else {
      activeSidebarTab = tabId;
      sidebarVisible = true;
    }
  }

  async function handleOpenFile() {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "Typst",
            extensions: ["typ"],
          },
        ],
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
      const existing = openFiles.find(f => f.path === path);
      if (existing) {
        content = existing.content;
        currentFilePath = path;
        if (editor) editor.setValue(content);
        return;
      }

      const text = await readTextFile(path);
      const name = path.split('/').pop() || path;
      openFiles = [...openFiles, { path, name, content: text }];
      content = text;
      currentFilePath = path;
      if (editor) {
        editor.setValue(text);
      }
    } catch (err) {
      error = `Error reading file: ${err}`;
    }
  }

  function handleCloseFile(path: string) {
    const index = openFiles.findIndex(f => f.path === path);
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
          content = DEFAULT_CONTENT;
          if (editor) editor.setValue(content);
        }
      }
    }
  }


  async function handleOpenFolder() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });
      if (selected) {
        currentFolder = selected;
        const entries = await readDir(selected);
        folderFiles = entries
          .filter(e => !e.name?.startsWith('.'))
          .map(e => ({
            name: e.name || '',
            path: `${selected}/${e.name}`,
            isDirectory: e.isDirectory
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
        console.log("Saved to:", currentFilePath);
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
        filters: [
          {
            name: "Typst",
            extensions: ["typ"],
          },
        ],
      });
      if (selected) {
        await writeTextFile(selected, content);
        currentFilePath = selected;
        console.log("Saved as:", selected);
      }
    } catch (err) {
      error = `Error saving as: ${err}`;
    }
  }

  // Auto-sync effect
  $effect(() => {
    if (currentFilePath && content) {
      const timeoutId = setTimeout(async () => {
        try {
          await writeTextFile(currentFilePath!, content);
          console.log("Auto-synced to:", currentFilePath);
        } catch (err) {
          console.error("Auto-sync failed:", err);
        }
      }, 1000); // 1s debounce for sync
      return () => clearTimeout(timeoutId);
    }
  });

  async function compile(text: string) {
    try {
      const result = await invoke<{ pages: string[]; page_count: number }>(
        "compile_typst",
        { content: text },
      );
      pages = result.pages;
      pageCount = result.page_count;

      // Keep currentPage within bounds after recompilation
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
    // Synchronously access content to ensure Svelte 5 tracks it as a dependency
    const currentContent = content;

    const timeoutId = setTimeout(() => {
      console.log("Triggering compilation...");
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

  onMount(() => {
    // Register Typst language
    monaco.languages.register({ id: "typst" });
    monaco.languages.setMonarchTokensProvider("typst", typstLanguage.language);
    monaco.languages.setLanguageConfiguration("typst", typstLanguage.conf);

    editor = monaco.editor.create(editorContainer, {
      value: content,
      language: "typst",
      theme: "vs-dark",
      minimap: { enabled: false },
      fontSize: 14,
      wordWrap: "on",
      automaticLayout: true,
    });

    editor.onDidChangeModelContent(() => {
      content = editor.getValue();
    });

    return () => {
      editor.dispose();
    };
  });

  // Pan logic
  function startPan(e: MouseEvent) {
    if (error) return;
    isPanning = true;
    startX = e.clientX - translateX;
    startY = e.clientY - translateY;
  }

  function pan(e: MouseEvent) {
    if (!isPanning) return;
    translateX = e.clientX - startX;
    translateY = e.clientY - startY;
  }

  function stopPan() {
    isPanning = false;
  }

  function zoomIn() {
    scale = Math.min(scale * 1.2, 10);
  }
  function zoomOut() {
    scale = Math.max(scale / 1.2, 0.1);
  }
  function resetTransform() {
    scale = 1;
    translateX = 0;
    translateY = 0;
  }

  function nextPage() {
    if (currentPage < pageCount - 1) {
      currentPage++;
    }
  }

  function prevPage() {
    if (currentPage > 0) {
      currentPage--;
    }
  }
</script>

<svelte:window
  onmousemove={isResizing ? handleResize : isPanning ? pan : null}
  onmouseup={() => {
    stopResizing();
    stopPan();
  }}
/>

<div
  bind:this={container}
  class="flex flex-col h-screen w-screen bg-[#1e1e1e] text-white overflow-hidden font-sans {isResizing
    ? 'cursor-col-resize select-none'
    : ''}"
>
  <Header
    onOpenFile={handleOpenFile}
    onOpenFolder={handleOpenFolder}
    onSave={handleSave}
    onSaveAs={handleSaveAs}
    filePath={currentFilePath}
  />

  <div class="flex flex-1 w-full overflow-hidden">
    <ActivityBar 
      activeTab={activeSidebarTab} 
      onTabClick={toggleSidebar} 
    />

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
      class="h-full border-r border-[#333] relative"
    >
      <div bind:this={editorContainer} class="h-full w-full"></div>
    </div>

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      onmousedown={handleMouseDown}
      class="w-1 cursor-col-resize bg-[#333] hover:bg-blue-500 transition-colors flex items-center justify-center z-10 relative group {isResizing
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
      style:width="{100 - editorWidth}%"
      class="h-full relative bg-gray-50 flex flex-col"
    >
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="flex-1 overflow-hidden relative {isPanning
          ? 'cursor-grabbing'
          : 'cursor-grab'}"
        onmousedown={startPan}
      >
        {#if error}
          <div
            class="absolute inset-0 p-8 overflow-y-auto bg-white flex justify-center"
          >
            <div
              class="bg-red-50 text-red-700 p-6 rounded-lg border border-red-200 w-full max-w-2xl h-fit shadow-sm"
            >
              <pre
                class="m-0 whitespace-pre-wrap break-all font-mono text-sm">{error}</pre>
            </div>
          </div>
        {:else}
          <div class="absolute bottom-6 right-6 flex flex-col gap-2 z-20">
            <div
              class="flex items-center gap-1 bg-white/90 p-1 rounded-lg shadow-lg border border-gray-200 mb-2"
            >
              <button
                onclick={prevPage}
                disabled={currentPage === 0}
                class="p-1.5 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent rounded-md transition-colors text-gray-700"
                title="Previous Page"
              >
                <ChevronLeft size={18} />
              </button>
              <div class="px-2 text-xs font-bold text-gray-800 tabular-nums">
                {pageCount > 0 ? currentPage + 1 : 0} / {pageCount}
              </div>
              <button
                onclick={nextPage}
                disabled={currentPage >= pageCount - 1}
                class="p-1.5 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent rounded-md transition-colors text-gray-700"
                title="Next Page"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            <button
              onclick={zoomIn}
              class="p-2 bg-white/90 hover:bg-white text-gray-800 rounded-lg shadow-lg border border-gray-200 transition-all active:scale-95 group"
              title="Zoom In"
            >
              <ZoomIn size={20} class="group-hover:text-blue-600" />
            </button>
            <button
              onclick={zoomOut}
              class="p-2 bg-white/90 hover:bg-white text-gray-800 rounded-lg shadow-lg border border-gray-200 transition-all active:scale-95 group"
              title="Zoom Out"
            >
              <ZoomOut size={20} class="group-hover:text-blue-600" />
            </button>
            <button
              onclick={resetTransform}
              class="p-2 bg-white/90 hover:bg-white text-gray-800 rounded-lg shadow-lg border border-gray-200 transition-all active:scale-95 group"
              title="Reset Zoom"
            >
              <RotateCcw size={20} class="group-hover:text-blue-600" />
            </button>
          </div>

          <div
            class="w-full h-full flex flex-col items-center overflow-auto p-12"
          >
            {#if pages[currentPage]}
              <div
                style:transform="translate({translateX}px, {translateY}px)
                scale({scale})"
                class="bg-white shadow-[0_0_50px_rgba(0,0,0,0.1)] rounded-sm min-w-[300px] transition-transform duration-75 ease-out flex-shrink-0 origin-top"
              >
                {@html pages[currentPage]}
              </div>
            {/if}
          </div>
        {/if}
      </div>
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
