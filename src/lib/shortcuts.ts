import { writable } from 'svelte/store';

export type ShortcutAction = string;

/** App-only command ids (not Monaco editor.action.*). */
export const APP_COMMAND_IDS = new Set([
  'file.new',
  'file.open',
  'file.openFolder',
  'file.save',
  'file.saveAs',
  'view.zoomIn',
  'view.zoomOut',
  'view.resetZoom',
  'view.toggleSidebar',
  'view.nextPage',
  'view.prevPage',
  'settings.shortcuts',
]);

const APP_SHORTCUT_LABELS: Record<string, { label: string; category: string }> = {
  'file.new': { label: 'New File', category: 'File' },
  'file.open': { label: 'Open File', category: 'File' },
  'file.openFolder': { label: 'Open Folder', category: 'File' },
  'file.save': { label: 'Save File', category: 'File' },
  'file.saveAs': { label: 'Save As', category: 'File' },
  'view.zoomIn': { label: 'Zoom In', category: 'View' },
  'view.zoomOut': { label: 'Zoom Out', category: 'View' },
  'view.resetZoom': { label: 'Reset Zoom', category: 'View' },
  'view.toggleSidebar': { label: 'Toggle Sidebar', category: 'View' },
  'view.nextPage': { label: 'Next Page', category: 'View' },
  'view.prevPage': { label: 'Previous Page', category: 'View' },
  'settings.shortcuts': { label: 'Keyboard Shortcuts', category: 'Settings' },
};

/** Parseable default chords (must match matchesDisplayKeys). */
export const APP_SHORTCUT_DEFAULT_KEYS: Record<string, string> = {
  'file.new': 'Mod+N',
  'file.open': 'Mod+O',
  'file.openFolder': 'Mod+Shift+O',
  'file.save': 'Mod+S',
  'file.saveAs': 'Mod+Shift+S',
  'view.zoomIn': 'Mod+=',
  'view.zoomOut': 'Mod+-',
  'view.resetZoom': 'Mod+0',
  'view.toggleSidebar': 'Mod+B',
  'view.nextPage': 'Right',
  'view.prevPage': 'Left',
  'settings.shortcuts': 'Mod+,',
};

function isMacOS(): boolean {
  return /Mac/i.test(navigator.userAgent || navigator.platform || '');
}

/** Encode VS Code chord → monaco keybinding int (matches parseKeybinding). */
function chordToMonacoInt(chord: {
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  keyCode: number;
}): number {
  const isMac = isMacOS();
  let n = chord.keyCode & 255;
  if (chord.shiftKey) n |= 1024;
  if (chord.altKey) n |= 512;
  if (isMac) {
    if (chord.metaKey) n |= 2048;
    if (chord.ctrlKey) n |= 256;
  } else {
    if (chord.ctrlKey) n |= 2048;
    if (chord.metaKey) n |= 256;
  }
  return n;
}

/** Normalize recorded keys (e.g. ArrowRight) for matching. */
export function normalizeKeySpec(spec: string): string {
  return spec
    .split('+')
    .map((p) => {
      const t = p.trim();
      if (t === 'ArrowRight') return 'Right';
      if (t === 'ArrowLeft') return 'Left';
      if (t === 'ArrowUp') return 'Up';
      if (t === 'ArrowDown') return 'Down';
      return t;
    })
    .join('+');
}

/** Match keydown against our display spec: "Mod+S", "Mod+Shift+O", "Right", "Mod+," */
export function matchesDisplayKeys(e: KeyboardEvent, spec: string): boolean {
  const specN = normalizeKeySpec(spec);
  const isMac = isMacOS();
  const parts = specN.split('+').map((p) => p.trim());
  let wantMod = false;
  let wantShift = false;
  let wantAlt = false;
  const keys: string[] = [];
  for (const p of parts) {
    if (p === 'Mod') wantMod = true;
    else if (p === 'Shift') wantShift = true;
    else if (p === 'Alt') wantAlt = true;
    else keys.push(p);
  }
  const keyToken = keys.join('+');

  if (wantMod) {
    if (isMac ? !e.metaKey : !e.ctrlKey) return false;
  } else {
    if (e.metaKey || e.ctrlKey) return false;
  }
  if (e.shiftKey !== wantShift) return false;
  if (e.altKey !== wantAlt) return false;

  if (keyToken === 'Right')
    return e.key === 'ArrowRight' || e.code === 'ArrowRight';
  if (keyToken === 'Left')
    return e.key === 'ArrowLeft' || e.code === 'ArrowLeft';
  if (keyToken === 'Up')
    return e.key === 'ArrowUp' || e.code === 'ArrowUp';
  if (keyToken === 'Down')
    return e.key === 'ArrowDown' || e.code === 'ArrowDown';
  if (keyToken === ',') return e.key === ',' || e.code === 'Comma';
  if (keyToken === '0') return e.key === '0' || e.code === 'Digit0';
  if (keyToken === '=' || keyToken === 'Plus')
    return e.key === '=' || e.key === '+' || e.code === 'Equal';
  if (keyToken === '-' || keyToken === 'Minus')
    return e.key === '-' || e.key === '_' || e.code === 'Minus';
  if (keyToken.length === 1)
    return e.key.toLowerCase() === keyToken.toLowerCase();
  const code = `Key${keyToken.toUpperCase()}`;
  if (e.code === code) return true;
  return e.key.toLowerCase() === keyToken.toLowerCase();
}

