import { writable } from 'svelte/store';
import * as monacoEditor from 'monaco-editor';
import { CommandsRegistry } from 'monaco-editor/esm/vs/platform/commands/common/commands.js';

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
  if (keyToken === 'Slash' || keyToken === '/')
    return e.code === 'Slash';
  if (keyToken === 'Period' || keyToken === '.')
    return e.code === 'Period';
  if (keyToken === 'Semicolon' || keyToken === ';')
    return e.code === 'Semicolon';
  if (keyToken === 'Quote' || keyToken === "'" || keyToken === '"')
    return e.code === 'Quote';
  if (keyToken === 'BracketLeft' || keyToken === '[')
    return e.code === 'BracketLeft';
  if (keyToken === 'BracketRight' || keyToken === ']')
    return e.code === 'BracketRight';
  if (keyToken === 'Backslash' || keyToken === '\\')
    return e.code === 'Backslash';
  if (keyToken === 'Backquote' || keyToken === '`')
    return e.code === 'Backquote';
  if (keyToken.length === 1)
    return e.key.toLowerCase() === keyToken.toLowerCase();
  const code = `Key${keyToken.toUpperCase()}`;
  if (e.code === code) return true;
  if (keyToken.startsWith('Key')) return e.code === keyToken;
  if (keyToken.startsWith('Digit')) return e.code === keyToken;
  if (keyToken.startsWith('Numpad')) return e.code === keyToken;
  return e.key.toLowerCase() === keyToken.toLowerCase();
}

export interface ShortcutItem {
  id: string;
  label: string;
  keybindingSource: string;
  displayKeys: string;
  category: string;
  isOverride?: boolean;
  /** Primary default chord (Monaco); used for collision detection */
  defaultKeybindingInt?: number | null;
}

export interface ShortcutKeyCollision {
  /** Human-readable key (e.g. ⌘S) */
  displayKey: string;
  commands: { id: string; label: string }[];
}

/**
 * Commands that share the same key chord (after applying overrides).
 */
