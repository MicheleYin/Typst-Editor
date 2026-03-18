<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { ask } from "@tauri-apps/plugin-dialog";
  import { X } from "lucide-svelte";
  import ShortcutEditor from "./ShortcutEditor.svelte";

  let {
    isOpen,
    onClose,
    initialTab = "shortcuts",
  } = $props<{
    isOpen: boolean;
    onClose: () => void;
    initialTab?: "shortcuts" | "packageCache";
  }>();

  let tab = $state<"shortcuts" | "packageCache">("shortcuts");

  $effect(() => {
    if (isOpen) {
      tab = initialTab;
      if (initialTab === "packageCache") {
        void loadCacheInfo();
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

  function selectTab(t: "shortcuts" | "packageCache") {
    tab = t;
    if (t === "packageCache") void loadCacheInfo();
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
        <div class="flex items-center gap-1 min-w-0">
          <h2 class="text-sm font-semibold text-[var(--app-fg)] shrink-0 mr-2">Settings</h2>
          <div class="flex rounded-md bg-[var(--app-bg)] p-0.5 border border-[var(--app-border)]">
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
