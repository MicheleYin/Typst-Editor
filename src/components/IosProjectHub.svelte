<script lang="ts">
  import {
    FolderPlus,
    FolderInput,
    FolderOpen,
    Folder,
    Pencil,
    Trash2,
    MoreVertical,
  } from "lucide-svelte";
  import appIcon from "../assets/icon.png";
  import {
    iosValidateRenameProject,
    type IosProjectSummary,
  } from "../lib/iosProjects";

  let {
    appName,
    projects,
    onRefresh,
    onOpenProject,
    onCreateProject,
    onRenameProject,
    onDeleteProject,
    onImportZip,
    onImportFolderFromDisk,
    /** Desktop: open any folder in place + recents (no ZIP / copy import). */
    onOpenFolderOnDisk,
  } = $props<{
    appName: string;
    projects: IosProjectSummary[];
    onRefresh: () => void | Promise<void>;
    onOpenProject: (p: IosProjectSummary) => void | Promise<void>;
    onCreateProject: (title: string) => Promise<string | null>;
    onRenameProject: (folderId: string, title: string) => Promise<string | null>;
    onDeleteProject: (folderId: string) => void | Promise<void>;
    onImportZip: () => void | Promise<void>;
    onImportFolderFromDisk?: () => void | Promise<void>;
    onOpenFolderOnDisk?: () => void | Promise<void>;
  }>();

  const directDisk = $derived(!!onOpenFolderOnDisk);

  let newOpen = $state(false);
  let newTitle = $state("");
  let newProjectError = $state("");
  let renameOpen = $state(false);
  let renameFolderId = $state<string | null>(null);
  let renameTitle = $state("");
  let renameProjectError = $state("");
  /** Fixed-position menu avoids clipping by card `overflow` and hub `overflow-y-auto`. */
  let menuOpenProject = $state<IosProjectSummary | null>(null);
  let menuFixedCss = $state("");

  function closeProjectMenu() {
    menuOpenProject = null;
    menuFixedCss = "";
  }

  function toggleProjectMenu(p: IosProjectSummary, e: PointerEvent) {
    e.stopPropagation();
    const btn = e.currentTarget as HTMLElement;
    if (menuOpenProject?.folderId === p.folderId) {
      closeProjectMenu();
      return;
    }
    const r = btn.getBoundingClientRect();
    const mw = 156;
    const mh = 96;
    let left = Math.max(8, r.right - mw);
    let top = r.bottom + 6;
    if (top + mh > window.innerHeight - 12) {
      top = Math.max(8, r.top - mh - 6);
    }
    if (left + mw > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - mw - 8);
    }
    menuFixedCss = `top:${top}px;left:${left}px;width:${mw}px`;
    menuOpenProject = p;
  }

  async function submitNew() {
    newProjectError = "";
    const t = newTitle.trim() || "Untitled";
    const err = await onCreateProject(t);
    if (err) {
      newProjectError = err;
      return;
    }
    newTitle = "";
    newOpen = false;
    await onRefresh();
  }

  function openRename(p: IosProjectSummary) {
    closeProjectMenu();
    renameProjectError = "";
    renameFolderId = p.folderId;
    renameTitle = p.title;
    renameOpen = true;
  }

  async function submitRename() {
    if (!renameFolderId) return;
    const id = renameFolderId;
    renameProjectError = "";
    if (!directDisk) {
      const v = await iosValidateRenameProject(renameTitle, id, projects);
      if (v) {
        renameProjectError = v;
        return;
      }
    }
    const err = await onRenameProject(id, renameTitle.trim() || "Untitled");
    if (err) {
      renameProjectError = err;
      return;
    }
    renameOpen = false;
    renameFolderId = null;
    await onRefresh();
  }

  function confirmDelete(p: IosProjectSummary) {
    closeProjectMenu();
    void onDeleteProject(p.folderId);
  }

  function formatProjectDateTime(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    const now = new Date();
    const dopts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    if (d.getFullYear() !== now.getFullYear()) dopts.year = "numeric";
    const dateStr = d.toLocaleDateString(undefined, dopts);
    const timeStr = d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
    return `${dateStr} · ${timeStr}`;
  }
</script>

<div
  class="absolute inset-0 z-[60] flex flex-col items-center bg-[var(--app-bg)] p-6 pt-10 overflow-y-auto text-[var(--app-fg)]"