export function findShortcutKeyCollisions(
  shortcuts: ShortcutItem[],
  overrides: Record<string, string>,
): ShortcutKeyCollision[] {
  const map = new Map<
    number,
    { id: string; label: string; displayKey: string }[]
  >();

  for (const item of shortcuts) {
    let bindingInt: number | null = null;
    let displayKey = '';

    const ov = overrides[item.id];
    if (ov) {
      const spec = normalizeKeySpec(ov);
      bindingInt = parseKeybinding(spec, monacoEditor);
      displayKey = formatKeys(spec);
    } else if (APP_COMMAND_IDS.has(item.id)) {
      const def = APP_SHORTCUT_DEFAULT_KEYS[item.id];
      if (def) {
        const spec = normalizeKeySpec(def);
        bindingInt = parseKeybinding(spec, monacoEditor);
        displayKey = formatKeys(spec);
      }
    } else if (
      item.defaultKeybindingInt != null &&
      item.defaultKeybindingInt !== 0
    ) {
      bindingInt = item.defaultKeybindingInt;
      displayKey = item.displayKeys?.trim() || '…';
    }

    const keyCode = bindingInt != null ? bindingInt & 255 : 0;
    if (bindingInt == null || keyCode === 0) continue;

    const list = map.get(bindingInt) ?? [];
    list.push({ id: item.id, label: item.label, displayKey });
    map.set(bindingInt, list);
  }

  const out: ShortcutKeyCollision[] = [];
  for (const [, entries] of map) {
    const byId = new Map<string, { id: string; label: string }>();
    for (const e of entries) {
      byId.set(e.id, { id: e.id, label: e.label });
    }
    if (byId.size < 2) continue;
    out.push({
      displayKey: entries[0]!.displayKey,
      commands: [...byId.values()],
    });
  }
  return out;
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

/** Map stored token → single-char display (Monaco-style names → glyphs). */
const TOKEN_DISPLAY: Record<string, string> = {
  Slash: '/',
  Period: '.',
  Comma: ',',
  Semicolon: ';',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  Plus: '+',
  Space: '␣',
};

function formatOneChord(chord: string): string {
  const isMac = isMacOS();
  const parts = chord.split('+').map((p) => p.trim());
  const out: string[] = [];
  for (const p of parts) {
    if (p === 'Mod') out.push(isMac ? '⌘' : 'Ctrl');
    else if (p === 'Shift') out.push('⇧');
    else if (p === 'Alt') out.push('⌥');
    else if (p === 'Plus') out.push('+');
    else if (p === 'Minus') out.push('-');
    else if (TOKEN_DISPLAY[p]) out.push(TOKEN_DISPLAY[p]);
    else if (p.startsWith('Key') && p.length === 4) out.push(p.slice(3));
    else if (p.startsWith('Digit') && p.length === 6) out.push(p.slice(5));
    else if (p === '=' || p === 'Equal') out.push('=');
    else if (p === ',') out.push(',');
    else if (/^[a-zA-Z]$/.test(p)) out.push(p.toUpperCase());
    else if (/^\d$/.test(p)) out.push(p);
    else out.push(p);
  }
  return out.join('');
}

/** e.g. Mod+K Mod+S → ⌘K ⌘S (Monaco-style sequence) */
export function formatKeys(keys: string): string {
  return keys
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(formatOneChord)
    .join(' ');
}

/** In-app menu row id → shortcut label (respects user overrides for app commands). */
export function menuShortcutLabel(
  menuId: string,
  overrides: Record<string, string>,
): string {
  const appMap: Record<string, keyof typeof APP_SHORTCUT_DEFAULT_KEYS> = {
    'file-new': 'file.new',
    'file-open': 'file.open',
    'file-open-folder': 'file.openFolder',
    'file-save': 'file.save',
    'file-save-as': 'file.saveAs',
    'view-zoom-in': 'view.zoomIn',
    'view-zoom-out': 'view.zoomOut',
    'view-reset-zoom': 'view.resetZoom',
    'view-toggle-sidebar': 'view.toggleSidebar',
    'help-shortcuts': 'settings.shortcuts',
  };
  const appKey = appMap[menuId];
  if (appKey) {
    const raw = overrides[appKey] ?? APP_SHORTCUT_DEFAULT_KEYS[appKey];
    if (raw) return formatKeys(normalizeKeySpec(raw));
  }
  const fixed: Record<string, string> = {
    'file-export-pdf': 'Mod+Shift+E',
    'edit-undo': 'Mod+Z',
    'edit-redo': 'Mod+Shift+Z',
    'edit-cut': 'Mod+X',
    'edit-copy': 'Mod+C',
    'edit-paste': 'Mod+V',
    'edit-select-all': 'Mod+A',
  };
  const ch = fixed[menuId];
  if (ch) return formatKeys(normalizeKeySpec(ch));
  return '';
}

/**
 * Build a stable chord string from a keydown event (uses physical KeyCode, not e.key layout).
 * Cmd+/ → Mod+Slash (parses to the same binding as Monaco’s ⌘/).
 */
export function physicalKeyTokenFromEvent(e: KeyboardEvent): string {
  const code = e.code;

  const byCode: Record<string, string> = {
    Slash: 'Slash',
    Period: 'Period',
    Comma: 'Comma',
    Semicolon: 'Semicolon',
    Quote: 'Quote',
    BracketLeft: 'BracketLeft',
    BracketRight: 'BracketRight',
    Backslash: 'Backslash',
    Minus: 'Minus',
    Equal: 'Equal',
    Backquote: 'Backquote',
    Space: 'Space',
    IntlBackslash: 'Backslash',
    NumpadDivide: 'NumpadDivide',
    NumpadMultiply: 'NumpadMultiply',
    NumpadSubtract: 'NumpadSubtract',
    NumpadAdd: 'NumpadAdd',
    NumpadDecimal: 'NumpadDecimal',
    NumpadEnter: 'NumpadEnter',
  };
  for (let i = 0; i <= 9; i++) {
    byCode[`Numpad${i}`] = `Numpad${i}`;
  }

  if (byCode[code]) return byCode[code];
  if (code.startsWith('Key')) return code;
  if (code.startsWith('Digit')) return code;
  if (/^F(1[0-9]?|[1-9])$/.test(code)) return code;

  const arrows: Record<string, string> = {
    ArrowLeft: 'LeftArrow',
    ArrowRight: 'RightArrow',
    ArrowUp: 'UpArrow',
    ArrowDown: 'DownArrow',
  };
  if (arrows[code]) return arrows[code]!;

  if (e.key === ' ') return 'Space';
  if (e.key === '+') return 'Plus';
  if (e.key === '-') return 'Minus';
  if (e.key === ',') return 'Comma';

  if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
    return `Key${e.key.toUpperCase()}`;
  }
  return e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key : code;
}

