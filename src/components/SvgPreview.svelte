<script lang="ts">
  import {
    ChevronLeft,
    ChevronRight,
    ZoomIn,
    ZoomOut,
    RotateCcw,
    AlertTriangle,
    Copy,
    Check,
  } from "lucide-svelte";

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

  let {
    error,
    pages,
    currentPage = $bindable(0),
    pageCount,
    diagnostics = [],
    warnings = [],
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
    warnings?: CompileDiagnostic[];
    stalePreview?: boolean;
    scale?: number;
    translateX?: number;
    translateY?: number;
  }>();

  let isPanning = $state(false);
  let startX = 0;
  let startY = 0;
  let copiedBanner = $state(false);
  let copiedDiagnostics = $state(false);
  let copiedWarnings = $state(false);

  async function copyToClipboard(
    text: string,
    kind: "banner" | "diagnostics" | "warnings",
  ) {
    const t = text.trim();
    if (!t) return;
    const markCopied = () => {
      if (kind === "banner") {
        copiedBanner = true;
        setTimeout(() => {
          copiedBanner = false;
        }, 2000);
      } else if (kind === "diagnostics") {
        copiedDiagnostics = true;
        setTimeout(() => {
          copiedDiagnostics = false;
        }, 2000);
      } else {
        copiedWarnings = true;
        setTimeout(() => {
          copiedWarnings = false;
        }, 2000);
      }
    };
    try {
      await navigator.clipboard.writeText(t);
      markCopied();
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = t;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        markCopied();
      } catch {
        /* ignore */
      }
    }
  }

  function singleDiagnosticAsText(
    d: CompileDiagnostic,
    index1: number,
    label: string,
  ): string {
    const loc = formatLocation(d);
    const lines = [`[${label} ${index1}] ${loc ? `${loc}\n` : ""}${d.message}`];
    if (d.hints?.length) {
      lines.push("Hints:", ...d.hints.map((h: string) => `  - ${h}`));
    }
    if (d.trace?.length) {
      for (const t of d.trace) {
        let s = `  ↳ ${t.message}`;
        if (t.line != null) {
          s += ` (line ${t.line}${t.column != null ? `, col ${t.column}` : ""}${t.file ? ` · ${t.file}` : ""})`;
        }
        lines.push(s);
      }
    }
    return lines.join("\n");
  }

  function diagnosticsAsText(): string {
    return diagnostics
      .map((d: CompileDiagnostic, i: number) =>
        singleDiagnosticAsText(d, i + 1, "error"),
      )
      .join("\n\n---\n\n");
  }

  function warningsAsText(): string {
    return warnings
      .map((d: CompileDiagnostic, i: number) =>
        singleDiagnosticAsText(d, i + 1, "warning"),
      )
      .join("\n\n---\n\n");
  }

  const SCALE_MIN = 0.25;
  /** Match raster / SVG file preview zoom range in FilePreviewPane. */
  const SCALE_MAX = 8;
  const ZOOM_DEBUG = false;

  let pinchActive = $state(false);
  let pinchScaleStart = 1;
  let pinchDistStart = 1;
  /** EMA-smoothed pinch span (reduces slow-pinch jitter). */
  let pinchDistFiltered = 1;
  let pinchLastRawD = 1;
  let pinchMoveLogCounter = 0;
  /** Pinch midpoint (viewport px) — two-finger pan + zoom toward fingers */
  let pinchMidX = 0;
  let pinchMidY = 0;

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

  /** Zoom toward a point in viewport coordinates (pane center, pinch center, etc.). */
  function setScaleAtFocalPoint(
    nextScale: number,
    fx: number,
    fy: number,
    reason = "focal",
  ) {
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
    const el = contentEl;
    if (el) {
      const r = el.getBoundingClientRect();
      const ox = r.left + r.width / 2;
      const oy = r.top + r.height / 2;
      const k = s / prevScale;
      translateX += (fx - ox) * (1 - k);
      translateY += (fy - oy) * (1 - k);
      if (ZOOM_DEBUG) {
        console.log("[SvgPreview zoom]", reason, {
          scale: { from: prevScale, to: s, k },
          translate: {
            from: [prevTx, prevTy],
            to: [translateX, translateY],
            delta: [translateX - prevTx, translateY - prevTy],
          },
          focal: { fx, fy },
          content: { w: r.width, h: r.height, ox, oy },
        });
      }
    } else if (ZOOM_DEBUG) {
      console.warn("[SvgPreview zoom] no content rect — translate unchanged", {
        reason,
        scale: { from: prevScale, to: s },
      });
    }
    scale = s;
  }

  /** Zoom in/out toward the center of the preview pane (toolbar buttons). */
  function setScaleFromViewportCenter(nextScale: number, reason = "viewportCenter") {
    const pane = viewportEl;
    if (!pane) {
      scale = Math.min(SCALE_MAX, Math.max(SCALE_MIN, nextScale));
      return;
    }
    const pr = pane.getBoundingClientRect();
    setScaleAtFocalPoint(
      nextScale,
      pr.left + pr.width / 2,
      pr.top + pr.height / 2,
      reason,
    );
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
      pinchMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      pinchMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
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
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const mx = (t0.clientX + t1.clientX) / 2;
      const my = (t0.clientY + t1.clientY) / 2;

      const el = contentEl;
      const r = el?.getBoundingClientRect();
      const ox = r ? r.left + r.width / 2 : 0;
      const oy = r ? r.top + r.height / 2 : 0;
      const dpx = mx - pinchMidX;
      const dpy = my - pinchMidY;
      translateX += dpx;
      translateY += dpy;
      pinchMidX = mx;
      pinchMidY = my;

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
      const k = next / prevScale;
      if (el && Math.abs(k - 1) > 1e-6) {
        const ox2 = ox + dpx;
        const oy2 = oy + dpy;
        translateX += (mx - ox2) * (1 - k);
        translateY += (my - oy2) * (1 - k);
      }
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
    setScaleAtFocalPoint(scale * factor, e.clientX, e.clientY, "wheel");
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

<div class="h-full w-full min-h-0 relative flex flex-col">
  {#if error}
    <div
      class="shrink-0 flex items-start gap-2 px-3 py-2 bg-red-950/90 text-red-200 text-xs border-b border-red-800"
      role="alert"
    >
      <span class="flex-1 min-w-0 break-words">{error}</span>
      <button
        type="button"
        onclick={() => copyToClipboard(error, "banner")}
        class="shrink-0 flex items-center gap-1 rounded-md px-2 py-1 bg-red-900/80 hover:bg-red-800 text-red-100 text-[11px] font-medium border border-red-700/60"
        title="Copy error"
      >
        {#if copiedBanner}
          <Check size={14} class="text-green-400" />
          Copied
        {:else}
          <Copy size={14} />
          Copy
        {/if}
      </button>
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

  {#if warnings.length > 0}
    <div
      class="shrink-0 max-h-[32vh] min-h-0 overflow-y-auto border-b border-amber-300 bg-amber-50/95"
      role="status"
    >
      <div
        class="flex items-center justify-between gap-2 px-3 py-2 border-b border-amber-200/90 bg-amber-100/50"
      >
        <div class="min-w-0">
          <div
            class="text-[10px] font-bold uppercase tracking-wide text-amber-900"
          >
            Compiler warning{warnings.length > 1 ? "s" : ""} ({warnings.length})
          </div>
          <p class="text-[11px] text-amber-950/90 mt-0.5 leading-snug">
            Preview still builds, but results may be wrong (e.g. missing fonts). This app
            does <strong>not</strong> use system fonts for Typst — add font files in
            <strong class="font-semibold">Settings → Typst fonts</strong> or ship them in
            <code class="font-mono text-[10px] bg-amber-200/60 px-1 rounded"
              >resources/fonts/bundled</code
            >.
          </p>
        </div>
        <button
          type="button"
          onclick={() => copyToClipboard(warningsAsText(), "warnings")}
          class="shrink-0 flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-amber-950 bg-white/90 hover:bg-white border border-amber-300 shadow-sm"
          title="Copy all compiler warnings to clipboard"
        >
          {#if copiedWarnings}
            <Check size={14} class="text-green-700" />
            Copied
          {:else}
            <Copy size={14} />
            Copy all
          {/if}
        </button>
      </div>
      <div class="px-3 pb-3 space-y-3 pt-2">
        {#each warnings as w, idx (idx)}
          <div
            class="rounded-lg border border-amber-200 bg-white p-3 shadow-sm text-sm text-gray-900"
          >
            {#if formatLocation(w)}
              <div
                class="font-mono text-xs font-semibold text-amber-900 mb-1.5 tabular-nums"
              >
                {formatLocation(w)}
              </div>
            {/if}
            <div class="text-gray-800 leading-snug">{w.message}</div>
            {#if w.hints?.length}
              <ul class="mt-2 space-y-1 text-xs text-gray-600 list-disc pl-4">
                {#each w.hints as hint}
                  <li>{hint}</li>
                {/each}
              </ul>
            {/if}
            {#if w.trace?.length}
              <div class="mt-2 pt-2 border-t border-gray-100 space-y-1">
                {#each w.trace as t}
                  <div class="text-xs text-gray-600 pl-2 border-l-2 border-amber-200">
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

  {#if diagnostics.length > 0}
    <div
      class="shrink-0 max-h-[38vh] min-h-0 overflow-y-auto border-b border-red-200 bg-red-50/95"
    >
      <div
        class="flex items-center justify-between gap-2 px-3 py-2 border-b border-red-100/80 bg-red-100/40"
      >
        <div class="text-[10px] font-bold uppercase tracking-wide text-red-800">
          Compile error{diagnostics.length > 1 ? "s" : ""} ({diagnostics.length})
        </div>
        <button
          type="button"
          onclick={() => copyToClipboard(diagnosticsAsText(), "diagnostics")}
          class="shrink-0 flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-red-900 bg-white/90 hover:bg-white border border-red-200 shadow-sm"
          title="Copy all compile errors to clipboard"
        >
          {#if copiedDiagnostics}
            <Check size={14} class="text-green-600" />
            Copied
          {:else}
            <Copy size={14} />
            Copy all
          {/if}
        </button>
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
    class="flex-1 min-h-0 min-w-0 overflow-hidden relative {pages[currentPage]
      ? isPanning
        ? 'cursor-grabbing'
        : 'cursor-grab'
      : 'cursor-default'}"
  >
    {#if pageCount > 0 && pages[currentPage]}
      <div
        class="absolute top-2 right-2 z-20 flex flex-col items-end gap-1 pointer-events-auto"
      >
        <div
          class="flex w-fit items-center gap-0.5 rounded-md shadow-lg border border-[var(--app-border)] bg-[var(--app-surface-elevated)] p-0.5"
        >
          <button
            type="button"
            onclick={prevPage}
            disabled={currentPage === 0}
            class="inline-flex shrink-0 items-center justify-center rounded p-1 text-[var(--app-fg-secondary)] hover:bg-[var(--app-btn-ghost-hover)] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            title="Previous Page"
          >
            <ChevronLeft size={15} />
          </button>
          <div
            class="px-1.5 text-[11px] font-bold tabular-nums text-[var(--app-fg-secondary)]"
          >
            {pageCount > 0 ? currentPage + 1 : 0} / {pageCount}
          </div>
          <button
            type="button"
            onclick={nextPage}
            disabled={currentPage >= pageCount - 1}
            class="inline-flex shrink-0 items-center justify-center rounded p-1 text-[var(--app-fg-secondary)] hover:bg-[var(--app-btn-ghost-hover)] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            title="Next Page"
          >
            <ChevronRight size={15} />
          </button>
        </div>

        <div class="flex w-fit flex-col gap-1">
          <button
            type="button"
            onclick={previewZoomIn}
            class="inline-flex size-7 shrink-0 items-center justify-center rounded-md shadow-md border border-[var(--app-border)] bg-[var(--app-surface-elevated)] text-[var(--app-fg-secondary)] hover:bg-[var(--app-btn-ghost-hover)]"
            title="Zoom in"
          >
            <ZoomIn size={14} />
          </button>
          <button
            type="button"
            onclick={previewZoomOut}
            class="inline-flex size-7 shrink-0 items-center justify-center rounded-md shadow-md border border-[var(--app-border)] bg-[var(--app-surface-elevated)] text-[var(--app-fg-secondary)] hover:bg-[var(--app-btn-ghost-hover)]"
            title="Zoom out"
          >
            <ZoomOut size={14} />
          </button>
          <button
            type="button"
            onclick={resetPreviewZoom}
            class="inline-flex size-7 shrink-0 items-center justify-center rounded-md shadow-md border border-[var(--app-border)] bg-[var(--app-surface-elevated)] text-[var(--app-fg-secondary)] hover:bg-[var(--app-btn-ghost-hover)]"
            title="Reset zoom and pan"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div
        bind:this={viewportEl}
        class="absolute inset-0 flex items-center justify-center overflow-hidden p-3 sm:p-4"
        style:touch-action="none"
        use:previewGestures
        onmousedown={startPan}
        role="application"
        aria-label="Pinch or Ctrl+scroll to zoom; drag to pan"
        tabindex="-1"
      >
        <div
          bind:this={contentEl}
          style:transform="translate3d({translateX}px, {translateY}px, 0) scale({scale})"
          class="flex h-full w-full origin-center items-center justify-center will-change-transform transition-none select-none [backface-visibility:hidden]"
        >
          <div class="typst-preview-graphic max-h-full max-w-full drop-shadow-md">
            {@html pages[currentPage]}
          </div>
        </div>
      </div>
    {:else}
      <div
        class="absolute inset-0 flex items-center justify-center text-[var(--preview-empty)] text-sm p-8 text-center"
      >
        {#if diagnostics.length > 0}
          No preview yet — fix the errors above, or keep editing.
        {:else if warnings.length > 0}
          No pages yet — if the document is empty, add content. Otherwise check warnings above.
        {:else}
          Compile your document to see a preview.
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  /* Match SVG-as-image preview: contain page in the padded viewport. */
  .typst-preview-graphic :global(svg) {
    display: block;
    max-width: 100%;
    max-height: 100%;
    width: auto;
    height: auto;
  }
</style>
