<script lang="ts">
  import { FileText, Folder, ChevronRight, ChevronDown, X, RefreshCw } from "lucide-svelte";

  interface SidebarFileItem {
    name: string;
    path: string;
    isDirectory: boolean;
  }

  let {
    width,
    openFiles,
    activeFile,
    currentFolder,
    folderFiles,
    onSelectFile,
    onCloseFile,
    onRefreshFolder,
  } = $props<{
    width: number;
    openFiles: { path: string; name: string; isDirty?: boolean; lastSaved?: Date | null }[];
    activeFile: string | null;
    currentFolder: string | null;
    folderFiles: SidebarFileItem[];
    onSelectFile: (path: string) => void;
    onCloseFile: (path: string) => void;
    onRefreshFolder?: () => void | Promise<void>;
  }>();

  let explorerOpen = $state(true);
  let openEditorsOpen = $state(true);

  function formatRelativeTime(date: Date | null | undefined) {
    if (!date) return "";
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (seconds < 10) return "just now";
    if (seconds < 60) return `${seconds}s ago`;
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  }
</script>

<aside
  style:width="{width}px"
  class="h-full min-h-0 shrink-0 bg-[var(--app-surface)] flex flex-col select-none text-[var(--app-fg-secondary)] overflow-hidden border-r border-[var(--app-border)] min-w-0 max-w-full"
>
  <div
    class="flex flex-col min-h-0 {openEditorsOpen
      ? 'flex-1 overflow-hidden'
      : 'shrink-0'}"
  >
    <button
      type="button"
      onclick={() => (openEditorsOpen = !openEditorsOpen)}
      class="shrink-0 flex items-center gap-1 px-2 py-1.5 bg-[var(--app-surface-toolbar)] hover:bg-[var(--app-surface-hover)] text-[10px] font-bold uppercase tracking-wider text-[var(--app-fg-secondary)] border-b border-[var(--app-border)]"
    >
      {#if openEditorsOpen}
        <ChevronDown size={14} />
      {:else}
        <ChevronRight size={14} />
      {/if}
      Open Editors
    </button>

    {#if openEditorsOpen}
      <div class="flex flex-1 min-h-0 flex-col overflow-y-auto py-0.5">
        {#each openFiles as file}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="group flex items-center justify-between px-4 py-1 text-xs hover:bg-[var(--app-surface-hover)] cursor-pointer {activeFile === file.path
              ? 'bg-[var(--app-surface-active)] text-[var(--app-active-fg)]'
              : ''}"
            onclick={() => onSelectFile(file.path)}
          >
            <div class="flex items-center gap-2 overflow-hidden flex-1">
              <div class="relative">
                <FileText
                  size={14}
                  class={activeFile === file.path ? "text-[var(--app-link)]" : "text-[var(--app-icon-muted)]"}
                />
                {#if file.isDirty}
                  <div
                    class="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full border-2 border-[var(--app-surface)]"
                  ></div>
                {/if}
              </div>
              <span class="truncate flex-1">{file.name}</span>
              {#if file.lastSaved && !file.isDirty}
                <span
                  class="text-[9px] text-[var(--app-fg-muted)] whitespace-nowrap opacity-60 group-hover:opacity-100 transition-opacity"
                >
                  {formatRelativeTime(file.lastSaved)}
                </span>
              {/if}
            </div>
            <button
              type="button"
              onclick={(e) => {
                e.stopPropagation();
                onCloseFile(file.path);
              }}
              class="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-[var(--app-surface-elevated)] rounded transition-opacity text-[var(--app-fg)]"
            >
              <X size={12} />
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <div
    class="flex flex-col min-h-0 border-t border-[var(--app-border)] {explorerOpen
      ? 'flex-1 overflow-hidden'
      : 'shrink-0'}"
  >
    <div
      class="shrink-0 flex min-w-0 items-stretch border-b border-[var(--app-border)] bg-[var(--app-surface-toolbar)]"
    >
      <button
        type="button"
        onclick={() => (explorerOpen = !explorerOpen)}
        class="flex min-w-0 flex-1 items-center gap-1 px-2 py-1.5 hover:bg-[var(--app-surface-hover)] text-[10px] font-bold uppercase tracking-wider text-[var(--app-fg-secondary)] text-left"
      >
        {#if explorerOpen}
          <ChevronDown size={14} class="shrink-0" />
        {:else}
          <ChevronRight size={14} class="shrink-0" />
        {/if}
        <span class="truncate">{currentFolder ? currentFolder.split("/").pop() : "No Folder Opened"}</span>
      </button>
      {#if currentFolder && onRefreshFolder}
        <button
          type="button"
          title="Refresh file list"
          onclick={(e) => {
            e.stopPropagation();
            void onRefreshFolder();
          }}
          class="shrink-0 flex items-center justify-center px-2 hover:bg-[var(--app-surface-hover)] text-[var(--app-fg-secondary)] border-l border-[var(--app-border)]"
        >
          <RefreshCw size={14} />
        </button>
      {/if}
    </div>

    {#if explorerOpen}
      <div class="flex min-h-0 flex-1 flex-col overflow-y-auto py-0.5">
        {#if !currentFolder}
          <div class="p-4 text-center">
            <p class="text-[11px] text-[var(--app-fg-muted)] leading-relaxed">
              You have not yet opened a folder.
            </p>
          </div>
        {:else}
          {#each folderFiles as item}
            <button
              type="button"
              class="flex w-full items-center gap-2 px-4 py-0.5 text-xs hover:bg-[var(--app-surface-hover)] cursor-pointer {activeFile === item.path
                ? 'bg-[var(--app-surface-active)] text-[var(--app-active-fg)]'
                : 'text-[var(--app-fg-secondary)]'}"
              onclick={() => onSelectFile(item.path)}
            >
              {#if item.isDirectory}
                <Folder size={14} class="text-[var(--app-link)]" />
              {:else}
                <FileText size={14} class="text-[var(--app-icon-muted)]" />
              {/if}
              <span class="truncate text-left">{item.name}</span>
            </button>
          {/each}
        {/if}
      </div>
    {/if}
  </div>
</aside>
