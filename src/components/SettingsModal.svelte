<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { ask, open, save } from "@tauri-apps/plugin-dialog";
  import { writeTextFile } from "@tauri-apps/plugin-fs";
  import { X, FolderOpen, FileType, Trash2, Download, Upload } from "lucide-svelte";
  import ShortcutEditor from "./ShortcutEditor.svelte";
  import {
    getTypstFontConfig,
    setTypstFontConfig,
    importTypstFontConfigJson,
    type TypstFontConfig,
  } from "../lib/typstFonts";

  let {
    isOpen,
    onClose,
    initialTab = "shortcuts",
  } = $props<{
    isOpen: boolean;
    onClose: () => void;
    initialTab?: "shortcuts" | "packageCache" | "fonts";
  }>();

  let tab = $state<"shortcuts" | "packageCache" | "fonts">("shortcuts");

  $effect(() => {
    if (isOpen) {
      tab = initialTab;
      if (initialTab === "packageCache") {
        void loadCacheInfo();
      }
      if (initialTab === "fonts") {
        void loadFontCfg();
      }
    }
  });

  type CacheInfo = {
    path: string;
    sizeBytes: number;
    fileCount: number;
    locationNote: string;
  };

  let cacheInfo = $state<CacheInfo | null>(null);
  let cacheLoading = $state(false);
  let cacheError = $state("");
  let clearBusy = $state(false);

  let fontConfig = $state<TypstFontConfig>({ directories: [], files: [] });
  let fontCfgLoading = $state(false);
  let fontCfgError = $state("");
  let fontCfgBusy = $state(false);

  function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
    return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  async function loadCacheInfo() {
    cacheLoading = true;
    cacheError = "";
    try {
      cacheInfo = await invoke<CacheInfo>("get_typst_package_cache_info");
    } catch (e) {
      cacheInfo = null;
      cacheError = String(e);
    } finally {
      cacheLoading = false;
    }
  }

  async function loadFontCfg() {
    fontCfgLoading = true;
    fontCfgError = "";
    try {
      fontConfig = await getTypstFontConfig();
    } catch (e) {
      fontCfgError = String(e);
    } finally {
      fontCfgLoading = false;
    }
  }

  async function persistFontCfg(next: TypstFontConfig) {
    fontCfgBusy = true;
    fontCfgError = "";
    try {
      await setTypstFontConfig(next);
      fontConfig = next;
    } catch (e) {
      fontCfgError = String(e);
    } finally {
      fontCfgBusy = false;
    }
  }

  async function addFontFolder() {
    try {
      const p = await open({ directory: true, multiple: false });
      if (typeof p !== "string" || !p) return;
      if (fontConfig.directories.includes(p)) return;
      await persistFontCfg({
        ...fontConfig,
        directories: [...fontConfig.directories, p],
      });
    } catch (e) {
      fontCfgError = String(e);
    }
  }

  async function addFontFiles() {
    try {
      const p = await open({
        multiple: true,
        filters: [{ name: "Fonts", extensions: ["ttf", "otf", "ttc", "otc"] }],
      });
      if (p == null) return;
      const arr = Array.isArray(p) ? p : [p];
      const set = new Set([...fontConfig.files, ...arr]);
      await persistFontCfg({ ...fontConfig, files: [...set] });
    } catch (e) {
      fontCfgError = String(e);
    }
  }

  async function removeDir(i: number) {
    const next = { ...fontConfig, directories: fontConfig.directories.filter((_, j) => j !== i) };
    await persistFontCfg(next);
  }

  async function removeFile(i: number) {
    const next = { ...fontConfig, files: fontConfig.files.filter((_, j) => j !== i) };
    await persistFontCfg(next);
  }

  async function exportFontConfigTemplate() {
    try {
      const path = await save({
        filters: [{ name: "JSON", extensions: ["json"] }],
        defaultPath: "typst-editor-fonts.json",
      });
      if (path == null) return;
      const body = JSON.stringify(
        { directories: [], files: [] },
        null,
        2,
      );
      await writeTextFile(path, body);
    } catch (e) {
      fontCfgError = String(e);
    }
  }

  async function importFontConfigMerge() {
    try {
      const p = await open({
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (typeof p !== "string") return;
      fontConfig = await importTypstFontConfigJson(p);
    } catch (e) {
      fontCfgError = String(e);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && isOpen) onClose();
  }

  onMount(() => {
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  });

  async function clearCache() {
    const ok = await ask(
      "Remove all downloaded @preview packages? They will be re-downloaded when you compile again.",
      { title: "Clear package cache", kind: "warning" },
    );
    if (!ok) return;
    clearBusy = true;
    cacheError = "";
    try {
      await invoke("clear_typst_package_cache");
      await loadCacheInfo();
    } catch (e) {
      cacheError = String(e);
    } finally {
      clearBusy = false;
    }
  }

  function selectTab(t: "shortcuts" | "packageCache" | "fonts") {
    tab = t;
    if (t === "packageCache") void loadCacheInfo();
    if (t === "fonts") void loadFontCfg();
  }
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
    onclick={onClose}
  >
    <div
      class="bg-[var(--app-surface)] border border-[var(--app-border)] rounded-lg shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
      onclick={(e) => e.stopPropagation()}
    >
      <div class="flex items-center justify-between px-4 py-3 border-b border-[var(--app-border)] gap-2">
        <div class="flex items-center gap-1 min-w-0 flex-wrap">
          <h2 class="text-sm font-semibold text-[var(--app-fg)] shrink-0 mr-2">Settings</h2>
          <div class="flex rounded-md bg-[var(--app-bg)] p-0.5 border border-[var(--app-border)] flex-wrap">
            <button
              type="button"
              class="px-3 py-1 text-xs rounded-md transition-colors {tab === 'shortcuts'
                ? 'bg-[var(--app-surface-active)] text-[var(--app-active-fg)]'
                : 'text-[var(--app-fg-secondary)] hover:text-[var(--app-fg)]'}"
              onclick={() => selectTab("shortcuts")}
            >
              Shortcuts
            </button>
            <button
              type="button"
              class="px-3 py-1 text-xs rounded-md transition-colors {tab === 'fonts'
                ? 'bg-[var(--app-surface-active)] text-[var(--app-active-fg)]'
                : 'text-[var(--app-fg-secondary)] hover:text-[var(--app-fg)]'}"
              onclick={() => selectTab("fonts")}
            >
              Fonts
            </button>
            <button
              type="button"
              class="px-3 py-1 text-xs rounded-md transition-colors {tab === 'packageCache'
                ? 'bg-[var(--app-surface-active)] text-[var(--app-active-fg)]'
                : 'text-[var(--app-fg-secondary)] hover:text-[var(--app-fg)]'}"
              onclick={() => selectTab("packageCache")}
            >
              Package cache
            </button>
          </div>
        </div>
        <button
          type="button"
          onclick={onClose}
          class="p-1 hover:bg-[var(--app-btn-ghost-hover)] rounded transition-colors text-[var(--app-fg-secondary)] hover:text-[var(--app-close-hover-fg)] shrink-0"
        >
          <X size={18} />
        </button>
      </div>

      <div class="flex-1 overflow-auto p-6 min-h-[280px]">
        {#if tab === "shortcuts"}
          <ShortcutEditor />
        {:else if tab === "fonts"}
          <div class="space-y-4 text-sm text-[var(--app-fg)]">
            <p class="text-[var(--app-fg-secondary)] text-xs leading-relaxed">
              The Typst compiler loads <strong class="text-[var(--app-fg)]">bundled</strong> fonts plus every
              <code class="text-[var(--app-link)]">.ttf</code> /
              <code class="text-[var(--app-link)]">.otf</code> /
              <code class="text-[var(--app-link)]">.ttc</code> under the folders below, and any individual files
              you add. Use <code class="text-[var(--app-link)]">#set text(font: &quot;Family Name&quot;)</code> as
              shown in the font picker.
            </p>

            {#if fontCfgLoading && !fontConfig.directories.length && !fontConfig.files.length}
              <p class="text-[var(--app-fg-muted)] text-xs">Loading…</p>
            {:else if fontCfgError && !fontConfig.directories.length && !fontConfig.files.length}
              <p class="text-red-400 text-xs">{fontCfgError}</p>
            {/if}

            <div class="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-4 space-y-3">
              <div class="flex items-center justify-between gap-2 flex-wrap">
                <span class="text-[10px] uppercase tracking-wider text-[var(--app-fg-muted)]"
                  >Font folders (recursive)</span
                >
                <button
                  type="button"
                  disabled={fontCfgBusy}
                  onclick={() => void addFontFolder()}
                  class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-[var(--app-border)] bg-[var(--app-surface-elevated)] hover:bg-[var(--app-surface-hover)] disabled:opacity-50"
                >
                  <FolderOpen size={14} /> Add folder
                </button>
              </div>
              {#if fontConfig.directories.length === 0}
                <p class="text-xs text-[var(--app-fg-muted)]">No folders — only bundled fonts.</p>
              {:else}
                <ul class="space-y-1.5">
                  {#each fontConfig.directories as dir, i}
                    <li
                      class="flex items-start gap-2 text-xs font-mono break-all text-[var(--app-fg-secondary)] bg-[var(--app-surface)] rounded px-2 py-1.5 border border-[var(--app-border)]"
                    >
                      <span class="flex-1 min-w-0">{dir}</span>
                      <button
                        type="button"
                        disabled={fontCfgBusy}
                        onclick={() => void removeDir(i)}
                        class="shrink-0 p-1 rounded hover:bg-[var(--app-surface-hover)] text-[var(--app-fg-muted)]"
                        title="Remove"
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>

            <div class="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-4 space-y-3">
              <div class="flex items-center justify-between gap-2 flex-wrap">
                <span class="text-[10px] uppercase tracking-wider text-[var(--app-fg-muted)]"
                  >Individual font files</span
                >
                <button
                  type="button"
                  disabled={fontCfgBusy}
                  onclick={() => void addFontFiles()}
                  class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-[var(--app-border)] bg-[var(--app-surface-elevated)] hover:bg-[var(--app-surface-hover)] disabled:opacity-50"
                >
                  <FileType size={14} /> Add files
                </button>
              </div>
              {#if fontConfig.files.length === 0}
                <p class="text-xs text-[var(--app-fg-muted)]">No extra files.</p>
              {:else}
                <ul class="space-y-1.5 max-h-40 overflow-y-auto">
                  {#each fontConfig.files as file, i}
                    <li
                      class="flex items-start gap-2 text-xs font-mono break-all text-[var(--app-fg-secondary)] bg-[var(--app-surface)] rounded px-2 py-1.5 border border-[var(--app-border)]"
                    >
                      <span class="flex-1 min-w-0">{file}</span>
                      <button
                        type="button"
                        disabled={fontCfgBusy}
                        onclick={() => void removeFile(i)}
                        class="shrink-0 p-1 rounded hover:bg-[var(--app-surface-hover)] text-[var(--app-fg-muted)]"
                        title="Remove"
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>

            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={fontCfgBusy}
                onclick={() => void exportFontConfigTemplate()}
                class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-[var(--app-border-strong)] bg-[var(--app-surface-elevated)] hover:bg-[var(--app-surface-hover)]"
              >
                <Download size={14} /> Export config template
              </button>
              <button
                type="button"
                disabled={fontCfgBusy}
                onclick={() => void importFontConfigMerge()}
                class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-[var(--app-border-strong)] bg-[var(--app-surface-elevated)] hover:bg-[var(--app-surface-hover)]"
              >
                <Upload size={14} /> Import JSON (merge)
              </button>
            </div>
            <p class="text-[10px] text-[var(--app-fg-muted)] leading-relaxed">
              Config is stored in the app config directory as
              <code class="text-[var(--app-fg-secondary)]">typst-editor-fonts.json</code>. Merge import adds
              directories and files from another JSON without removing existing entries.
            </p>
            {#if fontCfgError && (fontConfig.directories.length > 0 || fontConfig.files.length > 0)}
              <p class="text-red-400 text-xs">{fontCfgError}</p>
            {/if}
          </div>
        {:else}
          <div class="space-y-4 text-sm text-[var(--app-fg)]">
            <p class="text-[var(--app-fg-secondary)] text-xs leading-relaxed">
              Downloaded <code class="text-blue-400/90">@preview/…</code> packages from
              packages.typst.org are stored in the app&apos;s cache folder. On App Store builds this
              stays inside the app sandbox (no full disk access needed). Direct installs use the same
              app cache location.
            </p>

            {#if cacheLoading && !cacheInfo}
              <p class="text-[var(--app-fg-muted)] text-xs">Loading…</p>
            {:else if cacheError && !cacheInfo}
              <p class="text-red-400 text-xs">{cacheError}</p>
            {:else if cacheInfo}
              <div class="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-4 space-y-3">
                <div>
                  <div class="text-[10px] uppercase tracking-wider text-[var(--app-fg-muted)] mb-1">Size</div>
                  <div class="text-lg font-medium tabular-nums text-[var(--app-fg)]">
                    {formatBytes(cacheInfo.sizeBytes)}
                    <span class="text-sm font-normal text-[var(--app-fg-muted)] ml-2">
                      ({cacheInfo.fileCount.toLocaleString()} files)
                    </span>
                  </div>
                </div>
                <div>
                  <div class="text-[10px] uppercase tracking-wider text-[var(--app-fg-muted)] mb-1">Location</div>
                  <p
                    class="text-xs text-[var(--app-fg-secondary)] font-mono break-all leading-snug"
                    title={cacheInfo.path}
                  >
                    {cacheInfo.path}
                  </p>
                </div>
                {#if cacheInfo.locationNote}
                  <p class="text-[11px] text-[var(--app-fg-muted)]">{cacheInfo.locationNote}</p>
                {/if}
              </div>
            {/if}

            <div class="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                disabled={cacheLoading || clearBusy}
                onclick={() => void loadCacheInfo()}
                class="px-3 py-1.5 text-xs rounded-md border border-[var(--app-border-strong)] bg-[var(--app-surface-elevated)] hover:bg-[var(--app-surface-hover)] text-[var(--app-fg)] disabled:opacity-50"
              >
                Refresh
              </button>
              <button
                type="button"
                disabled={clearBusy || cacheLoading || (cacheInfo?.sizeBytes ?? 0) === 0}
                onclick={() => void clearCache()}
                class="px-3 py-1.5 text-xs rounded-md border border-red-900/50 bg-red-950/40 text-red-200 hover:bg-red-950/60 disabled:opacity-40"
              >
                {clearBusy ? "Clearing…" : "Clear cache"}
              </button>
            </div>
            {#if cacheError && cacheInfo}
              <p class="text-red-400 text-xs">{cacheError}</p>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .animate-in {
    animation-fill-mode: forwards;
  }
  .fade-in {
    animation: fadeIn 0.2s ease-out;
  }
  .zoom-in-95 {
    animation: zoomIn 0.2s ease-out;
  }
  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  @keyframes zoomIn {
    from {
      transform: scale(0.95);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }
</style>