>
  <div class="max-w-5xl w-full space-y-8 animate-in fade-in zoom-in duration-500 pb-12 px-1">
    <div class="flex flex-col items-center space-y-4 text-center">
      <img
        src={appIcon}
        alt=""
        width="80"
        height="80"
        class="w-20 h-20 rounded-2xl object-cover shadow-2xl shadow-black/15 dark:shadow-black/40"
        aria-hidden="true"
      />
      <h1 class="text-3xl font-bold tracking-tight">{appName}</h1>
      <p class="text-[var(--app-fg-secondary)] text-sm max-w-md">
        {#if directDisk}
          Open any folder on disk—files stay where they are. Recent projects are remembered on this Mac.
        {:else if onImportFolderFromDisk}
          Projects are stored in this app. On Mac/Windows/Linux you can also import any folder (copied
          into your project list). On iPhone/iPad, use ZIP import.
        {:else}
          Projects live in this app. Import a ZIP from Files (long-press folder → Compress), or create a
          new project here.
        {/if}
      </p>
    </div>

    <button
      type="button"
      onclick={() => {
        newTitle = "";
        newProjectError = "";
        newOpen = true;
      }}
      class="w-full flex items-center gap-3 p-4 bg-[var(--app-surface-elevated)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-card-border)] rounded-xl transition-all text-left text-[var(--app-fg)]"
    >
      <FolderPlus class="text-blue-500 shrink-0" size={22} />
      <div>
        <div class="text-sm font-semibold">New project</div>
        <div class="text-xs text-[var(--app-fg-muted)]">
          {#if directDisk}
            You’ll pick a parent folder, then we create a new subfolder with
            <code class="text-[10px]">main.typ</code>
          {:else}
            Empty <code class="text-[10px]">main.typ</code>; folder name follows your title
          {/if}
        </div>
      </div>
    </button>

    {#if onOpenFolderOnDisk}
      <button
        type="button"
        onclick={() => void onOpenFolderOnDisk()}
        class="w-full flex items-center gap-3 p-4 bg-[var(--app-surface-elevated)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-card-border)] rounded-xl transition-all text-left text-[var(--app-fg)]"
      >
        <FolderOpen class="text-emerald-600 shrink-0" size={22} />
        <div>
          <div class="text-sm font-semibold">Open folder on disk</div>
          <div class="text-xs text-[var(--app-fg-muted)]">
            Work directly in that folder—nothing is copied into app storage
          </div>
        </div>
      </button>
    {:else if onImportFolderFromDisk}
      <button
        type="button"
        onclick={() => void onImportFolderFromDisk()}
        class="w-full flex items-center gap-3 p-4 bg-[var(--app-surface-elevated)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-card-border)] rounded-xl transition-all text-left text-[var(--app-fg)]"
      >
        <FolderOpen class="text-emerald-600 shrink-0" size={22} />
        <div>
          <div class="text-sm font-semibold">Import folder as project</div>
          <div class="text-xs text-[var(--app-fg-muted)]">
            Choose a folder on disk; its files are copied into a new project
          </div>
        </div>
      </button>
    {/if}

    {#if !directDisk}
      <button
        type="button"
        onclick={() => void onImportZip()}
        class="w-full flex items-center gap-3 p-4 bg-[var(--app-surface-elevated)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-card-border)] rounded-xl transition-all text-left text-[var(--app-fg)]"
      >
        <FolderInput class="text-amber-600 shrink-0" size={22} />
        <div>
          <div class="text-sm font-semibold">Import project from ZIP</div>
          <div class="text-xs text-[var(--app-fg-muted)]">
            {#if onImportFolderFromDisk}
              Or pick a .zip archive (e.g. shared from another device)
            {:else}
              In Files: long-press folder → Compress, then pick the .zip
            {/if}
          </div>
        </div>
      </button>
    {/if}

    <div>
      <h2 class="text-[10px] font-bold uppercase tracking-wider text-[var(--app-fg-muted)] mb-3 px-1">
        {directDisk ? "Recent projects" : "Your projects"}
      </h2>
      {#if projects.length === 0}
        <p
          class="text-sm text-[var(--app-fg-secondary)] text-center py-10 border border-dashed border-[var(--app-border)] rounded-2xl col-span-full"
        >
          {directDisk
            ? "Open a folder or create a new project to get started."
            : "No projects yet. Create one to begin."}
        </p>
      {:else}
        <div
          class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4"
          role="list"
        >
          {#each projects as p (p.folderId)}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              role="listitem"
              class="relative flex flex-col rounded-2xl border border-[var(--app-card-border)] bg-[var(--app-surface-elevated)] hover:border-[var(--app-link)]/40 hover:shadow-md transition-all overflow-hidden group text-left cursor-pointer"
              onclick={() => void onOpenProject(p)}
            >
              <div class="p-4 flex flex-col flex-1 min-h-[100px]">
                <div class="flex items-start justify-between gap-2 mb-2">
                  <Folder
                    class="text-[var(--app-link)] shrink-0 opacity-90"
                    size={28}
                    aria-hidden="true"
                  />
                  <button
                    type="button"
                    class="p-1.5 rounded-lg hover:bg-[var(--app-surface-hover)] text-[var(--app-icon-muted)] -mr-1 -mt-1"
                    aria-label="Project options"
                    onclick={(e) => toggleProjectMenu(p, e)}
                  >
                    <MoreVertical size={18} />
                  </button>
                </div>
                <div class="font-semibold text-sm text-[var(--app-fg)] line-clamp-2 leading-snug">
                  {p.title}
                </div>
                <div
                  class="mt-auto pt-3 text-[10px] text-[var(--app-fg-muted)] tabular-nums"
                >
                  {formatProjectDateTime(p.updatedAt)}
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>

{#if menuOpenProject}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="fixed inset-0 z-[200]" onclick={closeProjectMenu} role="presentation"></div>
  <div
    class="fixed z-[201] rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] shadow-xl py-1 min-w-[140px]"
    style={menuFixedCss}
    role="menu"
  >
    <button
      type="button"
      class="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-[var(--app-chip-bg)]"
      onclick={() => openRename(menuOpenProject!)}
    >
      <Pencil size={14} class="text-[var(--app-icon-muted)]" />
      Rename…
    </button>
    <button
      type="button"
      class="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-red-600 dark:text-red-400 hover:bg-red-500/10"
      onclick={() => confirmDelete(menuOpenProject!)}
    >
      <Trash2 size={14} />
      {directDisk ? "Remove from list…" : "Delete…"}
    </button>
  </div>
{/if}

{#if newOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-4 bg-black/50"
    onclick={() => (newOpen = false)}
    role="presentation"
  >
    <div
      class="w-full max-w-md rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] shadow-xl p-4 space-y-4"
      role="dialog"
      aria-labelledby="new-project-title"
      onclick={(e) => e.stopPropagation()}
    >
      <h2 id="new-project-title" class="text-lg font-semibold text-[var(--app-fg)]">
        New project
      </h2>
      <input
        type="text"
        bind:value={newTitle}
        placeholder="Project title"
        class="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-elevated)] px-3 py-2.5 text-[var(--app-fg)] text-base"
        autocomplete="off"
        onkeydown={(e) => e.key === "Enter" && void submitNew()}
      />
      {#if newProjectError}
        <p class="text-sm text-red-600 dark:text-red-400" role="alert">{newProjectError}</p>
      {/if}
      <div class="flex justify-end gap-2">
        <button
          type="button"
          class="px-4 py-2 rounded-lg text-sm text-[var(--app-fg-secondary)]"
          onclick={() => (newOpen = false)}
        >
          Cancel
        </button>
        <button
          type="button"
          class="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white"
          onclick={() => void submitNew()}
        >
          Create
        </button>
      </div>
    </div>
  </div>
{/if}

{#if renameOpen && renameFolderId}
  <div
    class="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-4 bg-black/50"
    onclick={() => (renameOpen = false)}
    role="presentation"
  >
    <div
      class="w-full max-w-md rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] shadow-xl p-4 space-y-4"
      role="dialog"
      onclick={(e) => e.stopPropagation()}
    >
      <h2 class="text-lg font-semibold text-[var(--app-fg)]">Rename project</h2>
      <input
        type="text"
        bind:value={renameTitle}
        class="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-elevated)] px-3 py-2.5 text-[var(--app-fg)] text-base"
        autocomplete="off"
        onkeydown={(e) => e.key === "Enter" && void submitRename()}
      />
      {#if renameProjectError}
        <p class="text-sm text-red-600 dark:text-red-400" role="alert">{renameProjectError}</p>
      {/if}
      <div class="flex justify-end gap-2">
        <button
          type="button"
          class="px-4 py-2 rounded-lg text-sm text-[var(--app-fg-secondary)]"
          onclick={() => (renameOpen = false)}
        >
          Cancel
        </button>
        <button
          type="button"
          class="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white"
          onclick={() => void submitRename()}
        >
          Save
        </button>
      </div>
    </div>
  </div>
{/if}
