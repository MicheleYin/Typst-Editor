import { writable } from 'svelte/store';

export type ShortcutAction = string;

export interface ShortcutItem {
  id: string;
  label: string;
  keybindingSource: string; // "Built-in" or "Custom"
  displayKeys: string;      // Formatted for display (e.g., ⌘S)
  category: string;
  isOverride?: boolean;
}

// Store for ALL available shortcuts (discovered + registered)
export const allShortcuts = writable<ShortcutItem[]>([]);

// Store for user's custom overrides
export const shortcutOverrides = writable<Record<string, string>>(getStoredOverrides());

function getStoredOverrides(): Record<string, string> {
  const stored = localStorage.getItem('typst-editor-shortcut-overrides');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.error('Failed to parse shortcut overrides', e);
    }
  }
  return {};
}

shortcutOverrides.subscribe(value => {
  localStorage.setItem('typst-editor-shortcut-overrides', JSON.stringify(value));
});

export function formatKeys(keys: string): string {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  return keys
    .replace(/Mod/g, isMac ? '⌘' : 'Ctrl')
    .replace(/Shift/g, '⇧')
    .replace(/Alt/g, '⌥')
    .replace(/Plus/g, '+')
    .replace(/Minus/g, '-')
    .replace(/ /g, ' ');
}

/**
 * Discovers all built-in actions and their keybindings from a Monaco editor instance
 */
export function discoverMonacoActions(editor: any) {
  const actions = editor.getActions();
  const kbService = editor._standaloneKeybindingService;
  
  const discovered: ShortcutItem[] = actions.map((action: any) => {
    let displayKeys = "";
    if (kbService && typeof kbService.lookupKeybindings === 'function') {
      try {
        const kbs = kbService.lookupKeybindings(action.id);
        if (kbs && kbs.length > 0) {
          displayKeys = kbs[0].getLabel();
        }
      } catch (e) {
        console.warn(`Failed to lookup keybindings for action ${action.id}:`, e);
      }
    }

    return {
      id: action.id,
      label: action.label,
      keybindingSource: "Built-in",
      displayKeys: displayKeys,
      category: "Monaco",
    };
  });

  console.log(`Discovered ${discovered.length} Monaco actions`);

  allShortcuts.update(items => {
    const existingIds = new Set(items.map(i => i.id));
    const newItems = discovered.filter(d => !existingIds.has(d.id));
    return [...items, ...newItems];
  });
}

/**
 * Registers an app shortcut with the editor and tracks it
 */
export function registerShortcut(
  editor: any,
  _monaco: any,
  keybinding: number,
  handler: () => void,
  label: string,
  id: string,
  displayKeys: string,
  category: string = "App"
) {
  // Add to editor
  editor.addCommand(keybinding, handler);

  // Add to our registry for the UI
  const item: ShortcutItem = {
    id,
    label,
    keybindingSource: "Custom",
    displayKeys: formatKeys(displayKeys), 
    category
  };

  allShortcuts.update(items => {
    const filtered = items.filter(i => i.id !== id);
    return [...filtered, item];
  });
}

/**
 * Parses a string like "Mod+S" or "Shift+Alt+P" into Monaco KeyCode bits
 */
export function parseKeybinding(keyString: string, monaco: any): number {
  const parts = keyString.split('+');
  let result = 0;
  
  for (const part of parts) {
    if (part === 'Mod') result |= monaco.KeyMod.CtrlCmd;
    else if (part === 'Shift') result |= monaco.KeyMod.Shift;
    else if (part === 'Alt') result |= monaco.KeyMod.Alt;
    else if (part === 'Meta') result |= monaco.KeyMod.WinCtrl;
    else {
      // Find keycode by name
      const code = monaco.KeyCode[part];
      if (code !== undefined) result |= code;
      else if (part.length === 1) {
        // Handle single characters
        const charCode = monaco.KeyCode[`Key${part.toUpperCase()}`];
        if (charCode !== undefined) result |= charCode;
      }
    }
  }
  return result;
}

/**
 * Applies all shortcuts (defaults + overrides) to the editor
 */
export function applyShortcutsToEditor(editor: any, monaco: any, overrides: Record<string, string>) {
  // For each override, we find the action and re-register the command
  allShortcuts.subscribe(shortcuts => {
    for (const [id, keyString] of Object.entries(overrides)) {
      const shortcut = shortcuts.find(s => s.id === id);
      if (shortcut) {
        const keybinding = parseKeybinding(keyString, monaco);
        // Note: This adds a NEW command, it doesn't necessarily remove the old one
        // in Monaco Standalone, but it will win for that keybinding.
        editor.addCommand(keybinding, () => {
          // This is a bit tricky since we don't have the original handler here.
          // We might need to store the handlers or trigger a global event.
          console.log(`Triggering overridden shortcut for ${id}`);
          // For now, we'll emit an event that App.svelte can catch
          const event = new CustomEvent('shortcut-trigger', { detail: id });
          window.dispatchEvent(event);
        });
      }
    }
  })();
}
