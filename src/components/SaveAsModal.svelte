<script lang="ts">
  let {
    open = false,
    intent = "saveAs" as "saveAs" | "newFile",
    iosProjectPath = null as string | null,
    iosProjectTitle = "",
    appName = "",
    filename = $bindable("untitled.typ"),
    onClose,
    onConfirm,
  } = $props<{
    open: boolean;
    intent: "saveAs" | "newFile";
    iosProjectPath: string | null;
    iosProjectTitle: string;
    appName: string;
    filename: string;
    onClose: () => void;
    onConfirm: () => void | Promise<void>;
  }>();
</script>

{#if open}
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
      aria-labelledby="save-as-title"
      tabindex="0"
      onclick={(e) => e.stopPropagation()}
    >
      <h2 id="save-as-title" class="text-lg font-semibold text-[var(--app-fg)]">
        {intent === "newFile" && iosProjectPath
          ? "New file"
          : intent === "newFile"
            ? "Save document as…"
            : "Save as…"}
      </h2>
      <p class="text-sm text-[var(--app-fg-secondary)]">
        {#if intent === "newFile" && iosProjectPath}
          Creates a new file in this project and saves it immediately. Your current file is saved first if it has
          unsaved changes. Add <code class="text-[10px]">.typ</code> or another extension in the name; bare names get
          <code class="text-[10px]">.typ</code>.
        {:else if iosProjectPath}
          Saved inside project “{iosProjectTitle}” (app Documents only).
        {:else}
          File name in app Documents (shown in Files → On My iPhone → {appName})
        {/if}
      </p>
      <input
        type="text"
        bind:value={filename}
        class="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-elevated)] px-3 py-2.5 text-[var(--app-fg)] text-base"
        placeholder="untitled.typ"
        autocomplete="off"
        autocapitalize="off"
        enterkeyhint="done"
      />
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
          Save
        </button>
      </div>
    </div>
  </div>
{/if}
