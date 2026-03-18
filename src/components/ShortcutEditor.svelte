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
    $allShortcuts.filter(s => 
      s.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.category.toLowerCase().includes(searchQuery.toLowerCase())
    )
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
    <Search size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
    <input
      bind:value={searchQuery}
      type="text"
      placeholder="Search shortcuts..."
      class="w-full bg-[#1e1e1e] border border-[#333] rounded px-10 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors"
    />
  </div>
  <div class="text-[11px] text-gray-500 flex flex-col gap-1">
    <div class="flex items-center gap-2">
      <Keyboard size={14} />
      <span
        >Click a keybinding to edit. For <strong class="text-gray-400">⌘K ⌘S</strong>-style
        chords: press the first combo, then the second (or Enter after the first to keep a single
        shortcut). Backspace clears. Esc cancels.</span
      >
    </div>
  </div>
  <div class="flex-1 overflow-auto border border-[#333] rounded-md">
    <table class="w-full text-sm text-left border-collapse">
      <thead class="bg-[#1e1e1e] sticky top-0 border-b border-[#333] z-10">
        <tr>
          <th class="px-4 py-2 font-medium text-gray-400 w-1/2">Command</th>
          <th class="px-4 py-2 font-medium text-gray-400">Keybinding</th>
          <th class="px-4 py-2 font-medium text-gray-400 w-16"></th>
        </tr>
      </thead>
      <tbody class="divide-y divide-[#333]">
        {#each filteredShortcuts as shortcut}
          <tr class="hover:bg-[#2d2d2d] group transition-colors">
            <td class="px-4 py-3">
              <div class="flex flex-col">
                <span class="text-gray-200">{shortcut.label}</span>
                <span class="text-[10px] text-gray-500">{shortcut.category}</span>
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
                    class="text-[10px] bg-[#333] hover:bg-[#444] px-2 py-1 rounded text-gray-300"
                  >
                    Cancel
                  </button>
                </div>
              {:else}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="flex items-center gap-2 cursor-pointer" onclick={() => startEditing(shortcut.id)}>
                  <div class="bg-[#333] px-2 py-1 rounded text-gray-300 font-mono text-xs min-h-[24px] min-w-[40px] flex items-center justify-center">
                    {$shortcutOverrides[shortcut.id] ? formatKeys($shortcutOverrides[shortcut.id]) : (shortcut.displayKeys || "None")}
                  </div>
                  <Edit2 size={12} class="text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              {/if}
            </td>
            <td class="px-4 py-3 text-right">
              {#if $shortcutOverrides[shortcut.id]}
                <button 
                  onclick={() => resetShortcut(shortcut.id)}
                  class="p-1 hover:bg-[#444] rounded text-gray-500 hover:text-gray-300 transition-colors"
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
            <td colspan="3" class="px-4 py-10 text-center text-gray-500">
              No shortcuts found matching "{searchQuery}"
            </td>
          </tr>
        {/if}
      </tbody>
    </table>
  </div>

 
</div>
