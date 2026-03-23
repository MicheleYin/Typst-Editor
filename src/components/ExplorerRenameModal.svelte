<script lang="ts">
  let {
    open = false,
    fromPath = null as string | null,
    newName = $bindable(""),
    error = "",
    onClose,
    onConfirm,
  } = $props<{
    open: boolean;
    fromPath: string | null;
    newName: string;
    error: string;
    onClose: () => void;
    onConfirm: () => void | Promise<void>;
  }>();
</script>

{#if open && fromPath}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-[400] flex items-end justify-center sm:items-center p-4 bg-black/50"
    onclick={() => onClose()}
    role="presentation"
  >
    <div
      class="w-full max-w-md rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] shadow-xl p-4 space-y-4"
      role="dialog"
      aria-labelledby="explorer-rename-title"
      tabindex="0"
      onclick={(e) => e.stopPropagation()}
    >
      <h2
        id="explorer-rename-title"
        class="text-lg font-semibold text-[var(--app-fg)]"
      >
        Rename file
      </h2>
      <p class="text-sm text-[var(--app-fg-secondary)]">
        New name in the same folder (include the extension, e.g. <code
          class="text-[10px]">.typ</code
        >).
      </p>
      <input
        type="text"
        bind:value={newName}
        class="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-elevated)] px-3 py-2.5 text-[var(--app-fg)] text-base"
        autocomplete="off"
        autocapitalize="off"
        enterkeyhint="done"
        onkeydown={(e) => e.key === "Enter" && void onConfirm()}
      />
      {#if error}
        <p class="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      {/if}
      <div class="flex justify-end gap-2 pt-2">
        <button
          type="button"
          class="px-4 py-2 rounded-lg text-sm font-medium text-[var(--app-fg-secondary)] hover:bg-[var(--app-btn-ghost-hover)]"
          onclick={() => onClose()}
        >
          Cancel
        </button>
        <button
          type="button"
          class="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white"
          onclick={() => void onConfirm()}
        >
          Rename
        </button>
      </div>
    </div>
  </div>
{/if}
