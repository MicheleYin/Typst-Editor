<script lang="ts">
  import {
    allShortcuts,
    shortcutOverrides,
    formatKeys,
    physicalKeyTokenFromEvent,
    findShortcutKeyCollisions,
  } from "../lib/shortcuts";
  import { Search, Keyboard, RotateCcw, Edit2, AlertTriangle } from "lucide-svelte";

  let keyCollisions = $derived(
    findShortcutKeyCollisions($allShortcuts, $shortcutOverrides),
  );

  let searchQuery = $state("");
  let editingId = $state<string | null>(null);
  let recordedKeys = $state("");
  /** First chord when recording a two-key sequence (⌘K then ⌘S) */
  let pendingFirstChord = $state("");

  let filteredShortcuts = $derived(
    $allShortcuts.filter((s) => {
      const q = searchQuery.toLowerCase();
      return (
        s.label.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q)
      );
    }),
  );

  function startEditing(id: string) {
    editingId = id;
    recordedKeys = "";
    pendingFirstChord = "";
    window.addEventListener("keydown", recordKey);
  }

  function stopEditing() {
    editingId = null;
    pendingFirstChord = "";
    window.removeEventListener("keydown", recordKey);
  }

  function recordKey(e: KeyboardEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (e.key === "Escape") {
      stopEditing();
      return;
    }

    if (e.key === "Backspace") {
      pendingFirstChord = "";
      recordedKeys = "";
      return;
    }

    if (e.key === "Enter" && recordedKeys) {
      saveShortcut();
      return;
    }

    if (e.key === "Enter") return;

    let parts: string[] = [];
    if (e.metaKey || e.ctrlKey) parts.push("Mod");
    if (e.shiftKey) parts.push("Shift");
    if (e.altKey) parts.push("Alt");

    const mainToken = physicalKeyTokenFromEvent(e);
    if (
      !mainToken ||
      ["Control", "Shift", "Alt", "Meta"].includes(e.key)
    ) {
      return;
    }
    parts.push(mainToken);
    const chord = parts.join("+");

    if (!pendingFirstChord) {
      pendingFirstChord = chord;
      recordedKeys = chord;
      return;
    }

    recordedKeys = `${pendingFirstChord} ${chord}`;
    pendingFirstChord = "";
  }

  function saveShortcut() {
    if (editingId && recordedKeys) {
      shortcutOverrides.update((current: Record<string, string>) => ({
        ...current,
        [editingId!]: recordedKeys
      }));
    }
    stopEditing();
  }

  function resetShortcut(id: string) {
    shortcutOverrides.update((current: Record<string, string>) => {
      const { [id]: _, ...rest } = current;
      return rest;
    });
  }
</script>