/**
 * Merge Typst app shortcuts into the shortcuts list (for Shortcut Editor UI).
 */
export function ensureAppShortcutMetadataInStore() {
  const appItems: ShortcutItem[] = [...APP_COMMAND_IDS].map((id) => {
    const m = APP_SHORTCUT_LABELS[id];
    const def = APP_SHORTCUT_DEFAULT_KEYS[id];
    const spec = def ? normalizeKeySpec(def) : '';
    const defaultKeybindingInt = spec
      ? parseKeybinding(spec, monacoEditor)
      : null;
    return {
      id,
      label: m?.label ?? id,
      keybindingSource: 'Custom',
      displayKeys: def ? formatKeys(def) : '',
      category: m?.category ?? 'App',
      defaultKeybindingInt,
    };
  });
  allShortcuts.update((items) => {
    const rest = items.filter((i) => !APP_COMMAND_IDS.has(i.id));
    return [...rest, ...appItems];
  });
}

/** Human-readable title for Monaco command ids without an editor action label. */
export function titleFromMonacoCommandId(id: string): string {
  const segment = id.includes(':')
    ? (id.split(':').pop() ?? id)
    : id.includes('.')
      ? id.slice(id.lastIndexOf('.') + 1)
      : id;
  const spaced = segment
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .trim();
  if (!spaced) return id;
  return spaced.replace(/\b\w/g, (c) => c.toUpperCase());
}

function monacoListCategory(id: string, fromEditorAction: boolean): string {
  if (fromEditorAction) return 'Monaco';
  if (id.startsWith('editor.')) return 'Monaco · Editor';
  if (id.startsWith('workbench.')) return 'Monaco · Workbench';
  if (id.startsWith('default:')) return 'Monaco · Core';
  return 'Monaco · Commands';
}

function shortcutItemForMonacoCommand(
  id: string,
  actionLabel: string | undefined,
  kbService: {
    lookupKeybinding?: (commandId: string) =>
      | { getLabel: () => string; _chords?: unknown[] }
      | undefined;
  },
  keybindingLabelByCommand: Map<string, string>,
): ShortcutItem {
  let displayKeys = '';
  let defaultKeybindingInt: number | null = null;
  try {
    if (kbService?.lookupKeybinding) {
      const resolved = kbService.lookupKeybinding(id);
      displayKeys = resolved?.getLabel?.() ?? '';
      const chs = resolved?._chords as
        | Array<{
            keyCode: number;
            ctrlKey: boolean;
            shiftKey: boolean;
            altKey: boolean;
            metaKey: boolean;
          }>
        | undefined;
      if (chs?.length && typeof chs[0].keyCode === 'number') {
        if (chs.length >= 2 && typeof chs[1].keyCode === 'number') {
          defaultKeybindingInt = encodeMonacoKeyChord(
            chordToMonacoInt(chs[0]),
            chordToMonacoInt(chs[1]),
          );
        } else {
          defaultKeybindingInt = chordToMonacoInt(chs[0]);
        }
      }
    }
    if (!displayKeys) {
      displayKeys = keybindingLabelByCommand.get(id) ?? '';
    }
  } catch (e) {
    console.warn(`Failed to lookup keybinding for command ${id}:`, e);
  }

  const label = actionLabel ?? titleFromMonacoCommandId(id);
  return {
    id,
    label,
    keybindingSource: 'Built-in',
    displayKeys,
    category: monacoListCategory(id, !!actionLabel),
    defaultKeybindingInt,
  };
}

