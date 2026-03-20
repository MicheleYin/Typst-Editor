<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type { AppAppearance } from "../lib/monacoThemes";
  import {
    buildEmbedPdfTheme,
    wireEmbedPdfProjectIntegration,
    type EmbedPdfDiskSaveApi,
  } from "../lib/embedPdfAppChrome";
  import type { PDFViewerConfig, PluginRegistry } from "@embedpdf/svelte-pdf-viewer";

  let {
    src,
    appearance,
    onPdfDirty,
    onDiskApiReady,
  }: {
    src: string;
    appearance: AppAppearance;
    onPdfDirty?: () => void;
    onDiskApiReady?: (api: EmbedPdfDiskSaveApi | null) => void;
  } = $props();

  type PdfViewerCmp = (typeof import("@embedpdf/svelte-pdf-viewer"))["PDFViewer"];
  let PdfViewer = $state<PdfViewerCmp | null>(null);

  let viewerConfig = $derived.by(
    (): PDFViewerConfig => ({
      src,
      theme: buildEmbedPdfTheme(appearance),
      tabBar: "never",
      disabledCategories: ["redaction"],
      annotations: {
        autoCommit: true,
        annotationAuthor: "Typst Editor",
      },
    }),
  );

  let disposeWire: (() => void) | null = null;

  function handlePdfReady(registry: PluginRegistry) {
    disposeWire?.();
    disposeWire = wireEmbedPdfProjectIntegration(registry, {
      onPdfDirty,
      onDiskApiReady,
    });
  }

  onMount(() => {
    void import("@embedpdf/svelte-pdf-viewer").then((m) => {
      PdfViewer = m.PDFViewer;
    });
  });

  onDestroy(() => {
    disposeWire?.();
    disposeWire = null;
    onDiskApiReady?.(null);
  });
</script>

<div
  class="app-embed-pdf flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--app-bg)]"
>
  {#if PdfViewer}
    {#key `${src}|${appearance}`}
      <PdfViewer
        config={viewerConfig}
        onready={handlePdfReady}
        style="width: 100%; height: 100%; min-height: 0;"
        class="min-h-0 min-w-0 flex-1"
      />
    {/key}
  {:else}
    <div
      class="flex flex-1 items-center justify-center px-4 text-center text-xs text-[var(--app-fg-muted)]"
    >
      Loading PDF viewer…
    </div>
  {/if}
</div>
