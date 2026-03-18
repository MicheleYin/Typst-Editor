<script lang="ts">
  import {
    ChevronLeft,
    ChevronRight,
    ZoomIn,
    ZoomOut,
    RotateCcw,
    AlertTriangle,
  } from "lucide-svelte";

  type CompileDiagnostic = {
    file: string | null;
    line: number | null;
    column: number | null;
    message: string;
    hints: string[];
    trace: {
      message: string;
      line: number | null;
      column: number | null;
      file: string | null;
    }[];
  };

  let {
    error,
    pages,
    currentPage = $bindable(0),
    pageCount,
    diagnostics = [],
    stalePreview = false,
    scale = $bindable(1),
    translateX = $bindable(0),
    translateY = $bindable(0),
  } = $props<{
    error: string;
    pages: string[];
    currentPage?: number;
    pageCount: number;
    diagnostics?: CompileDiagnostic[];
    stalePreview?: boolean;
    scale?: number;
    translateX?: number;
    translateY?: number;
  }>();

  let isPanning = $state(false);
  let startX = 0;
  let startY = 0;

  function startPan(e: MouseEvent) {
    if (!pages[currentPage]) return;
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

  function prevPage() {
    if (currentPage > 0) currentPage--;
  }

  function nextPage() {
    if (currentPage < pageCount - 1) currentPage++;
  }

  function previewZoomIn() {
    scale = Math.min(scale + 0.1, 5);
  }

  function previewZoomOut() {
    scale = Math.max(scale - 0.1, 0.1);
  }

  function resetPreviewZoom() {
    scale = 1;
    translateX = 0;
    translateY = 0;
  }

  function formatLocation(d: CompileDiagnostic): string {
    const parts: string[] = [];
    if (d.file) parts.push(d.file);
    if (d.line != null) {
      parts.push(
        d.column != null
          ? `line ${d.line}, column ${d.column}`
          : `line ${d.line}`,
      );
    }
    return parts.length ? parts.join(" · ") : "";
  }
</script>

<svelte:window
  onmousemove={isPanning ? pan : null}
  onmouseup={stopPan}
/>

<div class="h-full relative bg-gray-50 flex flex-col min-h-0">
  {#if error}
    <div
      class="shrink-0 px-3 py-2 bg-red-950/90 text-red-200 text-xs border-b border-red-800"
      role="alert"
    >
      {error}
    </div>
  {/if}

  {#if stalePreview}
    <div
      class="shrink-0 flex items-center gap-2 px-3 py-2 bg-amber-50 text-amber-950 text-xs border-b border-amber-200"
    >
      <AlertTriangle size={14} class="shrink-0 text-amber-700" />
      <span
        >Showing <strong>last successful</strong> preview — fix errors below to update.</span
      >
    </div>
  {/if}

  {#if diagnostics.length > 0}
    <div
      class="shrink-0 max-h-[38vh] min-h-0 overflow-y-auto border-b border-red-200 bg-red-50/95"
    >
      <div class="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-red-800">
        Compile error{diagnostics.length > 1 ? "s" : ""} ({diagnostics.length})
      </div>
      <div class="px-3 pb-3 space-y-4">
        {#each diagnostics as d, idx (idx)}
          <div
            class="rounded-lg border border-red-200 bg-white p-3 shadow-sm text-sm text-gray-900"
          >
            {#if formatLocation(d)}
              <div
                class="font-mono text-xs font-semibold text-red-800 mb-1.5 tabular-nums"
              >
                {formatLocation(d)}
              </div>
            {/if}
            <div class="text-gray-800 leading-snug">{d.message}</div>
            {#if d.hints?.length}
              <ul class="mt-2 space-y-1 text-xs text-gray-600 list-disc pl-4">
                {#each d.hints as hint}
                  <li>{hint}</li>
                {/each}
              </ul>
            {/if}
            {#if d.trace?.length}
              <div class="mt-2 pt-2 border-t border-gray-100 space-y-1">
                {#each d.trace as t}
                  <div class="text-xs text-gray-600 pl-2 border-l-2 border-gray-300">
                    <span class="text-gray-500">↳</span>
                    {t.message}
                    {#if t.line != null}
                      <span class="font-mono text-gray-500">
                        · line {t.line}{#if t.column != null}, col {t.column}{/if}
                        {#if t.file}
                          · {t.file}{/if}
                      </span>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="flex-1 min-h-0 overflow-hidden relative {pages[currentPage]
      ? isPanning
        ? 'cursor-grabbing'
        : 'cursor-grab'
      : 'cursor-default'}"
    onmousedown={startPan}
  >
    {#if pageCount > 0 && pages[currentPage]}
      <div class="absolute bottom-6 right-6 flex flex-col gap-2 z-20">
        <div
          class="flex items-center gap-1 bg-white/90 p-1 rounded-lg shadow-lg border border-gray-200 mb-2"
        >
          <button
            type="button"
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
            type="button"
            onclick={nextPage}
            disabled={currentPage >= pageCount - 1}
            class="p-1.5 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent rounded-md transition-colors text-gray-700"
            title="Next Page"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <button
          type="button"
          onclick={previewZoomIn}
          class="p-2 bg-white/90 hover:bg-white text-gray-800 rounded-lg shadow-lg border border-gray-200 transition-all active:scale-95 group"
          title="Zoom In"
        >
          <ZoomIn size={20} class="group-hover:text-blue-600" />
        </button>
        <button
          type="button"
          onclick={previewZoomOut}
          class="p-2 bg-white/90 hover:bg-white text-gray-800 rounded-lg shadow-lg border border-gray-200 transition-all active:scale-95 group"
          title="Zoom Out"
        >
          <ZoomOut size={20} class="group-hover:text-blue-600" />
        </button>
        <button
          type="button"
          onclick={resetPreviewZoom}
          class="p-2 bg-white/90 hover:bg-white text-gray-800 rounded-lg shadow-lg border border-gray-200 transition-all active:scale-95 group"
          title="Reset Zoom"
        >
          <RotateCcw size={20} class="group-hover:text-blue-600" />
        </button>
      </div>

      <div class="w-full h-full flex flex-col items-center overflow-auto p-12">
        <div
          style:transform="translate({translateX}px, {translateY}px)
            scale({scale})"
          class="bg-white shadow-[0_0_50px_rgba(0,0,0,0.1)] rounded-sm min-w-[300px] transition-transform duration-75 ease-out flex-shrink-0 origin-top"
        >
          {@html pages[currentPage]}
        </div>
      </div>
    {:else}
      <div
        class="absolute inset-0 flex items-center justify-center text-gray-400 text-sm p-8 text-center"
      >
        {#if diagnostics.length > 0}
          No preview yet — fix the errors above, or keep editing.
        {:else}
          Compile your document to see a preview.
        {/if}
      </div>
    {/if}
  </div>
</div>
