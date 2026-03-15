<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import * as monaco from "monaco-editor";
  import { GripVertical, ZoomIn, ZoomOut, RotateCcw } from "lucide-svelte";
  import * as typstLanguage from "./typst-language";

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

  async function compile(text: string) {
    try {
      const result = await invoke<{ pages: string[], page_count: number }>("compile_typst", { content: text });
      pages = result.pages;
      pageCount = result.page_count;
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

  function handleWheel(e: WheelEvent) {
    if (error) return;
    e.preventDefault();

    const delta = -e.deltaY;
    const factor = Math.pow(1.1, delta / 100);
    const newScale = Math.min(Math.max(scale * factor, 0.1), 10);
    scale = newScale;
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
  class="flex h-screen w-screen bg-[#1e1e1e] text-white overflow-hidden font-sans {isResizing
    ? 'cursor-col-resize select-none'
    : ''}"
>
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
      onwheel={handleWheel}
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
          <div class="bg-white/90 px-3 py-2 text-gray-800 rounded-lg shadow-lg border border-gray-200 text-xs font-semibold mb-2">
            Page {pageCount > 0 ? 1 : 0} of {pageCount}
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
            class="w-full h-full flex flex-col items-center overflow-auto p-12 gap-8"
        >
          {#each pages as pageSnippet}
            <div
              style:transform="translate({translateX}px, {translateY}px) scale({scale})"
              class="bg-white shadow-[0_0_50px_rgba(0,0,0,0.1)] rounded-sm min-w-[300px] transition-transform duration-75 ease-out flex-shrink-0 origin-top"
            >
              {@html pageSnippet}
            </div>
          {/each}
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
