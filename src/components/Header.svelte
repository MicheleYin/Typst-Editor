<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { getVersion } from "@tauri-apps/api/app";
  import {
    Settings,
    PanelLeft,
    PanelRight,
    FileDown,
    Loader2,
    SquareTerminal,
    ChevronLeft,
  } from "lucide-svelte";
  import pkg from "../../package.json";
  import CustomSelect from "./CustomSelect.svelte";
  import InAppMenu from "./InAppMenu.svelte";
  import appIcon from "../assets/icon.png";

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
    colorMode = "auto",
    onColorModeChange,
    colorModeOptions = [],
    filePath = null,
    isDirty = false,
    lastSaved = null,
    sidebarVisible = true,
    onToggleSidebar,
    previewVisible = true,
    onTogglePreview,
    /** When true, hide the preview panel toggle (e.g. image/PDF full-width preview). */
    suppressPreviewToggle = false,
    showPanelToggles = true,
    showExportTypst = false,
    /** When false, in-app File → Export… is shown disabled (e.g. not a `.typ` file). */
    exportTypstEnabled = true,
    exportBusy = false,
    onOpenExportTypst,
    onShowCommandPalette,
    showInAppMenu = false,
    onInAppMenuAction,
    inAppMenuLanding = false,
    iosMenuHub = false,
    iosMenuProject = false,
    hubAllowsFolderImport = false,
    hubDirectFolders = false,
    showNativeBackToHub = false,
    onBackToProjects,
  } = $props<{
    appName: string;
    showInAppMenu?: boolean;
    onInAppMenuAction?: (id: string) => void;
    inAppMenuLanding?: boolean;
    iosMenuHub?: boolean;
    iosMenuProject?: boolean;
    hubAllowsFolderImport?: boolean;
    hubDirectFolders?: boolean;
    showNativeBackToHub?: boolean;
    onBackToProjects?: () => void | Promise<void>;
    onShowShortcuts: () => void;
    colorMode?: string;
    onColorModeChange?: (mode: string) => void;
    colorModeOptions?: { id: string; label: string }[];
    filePath?: string | null;
    isDirty?: boolean;
    lastSaved?: Date | null;
    sidebarVisible?: boolean;
    onToggleSidebar: () => void;
    previewVisible?: boolean;
    onTogglePreview: () => void;
    suppressPreviewToggle?: boolean;
    showPanelToggles?: boolean;
    showExportTypst?: boolean;
    exportBusy?: boolean;
    onOpenExportTypst?: () => void | Promise<void>;
    onShowCommandPalette?: () => void;
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
  class="h-auto pb-2 bg-[var(--app-bg)] border-b border-[var(--app-border)] flex items-center px-4 gap-2 z-[80] select-none {showInAppMenu
    ? ''
    : 'pt-2'}"
  style:padding-top={showInAppMenu
    ? "max(0.75rem, env(safe-area-inset-top, 0px))"
    : undefined}
>
  <div class="flex items-center gap-1 mr-4">
    {#if showInAppMenu && onInAppMenuAction}
      <InAppMenu
        onAction={onInAppMenuAction}
        landingPage={inAppMenuLanding}
        {iosMenuHub}
        {iosMenuProject}
        {hubAllowsFolderImport}
        {hubDirectFolders}
        {exportTypstEnabled}
      />
    {/if}
    {#if showNativeBackToHub && onBackToProjects}
      <button
        type="button"
        onclick={() => void onBackToProjects()}
        class="p-1.5 rounded transition-colors text-[var(--app-fg-secondary)] hover:bg-[var(--app-btn-ghost-hover)] hover:text-[var(--app-link)] shrink-0"
        title="All projects"
        aria-label="All projects"
      >
        <ChevronLeft size={20} aria-hidden="true" />
      </button>
    {/if}
    <img
      src={appIcon}
      alt=""
      width="24"
      height="24"
      class="w-6 h-6 rounded object-cover shadow-sm shrink-0"
      aria-hidden="true"
    />
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
              class="w-1.5 h-1.5 rounded-full animate-pulse"
              style="background: var(--app-status-edited-dot); box-shadow: 0 0 8px var(--app-status-edited-glow);"
            ></div>
            <span
              class="text-[10px] uppercase font-bold tracking-wider"
              style="color: var(--app-status-edited-text);"
              >Edited</span
            >
          </div>
        {:else if lastSaved}
          <div
            class="flex items-center gap-1.5 pl-1 border-l border-[var(--app-chip-divider)] ml-1"
          >
            <div
              class="w-1.5 h-1.5 rounded-full"
              style="background: var(--app-status-saved-dot); box-shadow: 0 0 8px var(--app-status-saved-glow);"
            ></div>
            <span
              class="text-[10px] uppercase font-bold tracking-wider opacity-90"
              style="color: var(--app-status-saved-text);"
              >Saved {formatRelativeTime(lastSaved)}</span
            >
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <div
    class="px-2 mx-auto flex min-w-0 flex-wrap items-center justify-end gap-x-1 gap-y-1 sm:gap-x-2"
  >
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
      {#if !suppressPreviewToggle}
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
    {/if}
    {#if onShowCommandPalette}
      <button
        type="button"
        onclick={onShowCommandPalette}
        class="p-1.5 rounded transition-colors text-[var(--app-fg-secondary)] hover:bg-[var(--app-btn-ghost-hover)] hover:text-[var(--app-link)]"
        title="Command palette (Monaco)"
      >
        <SquareTerminal size={18} aria-hidden="true" />
      </button>
    {/if}
    {#if showExportTypst && onOpenExportTypst}
      <button
        type="button"
        onclick={() => void onOpenExportTypst()}
        disabled={exportBusy}
        class="p-1.5 rounded transition-colors flex items-center justify-center min-w-[2.25rem] disabled:opacity-50 disabled:pointer-events-none text-[var(--app-fg-secondary)] hover:bg-[var(--app-btn-ghost-hover)] hover:text-[var(--app-link)]"
        title={exportBusy ? "Exporting…" : "Export (PDF, SVG, PNG, HTML…)"}
        aria-busy={exportBusy}
      >
        {#if exportBusy}
          <Loader2 size={18} class="animate-spin text-[var(--app-link)]" aria-hidden="true" />
        {:else}
          <FileDown size={18} aria-hidden="true" />
        {/if}
      </button>
    {/if}
    {#if colorModeOptions.length > 0 && onColorModeChange}
      <CustomSelect
        id="color-mode-select"
        label="Color mode"
        title="App appearance (header, sidebar, preview chrome). Editor stays Catppuccin alt."
        value={colorMode}
        options={colorModeOptions}
        onChange={onColorModeChange}
        align="end"
      />
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