export interface ShortcutItem {
  id: string;
  label: string;
  keybindingSource: string;
  displayKeys: string;
  category: string;
  isOverride?: boolean;
}

export const allShortcuts = writable<ShortcutItem[]>([]);
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

shortcutOverrides.subscribe((value) => {
  localStorage.setItem('typst-editor-shortcut-overrides', JSON.stringify(value));
});

export function formatKeys(keys: string): string {
  const isMac = isMacOS();
  return keys
    .replace(/Mod/g, isMac ? '⌘' : 'Ctrl')
    .replace(/Shift/g, '⇧')
    .replace(/Alt/g, '⌥')
    .replace(/Plus/g, '+')
    .replace(/Minus/g, '-')
    .replace(/ /g, ' ');
}

/**
 * Merge Typst app shortcuts into the shortcuts list (for Shortcut Editor UI).
 */
export function ensureAppShortcutMetadataInStore() {
  const appItems: ShortcutItem[] = [...APP_COMMAND_IDS].map((id) => {
    const m = APP_SHORTCUT_LABELS[id];
    const def = APP_SHORTCUT_DEFAULT_KEYS[id];
    return {
      id,
      label: m?.label ?? id,
      keybindingSource: 'Custom',
      displayKeys: def ? formatKeys(def) : '',
      category: m?.category ?? 'App',
    };
  });
  allShortcuts.update((items) => {
    const rest = items.filter((i) => !APP_COMMAND_IDS.has(i.id));
    return [...rest, ...appItems];
  });
}

export function discoverMonacoActions(editor: any) {
  const actions = editor.getActions();
  const kbService = editor._standaloneKeybindingService as
    | {
        lookupKeybinding?: (id: string) => { getLabel: () => string; _chords?: unknown[] } | undefined;
        getKeybindings?: () => Array<{
          command: string | null;
          resolvedKeybinding?: { getLabel: () => string };
        }>;
      }
    | undefined;

  const commandToLabel = new Map<string, string>();
  if (kbService?.getKeybindings) {
    try {
      for (const item of kbService.getKeybindings()) {
        if (!item.command || !item.resolvedKeybinding) continue;
        if (!commandToLabel.has(item.command)) {
          commandToLabel.set(item.command, item.resolvedKeybinding.getLabel());
        }
      }
    } catch {
      /* ignore */
    }
  }

  const discovered: ShortcutItem[] = actions.map((action: any) => {
    let displayKeys = '';
    try {
      if (kbService?.lookupKeybinding) {
        const resolved = kbService.lookupKeybinding(action.id);
        displayKeys = resolved?.getLabel?.() ?? '';
      }
      if (!displayKeys) {
        displayKeys = commandToLabel.get(action.id) ?? '';
      }
    } catch (e) {
      console.warn(`Failed to lookup keybinding for action ${action.id}:`, e);
    }

    return {
      id: action.id,
      label: action.label,
      keybindingSource: 'Built-in',
      displayKeys,
      category: 'Monaco',
    };
  });

  allShortcuts.update((items) => {
    const existingIds = new Set(items.map((i) => i.id));
    const newItems = discovered.filter((d) => !existingIds.has(d.id));
    return [...items, ...newItems];
  });
}

let appShortcutDisposers: (() => void)[] = [];
let monacoOverrideDisposable: { dispose: () => void } | null = null;

export function disposeAllShortcutBindings() {
  appShortcutDisposers.forEach((d) => d());
  appShortcutDisposers = [];
  monacoOverrideDisposable?.dispose();
  monacoOverrideDisposable = null;
}

/**
 * App shortcuts: only window capture listeners, torn down and rebuilt when overrides change.
 */
