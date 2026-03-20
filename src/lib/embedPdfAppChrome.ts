import type {
  AnnotationEvent,
  AnnotationPlugin,
  DeepPartial,
  DocumentManagerPlugin,
  ExportPlugin,
  GroupItem,
  HistoryPlugin,
  PluginRegistry,
  ThemeColors,
  ThemeConfig,
  ToolbarItem,
  UIPlugin,
} from "@embedpdf/svelte-pdf-viewer";

function cssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/**
 * Maps live `theme.css` variables into EmbedPDF semantic colors so toolbar / panels
 * match header icon buttons (ghost hover, chip-style selection, link accent).
 */
export function embedPdfThemeFromAppChrome(): DeepPartial<ThemeColors> {
  return {
    background: {
      app: cssVar("--app-bg", "#2c3142"),
      surface: cssVar("--app-surface-elevated", "#3d445a"),
      surfaceAlt: cssVar("--app-surface", "#343a4e"),
      elevated: cssVar("--app-surface-elevated", "#3d445a"),
      overlay: "rgba(0, 0, 0, 0.42)",
      input: cssVar("--app-input-bg", "#32384c"),
    },
    foreground: {
      primary: cssVar("--app-fg", "#e2e6f4"),
      secondary: cssVar("--app-fg-secondary", "#b8bfd4"),
      muted: cssVar("--app-fg-muted", "#949db8"),
      disabled: cssVar("--app-fg-subtle", "#8a93ad"),
      onAccent: cssVar("--app-header-badge-fg", "#2c3142"),
    },
    border: {
      default: cssVar("--app-border", "#4a5168"),
      subtle: cssVar("--app-border", "#4a5168"),
      strong: cssVar("--app-border-strong", "#5c6480"),
    },
    accent: {
      primary: cssVar("--embed-pdf-accent", "#747bff"),
      primaryHover: cssVar("--embed-pdf-accent-hover", "#9095ff"),
      primaryActive: cssVar("--embed-pdf-accent-active", "#5c63ef"),
      primaryLight: cssVar("--embed-pdf-accent-light", "rgba(116, 123, 255, 0.22)"),
      primaryForeground: "#ffffff",
    },
    interactive: {
      hover: cssVar("--app-btn-ghost-hover", "#454c64"),
      active: cssVar("--app-surface-active", "#5a6280"),
      selected: cssVar("--embed-pdf-accent-light", "rgba(116, 123, 255, 0.22)"),
      focus: cssVar("--embed-pdf-accent", "#747bff"),
      focusRing: cssVar("--embed-pdf-accent", "#747bff"),
    },
    scrollbar: {
      track: cssVar("--app-surface", "#343a4e"),
      thumb: cssVar("--app-border-strong", "#5c6480"),
      thumbHover: cssVar("--app-icon-muted", "#949db8"),
    },
    tooltip: {
      background: cssVar("--app-surface-elevated", "#3d445a"),
      foreground: cssVar("--app-fg", "#e2e6f4"),
    },
  };
}

export function buildEmbedPdfTheme(appearance: "light" | "dark"): ThemeConfig {
  const chrome = embedPdfThemeFromAppChrome();
  return {
    preference: appearance,
    ...(appearance === "dark" ? { dark: chrome } : { light: chrome }),
  };
}

/** Removes the document overflow (hamburger) menu control; keeps sidebar & other tools. */
export function removeEmbedPdfDocumentMenuButton(registry: PluginRegistry): void {
  const ui = registry.getPlugin<UIPlugin>("ui")?.provides();
  if (!ui) return;

  const schema = ui.getSchema();
  const toolbar = schema.toolbars["main-toolbar"];
  if (!toolbar?.items) return;

  const items = structuredClone(toolbar.items) as ToolbarItem[];
  const left = items.find((i): i is GroupItem => i.type === "group" && i.id === "left-group");
  if (left?.items) {
    left.items = left.items.filter(
      (child) => child.id !== "document-menu-button" && child.id !== "divider-1",
    );
  }

  ui.mergeSchema({
    toolbars: {
      "main-toolbar": {
        ...toolbar,
        items,
      },
    },
  });
}

/** Serialize the current in-memory PDF (including committed annotations) for disk write. */
export type EmbedPdfDiskSaveApi = {
  saveToBuffer: () => Promise<ArrayBuffer>;
  undo: () => void;
  redo: () => void;
};

/**
 * Toolbar tweak, dirty detection (committed annotation edits), and export API registration.
 * Call the returned disposer when the viewer unmounts or before rewiring the same registry.
 */
export function wireEmbedPdfProjectIntegration(
  registry: PluginRegistry,
  opts: {
    onPdfDirty?: () => void;
    onDiskApiReady?: (api: EmbedPdfDiskSaveApi | null) => void;
  },
): () => void {
  removeEmbedPdfDocumentMenuButton(registry);

  const docMgr = registry.getPlugin<DocumentManagerPlugin>("document-manager")?.provides();
  const ann = registry.getPlugin<AnnotationPlugin>("annotation")?.provides();

  const unsubs: (() => void)[] = [];
  if (ann && docMgr) {
    const unsub = ann.onAnnotationEvent((event: AnnotationEvent) => {
      const active = docMgr.getActiveDocumentId();
      if (!active || event.documentId !== active) return;
      if (event.type === "loaded") return;
      if (!event.committed) return;
      opts.onPdfDirty?.();
    });
    if (typeof unsub === "function") unsubs.push(unsub);
  }

  const api: EmbedPdfDiskSaveApi = {
    async saveToBuffer() {
      const dm = registry.getPlugin<DocumentManagerPlugin>("document-manager")?.provides();
      const exp = registry.getPlugin<ExportPlugin>("export")?.provides();
      const id = dm?.getActiveDocumentId();
      if (!id || !exp) throw new Error("PDF engine is not ready.");
      return exp.forDocument(id).saveAsCopy().toPromise();
    },
    undo() {
      registry.getPlugin<HistoryPlugin>("history")?.provides()?.undo();
    },
    redo() {
      registry.getPlugin<HistoryPlugin>("history")?.provides()?.redo();
    },
  };
  opts.onDiskApiReady?.(api);

  return () => {
    for (const u of unsubs) u();
    opts.onDiskApiReady?.(null);
  };
}