export function discoverMonacoActions(editor: any) {
  const actions = editor.getActions() as Array<{ id: string; label: string }>;
  const actionLabelById = new Map(actions.map((a) => [a.id, a.label]));

  const kbService = editor._standaloneKeybindingService as
    | {
        lookupKeybinding?: (id: string) => { getLabel: () => string; _chords?: unknown[] } | undefined;
        getKeybindings?: () => Array<{
          command: string | null;
          resolvedKeybinding?: { getLabel: () => string };
        }>;
      }
    | undefined;

  /** Any chord label from keybinding rules (includes alternate bindings). */
  const keybindingLabelByCommand = new Map<string, string>();
  if (kbService?.getKeybindings) {
    try {
      for (const item of kbService.getKeybindings()) {
        const cmd = item.command;
        if (!cmd || cmd.charAt(0) === '-') continue;
        const rk = item.resolvedKeybinding;
        if (rk && !keybindingLabelByCommand.has(cmd)) {
          try {
            keybindingLabelByCommand.set(cmd, rk.getLabel());
          } catch {
            /* ignore */
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  const commandIds = new Set<string>();
  for (const a of actions) {
    commandIds.add(a.id);
  }
  if (kbService?.getKeybindings) {
    try {
      for (const item of kbService.getKeybindings()) {
        const c = item.command;
        if (c && c.charAt(0) !== '-') commandIds.add(c);
      }
    } catch {
      /* ignore */
    }
  }
  try {
    for (const id of CommandsRegistry.getCommands().keys()) {
      if (id.startsWith('_') || id === 'noop') continue;
      commandIds.add(id);
    }
  } catch {
    /* ignore */
  }

  const discovered: ShortcutItem[] = [...commandIds].map((id) =>
    shortcutItemForMonacoCommand(
      id,
      actionLabelById.get(id),
      kbService ?? {},
      keybindingLabelByCommand,
    ),
  );

  discovered.sort((a, b) => {
    const cat = a.category.localeCompare(b.category);
    if (cat !== 0) return cat;
    return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
  });

  allShortcuts.update((items) => {
    const discById = new Map(discovered.map((d) => [d.id, d]));
    const merged = items.map((item) => {
      const d = discById.get(item.id);
      if (d && item.category === 'Monaco') {
        return {
          ...item,
          displayKeys: d.displayKeys || item.displayKeys,
          defaultKeybindingInt:
            d.defaultKeybindingInt ?? item.defaultKeybindingInt,
        };
      }
      return item;
    });
    const ids = new Set(merged.map((i) => i.id));
    const newItems = discovered.filter((d) => !ids.has(d.id));
    return [...merged, ...newItems];
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

const CHORD_WAIT_MS = 5000;

/**
 * App shortcuts: window capture. Supports two-chord sequences (e.g. Mod+K then Mod+S).
 */
export function syncAppShortcuts(
  overrides: Record<string, string>,
  handlers: Record<string, () => void | Promise<void>>
) {
  appShortcutDisposers.forEach((d) => d());
  appShortcutDisposers = [];

  type Reg = { parts: string[]; handler: () => void };
  const regs: Reg[] = [];
  for (const id of APP_COMMAND_IDS) {
    const handler = handlers[id];
    if (!handler) continue;
    const raw = overrides[id] ?? APP_SHORTCUT_DEFAULT_KEYS[id];
    if (!raw) continue;
    const parts = normalizeKeySpec(raw).split(/\s+/).filter(Boolean);
    if (parts.length === 0 || parts.length > 2) continue;
    regs.push({ parts, handler });
  }

  if (regs.length === 0) return;

  let chordWait: {
    timeout: ReturnType<typeof setTimeout>;
    candidates: { second: string; handler: () => void }[];
  } | null = null;

  const clearChord = () => {
    if (chordWait) {
      clearTimeout(chordWait.timeout);
      chordWait = null;
    }
  };

  const ignoreTarget = (t: HTMLElement | null) => {
    const tag = t?.tagName ?? '';
    return (
      (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') &&
      !t?.closest('.monaco-editor')
    );
  };

  const fire = (e: KeyboardEvent, handler: () => void) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    void Promise.resolve(handler());
  };

  const onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (ignoreTarget(t)) return;

    if (chordWait) {
      const matched = chordWait.candidates.filter((c) =>
        matchesDisplayKeys(e, c.second),
      );
      clearTimeout(chordWait.timeout);
      chordWait = null;
      if (matched.length > 0) {
        fire(e, matched[0]!.handler);
        return;
      }
    }

    const twoChord = regs.filter((r) => r.parts.length === 2);
    const starters = twoChord.filter((r) => matchesDisplayKeys(e, r.parts[0]));
    if (starters.length > 0) {
      chordWait = {
        candidates: starters.map((r) => ({
          second: r.parts[1],
          handler: r.handler,
        })),
        timeout: setTimeout(() => {
          chordWait = null;
        }, CHORD_WAIT_MS),
      };
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }

    const inMonacoTextarea = !!t?.closest?.('.monaco-editor textarea');

    for (const r of regs) {
      if (r.parts.length !== 1) continue;
      const spec = r.parts[0];
      if (!matchesDisplayKeys(e, spec)) continue;
      if (spec.includes('Mod')) {
        fire(e, r.handler);
        return;
      }
      if (inMonacoTextarea) continue;
      fire(e, r.handler);
      return;
    }
  };

  window.addEventListener('keydown', onKey, true);
  appShortcutDisposers.push(() => {
    clearChord();
    window.removeEventListener('keydown', onKey, true);
  });
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
  '/': 'Slash',
  '.': 'Period',
  ',': 'Comma',
  ';': 'Semicolon',
  "'": 'Quote',
  '"': 'Quote',
  '[': 'BracketLeft',
  ']': 'BracketRight',
  '\\': 'Backslash',
  '`': 'Backquote',
};

/** Monaco packs two 16-bit chords: (second << 16) | first */
export function encodeMonacoKeyChord(first: number, second: number): number {
  return (((second & 65535) << 16) | (first & 65535)) >>> 0;
}

function parseSingleChord(chordPart: string, monaco: { KeyMod: any; KeyCode: any }): number {
  const parts = chordPart.split('+').map((p) => p.trim()).filter(Boolean);
  let result = 0;
  for (const part of parts) {
    if (part === 'Mod') result |= monaco.KeyMod.CtrlCmd;
    else if (part === 'Shift') result |= monaco.KeyMod.Shift;
    else if (part === 'Alt') result |= monaco.KeyMod.Alt;
    else if (part === 'Meta') result |= monaco.KeyMod.WinCtrl;
    else {
      const aliased = KEY_ALIASES[part] ?? part;
      let name = aliased;
      if (monaco.KeyCode[name] === undefined && part.length === 1) {
        const k = `Key${part.toUpperCase()}`;
        if (monaco.KeyCode[k] !== undefined) name = k;
      }
      const code = monaco.KeyCode[name];
      if (code !== undefined) result |= code;
    }
  }
  return result;
}

/**
 * One chord ("Mod+S") or two-chord sequence ("Mod+K Mod+S") like VS Code / Monaco.
 */
export function parseKeybinding(keyString: string, monaco: any): number {
  const chords = keyString.trim().split(/\s+/).filter(Boolean);
  if (chords.length === 0) return 0;
  const singles = chords.map((c) => parseSingleChord(normalizeKeySpec(c), monaco));
  if (singles.some((x) => !x || (x & 255) === 0)) return 0;
  if (chords.length === 1) return singles[0]!;
  if (chords.length === 2) {
    return encodeMonacoKeyChord(singles[0]!, singles[1]!);
  }
  return 0;
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
    const chs = resolved?._chords as
      | Array<{
          keyCode: number;
          ctrlKey: boolean;
          shiftKey: boolean;
          altKey: boolean;
          metaKey: boolean;
        }>
      | undefined;
    let oldInt: number | null = null;
    if (chs?.length && typeof chs[0].keyCode === 'number') {
      if (chs.length >= 2 && typeof chs[1].keyCode === 'number') {
        oldInt = encodeMonacoKeyChord(
          chordToMonacoInt(chs[0]),
          chordToMonacoInt(chs[1]),
        );
      } else {
        oldInt = chordToMonacoInt(chs[0]);
      }
    }
    if (
      oldInt != null &&
      oldInt !== 0 &&
      (oldInt & 255) !== 0 &&
      oldInt !== newKb
    ) {
      rules.push({ keybinding: oldInt, command: `-${id}` });
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
