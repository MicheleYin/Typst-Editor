<script lang="ts">
  let {
    open = false,
    title = $bindable(""),
    error = "",
    onClose,
    onImport,
  } = $props<{
    open: boolean;
    title: string;
    error: string;
    onClose: () => void;
    onImport: () => void | Promise<void>;
  }>();
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-[400] flex items-end sm:items-center justify-center p-4 bg-black/50"
    onclick={() => onClose()}
    role="presentation"
  >
    <div
      class="w-full max-w-md rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] shadow-xl p-4 space-y-4"
      role="dialog"
      aria-labelledby="import-folder-title"
      tabindex="0"
      onclick={(e) => e.stopPropagation()}
    >
      <h2 id="import-folder-title" class="text-lg font-semibold text-[var(--app-fg)]">Import project from ZIP</h2>
      <p class="text-xs text-[var(--app-fg-secondary)]">
        The archive is extracted into a new project (.git, node_modules, etc. skipped). A single top-level folder in the
        ZIP is stripped. Missing <code class="text-[10px]">main.typ</code> is added.
      </p>
      <input
        type="text"
        bind:value={title}
        placeholder="Project title"
        class="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-elevated)] px-3 py-2.5 text-[var(--app-fg)] text-base"
        autocomplete="off"
      />
      {#if error}
        <p class="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>
      {/if}
      <div class="flex justify-end gap-2">
        <button
          type="button"
          class="px-4 py-2 rounded-lg text-sm text-[var(--app-fg-secondary)]"
          onclick={() => onClose()}
        >
          Cancel
        </button>
        <button
          type="button"
          class="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white"
          onclick={() => void onImport()}
        >
          Import
        </button>
      </div>
    </div>
  </div>
{/if}
