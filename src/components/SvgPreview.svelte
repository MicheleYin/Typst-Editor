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

  const SCALE_MIN = 0.25;
  const SCALE_MAX = 6;
  const ZOOM_DEBUG = false;

  let pinchActive = $state(false);
  let pinchScaleStart = 1;
  let pinchDistStart = 1;
  /** EMA-smoothed pinch span (reduces slow-pinch jitter). */
  let pinchDistFiltered = 1;
  let pinchLastRawD = 1;
  let pinchMoveLogCounter = 0;

  /** One-finger touch pan */
  let touchPanning = $state(false);
  let touchPanId = -1;
  let panTouchStartX = 0;
  let panTouchStartY = 0;
  let panStartTX = 0;
  let panStartTY = 0;
  function touchDistance(t: TouchList): number {
    if (t.length < 2) return 0;
    const dx = t[0].clientX - t[1].clientX;
    const dy = t[0].clientY - t[1].clientY;
    return Math.hypot(dx, dy);
  }

  let contentEl = $state<HTMLElement | null>(null);
  let viewportEl = $state<HTMLElement | null>(null);

  /** Zoom in/out toward the center of the preview pane (like browser image zoom). */
  function setScaleFromViewportCenter(nextScale: number, reason = "viewportCenter") {
    const s = Math.min(SCALE_MAX, Math.max(SCALE_MIN, nextScale));
    const prevScale = scale;
    const prevTx = translateX;
    const prevTy = translateY;
    if (Math.abs(s - prevScale) < 1e-6) {
      if (ZOOM_DEBUG) {
        console.log("[SvgPreview zoom] skip (no change)", { reason, scale: prevScale });
      }
      return;
    }
    const pane = viewportEl;
    const el = contentEl;
    let fx = 0;
    let fy = 0;
    let ox = 0;
    let oy = 0;
    let k = 1;
    if (pane && el) {
      const pr = pane.getBoundingClientRect();
      fx = pr.left + pr.width / 2;
      fy = pr.top + pr.height / 2;
      const r = el.getBoundingClientRect();
      ox = r.left + r.width / 2;
      oy = r.top + r.height / 2;
      k = s / prevScale;
      const dtx = (fx - ox) * (1 - k);
      const dty = (fy - oy) * (1 - k);
      translateX += dtx;
      translateY += dty;
      if (ZOOM_DEBUG) {
        console.log("[SvgPreview zoom]", reason, {
          scale: { from: prevScale, to: s, k },
          translate: {
            from: [prevTx, prevTy],
            to: [translateX, translateY],
            delta: [translateX - prevTx, translateY - prevTy],
          },
          pane: { w: pr.width, h: pr.height, fx, fy },
          content: {
            w: r.width,
            h: r.height,
            ox,
            oy,
            // offset of content center from pane center (before pan delta)
            offsetFromPaneCenter: [ox - fx, oy - fy],
          },
        });
      }
    } else {
      if (ZOOM_DEBUG) {
        console.warn("[SvgPreview zoom] no pane/content rect — translate unchanged", {
          reason,
          hadPane: !!pane,
          hadContent: !!el,
          scale: { from: prevScale, to: s },
        });
      }
    }
    scale = s;
  }

  function touchById(t: TouchList, id: number): Touch | undefined {
    for (let i = 0; i < t.length; i++) {
      if (t[i].identifier === id) return t[i];
    }
    return undefined;
  }

  function onTouchStartGestures(e: TouchEvent) {
    if (!pages[currentPage]) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest("button")) return;

    if (e.touches.length >= 2) {
      touchPanning = false;
      pinchActive = true;
      pinchScaleStart = scale;
      pinchDistStart = Math.max(touchDistance(e.touches), 10);
      pinchDistFiltered = pinchDistStart;
      pinchLastRawD = pinchDistStart;
      pinchMoveLogCounter = 0;
      if (ZOOM_DEBUG) {
        console.log("[SvgPreview pinch] start", {
          pinchScaleStart,
          pinchDistStart,
          scale,
          translateX,
          translateY,
        });
      }
      e.preventDefault();
    } else if (e.touches.length === 1) {
      const p = e.touches[0];
      touchPanning = true;
      touchPanId = p.identifier;
      panTouchStartX = p.clientX;
      panTouchStartY = p.clientY;
      panStartTX = translateX;
      panStartTY = translateY;
    }
  }

  function onTouchMoveGestures(e: TouchEvent) {
    if (!pages[currentPage]) return;

    if (e.touches.length >= 2 && pinchActive) {
      e.preventDefault();
      const rawD = Math.max(touchDistance(e.touches), 1);
      const dd = Math.abs(rawD - pinchLastRawD);
      pinchLastRawD = rawD;
      // More smoothing when per-frame change is tiny (slow pinch noise); snap up when moving on purpose.
      const alpha =
        dd < 0.75 ? 0.07 : dd < 2.5 ? 0.22 : dd < 10 ? 0.48 : 0.78;
      pinchDistFiltered = alpha * rawD + (1 - alpha) * pinchDistFiltered;
      const prevScale = scale;
      const next = Math.min(
        SCALE_MAX,
        Math.max(
          SCALE_MIN,
          pinchScaleStart * (pinchDistFiltered / pinchDistStart),
        ),
      );
      scale = next;
      pinchMoveLogCounter += 1;
      if (ZOOM_DEBUG && (pinchMoveLogCounter <= 3 || pinchMoveLogCounter % 6 === 0)) {
        console.log("[SvgPreview pinch] move", {
          n: pinchMoveLogCounter,
          rawD,
          pinchDistFiltered,
          distRatio: pinchDistFiltered / pinchDistStart,
          alpha,
          scale: { from: prevScale, to: next },
          translateX,
          translateY,
        });
      }
      return;
    }

    if (touchPanning && e.touches.length === 1) {
      const p = touchById(e.touches, touchPanId) ?? e.touches[0];
      e.preventDefault();
      translateX = panStartTX + (p.clientX - panTouchStartX);
      translateY = panStartTY + (p.clientY - panTouchStartY);
    }
  }

  function onTouchEndGestures(e: TouchEvent) {
    if (e.touches.length < 2 && pinchActive && ZOOM_DEBUG) {
      console.log("[SvgPreview pinch] end (finger lifted)", {
        remainingTouches: e.touches.length,
        scale,
        translateX,
        translateY,
      });
    }
    if (e.touches.length < 2) pinchActive = false;
    if (e.touches.length === 1 && pages[currentPage]) {
      const p = e.touches[0];
      touchPanning = true;
      touchPanId = p.identifier;
      panTouchStartX = p.clientX;
      panTouchStartY = p.clientY;
      panStartTX = translateX;
      panStartTY = translateY;
    }
    if (e.touches.length === 0) {
      touchPanning = false;
      touchPanId = -1;
    } else if (touchPanning && touchById(e.touches, touchPanId) === undefined) {
      touchPanning = false;
      touchPanId = -1;
    }
  }

  function onWheelPreview(e: WheelEvent) {
    if (!e.ctrlKey || !pages[currentPage]) return;
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.01);
    if (ZOOM_DEBUG) {
      console.log("[SvgPreview wheel] ctrl+wheel", {
        deltaY: e.deltaY,
        deltaMode: e.deltaMode,
        factor,
        scaleBefore: scale,
      });
    }
    setScaleFromViewportCenter(scale * factor, "wheel");
  }

  /** Non-passive touch + wheel so pinch/zoom can preventDefault (browser zoom / overscroll). */
  function previewGestures(node: HTMLElement) {
    const touchOpts: AddEventListenerOptions = { passive: false };
    node.addEventListener("touchstart", onTouchStartGestures, touchOpts);
    node.addEventListener("touchmove", onTouchMoveGestures, touchOpts);
    node.addEventListener("touchend", onTouchEndGestures);
    node.addEventListener("touchcancel", onTouchEndGestures);
    node.addEventListener("wheel", onWheelPreview, { passive: false });
    return {
      destroy() {
        node.removeEventListener("touchstart", onTouchStartGestures, touchOpts);
        node.removeEventListener("touchmove", onTouchMoveGestures, touchOpts);
        node.removeEventListener("touchend", onTouchEndGestures);
        node.removeEventListener("touchcancel", onTouchEndGestures);
        node.removeEventListener("wheel", onWheelPreview);
      },
    };
  }

  function startPan(e: MouseEvent) {
    if (!pages[currentPage] || e.button !== 0) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest("button")) return;
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
    if (ZOOM_DEBUG) console.log("[SvgPreview] zoomIn button", { scale });
    setScaleFromViewportCenter(scale * 1.2, "zoomIn");
  }

  function previewZoomOut() {
    if (ZOOM_DEBUG) console.log("[SvgPreview] zoomOut button", { scale });
    setScaleFromViewportCenter(scale / 1.2, "zoomOut");
  }

  function resetPreviewZoom() {
    if (ZOOM_DEBUG) {
      console.log("[SvgPreview] reset", { scale, translateX, translateY });
    }
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

<div class="h-full relative bg-[var(--preview-pane-bg)] flex flex-col min-h-0">
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
          class="flex items-center gap-1 bg-[var(--preview-floating-bg)] p-1 rounded-lg shadow-lg border border-[var(--preview-floating-border)] mb-2"
        >
          <button
            type="button"
            onclick={prevPage}
            disabled={currentPage === 0}
            class="p-1.5 hover:bg-[var(--preview-floating-hover)] disabled:opacity-30 disabled:hover:bg-transparent rounded-md transition-colors text-[var(--preview-floating-text)]"
            title="Previous Page"
          >
            <ChevronLeft size={18} />
          </button>
          <div class="px-2 text-xs font-bold text-[var(--preview-floating-text)] tabular-nums">
            {pageCount > 0 ? currentPage + 1 : 0} / {pageCount}
          </div>
          <button
            type="button"
            onclick={nextPage}
            disabled={currentPage >= pageCount - 1}
            class="p-1.5 hover:bg-[var(--preview-floating-hover)] disabled:opacity-30 disabled:hover:bg-transparent rounded-md transition-colors text-[var(--preview-floating-text)]"
            title="Next Page"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div class="flex flex-col gap-2 w-fit self-end">
          <button
            type="button"
            onclick={previewZoomIn}
            class="p-2 bg-[var(--preview-floating-bg)] hover:opacity-95 text-[var(--preview-floating-text)] rounded-lg shadow-lg border border-[var(--preview-floating-border)] transition-all active:scale-95 group inline-flex items-center justify-center"
            title="Zoom In"
          >
            <ZoomIn size={20} class="group-hover:text-blue-600" />
          </button>
          <button
            type="button"
            onclick={previewZoomOut}
            class="p-2 bg-[var(--preview-floating-bg)] hover:opacity-95 text-[var(--preview-floating-text)] rounded-lg shadow-lg border border-[var(--preview-floating-border)] transition-all active:scale-95 group inline-flex items-center justify-center"
            title="Zoom Out"
          >
            <ZoomOut size={20} class="group-hover:text-blue-600" />
          </button>
          <button
            type="button"
            onclick={resetPreviewZoom}
            class="p-2 bg-[var(--preview-floating-bg)] hover:opacity-95 text-[var(--preview-floating-text)] rounded-lg shadow-lg border border-[var(--preview-floating-border)] transition-all active:scale-95 group inline-flex items-center justify-center"
            title="Reset Zoom"
          >
            <RotateCcw size={20} class="group-hover:text-blue-600" />
          </button>
        </div>
      </div>

      <div
        bind:this={viewportEl}
        class="w-full h-full flex flex-col items-center overflow-hidden p-12 min-h-0"
        style:touch-action="none"
        use:previewGestures
      >
        <div
          bind:this={contentEl}
          style:transform="translate3d({translateX}px, {translateY}px, 0) scale({scale})"
          class="bg-white shadow-[0_0_50px_rgba(0,0,0,0.1)] rounded-sm min-w-[300px] shrink-0 origin-center will-change-transform transition-none [backface-visibility:hidden]"
        >
          {@html pages[currentPage]}
        </div>
      </div>
    {:else}
      <div
        class="absolute inset-0 flex items-center justify-center text-[var(--preview-empty)] text-sm p-8 text-center"
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
