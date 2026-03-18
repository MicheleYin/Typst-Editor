<script lang="ts">
  import {
    FolderPlus,
    FolderInput,
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
    onImportFolder,
  } = $props<{
    appName: string;
    projects: IosProjectSummary[];
    onRefresh: () => void | Promise<void>;
    onOpenProject: (p: IosProjectSummary) => void | Promise<void>;
    onCreateProject: (title: string) => Promise<string | null>;
    onRenameProject: (folderId: string, title: string) => Promise<string | null>;
    onDeleteProject: (folderId: string) => void | Promise<void>;
    onImportFolder: () => void | Promise<void>;
  }>();

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
    const v = await iosValidateRenameProject(renameTitle, id, projects);
    if (v) {
      renameProjectError = v;
      return;
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
      <p class="text-[var(--app-fg-secondary)] text-sm max-w-sm">
        Projects live in this app’s Documents storage. Each project is a folder with your
        <code class="text-xs bg-[var(--app-surface-elevated)] px-1 rounded">.typ</code> files.
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
          Folder in Files uses your title as-is (only / : * ? etc. removed)
        </div>
      </div>
    </button>

    <button
      type="button"
      onclick={() => void onImportFolder()}
      class="w-full flex items-center gap-3 p-4 bg-[var(--app-surface-elevated)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-card-border)] rounded-xl transition-all text-left text-[var(--app-fg)]"
    >
      <FolderInput class="text-emerald-600 shrink-0" size={22} />
      <div>
        <div class="text-sm font-semibold">Import project from ZIP</div>
        <div class="text-xs text-[var(--app-fg-muted)]">
          In Files: long-press your folder → Compress, then pick the .zip here
        </div>
      </div>
    </button>

    <div>
      <h2 class="text-[10px] font-bold uppercase tracking-wider text-[var(--app-fg-muted)] mb-3 px-1">
        Your projects
      </h2>
      {#if projects.length === 0}
        <p
          class="text-sm text-[var(--app-fg-secondary)] text-center py-10 border border-dashed border-[var(--app-border)] rounded-2xl col-span-full"
        >
          No projects yet. Create one to begin.
        </p>
      {:else}
        <div
          class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4"
          role="list"
        >
          {#each projects as p (p.folderId)}
            <div
              class="relative group rounded-2xl border border-[var(--app-card-border)] bg-[var(--app-surface-elevated)] shadow-sm hover:shadow-md hover:border-[var(--app-border)] transition-shadow min-h-[138px] flex flex-col"
              role="listitem"
            >
              <button
                type="button"
                class="flex-1 flex flex-col items-stretch p-3 sm:p-4 pt-3 text-left active:bg-[var(--app-btn-ghost-hover)] min-h-0"
                onclick={() => onOpenProject(p)}
              >
                <Folder
                  class="text-blue-500/90 dark:text-blue-400 shrink-0 mb-2"
                  size={28}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <div class="font-semibold text-sm text-[var(--app-fg)] line-clamp-2 leading-snug min-h-[2.25rem]">
                  {p.title}
                </div>
                <div
                  class="mt-1.5 space-y-0.5 text-[9px] sm:text-[10px] leading-snug"
                  aria-label="Created {formatProjectDateTime(p.createdAt)}, last edited {formatProjectDateTime(p.updatedAt)}"
                >
                  <div class="flex flex-wrap items-baseline gap-x-1 text-[var(--app-fg-muted)]">
                    <span class="uppercase tracking-wide text-[8px] sm:text-[9px] font-semibold shrink-0"
                      >Created</span
                    >
                    <span class="text-[var(--app-fg-secondary)] tabular-nums leading-tight text-[8px] sm:text-[9px]"
                      >{formatProjectDateTime(p.createdAt)}</span
                    >
                  </div>
                  <div class="flex flex-wrap items-baseline gap-x-1 text-[var(--app-fg-muted)]">
                    <span class="uppercase tracking-wide text-[8px] sm:text-[9px] font-semibold shrink-0"
                      >Edited</span
                    >
                    <span class="text-[var(--app-fg-secondary)] tabular-nums leading-tight text-[8px] sm:text-[9px]"
                      >{formatProjectDateTime(p.updatedAt)}</span
                    >
                  </div>
                </div>
                <!-- <div
                  class="text-[9px] sm:text-[10px] text-[var(--app-fg-muted)] truncate font-mono mt-auto pt-2"
                  title="Projects/{p.folderId}"
                >
                  {p.folderId}
                </div> -->
              </button>
              <div class="absolute top-1.5 right-1">
                <button
                  type="button"
                  class="p-2 rounded-lg hover:bg-[var(--app-surface-hover)] text-[var(--app-fg-secondary)] opacity-80 group-hover:opacity-100"
                  aria-label="Project options for {p.title}"
                  onclick={(e) => toggleProjectMenu(p, e)}
                >
                  <MoreVertical size={18} />
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  {#if menuOpenProject}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="fixed inset-0 z-[390] bg-black/25"
      onclick={() => closeProjectMenu()}
      role="presentation"
    ></div>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="fixed z-[400] rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] shadow-2xl py-1"
      style={menuFixedCss}
      role="menu"
      aria-label="Project actions"
      onclick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        class="w-full text-left px-3 py-2.5 text-sm hover:bg-[var(--app-chip-bg)] flex items-center gap-2 text-[var(--app-fg)]"
        onclick={() => openRename(menuOpenProject!)}
      >
        <Pencil size={14} /> Rename
      </button>
      <button
        type="button"
        class="w-full text-left px-3 py-2.5 text-sm text-red-600 hover:bg-red-500/10 flex items-center gap-2"
        onclick={() => confirmDelete(menuOpenProject!)}
      >
        <Trash2 size={14} /> Delete
      </button>
    </div>
  {/if}

  {#if newOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="fixed inset-0 z-[400] flex items-end sm:items-center justify-center p-4 bg-black/50"
      onclick={() => {
        newOpen = false;
        newProjectError = "";
      }}
      role="presentation"
    >
      <div
        class="w-full max-w-md rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] shadow-xl p-4 space-y-4"
        role="dialog"
        aria-labelledby="new-proj-title"
        tabindex="0"
        onclick={(e) => e.stopPropagation()}
      >
        <h2 id="new-proj-title" class="text-lg font-semibold text-[var(--app-fg)]">New project</h2>
        <p class="text-xs text-[var(--app-fg-secondary)]">
          Empty <code class="text-[10px]">main.typ</code> opens in the editor. Names must be unique.
        </p>
        <input
          type="text"
          bind:value={newTitle}
          placeholder="Project title"
          class="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-elevated)] px-3 py-2.5 text-[var(--app-fg)] text-base"
          autocomplete="off"
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

  {#if renameOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="fixed inset-0 z-[400] flex items-end sm:items-center justify-center p-4 bg-black/50"
      onclick={() => {
        renameOpen = false;
        renameProjectError = "";
      }}
      role="presentation"
    >
      <div
        class="w-full max-w-md rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] shadow-xl p-4 space-y-4"
        role="dialog"
        onclick={(e) => e.stopPropagation()}
      >
        <h2 class="text-lg font-semibold text-[var(--app-fg)]">Rename project</h2>
        <p class="text-xs text-[var(--app-fg-secondary)]">
          The project folder under Files is renamed to match your title (same rules as new
          projects). Open files stay linked.
        </p>
        <input
          type="text"
          bind:value={renameTitle}
          class="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-elevated)] px-3 py-2.5 text-[var(--app-fg)] text-base"
        />
        {#if renameProjectError}
          <p class="text-sm text-red-600 dark:text-red-400" role="alert">
            {renameProjectError}
          </p>
        {/if}
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="px-4 py-2 rounded-lg text-sm text-[var(--app-fg-secondary)]"
            onclick={() => {
              renameOpen = false;
              renameProjectError = "";
            }}
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
</div>
