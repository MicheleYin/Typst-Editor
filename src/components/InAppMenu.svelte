<script lang="ts">
  import { Menu, X, ChevronLeft } from "lucide-svelte";
  import { shortcutOverrides, menuShortcutLabel } from "../lib/shortcuts";

  let {
    onAction,
    landingPage = false,
    iosMenuHub = false,
    iosMenuProject = false,
    hubAllowsFolderImport = false,
    /** Desktop: open folder on disk (no ZIP on hub). */
    hubDirectFolders = false,
    /** When false, File → Export… is disabled (e.g. current file is not `.typ`). */
    exportTypstEnabled = true,
  } = $props<{
    onAction: (id: string) => void;
    landingPage?: boolean;
    iosMenuHub?: boolean;
    iosMenuProject?: boolean;
    hubAllowsFolderImport?: boolean;
    hubDirectFolders?: boolean;
    exportTypstEnabled?: boolean;
  }>();

  let open = $state(false);

  function close() {
    open = false;
  }

  function select(id: string) {
    onAction(id);
    close();
  }

  type Item = { id: string; label: string; disabled?: boolean };

  const hubFileItemsZip: Item = {
    id: "ios-import-folder-project",
    label: "Import from ZIP…",
  };
  const hubFileItemsFolder: Item = {
    id: "desktop-import-folder",
    label: "Import folder…",
  };

  const hubFileItems = $derived<Item[]>(
    iosMenuHub
      ? hubDirectFolders
        ? [
            {
              id: "desktop-open-project-folder",
              label: "Open folder on disk…",
            },
          ]
        : hubAllowsFolderImport
          ? [hubFileItemsFolder, hubFileItemsZip]
          : [hubFileItemsZip]
      : [],
  );

  const iosProjectFileItems: Item[] = [
    { id: "ios-back-projects", label: "All projects" },
    { id: "file-new", label: "New File" },
    { id: "ios-import-typ", label: "Import .typ…" },
    { id: "ios-export-project", label: "Export project…" },
    { id: "file-save", label: "Save", disabled: false },
    { id: "file-save-as", label: "Save As…", disabled: false },
    { id: "file-export-typst", label: "Export…", disabled: false },
  ];

  const editItems: Item[] = [
    { id: "edit-undo", label: "Undo" },
    { id: "edit-redo", label: "Redo" },
    { id: "edit-cut", label: "Cut" },
    { id: "edit-copy", label: "Copy" },
    { id: "edit-paste", label: "Paste" },
    { id: "edit-select-all", label: "Select All" },
  ];

  const viewItems: Item[] = [
    { id: "view-zoom-in", label: "Zoom In" },
    { id: "view-zoom-out", label: "Zoom Out" },
    { id: "view-reset-zoom", label: "Reset Zoom" },
    { id: "view-toggle-sidebar", label: "Toggle Sidebar" },
  ];

  const helpItems: Item[] = [
    { id: "help-faq", label: "FAQ" },
    { id: "help-fonts", label: "Fonts…" },
    { id: "help-package-cache", label: "Package Cache…" },
    { id: "help-shortcuts", label: "Keyboard Shortcuts" },
  ];

  function fileItemDisabled(item: Item): boolean {
    if (item.id === "file-export-typst" && !exportTypstEnabled) {
      return true;
    }
    if (iosMenuHub) {
      return false;
    }
    if (!landingPage) return false;
    return (
      item.id === "file-save" ||
      item.id === "file-save-as" ||
      item.id === "file-export-typst"
    );
  }

  const fileItems = $derived(
    iosMenuProject ? iosProjectFileItems : hubFileItems,
  );

  function hint(id: string): string {
    return menuShortcutLabel(id, $shortcutOverrides);
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="relative shrink-0">
  <button
    type="button"
    class="p-1.5 rounded transition-colors text-[var(--app-fg-secondary)] hover:bg-[var(--app-btn-ghost-hover)] hover:text-[var(--app-link)]"
    title="Menu"
    aria-label="App menu"
    aria-expanded={open}
    aria-haspopup="true"
    onclick={() => (open = !open)}
  >
    <Menu size={20} aria-hidden="true" />
  </button>

  {#if open}
    <div
      class="fixed inset-0 z-[250] bg-black/30"
      onclick={close}
      role="presentation"
    ></div>
    <div
      class="fixed z-[251] left-2 right-2 top-[3.25rem] max-h-[min(72vh,520px)] overflow-y-auto rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] shadow-xl flex flex-col"
      role="dialog"
      aria-label="App menu"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
    >
      <div
        class="flex items-center justify-between px-3 py-2 border-b border-[var(--app-border)] sticky top-0 bg-[var(--app-bg)]"
      >
        <span class="text-sm font-semibold text-[var(--app-fg)]">Menu</span>
        <button
          type="button"
          class="p-1.5 rounded hover:bg-[var(--app-btn-ghost-hover)] text-[var(--app-icon-muted)]"
          aria-label="Close menu"
          onclick={close}
        >
          <X size={18} />
        </button>
      </div>

      <div class="py-1">
        {#if fileItems.length > 0}
          <div class="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--app-fg-muted)]">
            File
          </div>
          {#each fileItems as item}
            <button
              type="button"
              disabled={fileItemDisabled(item)}
              class="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-[var(--app-chip-bg)] disabled:opacity-40 disabled:pointer-events-none active:bg-[var(--app-btn-ghost-hover)] {item.id ===
              'ios-back-projects' || item.id === 'desktop-import-folder'
                ? 'text-[var(--app-fg-secondary)] hover:text-[var(--app-fg)]'
                : 'text-[var(--app-fg)]'}"
              onclick={() => select(item.id)}
            >
              <span class="min-w-0 flex items-center gap-2 truncate">
                {#if item.id === "ios-back-projects"}
                  <ChevronLeft
                    size={18}
                    class="shrink-0 text-[var(--app-icon-muted)]"
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                {/if}
                <span class="truncate">{item.label}</span>
              </span>
              {#if hint(item.id)}
                <span
                  class="shrink-0 text-[11px] font-medium tabular-nums tracking-tight text-[var(--app-fg-muted)] px-1.5 py-0.5 rounded-md bg-[var(--app-surface-elevated)] border border-[var(--app-border)]"
                  aria-hidden="true"
                >
                  {hint(item.id)}
                </span>
              {/if}
            </button>
          {/each}
        {/if}

        {#if iosMenuProject}
          <div class="px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--app-fg-muted)]">
            Edit
          </div>
          {#each editItems as item}
            <button
              type="button"
              class="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-sm text-[var(--app-fg)] hover:bg-[var(--app-chip-bg)] active:bg-[var(--app-btn-ghost-hover)]"
              onclick={() => select(item.id)}
            >
              <span>{item.label}</span>
              {#if hint(item.id)}
                <span
                  class="shrink-0 text-[11px] font-medium tabular-nums tracking-tight text-[var(--app-fg-muted)] px-1.5 py-0.5 rounded-md bg-[var(--app-surface-elevated)] border border-[var(--app-border)]"
                  aria-hidden="true"
                >
                  {hint(item.id)}
                </span>
              {/if}
            </button>
          {/each}

          <div class="px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--app-fg-muted)]">
            View
          </div>
          {#each viewItems as item}
            <button
              type="button"
              class="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-sm text-[var(--app-fg)] hover:bg-[var(--app-chip-bg)] active:bg-[var(--app-btn-ghost-hover)]"
              onclick={() => select(item.id)}
            >
              <span>{item.label}</span>
              {#if hint(item.id)}
                <span
                  class="shrink-0 text-[11px] font-medium tabular-nums tracking-tight text-[var(--app-fg-muted)] px-1.5 py-0.5 rounded-md bg-[var(--app-surface-elevated)] border border-[var(--app-border)]"
                  aria-hidden="true"
                >
                  {hint(item.id)}
                </span>
              {/if}
            </button>
          {/each}
        {/if}

        <div class="px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--app-fg-muted)]">
          Help
        </div>
        {#each helpItems as item}
          <button
            type="button"
            class="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-sm text-[var(--app-fg)] hover:bg-[var(--app-chip-bg)] active:bg-[var(--app-btn-ghost-hover)]"
            onclick={() => select(item.id)}
          >
            <span>{item.label}</span>
            {#if hint(item.id)}
              <span
                class="shrink-0 text-[11px] font-medium tabular-nums tracking-tight text-[var(--app-fg-muted)] px-1.5 py-0.5 rounded-md bg-[var(--app-surface-elevated)] border border-[var(--app-border)]"
                aria-hidden="true"
              >
                {hint(item.id)}
              </span>
            {/if}
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>
