<script lang="ts">
  import {
    FileText,
    Folder,
    ChevronRight,
    ChevronDown,
    X,
    RefreshCw,
    
  } from "lucide-svelte";
  import type { FolderExplorerNode } from "../lib/folderExplorerTree";

  type ExplorerRow = {
    name: string;
    path: string;
    isDirectory: boolean;
    depth: number;
    /** False for empty dirs — no chevron / toggle. */
    expandable: boolean;
  };

  let {
    width,
    openFiles,
    activeFile,
    currentFolder,
    folderFiles,
    onSelectFile,
    onCloseFile,
    onRefreshFolder,
    onExplorerRenameFile,
    onExplorerDeleteFile,
    
  } = $props<{
    width: number;
    openFiles: { path: string; name: string; isDirty?: boolean; lastSaved?: Date | null }[];
    activeFile: string | null;
    currentFolder: string | null;
    folderFiles: FolderExplorerNode[];
    onSelectFile: (path: string) => void;
    onCloseFile: (path: string) => void;
    onRefreshFolder?: () => void | Promise<void>;
    onExplorerRenameFile?: (path: string) => void;
    onExplorerDeleteFile?: (path: string) => void | Promise<void>;
    iosProjectTitle?: string | null;
    onIosBackToProjects?: () => void;
  }>();

  let explorerOpen = $state(true);
  let openEditorsOpen = $state(true);

  /** `true` = folder row is collapsed (children hidden). */
  let collapsedByPath = $state<Record<string, boolean>>({});

  $effect(() => {
    void currentFolder;
    collapsedByPath = {};
  });

  function walkVisible(
    nodes: FolderExplorerNode[],
    collapsed: Record<string, boolean>,
    depth: number,
  ): ExplorerRow[] {
    const rows: ExplorerRow[] = [];
    for (const n of nodes) {
      const expandable = n.isDirectory && (n.children?.length ?? 0) > 0;
      rows.push({
        name: n.name,
        path: n.path,
        isDirectory: n.isDirectory,
        depth,
        expandable,
      });
      if (expandable && collapsed[n.path] !== true) {
        rows.push(...walkVisible(n.children!, collapsed, depth + 1));
      }
    }
    return rows;
  }

  let explorerRows = $derived.by(() =>
    walkVisible(folderFiles, collapsedByPath, 0),
  );

  let explorerFileMenu = $state<{
    x: number;
    y: number;
    path: string;
  } | null>(null);

  function closeExplorerFileMenu() {
    explorerFileMenu = null;
  }

  function openExplorerFileMenu(
    e: MouseEvent,
    path: string,
  ) {
    e.preventDefault();
    e.stopPropagation();
    const pad = 8;
    const mw = 200;
    const mh = 88;
    let x = e.clientX;
    let y = e.clientY;
    if (typeof window !== "undefined") {
      x = Math.min(x, window.innerWidth - mw - pad);
      y = Math.min(y, window.innerHeight - mh - pad);
      x = Math.max(pad, x);
      y = Math.max(pad, y);
    }
    explorerFileMenu = { x, y, path };
  }

  function toggleExplorerDir(path: string) {
    const next = { ...collapsedByPath };
    if (next[path]) {
      delete next[path];
    } else {
      next[path] = true;
    }
    collapsedByPath = next;
  }

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
          {#each explorerRows as item}
            <button
              type="button"
              class="flex w-full items-center gap-1.5 py-0.5 pr-4 text-xs hover:bg-[var(--app-surface-hover)] cursor-pointer {activeFile === item.path
                ? 'bg-[var(--app-surface-active)] text-[var(--app-active-fg)]'
                : 'text-[var(--app-fg-secondary)]'}"
              style:padding-left="{10 + item.depth * 14}px"
              oncontextmenu={(e) => {
                if (
                  item.isDirectory ||
                  !onExplorerRenameFile ||
                  !onExplorerDeleteFile
                ) {
                  return;
                }
                openExplorerFileMenu(e, item.path);
              }}
              onclick={() => {
                if (item.isDirectory && item.expandable) {
                  toggleExplorerDir(item.path);
                } else if (!item.isDirectory) {
                  onSelectFile(item.path);
                }
              }}
            >
              {#if item.isDirectory}
                {#if item.expandable}
                  {#if collapsedByPath[item.path]}
                    <ChevronRight size={14} class="shrink-0 text-[var(--app-fg-muted)]" />
                  {:else}
                    <ChevronDown size={14} class="shrink-0 text-[var(--app-fg-muted)]" />
                  {/if}
                {:else}
                  <span class="inline-block w-[14px] shrink-0" aria-hidden="true"></span>
                {/if}
                <Folder size={14} class="shrink-0 text-[var(--app-link)]" />
              {:else}
                <span class="inline-block w-[14px] shrink-0" aria-hidden="true"></span>
                <FileText size={14} class="shrink-0 text-[var(--app-icon-muted)]" />
              {/if}
              <span class="truncate text-left min-w-0">{item.name}</span>
            </button>
          {/each}
        {/if}
      </div>
    {/if}
  </div>

  {#if explorerFileMenu && onExplorerRenameFile && onExplorerDeleteFile}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="fixed inset-0 z-[450]"
      onclick={() => closeExplorerFileMenu()}
      oncontextmenu={(e) => {
        e.preventDefault();
        closeExplorerFileMenu();
      }}
      role="presentation"
    >
      <div
        class="fixed z-[451] min-w-[11rem] rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] py-1 text-xs shadow-lg"
        style:left="{explorerFileMenu.x}px"
        style:top="{explorerFileMenu.y}px"
        onclick={(e) => e.stopPropagation()}
        onpointerdown={(e) => e.stopPropagation()}
        role="menu"
        tabindex="-1"
        aria-label="File actions"
      >
        <button
          type="button"
          role="menuitem"
          class="flex w-full px-3 py-2 text-left hover:bg-[var(--app-surface-hover)] text-[var(--app-fg)]"
          onclick={() => {
            const p = explorerFileMenu!.path;
            closeExplorerFileMenu();
            onExplorerRenameFile(p);
          }}
        >
          Rename…
        </button>
        <button
          type="button"
          role="menuitem"
          class="flex w-full px-3 py-2 text-left hover:bg-[var(--app-surface-hover)] text-red-600 dark:text-red-400"
          onclick={() => {
            const p = explorerFileMenu!.path;
            closeExplorerFileMenu();
            void onExplorerDeleteFile(p);
          }}
        >
          Delete…
        </button>
      </div>
    </div>
  {/if}
</aside>
