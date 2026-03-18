<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { getVersion } from "@tauri-apps/api/app";
  import { Settings, PanelLeft, PanelRight } from "lucide-svelte";
  import pkg from "../../package.json";

  let editorVersion = $state("");
  let typstEngineVersion = $state("");

  onMount(() => {
    void (async () => {
      try {
        editorVersion = await getVersion();
      } catch {
        editorVersion = pkg.version;
      }
      try {
        typstEngineVersion = await invoke<string>("typst_engine_version");
      } catch {
        typstEngineVersion = "";
      }
    })();
  });

  let {
    appName,
    onShowShortcuts,
    themePreference = "auto",
    onThemePreferenceChange,
    themePreferenceOptions = [],
    filePath = null,
    isDirty = false,
    lastSaved = null,
    sidebarVisible = true,
    onToggleSidebar,
    previewVisible = true,
    onTogglePreview,
    showPanelToggles = true,
  } = $props<{
    appName: string;
    onShowShortcuts: () => void;
    themePreference?: string;
    onThemePreferenceChange?: (pref: string) => void;
    themePreferenceOptions?: { id: string; label: string }[];
    filePath?: string | null;
    isDirty?: boolean;
    lastSaved?: Date | null;
    sidebarVisible?: boolean;
    onToggleSidebar: () => void;
    previewVisible?: boolean;
    onTogglePreview: () => void;
    showPanelToggles?: boolean;
  }>();

  function formatRelativeTime(date: Date | null | undefined) {
    if (!date) return "";
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);

    if (seconds < 10) return "just now";
    if (seconds < 60) return `${seconds}s ago`;
    if (minutes < 60) return `${minutes}m ago`;
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
</script>

<header
  class="h-10 bg-[var(--app-bg)] border-b border-[var(--app-border)] flex items-center px-4 gap-2 z-50 select-none"
>
  <div class="flex items-center gap-1 mr-4">
    <div class="w-6 h-6 bg-blue-600 rounded flex items-center justify-center">
      <span class="text-[10px] font-bold text-white">T</span>
    </div>
    <span class="text-xs font-semibold text-[var(--app-fg-secondary)]">{appName}</span>
  </div>

  <div class="flex-1 flex items-center justify-center">
    {#if filePath}
      <div
        class="flex items-center gap-2 bg-[var(--app-chip-bg)] px-3 py-1 rounded-full border border-[var(--app-border)]"
      >
        <span class="text-xs text-[var(--app-fg-secondary)]">
          {filePath.split("/").pop()}
        </span>
        {#if isDirty}
          <div
            class="flex items-center gap-1.5 pl-1 border-l border-[var(--app-chip-divider)] ml-1"
          >
            <div
              class="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.5)]"
            ></div>
            <span class="text-[10px] uppercase font-bold tracking-wider text-blue-400"
              >Edited</span
            >
          </div>
        {:else if lastSaved}
          <div
            class="flex items-center gap-1.5 pl-1 border-l border-[var(--app-chip-divider)] ml-1"
          >
            <div
              class="w-1.5 h-1.5 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.3)]"
            ></div>
            <span
              class="text-[10px] uppercase font-bold tracking-wider text-emerald-500 opacity-80"
              >Saved {formatRelativeTime(lastSaved)}</span
            >
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <div class="ml-auto flex items-center gap-1 sm:gap-2">
    {#if showPanelToggles}
      <button
        type="button"
        onclick={onToggleSidebar}
        class="p-1.5 rounded transition-colors {sidebarVisible
          ? 'text-[var(--app-link)] bg-[var(--app-chip-bg)] hover:bg-[var(--app-btn-ghost-hover)]'
          : 'text-[var(--app-icon-muted)] hover:bg-[var(--app-btn-ghost-hover)] hover:text-[var(--app-fg)]'}"
        title={sidebarVisible ? "Hide sidebar" : "Show sidebar"}
        aria-pressed={sidebarVisible}
      >
        <PanelLeft size={18} />
      </button>
      <button
        type="button"
        onclick={onTogglePreview}
        class="p-1.5 rounded transition-colors {previewVisible
          ? 'text-[var(--app-link)] bg-[var(--app-chip-bg)] hover:bg-[var(--app-btn-ghost-hover)]'
          : 'text-[var(--app-icon-muted)] hover:bg-[var(--app-btn-ghost-hover)] hover:text-[var(--app-fg)]'}"
        title={previewVisible ? "Hide preview" : "Show preview"}
        aria-pressed={previewVisible}
      >
        <PanelRight size={18} />
      </button>
    {/if}
    {#if themePreferenceOptions.length > 0 && onThemePreferenceChange}
      <label class="sr-only" for="app-theme-select">Appearance</label>
      <select
        id="app-theme-select"
        class="max-w-40 text-[11px] bg-[var(--app-chip-bg)] border border-[var(--app-border-strong)] text-[var(--app-fg)] rounded px-1.5 py-1 cursor-pointer hover:opacity-90 focus:outline-none focus:ring-1 focus:ring-blue-500"
        title="Theme: editor + app follow this. Auto matches system light/dark."
        value={themePreference}
        onchange={(e) => onThemePreferenceChange(e.currentTarget.value)}
      >
        {#each themePreferenceOptions as opt (opt.id)}
          <option value={opt.id}>{opt.label}</option>
        {/each}
      </select>
    {/if}
    <button
      type="button"
      onclick={onShowShortcuts}
      class="p-1.5 hover:bg-[var(--app-btn-ghost-hover)] rounded text-[var(--app-fg-secondary)] hover:text-[var(--app-close-hover-fg)] transition-colors"
      title="Settings"
    >
      <Settings size={16} />
    </button>
    <div
      class="text-[10px] text-[var(--app-fg-muted)] hidden sm:block text-right leading-tight tabular-nums"
      title={`${appName} app version and linked Typst compiler`}
    >
      <div>{appName} v{editorVersion || "…"}</div>
      <div class="text-[var(--app-fg-subtle)]">Typst {typstEngineVersion || "…"}</div>
    </div>
  </div>
</header>

<style>
  /* Keep it clean */
</style>