export function syncAppShortcuts(
  overrides: Record<string, string>,
  handlers: Record<string, () => void | Promise<void>>
) {
  appShortcutDisposers.forEach((d) => d());
  appShortcutDisposers = [];

  for (const id of APP_COMMAND_IDS) {
    const handler = handlers[id];
    if (!handler) continue;
    const raw = overrides[id] ?? APP_SHORTCUT_DEFAULT_KEYS[id];
    if (!raw) continue;
    const keySpec = normalizeKeySpec(raw);

    const onKey = (e: KeyboardEvent) => {
      if (!matchesDisplayKeys(e, keySpec)) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName ?? '';
      if (
        (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') &&
        !t?.closest('.monaco-editor')
      ) {
        return;
      }

      const inMonacoTextarea = !!t?.closest?.('.monaco-editor textarea');

      if (keySpec.includes('Mod')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        void Promise.resolve(handler());
        return;
      }

      if (inMonacoTextarea) return;

      e.preventDefault();
      e.stopImmediatePropagation();
      void Promise.resolve(handler());
    };

    window.addEventListener('keydown', onKey, true);
    appShortcutDisposers.push(() => window.removeEventListener('keydown', onKey, true));
  }
}

const KEY_ALIASES: Record<string, string> = {
  ArrowLeft: 'LeftArrow',
  ArrowRight: 'RightArrow',
  ArrowUp: 'UpArrow',
  ArrowDown: 'DownArrow',
  Space: 'Space',
  Enter: 'Enter',
  Escape: 'Escape',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
};

/**
 * Parses "Mod+S", "Shift+Alt+P", "ArrowRight", single letters, etc.
 */
export function parseKeybinding(keyString: string, monaco: any): number {
  const parts = keyString.split('+').map((p) => p.trim());
  let result = 0;
  for (const part of parts) {
    if (part === 'Mod') result |= monaco.KeyMod.CtrlCmd;
    else if (part === 'Shift') result |= monaco.KeyMod.Shift;
    else if (part === 'Alt') result |= monaco.KeyMod.Alt;
    else if (part === 'Meta') result |= monaco.KeyMod.WinCtrl;
    else {
      const aliased = KEY_ALIASES[part] ?? part;
      const code = monaco.KeyCode[aliased];
      if (code !== undefined) result |= code;
      else if (part.length === 1) {
        const k = monaco.KeyCode[`Key${part.toUpperCase()}`];
        if (k !== undefined) result |= k;
      }
    }
  }
  return result;
}

/**
 * Monaco editor actions: remove default primary binding, bind new key. Disposed and reapplied on every change.
 */
export function applyMonacoShortcutOverrides(editor: any, monaco: any, overrides: Record<string, string>) {
  monacoOverrideDisposable?.dispose();
  monacoOverrideDisposable = null;

  const kbService = editor._standaloneKeybindingService as
    | { lookupKeybinding?: (id: string) => { _chords?: Array<{ keyCode: number; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean }> } | undefined }
    | undefined;

  if (!kbService?.lookupKeybinding || !monaco?.editor?.addKeybindingRules) return;

  const rules: Array<{ keybinding: number; command: string }> = [];

  for (const [id, keyString] of Object.entries(overrides)) {
    if (APP_COMMAND_IDS.has(id)) continue;
    const newKb = parseKeybinding(normalizeKeySpec(keyString), monaco);
    if (!newKb) continue;

    const resolved = kbService.lookupKeybinding(id);
    const chord = resolved?._chords?.[0] as
      | { keyCode: number; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean }
      | undefined;
    if (chord && typeof chord.keyCode === 'number') {
      const oldInt = chordToMonacoInt(chord);
      if (oldInt && oldInt !== newKb) {
        rules.push({ keybinding: oldInt, command: `-${id}` });
      }
    }
    rules.push({ keybinding: newKb, command: id });
  }

  if (rules.length === 0) return;

  try {
    monacoOverrideDisposable = monaco.editor.addKeybindingRules(rules);
  } catch (e) {
    console.warn('[shortcuts] addKeybindingRules failed', e);
  }
}

/** @deprecated Use syncAppShortcuts + applyMonacoShortcutOverrides */
export function registerShortcut() {
  console.warn('registerShortcut is deprecated; use syncAppShortcuts');
}

export function disposeAppShortcuts() {
  disposeAllShortcutBindings();
}

/** @deprecated */
export function applyShortcutsToEditor() {
  console.warn('applyShortcutsToEditor replaced by applyMonacoShortcutOverrides');
}
