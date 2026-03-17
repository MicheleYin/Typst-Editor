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
  category: string = "App"
) {
  // Add to editor
  editor.addCommand(keybinding, handler);

  // Add to our registry for the UI
  const item: ShortcutItem = {
    id,
    label,
    keybindingSource: "Custom",
    displayKeys: "Custom", 
    category
  };

  allShortcuts.update(items => {
    const filtered = items.filter(i => i.id !== id);
    return [...filtered, item];
  });
}
