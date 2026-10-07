<script lang="ts">
  import { tick } from "svelte";
  import { Hand, ScrollText, ZoomIn, ZoomOut, RotateCcw } from "lucide-svelte";
  import type { AppAppearance } from "../lib/monacoThemes";
  import type { EmbedPdfDiskSaveApi } from "../lib/embedPdfAppChrome";
  import {
    persistPreviewInteractionMode,
    type PreviewInteractionMode,
  } from "../lib/appLayoutStorage";
  import EmbedPdfPane from "./EmbedPdfPane.svelte";
  import SvgPreview from "./SvgPreview.svelte";

  type CompileDiagnostic = {
    severity?: "error" | "warning";
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
    | {
        kind: "typst";
        error: string;
        pages: string[];
        pageCount: number;
        diagnostics: CompileDiagnostic[];
        warnings: CompileDiagnostic[];
        stale: boolean;
      }
    | { kind: "image"; url: string; label: string }
    | { kind: "pdf"; url: string }
    | { kind: "svg-inline"; svg: string }
    | { kind: "markdown"; html: string }
    | { kind: "html"; html: string }
    | { kind: "none"; hint: string };

  let {
    mode,
    appAppearance = "dark",
    onPdfDirty,
    onPdfDiskApiReady,
    currentPage = $bindable(0),
    scale = $bindable(1),
    previewInteractionMode = $bindable<PreviewInteractionMode>("scroll"),
  } = $props<{
    mode: PreviewMode;
    /** Used by the PDF viewer (EmbedPDF) to match app light/dark. */
    appAppearance?: AppAppearance;
    onPdfDirty?: () => void;
    onPdfDiskApiReady?: (api: EmbedPdfDiskSaveApi | null) => void;
    currentPage?: number;
    scale?: number;
    previewInteractionMode?: PreviewInteractionMode;
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
        rasterViewportEl?.scrollTo(0, 0);
      }
    } else {
      rasterImageZoomKey = null;
    }
    if (k === "svg-inline" && prevRasterPreviewKind !== "svg-inline") {
      scale = 1;
      translateX = 0;
      translateY = 0;
      rasterViewportEl?.scrollTo(0, 0);
    }
    if (k === "typst" && prevRasterPreviewKind !== "typst") {
      scale = 1;
      translateX = 0;
      translateY = 0;
      rasterViewportEl?.scrollTo(0, 0);
    }
    prevRasterPreviewKind = k;
  });

  const SCALE_MIN = 0.25;
  const SCALE_MAX = 8;

  let rasterViewportEl = $state<HTMLElement | null>(null);
  let rasterContentEl = $state<HTMLImageElement | null>(null);
  let rasterFitWidth = $state(0);
  let rasterFitHeight = $state(0);
  let translateX = $state(0);
  let translateY = $state(0);
  let isRasterPanning = $state(false);
  let rasterPanStartX = 0;
  let rasterPanStartY = 0;

  let touchPanning = false;
  let touchPanId = -1;
  let panTouchStartX = 0;
  let panTouchStartY = 0;
  let panStartTX = 0;
  let panStartTY = 0;

  let pinchActive = false;
  let pinchScaleStart = 1;
  let pinchDistStart = 1;
  let pinchDistFiltered = 1;
  let pinchLastRawD = 1;
  let pinchMidX = 0;
  let pinchMidY = 0;
  function touchDistance(t: TouchList): number {
    if (t.length < 2) return 0;
    const dx = t[0].clientX - t[1].clientX;
    const dy = t[0].clientY - t[1].clientY;
    return Math.hypot(dx, dy);
  }

  function touchById(touches: TouchList, id: number): Touch | undefined {
    for (let index = 0; index < touches.length; index++) {
      if (touches[index].identifier === id) return touches[index];
    }
    return undefined;
  }

  function measureRasterFit(viewport = rasterViewportEl) {
    const image = rasterContentEl;
    if (!image || !viewport || image.naturalWidth === 0 || image.naturalHeight === 0) return;
    const style = getComputedStyle(viewport);
    const availableWidth =
      viewport.clientWidth -
      Number.parseFloat(style.paddingLeft) -
      Number.parseFloat(style.paddingRight);
    const availableHeight =
      viewport.clientHeight -
      Number.parseFloat(style.paddingTop) -
      Number.parseFloat(style.paddingBottom);
    const fitScale = Math.min(
      availableWidth / image.naturalWidth,
      availableHeight / image.naturalHeight,
      1,
    );
    rasterFitWidth = image.naturalWidth * fitScale;
    rasterFitHeight = image.naturalHeight * fitScale;
  }

  function refitRasterContent() {
    rasterFitWidth = 0;
    rasterFitHeight = 0;
    void tick().then(measureRasterFit);
  }

  function observeRasterViewport(node: HTMLElement) {
    const initialRect = node.getBoundingClientRect();
    let viewportWidth = initialRect.width;
    let viewportHeight = initialRect.height;
    const observer = new ResizeObserver(() => {
      const rect = node.getBoundingClientRect();
      if (rect.width === viewportWidth && rect.height === viewportHeight) return;
      viewportWidth = rect.width;
      viewportHeight = rect.height;
      refitRasterContent();
    });
    observer.observe(node);
    requestAnimationFrame(() => measureRasterFit(node));
    return { destroy: () => observer.disconnect() };
  }

  /** Zoom toward a viewport point (touch pinch midpoint, Ctrl+wheel / trackpad pinch cursor). */
  async function setRasterScaleAtFocalPoint(nextScale: number, fx: number, fy: number) {
    const s = Math.min(SCALE_MAX, Math.max(SCALE_MIN, nextScale));
    const prevScale = scale;
    const el = rasterContentEl;
    const pane = rasterViewportEl;
    if (Math.abs(s - prevScale) < 1e-6) return;
    if (previewInteractionMode === "pan") {
      if (el) {
        const rect = el.getBoundingClientRect();
        const k = s / prevScale;
        translateX += (fx - (rect.left + rect.width / 2)) * (1 - k);
        translateY += (fy - (rect.top + rect.height / 2)) * (1 - k);
      }
      scale = s;
      return;
    }
    if (el && pane) {
      const previousRect = el.getBoundingClientRect();
      const focalX = previousRect.width > 0
        ? (fx - previousRect.left) / previousRect.width
        : 0;
      const focalY = previousRect.height > 0
        ? (fy - previousRect.top) / previousRect.height
        : 0;
      scale = s;
      await tick();
      const nextRect = el.getBoundingClientRect();
      pane.scrollLeft += nextRect.left + focalX * nextRect.width - fx;
      pane.scrollTop += nextRect.top + focalY * nextRect.height - fy;
    } else {
      scale = s;
    }
  }

  function setRasterScaleFromViewportCenter(nextScale: number) {
    const pane = rasterViewportEl;
    if (!pane) {
      scale = Math.min(SCALE_MAX, Math.max(SCALE_MIN, nextScale));
      return;
    }
    const pr = pane.getBoundingClientRect();
    setRasterScaleAtFocalPoint(
      nextScale,
      pr.left + pr.width / 2,
      pr.top + pr.height / 2,
    );
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
      pinchMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      pinchMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      e.preventDefault();
    } else if (e.touches.length === 1 && previewInteractionMode === "pan") {
      const touch = e.touches[0];
      touchPanning = true;
      touchPanId = touch.identifier;
      panTouchStartX = touch.clientX;
      panTouchStartY = touch.clientY;
      panStartTX = translateX;
      panStartTY = translateY;
    }
  }

  async function onRasterTouchMove(e: TouchEvent) {
    if (e.touches.length >= 2 && pinchActive) {
      e.preventDefault();
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const mx = (t0.clientX + t1.clientX) / 2;
      const my = (t0.clientY + t1.clientY) / 2;
      const dx = mx - pinchMidX;
      const dy = my - pinchMidY;
      if (previewInteractionMode === "pan") {
        translateX += dx;
        translateY += dy;
      }
      pinchMidX = mx;
      pinchMidY = my;

      const rawD = Math.max(touchDistance(e.touches), 1);
      const dd = Math.abs(rawD - pinchLastRawD);
      pinchLastRawD = rawD;
      const alpha =
        dd < 0.75 ? 0.07 : dd < 2.5 ? 0.22 : dd < 10 ? 0.48 : 0.78;
      pinchDistFiltered = alpha * rawD + (1 - alpha) * pinchDistFiltered;
      const next = Math.min(
        SCALE_MAX,
        Math.max(
          SCALE_MIN,
          pinchScaleStart * (pinchDistFiltered / pinchDistStart),
        ),
      );
      await setRasterScaleAtFocalPoint(next, mx, my);
      return;
    }

    if (previewInteractionMode === "pan" && touchPanning && e.touches.length === 1) {
      const touch = touchById(e.touches, touchPanId) ?? e.touches[0];
      e.preventDefault();
      translateX = panStartTX + touch.clientX - panTouchStartX;
      translateY = panStartTY + touch.clientY - panTouchStartY;
    }
  }

  function onRasterTouchEnd(e: TouchEvent) {
    if (e.touches.length < 2) pinchActive = false;
    if (e.touches.length === 1 && previewInteractionMode === "pan") {
      const touch = e.touches[0];
      touchPanning = true;
      touchPanId = touch.identifier;
      panTouchStartX = touch.clientX;
      panTouchStartY = touch.clientY;
      panStartTX = translateX;
      panStartTY = translateY;
    } else if (e.touches.length === 0) {
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
    setRasterScaleAtFocalPoint(scale * factor, e.clientX, e.clientY);
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

  function rasterZoomIn() {
    setRasterScaleFromViewportCenter(scale * 1.2);
  }

  function rasterZoomOut() {
    setRasterScaleFromViewportCenter(scale / 1.2);
  }

  function setRasterInteractionMode(nextMode: PreviewInteractionMode) {
    if (previewInteractionMode === nextMode) return;
    previewInteractionMode = nextMode;
    persistPreviewInteractionMode(nextMode);
    translateX = 0;
    translateY = 0;
    isRasterPanning = false;
    touchPanning = false;
    rasterViewportEl?.scrollTo(0, 0);
  }

  function startRasterMousePan(e: MouseEvent) {
    if (previewInteractionMode !== "pan" || e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest("button")) return;
    isRasterPanning = true;
    rasterPanStartX = e.clientX - translateX;
    rasterPanStartY = e.clientY - translateY;
  }

  function onRasterMouseMove(e: MouseEvent) {
    if (!isRasterPanning) return;
    translateX = e.clientX - rasterPanStartX;
    translateY = e.clientY - rasterPanStartY;
  }

  function stopRasterMousePan() {
    isRasterPanning = false;
  }

  function rasterResetZoom() {
    scale = 1;
    translateX = 0;
    translateY = 0;
    rasterViewportEl?.scrollTo(0, 0);
  }
</script>

<svelte:window
  onmousemove={isRasterPanning ? onRasterMouseMove : null}
  onmouseup={stopRasterMousePan}
/>

{#if mode.kind === "typst"}
  <div
    class="h-full w-full min-h-0 flex flex-col bg-[var(--app-surface)] overflow-hidden"
    role="region"
    aria-label="Typst preview"
  >
    <div
      class="shrink-0 px-2 py-1.5 text-[10px] uppercase tracking-wider text-[var(--app-fg-muted)] border-b border-[var(--app-border)]"
    >
      Typst preview
    </div>
    <div class="flex-1 min-h-0 relative min-w-0 bg-[var(--app-bg)] checkerboard">
      <SvgPreview
        error={mode.error}
        pages={mode.pages}
        bind:currentPage
        pageCount={mode.pageCount}
        diagnostics={mode.diagnostics}
        warnings={mode.warnings}
        stalePreview={mode.stale}
        bind:scale
        bind:previewInteractionMode
      />
    </div>
  </div>
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
        <div class="flex w-fit items-center gap-0.5 rounded-md shadow-lg border border-[var(--app-border)] bg-[var(--app-surface-elevated)] p-0.5">
          <button
            type="button"
            onclick={() => setRasterInteractionMode("scroll")}
            class="inline-flex size-7 shrink-0 items-center justify-center rounded text-[var(--app-fg-secondary)] hover:bg-[var(--app-btn-ghost-hover)] {previewInteractionMode === 'scroll' ? 'bg-[var(--app-btn-ghost-hover)] text-[var(--app-fg)]' : ''}"
            title="Scroll mode"
            aria-pressed={previewInteractionMode === "scroll"}
          >
            <ScrollText size={14} />
          </button>
          <button
            type="button"
            onclick={() => setRasterInteractionMode("pan")}
            class="inline-flex size-7 shrink-0 items-center justify-center rounded text-[var(--app-fg-secondary)] hover:bg-[var(--app-btn-ghost-hover)] {previewInteractionMode === 'pan' ? 'bg-[var(--app-btn-ghost-hover)] text-[var(--app-fg)]' : ''}"
            title="Pan mode"
            aria-pressed={previewInteractionMode === "pan"}
          >
            <Hand size={14} />
          </button>
        </div>
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
          title="Reset zoom and scroll"
        >
          <RotateCcw size={18} />
        </button>
      </div>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div
        bind:this={rasterViewportEl}
        class="absolute inset-0 {previewInteractionMode === 'scroll' ? 'overflow-auto' : 'overflow-hidden'} p-3 sm:p-4 {previewInteractionMode === 'pan' ? (isRasterPanning ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-auto'}"
        use:rasterPreviewGestures
        use:observeRasterViewport
        onmousedown={startRasterMousePan}
        style:touch-action={previewInteractionMode === "pan" ? "none" : "auto"}
        role="region"
        aria-label={previewInteractionMode === "scroll" ? "Scrollable image preview" : "Pannable image preview"}
        tabindex="0"
      >
        <div
          class="flex h-full w-full items-start"
        >
          <div
            class="relative m-auto shrink-0 {rasterFitWidth > 0 ? '' : 'max-h-full max-w-full'}"
            style:width={rasterFitWidth > 0
              ? `${rasterFitWidth * (previewInteractionMode === "scroll" ? scale : 1)}px`
              : undefined}
            style:height={rasterFitHeight > 0
              ? `${rasterFitHeight * (previewInteractionMode === "scroll" ? scale : 1)}px`
              : undefined}
          >
            <img
              bind:this={rasterContentEl}
              src={mode.url}
              alt=""
              draggable="false"
              onload={refitRasterContent}
              class="{rasterFitWidth > 0 ? 'absolute left-0 top-0 max-h-none max-w-none' : 'relative max-h-full max-w-full'} object-contain shadow-lg rounded-sm border border-[var(--app-border)] select-none"
              style:width={rasterFitWidth > 0 ? `${rasterFitWidth}px` : undefined}
              style:height={rasterFitHeight > 0 ? `${rasterFitHeight}px` : undefined}
              style:transform={previewInteractionMode === "pan"
                ? `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale})`
                : `scale(${scale})`}
              style:transform-origin={previewInteractionMode === "pan" ? "center" : "top left"}
            />
          </div>
        </div>
      </div>
    </div>
  </div>
{:else if mode.kind === "pdf"}
  <div
    class="h-full w-full min-h-0 flex flex-col bg-[var(--app-surface)] overflow-hidden"
    role="region"
    aria-label="PDF preview with annotations"
  >
    <div
      class="shrink-0 border-b border-[var(--app-border)] px-2 py-1.5 text-[10px] uppercase tracking-wider text-[var(--app-fg-muted)]"
      title="Annotate in the viewer; use Save (⌘S / Ctrl+S) to write changes to this file in the project."
    >
      PDF · annotate &amp; save
    </div>
    <EmbedPdfPane
      src={mode.url}
      appearance={appAppearance}
      onPdfDirty={onPdfDirty}
      onDiskApiReady={onPdfDiskApiReady}
    />
  </div>
{:else if mode.kind === "markdown"}
  <div
    class="h-full w-full min-h-0 flex flex-col bg-[var(--app-surface)] overflow-hidden"
    role="region"
    aria-label="Markdown preview"
  >
    <div
      class="shrink-0 px-2 py-1.5 text-[10px] uppercase tracking-wider text-[var(--app-fg-muted)] border-b border-[var(--app-border)]"
    >
      Markdown preview
    </div>
    <div
      class="md-preview flex-1 min-h-0 overflow-auto px-4 py-3 text-[var(--app-fg)] text-sm leading-relaxed bg-[var(--app-bg)]"
    >
      {@html mode.html}
    </div>
  </div>
{:else if mode.kind === "html"}
  <div
    class="h-full w-full min-h-0 flex flex-col bg-[var(--app-surface)] overflow-hidden"
    role="region"
    aria-label="HTML preview"
  >
    <div
      class="shrink-0 px-2 py-1.5 text-[10px] uppercase tracking-wider text-[var(--app-fg-muted)] border-b border-[var(--app-border)]"
    >
      HTML preview
    </div>
    <div
      class="md-preview flex-1 min-h-0 overflow-auto px-4 py-3 text-[var(--app-fg)] text-sm leading-relaxed bg-[var(--app-bg)]"
    >
      {@html mode.html}
    </div>
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
        <div class="flex w-fit items-center gap-0.5 rounded-md shadow-lg border border-[var(--app-border)] bg-[var(--app-surface-elevated)] p-0.5">
          <button
            type="button"
            onclick={() => setRasterInteractionMode("scroll")}
            class="inline-flex size-7 shrink-0 items-center justify-center rounded text-[var(--app-fg-secondary)] hover:bg-[var(--app-btn-ghost-hover)] {previewInteractionMode === 'scroll' ? 'bg-[var(--app-btn-ghost-hover)] text-[var(--app-fg)]' : ''}"
            title="Scroll mode"
            aria-pressed={previewInteractionMode === "scroll"}
          >
            <ScrollText size={14} />
          </button>
          <button
            type="button"
            onclick={() => setRasterInteractionMode("pan")}
            class="inline-flex size-7 shrink-0 items-center justify-center rounded text-[var(--app-fg-secondary)] hover:bg-[var(--app-btn-ghost-hover)] {previewInteractionMode === 'pan' ? 'bg-[var(--app-btn-ghost-hover)] text-[var(--app-fg)]' : ''}"
            title="Pan mode"
            aria-pressed={previewInteractionMode === "pan"}
          >
            <Hand size={14} />
          </button>
        </div>
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
          title="Reset zoom and position"
        >
          <RotateCcw size={18} />
        </button>
      </div>
      {#if svgBlobUrl}
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <div
          bind:this={rasterViewportEl}
          class="absolute inset-0 {previewInteractionMode === 'scroll' ? 'overflow-auto' : 'overflow-hidden'} p-3 sm:p-4 {previewInteractionMode === 'pan' ? (isRasterPanning ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-auto'}"
          use:rasterPreviewGestures
          use:observeRasterViewport
          onmousedown={startRasterMousePan}
          style:touch-action={previewInteractionMode === "pan" ? "none" : "auto"}
          role="region"
          aria-label={previewInteractionMode === "scroll" ? "Scrollable SVG preview" : "Pannable SVG preview"}
          tabindex="0"
        >
          <div
            class="flex h-full w-full items-start"
          >
            <div
              class="relative m-auto shrink-0 {rasterFitWidth > 0 ? '' : 'max-h-full max-w-full'}"
              style:width={rasterFitWidth > 0
                ? `${rasterFitWidth * (previewInteractionMode === "scroll" ? scale : 1)}px`
                : undefined}
              style:height={rasterFitHeight > 0
                ? `${rasterFitHeight * (previewInteractionMode === "scroll" ? scale : 1)}px`
                : undefined}
            >
              <img
                bind:this={rasterContentEl}
                src={svgBlobUrl}
                alt=""
                draggable="false"
                onload={refitRasterContent}
                class="{rasterFitWidth > 0 ? 'absolute left-0 top-0 max-h-none max-w-none' : 'relative max-h-full max-w-full'} object-contain drop-shadow-md select-none"
                style:width={rasterFitWidth > 0 ? `${rasterFitWidth}px` : undefined}
                style:height={rasterFitHeight > 0 ? `${rasterFitHeight}px` : undefined}
                style:transform={previewInteractionMode === "pan"
                  ? `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale})`
                  : `scale(${scale})`}
                style:transform-origin={previewInteractionMode === "pan" ? "center" : "top left"}
              />
            </div>
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
  /* Markdown preview (sanitized HTML) */
  .md-preview :global(h1) {
    font-size: 1.5rem;
    font-weight: 700;
    margin: 0.75rem 0 0.5rem;
    line-height: 1.25;
    color: var(--app-fg-secondary);
  }
  .md-preview :global(h2) {
    font-size: 1.25rem;
    font-weight: 650;
    margin: 0.65rem 0 0.4rem;
    line-height: 1.3;
    color: var(--app-fg-secondary);
  }
  .md-preview :global(h3) {
    font-size: 1.1rem;
    font-weight: 600;
    margin: 0.5rem 0 0.35rem;
    color: var(--app-fg-secondary);
  }
  .md-preview :global(h4),
  .md-preview :global(h5),
  .md-preview :global(h6) {
    font-size: 1rem;
    font-weight: 600;
    margin: 0.45rem 0 0.3rem;
    color: var(--app-fg-secondary);
  }
  .md-preview :global(p) {
    margin: 0.4rem 0;
  }
  .md-preview :global(a) {
    color: var(--app-accent, #6c9ef8);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .md-preview :global(ul),
  .md-preview :global(ol) {
    margin: 0.35rem 0;
    padding-left: 1.35rem;
  }
  .md-preview :global(li) {
    margin: 0.15rem 0;
  }
  .md-preview :global(blockquote) {
    margin: 0.5rem 0;
    padding: 0.25rem 0 0.25rem 0.75rem;
    border-left: 3px solid var(--app-border);
    color: var(--app-fg-muted);
  }
  .md-preview :global(code) {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.9em;
    padding: 0.1em 0.35em;
    border-radius: 4px;
    background: var(--app-surface-elevated, var(--app-surface));
    border: 1px solid var(--app-border);
  }
  .md-preview :global(pre) {
    margin: 0.5rem 0;
    padding: 0.65rem 0.85rem;
    overflow-x: auto;
    border-radius: 6px;
    background: var(--app-surface-elevated, var(--app-surface));
    border: 1px solid var(--app-border);
  }
  .md-preview :global(pre code) {
    padding: 0;
    border: none;
    background: transparent;
    font-size: 0.85em;
  }
  .md-preview :global(hr) {
    margin: 0.75rem 0;
    border: none;
    border-top: 1px solid var(--app-border);
  }
  .md-preview :global(table) {
    border-collapse: collapse;
    width: 100%;
    margin: 0.5rem 0;
    font-size: 0.9em;
  }
  .md-preview :global(th),
  .md-preview :global(td) {
    border: 1px solid var(--app-border);
    padding: 0.35rem 0.5rem;
    text-align: left;
  }
  .md-preview :global(th) {
    background: var(--app-surface-elevated, var(--app-surface));
    font-weight: 600;
  }
  .md-preview :global(img) {
    max-width: 100%;
    height: auto;
    border-radius: 4px;
  }

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
