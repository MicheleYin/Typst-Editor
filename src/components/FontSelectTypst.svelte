<script lang="ts">
  import { onMount, tick } from "svelte";
  import { ChevronDown, Type } from "lucide-svelte";
  import { TYPST_FONT_GROUPS, type TypstFontGroup } from "../lib/typstFontPresets";
  import { pickerFaceCssId, type TypstFontFace } from "../lib/typstFonts";

  let { faces = [], disabled = false, onPick } = $props<{
    /** From Rust; empty → preset groups only (web / preview). */
    faces?: TypstFontFace[];
    disabled?: boolean;
    onPick: (typstFont: string) => void;
  }>();

  let open = $state(false);
  let rootEl: HTMLDivElement | undefined = $state();
  let searchQuery = $state("");
  let searchInput: HTMLInputElement | undefined = $state();

  const previewSample = "The quick brown fox — AaGg 123";

  const useLiveCatalog = $derived(faces.length > 0);

  type LiveRow = TypstFontFace & { group: string };

  const liveRows = $derived.by((): LiveRow[] => {
    const typst = faces.filter((f: TypstFontFace) => f.bundledTypst);
    const app = faces.filter((f: TypstFontFace) => f.bundledApp);
    const imported = faces.filter(
      (f: TypstFontFace) => !f.bundledTypst && !f.bundledApp,
    );
    const rows: LiveRow[] = [
      ...typst.map((f: TypstFontFace) => ({ ...f, group: "Bundled with Typst" })),
      ...app.map((f: TypstFontFace) => ({ ...f, group: "Bundled with app" })),
      ...imported.map((f: TypstFontFace) => ({ ...f, group: "Imported (app storage)" })),
    ];
    return rows;
  });

  const filteredLive = $derived.by(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return liveRows;
    return liveRows.filter(
      (r) =>
        r.family.toLowerCase().includes(q) ||
        r.variant.toLowerCase().includes(q) ||
        r.group.toLowerCase().includes(q) ||
        (r.sourcePath?.toLowerCase().includes(q) ?? false),
    );
  });

  const filteredPresetGroups = $derived.by((): TypstFontGroup[] => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return TYPST_FONT_GROUPS;
    return TYPST_FONT_GROUPS.map((g) => ({
      title: g.title,
      fonts: g.fonts.filter(
        (f) =>
          f.typst.toLowerCase().includes(q) ||
          (f.hint?.toLowerCase().includes(q) ?? false) ||
          g.title.toLowerCase().includes(q),
      ),
    })).filter((g) => g.fonts.length > 0);
  });

  const presetMatchCount = $derived(
    filteredPresetGroups.reduce((n, g) => n + g.fonts.length, 0),
  );

  function previewFamilyForLive(f: TypstFontFace): string {
    if (f.sourcePath && !f.bundledTypst) return `'${pickerFaceCssId(f)}', sans-serif`;
    const fam = f.family.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `"${fam}", ui-serif, serif`;
  }

  function close() {
    open = false;
  }

  function pick(typst: string) {
    onPick(typst);
    close();
  }

  function toggle(e: MouseEvent) {
    e.stopPropagation();
    if (disabled) return;
    open = !open;
  }

  $effect(() => {
    if (open) {
      void tick().then(() => searchInput?.focus());
    } else {
      searchQuery = "";
    }
  });

  $effect(() => {
    if (!open || !useLiveCatalog) return;
    const withPath = faces.filter((f: TypstFontFace) => f.sourcePath);
    if (withPath.length === 0 || typeof document === "undefined") return;
    let style = document.getElementById("typst-editor-font-picker-faces") as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = "typst-editor-font-picker-faces";
      document.head.appendChild(style);
    }
    void (async () => {
      try {
        const { convertFileSrc } = await import("@tauri-apps/api/core");
        style!.textContent = withPath
          .map((f: TypstFontFace) => {
            const id = pickerFaceCssId(f);
            const url = convertFileSrc(f.sourcePath!);
            return `@font-face{font-family:'${id}';src:url("${url}") format("opentype"),url("${url}") format("truetype");font-display:swap;}`;
          })
          .join("\n");
      } catch {
        style!.textContent = "";
      }
    })();
  });

  onMount(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!open || !rootEl) return;
      if (!rootEl.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  });
</script>

