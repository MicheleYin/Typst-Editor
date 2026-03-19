<script lang="ts">
  import { ZoomIn, ZoomOut, RotateCcw } from "lucide-svelte";
  import SvgPreview from "./SvgPreview.svelte";

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

  type PreviewMode =
    | { kind: "typst"; error: string; pages: string[]; pageCount: number; diagnostics: CompileDiagnostic[]; stale: boolean }
    | { kind: "image"; url: string; label: string }
    | { kind: "pdf"; url: string }
    | { kind: "svg-inline"; svg: string }
    | { kind: "none"; hint: string };

  let {
    mode,
    currentPage = $bindable(0),
    scale = $bindable(1),
    translateX = $bindable(0),
    translateY = $bindable(0),
  } = $props<{
    mode: PreviewMode;
    currentPage?: number;
    scale?: number;
    translateX?: number;
    translateY?: number;
  }>();

  let svgBlobUrl = $state<string | null>(null);

  $effect(() => {
    let url: string | null = null;
    if (mode.kind === "svg-inline") {
      const body = mode.svg?.trim()
        ? mode.svg
        : "<svg xmlns='http://www.w3.org/2000/svg' width='120' height='40'><text x='8' y='26' fill='currentColor' font-size='14'>Empty SVG</text></svg>";
      url = URL.createObjectURL(
        new Blob([body], { type: "image/svg+xml;charset=utf-8" }),
      );
      svgBlobUrl = url;
    } else {
      svgBlobUrl = null;
    }
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  });

  /** Reset zoom when opening a different raster file (not on every SVG source edit). */
  let rasterImageZoomKey = $state<string | null>(null);
  let prevRasterPreviewKind = $state<PreviewMode["kind"] | "">("");
  $effect(() => {
    const k = mode.kind;
    if (k === "image") {
      const key = `img:${mode.url}`;
      if (key !== rasterImageZoomKey) {
        rasterImageZoomKey = key;
        scale = 1;
        translateX = 0;
        translateY = 0;
      }
    } else {
      rasterImageZoomKey = null;
    }
    if (k === "svg-inline" && prevRasterPreviewKind !== "svg-inline") {
      scale = 1;
      translateX = 0;
      translateY = 0;
    }
    prevRasterPreviewKind = k;
  });

  const SCALE_MIN = 0.25;
  const SCALE_MAX = 8;

  let rasterViewportEl = $state<HTMLElement | null>(null);
  let rasterContentEl = $state<HTMLElement | null>(null);

  let isRasterPanning = $state(false);
  let rasterPanStartX = 0;
  let rasterPanStartY = 0;
  let rasterPanOriginTx = 0;
  let rasterPanOriginTy = 0;

  let pinchActive = false;
  let pinchScaleStart = 1;
  let pinchDistStart = 1;
  let pinchDistFiltered = 1;
  let pinchLastRawD = 1;

  let touchPanning = false;
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

  function touchById(t: TouchList, id: number): Touch | undefined {
    for (let i = 0; i < t.length; i++) {
      if (t[i].identifier === id) return t[i];
    }
    return undefined;
  }

  function setRasterScaleFromViewportCenter(nextScale: number) {
    const s = Math.min(SCALE_MAX, Math.max(SCALE_MIN, nextScale));
    const prevScale = scale;
    const pane = rasterViewportEl;
    const el = rasterContentEl;
    if (Math.abs(s - prevScale) < 1e-6) return;
    if (pane && el) {
      const pr = pane.getBoundingClientRect();
      const fx = pr.left + pr.width / 2;
      const fy = pr.top + pr.height / 2;
      const r = el.getBoundingClientRect();
      const ox = r.left + r.width / 2;
      const oy = r.top + r.height / 2;
      const k = s / prevScale;
      translateX += (fx - ox) * (1 - k);
      translateY += (fy - oy) * (1 - k);
    }
    scale = s;
  }

  function onRasterTouchStart(e: TouchEvent) {
    const t = e.target as HTMLElement | null;
    if (t?.closest("button")) return;

    if (e.touches.length >= 2) {
      touchPanning = false;
      pinchActive = true;
      pinchScaleStart = scale;
      pinchDistStart = Math.max(touchDistance(e.touches), 10);
      pinchDistFiltered = pinchDistStart;
      pinchLastRawD = pinchDistStart;
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

  function onRasterTouchMove(e: TouchEvent) {
    if (e.touches.length >= 2 && pinchActive) {
      e.preventDefault();
      const rawD = Math.max(touchDistance(e.touches), 1);
      const dd = Math.abs(rawD - pinchLastRawD);
      pinchLastRawD = rawD;
      const alpha =
        dd < 0.75 ? 0.07 : dd < 2.5 ? 0.22 : dd < 10 ? 0.48 : 0.78;
      pinchDistFiltered = alpha * rawD + (1 - alpha) * pinchDistFiltered;
      scale = Math.min(
        SCALE_MAX,
        Math.max(
          SCALE_MIN,
          pinchScaleStart * (pinchDistFiltered / pinchDistStart),
        ),
      );
      return;
    }

    if (touchPanning && e.touches.length === 1) {
      const p = touchById(e.touches, touchPanId) ?? e.touches[0];
      e.preventDefault();
      translateX = panStartTX + (p.clientX - panTouchStartX);
      translateY = panStartTY + (p.clientY - panTouchStartY);
    }
  }

  function onRasterTouchEnd(e: TouchEvent) {
    if (e.touches.length < 2) pinchActive = false;
    if (e.touches.length === 1) {
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

  function onRasterWheel(e: WheelEvent) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.01);
    setRasterScaleFromViewportCenter(scale * factor);
  }

  /** Non-passive touch + wheel so pinch/zoom can preventDefault (browser zoom / overscroll). */
  function rasterPreviewGestures(node: HTMLElement) {
    const touchOpts: AddEventListenerOptions = { passive: false };
    node.addEventListener("touchstart", onRasterTouchStart, touchOpts);
    node.addEventListener("touchmove", onRasterTouchMove, touchOpts);
    node.addEventListener("touchend", onRasterTouchEnd);
    node.addEventListener("touchcancel", onRasterTouchEnd);
    node.addEventListener("wheel", onRasterWheel, { passive: false });
    return {
      destroy() {
        node.removeEventListener("touchstart", onRasterTouchStart, touchOpts);
        node.removeEventListener("touchmove", onRasterTouchMove, touchOpts);
        node.removeEventListener("touchend", onRasterTouchEnd);
        node.removeEventListener("touchcancel", onRasterTouchEnd);
        node.removeEventListener("wheel", onRasterWheel);
      },
    };
  }

  function startRasterMousePan(e: MouseEvent) {
    if (e.button !== 0) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest("button")) return;
    isRasterPanning = true;
    rasterPanStartX = e.clientX;
    rasterPanStartY = e.clientY;
    rasterPanOriginTx = translateX;
    rasterPanOriginTy = translateY;
  }

  function onRasterMouseMove(e: MouseEvent) {
    if (!isRasterPanning) return;
    translateX = rasterPanOriginTx + (e.clientX - rasterPanStartX);
    translateY = rasterPanOriginTy + (e.clientY - rasterPanStartY);
  }

  function stopRasterMousePan() {
    isRasterPanning = false;
  }

  function rasterZoomIn() {
    setRasterScaleFromViewportCenter(scale * 1.2);
  }

  function rasterZoomOut() {
    setRasterScaleFromViewportCenter(scale / 1.2);
  }

  function rasterResetZoom() {
    scale = 1;
    translateX = 0;
    translateY = 0;
  }

  let rasterGesturesActive = $derived(
    mode.kind === "image" || mode.kind === "svg-inline",
  );
</script>

<svelte:window
  onmousemove={rasterGesturesActive && isRasterPanning ? onRasterMouseMove : null}
  onmouseup={rasterGesturesActive ? stopRasterMousePan : null}
/>

{#if mode.kind === "typst"}
  <SvgPreview
    error={mode.error}
    pages={mode.pages}
    bind:currentPage
    pageCount={mode.pageCount}
    diagnostics={mode.diagnostics}
    stalePreview={mode.stale}
    bind:scale
    bind:translateX
    bind:translateY
  />
{:else if mode.kind === "image"}
  <div
    class="h-full w-full min-h-0 flex flex-col bg-[var(--app-surface)] overflow-hidden"
    role="region"
    aria-label="Image preview"
  >
    <div
      class="shrink-0 px-2 py-1.5 text-[10px] uppercase tracking-wider text-[var(--app-fg-muted)] border-b border-[var(--app-border)] truncate"
      title={mode.label}
    >
      {mode.label}
    </div>
    <div class="flex-1 min-h-0 relative min-w-0">
      <div
        class="absolute top-2 right-2 z-10 flex flex-col gap-1.5 pointer-events-auto"
      >
        <button
          type="button"
          onclick={rasterZoomIn}
          class="p-2 rounded-lg shadow-lg border border-[var(--app-border)] bg-[var(--app-surface-elevated)] text-[var(--app-fg-secondary)] hover:bg-[var(--app-btn-ghost-hover)]"
          title="Zoom in"
        >
          <ZoomIn size={18} />
        </button>
        <button
          type="button"
          onclick={rasterZoomOut}
          class="p-2 rounded-lg shadow-lg border border-[var(--app-border)] bg-[var(--app-surface-elevated)] text-[var(--app-fg-secondary)] hover:bg-[var(--app-btn-ghost-hover)]"
          title="Zoom out"
        >
          <ZoomOut size={18} />
        </button>
        <button
          type="button"
          onclick={rasterResetZoom}
          class="p-2 rounded-lg shadow-lg border border-[var(--app-border)] bg-[var(--app-surface-elevated)] text-[var(--app-fg-secondary)] hover:bg-[var(--app-btn-ghost-hover)]"
          title="Reset zoom and pan"
        >
          <RotateCcw size={18} />
        </button>
      </div>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div
        bind:this={rasterViewportEl}
        class="absolute inset-0 flex items-center justify-center overflow-hidden p-3 sm:p-4"
        style:touch-action="none"
        use:rasterPreviewGestures
        onmousedown={startRasterMousePan}
        role="application"
        aria-label="Pinch or Ctrl+scroll to zoom; drag to pan"
        tabindex="-1"
      >
        <div
          bind:this={rasterContentEl}
          class="flex h-full w-full origin-center items-center justify-center will-change-transform transition-none select-none [backface-visibility:hidden]"
          style:transform="translate3d({translateX}px, {translateY}px, 0) scale({scale})"
        >
          <img
            src={mode.url}
            alt=""
            draggable="false"
            class="max-h-full max-w-full object-contain shadow-lg rounded-sm border border-[var(--app-border)]"
          />
        </div>
      </div>
    </div>
  </div>
{:else if mode.kind === "pdf"}
  <div
    class="h-full w-full min-h-0 flex flex-col bg-[var(--app-surface)] overflow-hidden"
    role="region"
    aria-label="PDF preview"
  >
    <div
      class="shrink-0 px-2 py-1.5 text-[10px] uppercase tracking-wider text-[var(--app-fg-muted)] border-b border-[var(--app-border)]"
    >
      PDF
    </div>
    <iframe
      title="PDF preview"
      src={mode.url}
      class="flex-1 min-h-0 w-full border-0 bg-[var(--app-bg)]"
    ></iframe>
  </div>
{:else if mode.kind === "svg-inline"}
  <div
    class="h-full w-full min-h-0 flex flex-col bg-[var(--app-surface)] overflow-hidden"
    role="region"
    aria-label="SVG preview"
  >
    <div
      class="shrink-0 px-2 py-1.5 text-[10px] uppercase tracking-wider text-[var(--app-fg-muted)] border-b border-[var(--app-border)]"
    >
      SVG preview (from editor)
    </div>
    <div class="flex-1 min-h-0 relative min-w-0 bg-[var(--app-bg)] checkerboard">
      <div
        class="absolute top-2 right-2 z-10 flex flex-col gap-1.5 pointer-events-auto"
      >
        <button
          type="button"
          onclick={rasterZoomIn}
          class="p-2 rounded-lg shadow-lg border border-[var(--app-border)] bg-[var(--app-surface-elevated)] text-[var(--app-fg-secondary)] hover:bg-[var(--app-btn-ghost-hover)]"
          title="Zoom in"
        >
          <ZoomIn size={18} />
        </button>
        <button
          type="button"
          onclick={rasterZoomOut}
          class="p-2 rounded-lg shadow-lg border border-[var(--app-border)] bg-[var(--app-surface-elevated)] text-[var(--app-fg-secondary)] hover:bg-[var(--app-btn-ghost-hover)]"
          title="Zoom out"
        >
          <ZoomOut size={18} />
        </button>
        <button
          type="button"
          onclick={rasterResetZoom}
          class="p-2 rounded-lg shadow-lg border border-[var(--app-border)] bg-[var(--app-surface-elevated)] text-[var(--app-fg-secondary)] hover:bg-[var(--app-btn-ghost-hover)]"
          title="Reset zoom and pan"
        >
          <RotateCcw size={18} />
        </button>
      </div>
      {#if svgBlobUrl}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div
          bind:this={rasterViewportEl}
          class="absolute inset-0 flex items-center justify-center overflow-hidden p-3 sm:p-4"
          style:touch-action="none"
          use:rasterPreviewGestures
          onmousedown={startRasterMousePan}
          role="application"
          aria-label="Pinch or Ctrl+scroll to zoom; drag to pan"
          tabindex="-1"
        >
          <div
            bind:this={rasterContentEl}
            class="flex h-full w-full origin-center items-center justify-center will-change-transform transition-none select-none [backface-visibility:hidden]"
            style:transform="translate3d({translateX}px, {translateY}px, 0) scale({scale})"
          >
            <img
              src={svgBlobUrl}
              alt=""
              draggable="false"
              class="max-h-full max-w-full object-contain drop-shadow-md"
            />
          </div>
        </div>
      {:else}
        <div class="flex h-full items-center justify-center">
          <span class="text-xs text-[var(--app-fg-muted)]">…</span>
        </div>
      {/if}
    </div>
  </div>
{:else}
  <div
    class="h-full w-full flex flex-col items-center justify-center gap-2 px-6 text-center text-[var(--app-fg-muted)] text-sm bg-[var(--app-surface)]"
  >
    <p class="text-[var(--app-fg-secondary)] font-medium">Preview</p>
    <p class="text-xs max-w-sm leading-relaxed">{mode.kind === "none" ? mode.hint : "No preview available."}</p>
  </div>
{/if}

<style>
  .checkerboard {
    background-image: linear-gradient(45deg, var(--app-border) 25%, transparent 25%),
      linear-gradient(-45deg, var(--app-border) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, var(--app-border) 75%),
      linear-gradient(-45deg, transparent 75%, var(--app-border) 75%);
    background-size: 12px 12px;
    background-position:
      0 0,
      0 6px,
      6px -6px,
      -6px 0;
    opacity: 1;
  }
</style>
