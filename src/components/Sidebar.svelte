<script lang="ts">
  import {
    FileText,
    Folder,
    ChevronRight,
    ChevronDown,
    RefreshCw,
    MoreVertical,
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
    onRefreshFolder?: () => void | Promise<void>;
    onExplorerRenameFile?: (path: string) => void;
    onExplorerDeleteFile?: (path: string) => void | Promise<void>;
    iosProjectTitle?: string | null;
    onIosBackToProjects?: () => void;
  }>();

  let explorerOpen = $state(true);

  /** Open-tab metadata by path (dirty dot + relative save time in explorer). */
  let openFileMetaByPath = $derived.by(() => {
    const m = new Map<
      string,
      { isDirty?: boolean; lastSaved?: Date | null }
    >();
    for (const f of openFiles) {
      m.set(f.path, { isDirty: f.isDirty, lastSaved: f.lastSaved });
    }
    return m;
  });

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
    anchor: "pointer" | "trigger" = "pointer",
  ) {
    e.preventDefault();
    e.stopPropagation();
    const pad = 8;
    const mw = 200;
    const mh = 88;
    let x = e.clientX;
    let y = e.clientY;
    if (
      anchor === "trigger" &&
      e.currentTarget instanceof HTMLElement
    ) {
      const r = e.currentTarget.getBoundingClientRect();
      x = r.right - mw;
      y = r.bottom + 4;
      if (typeof window !== "undefined" && y + mh > window.innerHeight - pad) {
        y = r.top - mh - 4;
      }
    }
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
  class="min-h-0 shrink-0 bg-[var(--app-surface)] flex flex-col select-none text-[var(--app-fg-secondary)] overflow-hidden border-r border-[var(--app-border)] min-w-0 max-w-full"
>


  <div
    class="flex flex-col min-h-0 {explorerOpen
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
            {@const tabMeta = item.isDirectory
              ? undefined
              : openFileMetaByPath.get(item.path)}
            {#if item.isDirectory}
              <button
                type="button"
                class="group flex w-full min-w-0 items-center gap-1.5 py-0.5 pr-2 text-xs hover:bg-[var(--app-surface-hover)] cursor-pointer {activeFile === item.path
                  ? 'bg-[var(--app-surface-active)] text-[var(--app-active-fg)]'
                  : 'text-[var(--app-fg-secondary)]'}"
                style:padding-left="{10 + item.depth * 14}px"
                onclick={() => {
                  if (item.expandable) {
                    toggleExplorerDir(item.path);
                  }
                }}
              >
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
                <span class="truncate text-left min-w-0 flex-1">{item.name}</span>
              </button>
            {:else}
              {@const explorerRowActive =
                activeFile === item.path || explorerFileMenu?.path === item.path}
              <div
                class="group flex w-full min-w-0 items-center gap-0.5 py-0.5 pr-1 text-xs {explorerRowActive
                  ? 'bg-[var(--app-surface-active)] text-[var(--app-active-fg)]'
                  : 'text-[var(--app-fg-secondary)] hover:bg-[var(--app-surface-hover)]'}"
                style:padding-left="{10 + item.depth * 14}px"
              >
                <button
                  type="button"
                  class="flex min-h-0 min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-sm py-0 text-left"
                  oncontextmenu={(e) => {
                    if (!onExplorerRenameFile || !onExplorerDeleteFile) {
                      return;
                    }
                    openExplorerFileMenu(e, item.path);
                  }}
                  onclick={() => onSelectFile(item.path)}
                >
                  <span class="inline-block w-[14px] shrink-0" aria-hidden="true"></span>
                  <div class="relative shrink-0">
                    <FileText
                      size={14}
                      class={explorerRowActive
                        ? "text-[var(--app-link)]"
                        : "text-[var(--app-icon-muted)]"}
                    />
                    {#if tabMeta?.isDirty}
                      <div
                        class="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full border-2 border-[var(--app-surface)]"
                        aria-hidden="true"
                      ></div>
                    {/if}
                  </div>
                  <span class="min-w-0 flex-1 truncate text-left">{item.name}</span>
                  {#if tabMeta?.lastSaved && !tabMeta?.isDirty}
                    <span
                      class="shrink-0 whitespace-nowrap text-[9px] text-[var(--app-fg-muted)] opacity-60 transition-opacity group-hover:opacity-100"
                    >
                      {formatRelativeTime(tabMeta.lastSaved)}
                    </span>
                  {/if}
                </button>
                {#if onExplorerRenameFile && onExplorerDeleteFile}
                  <button
                    type="button"
                    class="shrink-0 rounded p-0.5 text-[var(--app-icon-muted)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-fg-secondary)] {explorerRowActive
                      ? 'hover:text-[var(--app-active-fg)]'
                      : ''}"
                    aria-label="File actions"
                    aria-haspopup="menu"
                    aria-expanded={explorerFileMenu?.path === item.path}
                    onclick={(e) => openExplorerFileMenu(e, item.path, "trigger")}
                    oncontextmenu={(e) => {
                      e.preventDefault();
                      openExplorerFileMenu(e, item.path, "trigger");
                    }}
                  >
                    <MoreVertical size={14} />
                  </button>
                {/if}
              </div>
            {/if}
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
