<script lang="ts">
  import {
    ChevronLeft,
    ChevronRight,
    ZoomIn,
    ZoomOut,
    RotateCcw,
  } from "lucide-svelte";

  let {
    error,
    pages,
    currentPage = $bindable(0),
    pageCount,
    scale = $bindable(1),
    translateX = $bindable(0),
    translateY = $bindable(0),
  } = $props<{
    error: string;
    pages: string[];
    currentPage?: number;
    pageCount: number;
    scale?: number;
    translateX?: number;
    translateY?: number;
  }>();

  let isPanning = $state(false);
  let startX = 0;
  let startY = 0;

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
</script>

<svelte:window
  onmousemove={isPanning ? pan : null}
  onmouseup={stopPan}
/>

<div class="h-full relative bg-gray-50 flex flex-col">
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
