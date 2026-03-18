<script lang="ts">
  import { Menu, X } from "lucide-svelte";

  let {
    onAction,
    landingPage = false,
  } = $props<{
    onAction: (id: string) => void;
    landingPage?: boolean;
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

  const fileItems: Item[] = [
    { id: "file-new", label: "New File" },
    { id: "file-open", label: "Open File…" },
    { id: "file-open-folder", label: "Open Folder…" },
    { id: "file-save", label: "Save", disabled: false },
    { id: "file-save-as", label: "Save As…", disabled: false },
    { id: "file-export-pdf", label: "Export PDF…", disabled: false },
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
    if (!landingPage) return false;
    return (
      item.id === "file-save" ||
      item.id === "file-save-as" ||
      item.id === "file-export-pdf"
    );
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
        <div class="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--app-fg-muted)]">
          File
        </div>
        {#each fileItems as item}
          <button
            type="button"
            disabled={fileItemDisabled(item)}
            class="w-full text-left px-4 py-2.5 text-sm text-[var(--app-fg)] hover:bg-[var(--app-chip-bg)] disabled:opacity-40 disabled:pointer-events-none active:bg-[var(--app-btn-ghost-hover)]"
            onclick={() => select(item.id)}
          >
            {item.label}
          </button>
        {/each}

        <div class="px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--app-fg-muted)]">
          Edit
        </div>
        {#each editItems as item}
          <button
            type="button"
            class="w-full text-left px-4 py-2.5 text-sm text-[var(--app-fg)] hover:bg-[var(--app-chip-bg)] active:bg-[var(--app-btn-ghost-hover)]"
            onclick={() => select(item.id)}
          >
            {item.label}
          </button>
        {/each}

        <div class="px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--app-fg-muted)]">
          View
        </div>
        {#each viewItems as item}
          <button
            type="button"
            class="w-full text-left px-4 py-2.5 text-sm text-[var(--app-fg)] hover:bg-[var(--app-chip-bg)] active:bg-[var(--app-btn-ghost-hover)]"
            onclick={() => select(item.id)}
          >
            {item.label}
          </button>
        {/each}

        <div class="px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--app-fg-muted)]">
          Help
        </div>
        {#each helpItems as item}
          <button
            type="button"
            class="w-full text-left px-4 py-2.5 text-sm text-[var(--app-fg)] hover:bg-[var(--app-chip-bg)] active:bg-[var(--app-btn-ghost-hover)]"
            onclick={() => select(item.id)}
          >
            {item.label}
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>
