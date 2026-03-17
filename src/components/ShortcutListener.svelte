<script lang="ts">
  import { onMount } from "svelte";
  import { shortcuts, isKeyMatch, type ShortcutAction } from "../lib/shortcuts";

  let { onCommand } = $props<{
    onCommand: (action: ShortcutAction) => void;
  }>();

  // Multi-stroke state (e.g., Mod+K Mod+S)
  let pendingSequence: string | null = null;
  let sequenceTimeout: number | null = null;

  function handleKeydown(event: KeyboardEvent) {
    // If the editor is focused, we mostly want to let Monaco handle its own shortcuts.
    // However, some global shortcuts (Save, Sidebar, Settings) should still trigger.
    const target = event.target as HTMLElement;
    const isInsideEditor = target.closest(".monaco-editor");
    
    // Don't trigger global shortcuts if user is typing in a normal input/textarea
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
      if (!isInsideEditor) return;
    }

    const currentShortcuts = $shortcuts;
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modKey = isMac ? event.metaKey : event.ctrlKey;

    for (const shortcut of currentShortcuts) {
      const keys = shortcut.keys.split(" ");
      
      if (keys.length === 1) {
        if (isKeyMatch(event, keys[0])) {
          // If we are in the editor, only catch our specific "global" overrides
          // Most common editor shortcuts (Cmd+C, Cmd+V, Cmd+Z, Cmd+F) should be left to Monaco
          // UNLESS they are specifically mapped in our system (like Save)
          const isGlobalOverride = ['file.save', 'view.toggleSidebar', 'settings.shortcuts'].includes(shortcut.id);
          
          if (isInsideEditor && !isGlobalOverride) {
            // Let Monaco handle it
            continue;
          }

          event.preventDefault();
          event.stopPropagation();
          onCommand(shortcut.id);
          return;
        }
      } else if (keys.length === 2) {
        if (!pendingSequence) {
          if (isKeyMatch(event, keys[0])) {
            event.preventDefault();
            pendingSequence = keys[0];
            if (sequenceTimeout) clearTimeout(sequenceTimeout);
            sequenceTimeout = window.setTimeout(() => {
              pendingSequence = null;
            }, 1000); // 1s timeout for sequence
            return;
          }
        } else if (pendingSequence === keys[0]) {
          if (isKeyMatch(event, keys[1])) {
            event.preventDefault();
            onCommand(shortcut.id);
            pendingSequence = null;
            if (sequenceTimeout) clearTimeout(sequenceTimeout);
            return;
          }
        }
      }
    }
    
    // If a key was pressed that didn't match the second part of a sequence,
    // we might want to clear the sequence, but for now we let it timeout.
  }

  onMount(() => {
    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
      if (sequenceTimeout) clearTimeout(sequenceTimeout);
    };
  });
</script>
