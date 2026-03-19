<script lang="ts">
  import { Check } from "lucide-svelte";
  import CustomSelect from "./CustomSelect.svelte";

  export type ExportTypstKindPayload =
    | { kind: "pdf"; pdfProfile: string; tagged: boolean }
    | { kind: "svg" }
    | { kind: "png"; ppi: number }
    | { kind: "html" };

  let {
    open = false,
    onClose,
    onConfirm,
  } = $props<{
    open: boolean;
    onClose: () => void;
    onConfirm: (payload: ExportTypstKindPayload) => void | Promise<void>;
  }>();

  let format = $state<"pdf" | "svg" | "png" | "html">("pdf");
  let pdfProfile = $state("1.7");
  let pdfTagged = $state(true);
  let ppi = $state(150);

  const formatOptions: { id: string; label: string }[] = [
    { id: "pdf", label: "PDF" },
    { id: "svg", label: "SVG (vector)" },
    { id: "png", label: "PNG (raster)" },
    // { id: "html", label: "HTML" },
  ];

  const pdfProfiles: { id: string; label: string }[] = [
    { id: "1.7", label: "PDF 1.7 (default)" },
    { id: "1.7-untagged", label: "PDF 1.7 — no structure tree (smaller file)" },
    { id: "2.0", label: "PDF 2.0" },
    { id: "1.6", label: "PDF 1.6" },
    { id: "1.5", label: "PDF 1.5" },
    { id: "1.4", label: "PDF 1.4" },
    { id: "a-1b", label: "PDF/A-1b (archival)" },
    { id: "a-2b", label: "PDF/A-2b" },
    { id: "a-2u", label: "PDF/A-2u (Unicode)" },
    { id: "a-3b", label: "PDF/A-3b" },
    { id: "a-3u", label: "PDF/A-3u" },
    { id: "a-4", label: "PDF/A-4" },
    { id: "ua-1", label: "PDF/UA-1 (accessible)" },
  ];

  const ppiPresets = [72, 96, 150, 300] as const;

  /** Match toolbar `CustomSelect` look; full width in modal (listbox uses `portal` + fixed layer) */
  const selectClass =
    "w-full [&_button]:w-full [&_button]:max-w-none [&_button]:min-w-0 [&_button]:justify-between [&_button]:px-2.5 [&_button]:py-2 [&_button]:text-sm";

  /** Wider than default so long PDF profile names fit; rendered in `document.body` */
  const exportPortalMenuMaxWidth = "min(100vw - 16px, 28rem)";

  const showPdfTaggedToggle = $derived(
    pdfProfile !== "1.7-untagged" &&
      pdfProfile !== "ua-1" &&
      !pdfProfile.startsWith("a-"),
  );

  function buildPayload(): ExportTypstKindPayload {
    if (format === "svg") return { kind: "svg" };
    if (format === "html") return { kind: "html" };
    if (format === "png") {
      const n = Number(ppi);
      return { kind: "png", ppi: Number.isFinite(n) ? n : 150 };
    }
    if (pdfProfile === "1.7-untagged") {
      return { kind: "pdf", pdfProfile: "1.7-untagged", tagged: false };
    }
    if (pdfProfile === "ua-1" || pdfProfile.startsWith("a-")) {
      return { kind: "pdf", pdfProfile, tagged: true };
    }
    return { kind: "pdf", pdfProfile, tagged: pdfTagged };
  }

  async function submit() {
    await onConfirm(buildPayload());
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-[400] flex items-end justify-center sm:items-center p-4 bg-black/50"
    onclick={onClose}
    role="presentation"
  >
    <div
      class="w-full max-w-md rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] shadow-xl p-4 space-y-4 max-h-[min(90vh,32rem)] overflow-y-auto"
      role="dialog"
      aria-labelledby="export-typst-title"
      tabindex="0"
      onclick={(e) => e.stopPropagation()}
    >
      <h2 id="export-typst-title" class="text-lg font-semibold text-[var(--app-fg)]">
        Export document
      </h2>

      <fieldset class="space-y-2 min-w-0 border-0 p-0 m-0">
        <legend class="block w-full text-sm font-medium text-[var(--app-fg-secondary)] pb-1 px-0">
          Format
        </legend>
        <CustomSelect
          id="export-format"
          label=""
          title="Export format"
          class={selectClass}
          portal={true}
          portalMenuMaxWidth={exportPortalMenuMaxWidth}
          value={format}
          options={formatOptions}
          onChange={(id) => {
            format = id as typeof format;
          }}
        />
      </fieldset>

      {#if format === "pdf"}
        <fieldset class="space-y-2 min-w-0 border-0 p-0 m-0 mt-2">
          <legend class="block w-full text-sm font-medium text-[var(--app-fg-secondary)] pb-1 px-0">
            PDF type
          </legend>
          <CustomSelect
            id="export-pdf-profile"
            label=""
            title="PDF standard / profile"
            class={selectClass}
            portal={true}
            portalMenuMaxWidth={exportPortalMenuMaxWidth}
            value={pdfProfile}
            options={pdfProfiles}
            onChange={(id) => {
              pdfProfile = id;
            }}
          />
        </fieldset>
        {#if showPdfTaggedToggle}
          <label
            class="flex cursor-pointer items-start gap-3 rounded-lg -mx-1 px-1 py-1 transition-colors hover:bg-[var(--app-btn-ghost-hover)]/50 mt-2"
          >
            <div class="relative mt-0.5 h-[18px] w-[18px] shrink-0">
              <input
                type="checkbox"
                class="peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0"
                bind:checked={pdfTagged}
              />
              <span
                class="pointer-events-none flex h-[18px] w-[18px] items-center justify-center rounded-md border-2 border-[var(--app-border-strong)] bg-[var(--app-chip-bg)] shadow-sm transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--app-link)]/35 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[var(--app-bg)] peer-checked:border-[var(--app-link)] peer-checked:bg-[var(--app-link)] peer-checked:[&_svg]:opacity-100"
                aria-hidden="true"
              >
                <Check
                  size={12}
                  strokeWidth={3}
                  class="text-white opacity-0 transition-opacity"
                  aria-hidden="true"
                />
              </span>
            </div>
            <span class="text-sm leading-snug text-[var(--app-fg)] pt-0.5">
              Tagged PDF (structure tree for accessibility; larger file)
            </span>
          </label>
        {/if}
      {/if}

      {#if format === "png"}
        <div class="space-y-2 mt-2">
          <span class="block text-sm font-medium text-[var(--app-fg-secondary)]">Resolution (PPI)</span>
          <div class="flex flex-wrap gap-2">
            {#each ppiPresets as preset}
              <button
                type="button"
                class="px-3 py-1.5 rounded-lg text-sm border transition-colors {ppi === preset
                  ? 'border-[var(--app-link)] bg-[var(--app-chip-bg)] text-[var(--app-link)]'
                  : 'border-[var(--app-border)] text-[var(--app-fg-secondary)] hover:bg-[var(--app-btn-ghost-hover)]'}"
                onclick={() => (ppi = preset)}
              >
                {preset}
              </button>
            {/each}
          </div>
          <input
            type="number"
            min="1"
            max="1200"
            step="1"
            bind:value={ppi}
            class="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-elevated)] px-3 py-2 text-[var(--app-fg)] text-sm"
            aria-label="Custom PPI"
          />
          <p class="text-xs text-[var(--app-fg-muted)]">
            PPI is relative to Typst’s point-based page size (72&nbsp;pt = 1&nbsp;inch).
          </p>
        </div>
      {/if}

      {#if format === "svg" || format === "png"}
        <p class="text-xs text-[var(--app-fg-muted)] mt-2">
          Multi-page documents are saved as separate files:
          <code class="text-[var(--app-fg-secondary)]">name-p1.{format}</code>,
          <code class="text-[var(--app-fg-secondary)]">name-p2.{format}</code>, …
        </p>
      {/if}

      {#if format === "html"}
        <p class="text-xs text-[var(--app-fg-muted)]">
          HTML export is experimental in Typst; layout and features differ from PDF. You may see compiler
          warnings.
        </p>
      {/if}

      <div class="flex justify-end gap-2 pt-2">
        <button
          type="button"
          class="px-4 py-2 rounded-lg text-sm font-medium text-[var(--app-fg-secondary)] hover:bg-[var(--app-btn-ghost-hover)]"
          onclick={onClose}
        >
          Cancel
        </button>
        <button
          type="button"
          class="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--app-link)] text-white hover:opacity-90"
          onclick={() => void submit()}
        >
          Continue…
        </button>
      </div>
    </div>
  </div>
{/if}