<div class="relative shrink-0" bind:this={rootEl}>
  <button
    type="button"
    class="group font-select-trigger flex h-7 min-w-[7.5rem] max-w-[11rem] items-center gap-1 rounded-md border px-2 text-left text-xs transition-all duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-link)]/35 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--app-surface-toolbar)] disabled:pointer-events-none disabled:opacity-40 {open
      ? 'border-[var(--app-link)]/35 bg-[var(--app-surface-hover)] text-[var(--app-fg)] shadow-sm'
      : 'border-[var(--app-border)]/45 bg-[var(--app-surface)]/85 text-[var(--app-fg-secondary)] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] hover:border-[var(--app-border-strong)]/70 hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-fg)] hover:shadow-md hover:shadow-black/12 active:scale-[0.98'}"
    {disabled}
    aria-expanded={open}
    aria-haspopup="menu"
    onclick={toggle}
    title="Insert #set text(font: …)"
  >
    <Type
      size={14}
      class="shrink-0 transition-colors {open ? 'text-[var(--app-link)]' : 'text-[var(--app-icon-muted)] group-hover:text-[var(--app-fg-secondary)]'}"
      strokeWidth={2}
    />
    <span class="min-w-0 flex-1 truncate">Font</span>
    <ChevronDown
      size={14}
      class="shrink-0 transition-all duration-200 {open
        ? 'rotate-180 text-[var(--app-link)]'
        : 'text-[var(--app-icon-muted)] group-hover:text-[var(--app-fg-secondary)]'}"
      strokeWidth={2}
    />
  </button>

  {#if open}
    <div
      class="absolute left-0 top-full z-[200] mt-1 flex w-[min(100vw-2rem,22rem)] max-h-[min(72vh,24rem)] flex-col overflow-hidden rounded-lg border border-[var(--app-border)] bg-[var(--app-dropdown-list-bg)] shadow-lg"
      role="menu"
      aria-label="Typst fonts"
    >
      <div
        class="shrink-0 border-b border-[var(--app-border)] bg-[var(--app-surface)] p-2"
        onclick={(e) => e.stopPropagation()}
      >
        <input
          bind:this={searchInput}
          type="search"
          placeholder="Search fonts…"
          autocomplete="off"
          autocorrect="off"
          spellcheck="false"
          bind:value={searchQuery}
          class="h-8 w-full rounded-md border border-[var(--app-border)] bg-[var(--app-input-bg)] px-2.5 text-sm text-[var(--app-input-fg)] placeholder:text-[var(--app-fg-muted)] focus:border-[var(--app-link)] focus:outline-none focus:ring-1 focus:ring-[var(--app-link)]"
        />
        {#if useLiveCatalog}
          <p class="mt-1.5 text-[10px] text-[var(--app-fg-muted)] leading-snug">
            Bundled, app-shipped, and imported fonts are loaded by Typst. Import fonts in Settings → Fonts
            (copied into app storage for sandboxing).
          </p>
        {:else}
          <p class="mt-1.5 text-[10px] text-[var(--app-fg-muted)] leading-snug">
            Run the desktop app to use your imported fonts for preview &amp; PDF. Below are common names
            only.
          </p>
        {/if}
      </div>

      <div
        class="min-h-0 flex-1 overflow-y-auto bg-[var(--app-dropdown-list-bg)] py-0.5"
      >
        {#if useLiveCatalog}
          {#if filteredLive.length === 0}
            <div class="px-3 py-6 text-center text-sm text-[var(--app-fg-muted)]">
              No fonts match “{searchQuery.trim()}”
            </div>
          {:else}
            {#each filteredLive as r, i}
              {#if i === 0 || filteredLive[i - 1].group !== r.group}
                <div
                  class="bg-[color-mix(in_srgb,var(--app-dropdown-list-bg)_92%,var(--app-fg))] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--app-fg-secondary)] border-b border-[var(--app-border)]/50"
                >
                  {r.group}
                </div>
              {/if}
              <button
                type="button"
                role="menuitem"
                class="group/menuitem flex w-full flex-col items-start gap-1 border-b border-[var(--app-border)]/40 px-3 py-2.5 text-left transition-all duration-150 ease-out border-l-[3px] border-l-transparent hover:border-l-[var(--app-link)] hover:bg-[var(--app-surface-hover)] hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] active:bg-[var(--app-surface-active)]"
                onclick={(e) => {
                  e.stopPropagation();
                  pick(r.family);
                }}
              >
                <span
                  class="w-full truncate text-[17px] font-medium leading-snug text-[var(--app-fg)]"
                  style:font-family={previewFamilyForLive(r)}
                >
                  {r.family}
                </span>
                <span
                  class="w-full text-[10px] leading-relaxed text-[var(--app-fg-muted)] font-mono opacity-90"
                >
                  {previewSample}
                </span>
                <span class="text-[9px] text-[var(--app-fg-subtle)]">{r.variant}</span>
              </button>
            {/each}
          {/if}
        {:else if presetMatchCount === 0}
          <div class="px-3 py-6 text-center text-sm text-[var(--app-fg-muted)]">
            No fonts match “{searchQuery.trim()}”
          </div>
        {:else}
          {#each filteredPresetGroups as group}
            <div
              class="bg-[color-mix(in_srgb,var(--app-dropdown-list-bg)_92%,var(--app-fg))] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--app-fg-secondary)] border-b border-[var(--app-border)]/50"
            >
              {group.title}
            </div>
            {#each group.fonts as f}
              <button
                type="button"
                role="menuitem"
                class="group/menuitem flex w-full flex-col items-start gap-1 border-b border-[var(--app-border)]/40 px-3 py-2.5 text-left transition-all duration-150 ease-out border-l-[3px] border-l-transparent hover:border-l-[var(--app-link)] hover:bg-[var(--app-surface-hover)] hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] active:bg-[var(--app-surface-active)]"
                onclick={(e) => {
                  e.stopPropagation();
                  pick(f.typst);
                }}
              >
                <span
                  class="w-full truncate text-[17px] font-medium leading-snug text-[var(--app-fg)]"
                  style:font-family={f.previewFamily}
                >
                  {f.typst}
                </span>
                <span
                  class="w-full text-[10px] leading-relaxed text-[var(--app-fg-muted)] font-mono opacity-90"
                >
                  {previewSample}
                </span>
                {#if f.hint}
                  <span class="text-[9px] text-[var(--app-fg-subtle)]">{f.hint}</span>
                {/if}
              </button>
            {/each}
          {/each}
        {/if}
      </div>
    </div>
  {/if}
</div>
