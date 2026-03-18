<script lang="ts">
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
</script>

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
    <div class="flex-1 min-h-0 flex items-center justify-center p-4 overflow-auto">
      <img
        src={mode.url}
        alt=""
        class="max-w-full max-h-full object-contain shadow-lg rounded-sm border border-[var(--app-border)]"
      />
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
    <div class="flex-1 min-h-0 flex items-center justify-center p-4 overflow-auto bg-[var(--app-bg)] checkerboard">
      {#if svgBlobUrl}
        <img src={svgBlobUrl} alt="" class="max-w-full max-h-full object-contain drop-shadow-md" />
      {:else}
        <span class="text-xs text-[var(--app-fg-muted)]">…</span>
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