<div class="flex flex-col gap-4 h-full min-h-[400px]">
  {#if keyCollisions.length > 0}
    <div
      role="alert"
      class="rounded-lg border border-amber-600/50 bg-amber-950/40 px-3 py-2.5 text-sm text-amber-100"
    >
      <div class="flex items-start gap-2">
        <AlertTriangle
          class="shrink-0 text-amber-400 mt-0.5"
          size={18}
          aria-hidden="true"
        />
        <div class="min-w-0 space-y-2">
          <p class="font-medium text-amber-200">
            Multiple commands use the same shortcut
          </p>
          <ul class="list-none space-y-1.5 text-amber-100/90 text-xs">
            {#each keyCollisions as group}
              <li>
                <span class="font-mono font-semibold text-amber-300"
                  >{group.displayKey}</span
                >
                <span class="text-amber-200/70"> — </span>
                {group.commands.map((c) => c.label).join(" · ")}
              </li>
            {/each}
          </ul>
        </div>
      </div>
    </div>
  {/if}

  <div class="relative">
    <Search size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--app-fg-muted)]" />
    <input
      bind:value={searchQuery}
      type="text"
      placeholder="Search by name, command id, or category…"
      class="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-10 py-2 text-sm text-[var(--app-input-fg)] placeholder:text-[var(--app-fg-muted)] focus:outline-none focus:border-blue-500 transition-colors"
    />
  </div>
  <div class="text-[11px] text-[var(--app-fg-muted)] flex flex-col gap-1">
    <div class="flex items-center gap-2">
      <Keyboard size={14} />
      <span
        >Click a keybinding to edit. For <strong class="text-[var(--app-fg-secondary)]">⌘K ⌘S</strong>-style
        chords: press the first combo, then the second (or Enter after the first to keep a single
        shortcut). Backspace clears. Esc cancels.</span
      >
    </div>
  </div>
  <div class="flex-1 overflow-auto border border-[var(--app-border)] rounded-md">
    <table class="w-full text-sm text-left border-collapse text-[var(--app-fg)]">
      <thead class="bg-[var(--app-input-bg)] sticky top-0 border-b border-[var(--app-border)] z-10">
        <tr>
          <th class="px-4 py-2 font-medium text-[var(--app-fg-secondary)] w-1/2">Command</th>
          <th class="px-4 py-2 font-medium text-[var(--app-fg-secondary)]">Keybinding</th>
          <th class="px-4 py-2 font-medium text-[var(--app-fg-secondary)] w-16"></th>
        </tr>
      </thead>
      <tbody class="divide-y divide-[var(--app-border)]">
        {#each filteredShortcuts as shortcut}
          <tr class="hover:bg-[var(--app-surface-elevated)] group transition-colors">
            <td class="px-4 py-3">
              <div class="flex flex-col gap-0.5 min-w-0">
                <span class="text-[var(--app-fg)]">{shortcut.label}</span>
                <span class="text-[10px] text-[var(--app-fg-muted)] font-mono truncate" title={shortcut.id}
                  >{shortcut.id}</span
                >
                <span class="text-[10px] text-[var(--app-fg-muted)]">{shortcut.category}</span>
              </div>
            </td>
            <td class="px-4 py-3">
              {#if editingId === shortcut.id}
                <div class="flex items-center gap-2">
                  <div class="bg-blue-600/20 border border-blue-500 px-2 py-1 rounded text-blue-400 font-mono text-xs min-w-[100px] text-center">
                    {recordedKeys ? formatKeys(recordedKeys) : "Type keys..."}
                  </div>
                  <button 
                    onclick={saveShortcut}
                    class="text-[10px] bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded text-white"
                  >
                    Save
                  </button>
                  <button 
                    onclick={stopEditing}
                    class="text-[10px] bg-[var(--app-btn-ghost-hover)] hover:opacity-90 px-2 py-1 rounded text-[var(--app-fg)]"
                  >
                    Cancel
                  </button>
                </div>
              {:else}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="flex items-center gap-2 cursor-pointer" onclick={() => startEditing(shortcut.id)}>
                  <div class="bg-[var(--app-btn-ghost-hover)] px-2 py-1 rounded text-[var(--app-fg)] font-mono text-xs min-h-[24px] min-w-[40px] flex items-center justify-center">
                    {$shortcutOverrides[shortcut.id] ? formatKeys($shortcutOverrides[shortcut.id]) : (shortcut.displayKeys || "None")}
                  </div>
                  <Edit2 size={12} class="text-[var(--app-fg-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              {/if}
            </td>
            <td class="px-4 py-3 text-right">
              {#if $shortcutOverrides[shortcut.id]}
                <button 
                  onclick={() => resetShortcut(shortcut.id)}
                  class="p-1 hover:bg-[var(--app-surface-hover)] rounded text-[var(--app-fg-muted)] hover:text-[var(--app-fg)] transition-colors"
                  title="Reset to Default"
                >
                  <RotateCcw size={14} />
                </button>
              {/if}
            </td>
          </tr>
        {/each}
        {#if filteredShortcuts.length === 0}
          <tr>
            <td colspan="3" class="px-4 py-10 text-center text-[var(--app-fg-muted)]">
              No shortcuts found matching "{searchQuery}"
            </td>
          </tr>
        {/if}
      </tbody>
    </table>
  </div>

 
</div>
