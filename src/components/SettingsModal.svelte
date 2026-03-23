<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { ask, open, save } from "@tauri-apps/plugin-dialog";
  import { writeTextFile } from "@tauri-apps/plugin-fs";
  import {
    X,
    FolderOpen,
    FileType,
    Trash2,
    Download,
    Upload,
  } from "lucide-svelte";
  import ShortcutEditor from "./ShortcutEditor.svelte";
  import {
    getTypstFontConfig,
    importTypstFontConfigJson,
    addTypstFontsImport,
    removeTypstImportedFont,
    getTypstFontStorageInfo,
    displayFontPath,
    type TypstFontConfig,
    type TypstFontStorageInfo,
  } from "../lib/typstFonts";

  let {
    isOpen,
    onClose,
    initialTab = "shortcuts",
    onFontsChanged,
  } = $props<{
    isOpen: boolean;
    onClose: () => void;
    initialTab?: "shortcuts" | "packageCache" | "fonts" | "faq";
    /** Refresh global Typst font catalog (e.g. toolbar picker) without closing Settings. */
    onFontsChanged?: () => void;
  }>();

  let tab = $state<"shortcuts" | "packageCache" | "fonts" | "faq">("shortcuts");

  $effect(() => {
    if (isOpen) {
      tab = initialTab;
      if (initialTab === "packageCache") {
        void loadCacheInfo();
      }
      if (initialTab === "fonts") {
        void loadFontCfg();
      }
    }
  });

  type CacheInfo = {
    path: string;
    sizeBytes: number;
    fileCount: number;
    locationNote: string;
  };

  let cacheInfo = $state<CacheInfo | null>(null);
  let cacheLoading = $state(false);
  let cacheError = $state("");
  let clearBusy = $state(false);

  let fontConfig = $state<TypstFontConfig>({ directories: [], files: [] });
  let fontStorageInfo = $state<TypstFontStorageInfo | null>(null);
  let fontCfgLoading = $state(false);
  let fontCfgError = $state("");
  let fontCfgBusy = $state(false);

  function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
    return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  async function loadCacheInfo() {
    cacheLoading = true;
    cacheError = "";
    try {
      cacheInfo = await invoke<CacheInfo>("get_typst_package_cache_info");
    } catch (e) {
      cacheInfo = null;
      cacheError = String(e);
    } finally {
      cacheLoading = false;
    }
  }

  async function loadFontCfg() {
    fontCfgLoading = true;
    fontCfgError = "";
    try {
      fontConfig = await getTypstFontConfig();
      fontStorageInfo = await getTypstFontStorageInfo();
    } catch (e) {
      fontCfgError = String(e);
    } finally {
      fontCfgLoading = false;
    }
  }

  async function importFontFolder() {
    fontCfgBusy = true;
    fontCfgError = "";
    try {
      const p = await open({ directory: true, multiple: false });
      if (typeof p !== "string" || !p) return;
      fontConfig = await addTypstFontsImport([p], true);
      onFontsChanged?.();
    } catch (e) {
      fontCfgError = String(e);
    } finally {
      fontCfgBusy = false;
    }
  }

  async function importFontFiles() {
    fontCfgBusy = true;
    fontCfgError = "";
    try {
      const p = await open({
        multiple: true,
        filters: [{ name: "Fonts", extensions: ["ttf", "otf", "ttc", "otc"] }],
      });
      if (p == null) return;
      const arr = Array.isArray(p) ? p : [p];
      fontConfig = await addTypstFontsImport(arr, false);
      onFontsChanged?.();
    } catch (e) {
      fontCfgError = String(e);
    } finally {
      fontCfgBusy = false;
    }
  }

  async function removeImportedFile(i: number) {
    const path = fontConfig.files[i];
    if (!path) return;
    fontCfgBusy = true;
    fontCfgError = "";
    try {
      fontConfig = await removeTypstImportedFont(path);
      onFontsChanged?.();
    } catch (e) {
      fontCfgError = String(e);
    } finally {
      fontCfgBusy = false;
    }
  }

  async function exportFontConfigTemplate() {
    try {
      const path = await save({
        filters: [{ name: "JSON", extensions: ["json"] }],
        defaultPath: "typst-editor-fonts.json",
      });
      if (path == null) return;
      const body = JSON.stringify({ directories: [], files: [] }, null, 2);
      await writeTextFile(path, body);
    } catch (e) {
      fontCfgError = String(e);
    }
  }

  async function importFontConfigMerge() {
    fontCfgBusy = true;
    fontCfgError = "";
    try {
      const p = await open({
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (typeof p !== "string") return;
      fontConfig = await importTypstFontConfigJson(p);
      onFontsChanged?.();
    } catch (e) {
      fontCfgError = String(e);
    } finally {
      fontCfgBusy = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && isOpen) onClose();
  }

  onMount(() => {
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  });

  async function clearCache() {
    const ok = await ask(
      "Remove all downloaded @preview packages? They will be re-downloaded when you compile again.",
      { title: "Clear package cache", kind: "warning" },
    );
    if (!ok) return;
    clearBusy = true;
    cacheError = "";
    try {
      await invoke("clear_typst_package_cache");
      await loadCacheInfo();
    } catch (e) {
      cacheError = String(e);
    } finally {
      clearBusy = false;
    }
  }

  function selectTab(t: "shortcuts" | "packageCache" | "fonts" | "faq") {
    tab = t;
    if (t === "packageCache") void loadCacheInfo();
    if (t === "fonts") void loadFontCfg();
  }
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
    onclick={onClose}
  >
    <div
      class="bg-[var(--app-surface)] border border-[var(--app-border)] rounded-lg shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
      onclick={(e) => e.stopPropagation()}
    >
      <div
        class="flex items-center justify-between px-4 py-3 border-b border-[var(--app-border)] gap-2"
      >
        <div class="flex items-center gap-1 min-w-0 flex-wrap">
          <h2 class="text-sm font-semibold text-[var(--app-fg)] shrink-0 mr-2">
            Settings
          </h2>
          <div
            class="flex rounded-md bg-[var(--app-bg)] p-0.5 border border-[var(--app-border)] flex-wrap"
          >
            <button
              type="button"
              class="px-3 py-1 text-xs rounded-md transition-colors {tab ===
              'shortcuts'
                ? 'bg-[var(--app-surface-active)] text-[var(--app-active-fg)]'
                : 'text-[var(--app-fg-secondary)] hover:text-[var(--app-fg)]'}"
              onclick={() => selectTab("shortcuts")}
            >
              Shortcuts
            </button>
            <button
              type="button"
              class="px-3 py-1 text-xs rounded-md transition-colors {tab ===
              'fonts'
                ? 'bg-[var(--app-surface-active)] text-[var(--app-active-fg)]'
                : 'text-[var(--app-fg-secondary)] hover:text-[var(--app-fg)]'}"
              onclick={() => selectTab("fonts")}
            >
              Fonts
            </button>
            <button
              type="button"
              class="px-3 py-1 text-xs rounded-md transition-colors {tab ===
              'packageCache'
                ? 'bg-[var(--app-surface-active)] text-[var(--app-active-fg)]'
                : 'text-[var(--app-fg-secondary)] hover:text-[var(--app-fg)]'}"
              onclick={() => selectTab("packageCache")}
            >
              Package cache
            </button>
            <button
              type="button"
              class="px-3 py-1 text-xs rounded-md transition-colors {tab ===
              'faq'
                ? 'bg-[var(--app-surface-active)] text-[var(--app-active-fg)]'
                : 'text-[var(--app-fg-secondary)] hover:text-[var(--app-fg)]'}"
              onclick={() => selectTab("faq")}
            >
              FAQ
            </button>
          </div>
        </div>
        <button
          type="button"
          onclick={onClose}
          class="p-1 hover:bg-[var(--app-btn-ghost-hover)] rounded transition-colors text-[var(--app-fg-secondary)] hover:text-[var(--app-close-hover-fg)] shrink-0"
        >
          <X size={18} />
        </button>
      </div>

      <div class="flex-1 overflow-auto p-6 min-h-[280px]">
        {#if tab === "shortcuts"}
          <ShortcutEditor />
        {:else if tab === "faq"}
          <div class="space-y-2 text-sm text-[var(--app-fg)]">
            <p
              class="text-[var(--app-fg-secondary)] text-xs leading-relaxed mb-4"
            >
              Quick answers about Typst Editor. Open other tabs in Settings for
              shortcuts, fonts, and package cache.
            </p>
            <details
              class="group rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 open:pb-3"
            >
              <summary
                class="cursor-pointer list-none font-medium text-[var(--app-fg)] flex items-center justify-between gap-2 [&::-webkit-details-marker]:hidden"
              >
                <span>Why doesn&apos;t the preview match my latest edits?</span>
                <span class="text-[var(--app-fg-muted)] text-xs shrink-0"
                  >▼</span
                >
              </summary>
              <p
                class="mt-2 text-xs text-[var(--app-fg-secondary)] leading-relaxed pl-0.5"
              >
                The preview updates when Typst compiles successfully. If there
                are errors, check the sidebar diagnostics. The last successful
                preview may stay visible until the document compiles again.
              </p>
            </details>
            <details
              class="group rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 open:pb-3"
            >
              <summary
                class="cursor-pointer list-none font-medium text-[var(--app-fg)] flex items-center justify-between gap-2 [&::-webkit-details-marker]:hidden"
              >
                <span>How do I use my own fonts?</span>
                <span class="text-[var(--app-fg-muted)] text-xs shrink-0"
                  >▼</span
                >
              </summary>
              <p
                class="mt-2 text-xs text-[var(--app-fg-secondary)] leading-relaxed pl-0.5"
              >
                Open <strong class="text-[var(--app-fg)]"
                  >Settings → Fonts</strong
                >, import font files or a folder, then in your document use
                <code class="text-[var(--app-link)]"
                  >#set text(font: &quot;Family Name&quot;)</code
                >
                with the font&apos;s PostScript or display name. Otherwise you can
                also add the font file in the project and Typst Editor will automatically
                detect it. Import to Settings if you want to reuse the font, keep
                it in the project if you want to use it only in that project.
              </p>
            </details>
            <details
              class="group rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 open:pb-3"
            >
              <summary
                class="cursor-pointer list-none font-medium text-[var(--app-fg)] flex items-center justify-between gap-2 [&::-webkit-details-marker]:hidden"
              >
                <span
                  >What are <code class="text-[var(--app-link)] font-normal"
                    >@preview/…</code
                  > packages?</span
                >
                <span class="text-[var(--app-fg-muted)] text-xs shrink-0"
                  >▼</span
                >
              </summary>
              <p
                class="mt-2 text-xs text-[var(--app-fg-secondary)] leading-relaxed pl-0.5"
              >
                They come from the Typst package registry. The first time you
                compile with a package, it is downloaded and cached. See <strong
                  class="text-[var(--app-fg)]">Package cache</strong
                > for size and location; you can clear the cache if you need to reclaim
                space.
              </p>
            </details>
            <details
              class="group rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 open:pb-3"
            >
              <summary
                class="cursor-pointer list-none font-medium text-[var(--app-fg)] flex items-center justify-between gap-2 [&::-webkit-details-marker]:hidden"
              >
                <span>How do I export (PDF, images, HTML)?</span>
                <span class="text-[var(--app-fg-muted)] text-xs shrink-0"
                  >▼</span
                >
              </summary>
              <p
                class="mt-2 text-xs text-[var(--app-fg-secondary)] leading-relaxed pl-0.5"
              >
                With a document open, use the export button in the header or
                <strong class="text-[var(--app-fg)]">File → Export…</strong> (in-app
                menu on mobile). Pick PDF (several standards), SVG, PNG (with PPI),
                or HTML, then choose where to save.
              </p>
            </details>
            <details
              class="group rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 open:pb-3"
            >
              <summary
                class="cursor-pointer list-none font-medium text-[var(--app-fg)] flex items-center justify-between gap-2 [&::-webkit-details-marker]:hidden"
              >
                <span>Where are keyboard shortcuts configured?</span>
                <span class="text-[var(--app-fg-muted)] text-xs shrink-0"
                  >▼</span
                >
              </summary>
              <p
                class="mt-2 text-xs text-[var(--app-fg-secondary)] leading-relaxed pl-0.5"
              >
                <strong class="text-[var(--app-fg)]"
                  >Settings → Shortcuts</strong
                >. The editor also has Monaco&apos;s command palette (header
                button) for editor actions.
              </p>
            </details>
            <details
              class="group rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 open:pb-3"
            >
              <summary
                class="cursor-pointer list-none font-medium text-[var(--app-fg)] flex items-center justify-between gap-2 [&::-webkit-details-marker]:hidden"
              >
                <span>How do files and projects work?</span>
                <span class="text-[var(--app-fg-muted)] text-xs shrink-0"
                  >▼</span
                >
              </summary>
              <div
                class="mt-2 text-xs text-[var(--app-fg-secondary)] leading-relaxed pl-0.5 space-y-2"
              >
                <p>
                  Typst Editor is built around <strong
                    class="text-[var(--app-fg)]">projects</strong
                  >: a folder that holds your
                  <code class="text-[var(--app-link)]">.typ</code>
                  sources, assets, and usually a
                  <code class="text-[var(--app-link)]">main.typ</code>. You
                  start from the
                  <strong class="text-[var(--app-fg)]">project hub</strong>,
                  then edit in the sidebar and editor—saves go into that
                  project. Use
                  <strong class="text-[var(--app-fg)]">New File</strong>
                  to add more <code class="text-[var(--app-link)]">.typ</code>
                  files inside the project,
                  <strong class="text-[var(--app-fg)]">Import .typ</strong> to
                  copy files in, and
                  <strong class="text-[var(--app-fg)]">Export project</strong> for
                  a ZIP backup.
                </p>
                <p>
                  <strong class="text-[var(--app-fg)]"
                    >On Mac, Windows, and Linux</strong
                  >
                  you
                  <strong class="text-[var(--app-fg)]"
                    >open a folder on disk</strong
                  >
                  (or create a new subfolder in a location you pick). The app reads
                  and writes those files directly—nothing is duplicated into hidden
                  app storage.
                  <strong class="text-[var(--app-fg)]">Recent projects</strong> is
                  only a shortcut list; removing one from the list does not delete
                  files.
                </p>
                <p>
                  <strong class="text-[var(--app-fg)]"
                    >On iPhone and iPad</strong
                  >
                  projects live inside the app&apos;s sandbox (under
                  <strong class="text-[var(--app-fg)]"
                    >Files → On My iPhone/iPad</strong
                  >). You create projects there or
                  <strong class="text-[var(--app-fg)]">import a ZIP</strong> (e.g.
                  compress a folder in Files, then import the archive). Deleting
                  a project from the hub removes that copy inside the app.
                </p>
              </div>
            </details>
            <details
              class="group rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 open:pb-3"
            >
              <summary
                class="cursor-pointer list-none font-medium text-[var(--app-fg)] flex items-center justify-between gap-2 [&::-webkit-details-marker]:hidden"
              >
                <span>Why do iPad and desktop work differently?</span>
                <span class="text-[var(--app-fg-muted)] text-xs shrink-0"
                  >▼</span
                >
              </summary>
              <div
                class="mt-2 text-xs text-[var(--app-fg-secondary)] leading-relaxed pl-0.5 space-y-2"
              >
                <p>
                  <strong class="text-[var(--app-fg)]">iOS and iPadOS</strong>
                  use a strict
                  <strong class="text-[var(--app-fg)]">sandbox</strong>: each
                  app only has guaranteed access to its own container. It cannot
                  silently read or write arbitrary folders elsewhere on the
                  device the way a Mac app can. So projects are stored in the
                  app&apos;s Documents area, and bringing work in often means
                  <strong class="text-[var(--app-fg)]">importing a ZIP</strong> (or
                  creating a new project there)—that matches what Apple and the App
                  Store expect for security and privacy.
                </p>
                <p>
                  <strong class="text-[var(--app-fg)]">Desktop</strong> apps run
                  with normal file-system access once you choose a folder (e.g.
                  via the system file dialog). The editor can work
                  <strong class="text-[var(--app-fg)]">in place</strong> on your
                  Git folder, Dropbox path, or USB drive—no extra copy step. The
                  app only keeps a small
                  <strong class="text-[var(--app-fg)]"
                    >recent-projects list</strong
                  > in its own data directory so you can reopen folders quickly.
                </p>
                <p>
                  Same editor and preview on both; the difference is
                  <strong class="text-[var(--app-fg)]">where files live</strong>
                  and
                  <strong class="text-[var(--app-fg)]"
                    >how the OS lets the app reach them</strong
                  >.
                </p>
              </div>
            </details>
            <details
              class="group rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 open:pb-3"
            >
              <summary
                class="cursor-pointer list-none font-medium text-[var(--app-fg)] flex items-center justify-between gap-2 [&::-webkit-details-marker]:hidden"
              >
                <span>How do I fix the bottom bar when using the iPad?</span>
                <span class="text-[var(--app-fg-muted)] text-xs shrink-0"
                  >▼</span
                >
              </summary>
              <p
                class="mt-2 text-xs text-[var(--app-fg-secondary)] leading-relaxed pl-0.5"
              >
                Open <strong class="text-[var(--app-fg)]"
                  >Settings → Keyboard → Disable Shortcuts
                </strong>, that is an issue of iPadOS when a hardware keyboard
                is connected that causes the unexpected overflow.
              </p>
            </details>
          </div>
        {:else if tab === "fonts"}
          <div class="space-y-4 text-sm text-[var(--app-fg)]">
            <p class="text-[var(--app-fg-secondary)] text-xs leading-relaxed">
              Typst loads <strong class="text-[var(--app-fg)]"
                >typst-assets</strong
              >
              fonts (e.g. New Computer Modern), fonts from
              <code class="text-[var(--app-link)]"
                >src-tauri/resources/fonts/bundled</code
              >
              (shipped with the app),
              <strong class="text-[var(--app-fg)]"
                >font files under your open project folder</strong
              >
              (<code class="text-[var(--app-link)]">.ttf</code> /
              <code class="text-[var(--app-link)]">.otf</code> /
              <code class="text-[var(--app-link)]">.ttc</code> /
              <code class="text-[var(--app-link)]">.otc</code>, skipping heavy
              dirs like
              <code class="text-[var(--app-link)]">node_modules</code>), and
              fonts you
              <strong class="text-[var(--app-fg)]">import</strong> here. Imports
              are
              <strong class="text-[var(--app-fg)]">copied</strong> into app
              local data so preview and PDF work under the App Store sandbox.
              Use
              <code class="text-[var(--app-link)]"
                >#set text(font: &quot;Family Name&quot;)</code
              > in your document.
            </p>

            {#if fontStorageInfo}
              <div
                class="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-3 space-y-1.5"
              >
                <div
                  class="text-[10px] uppercase tracking-wider text-[var(--app-fg-muted)]"
                >
                  Import storage
                </div>
                <p
                  class="text-[11px] font-mono break-all text-[var(--app-fg-secondary)] leading-snug"
                  title={fontStorageInfo.importedDir}
                >
                  {fontStorageInfo.importedDir}
                </p>
                {#if fontStorageInfo.appBundledFontsDir}
                  <div
                    class="text-[10px] uppercase tracking-wider text-[var(--app-fg-muted)] pt-1"
                  >
                    App-bundled fonts dir
                  </div>
                  <p
                    class="text-[11px] font-mono break-all text-[var(--app-fg-muted)] leading-snug"
                  >
                    {fontStorageInfo.appBundledFontsDir}
                  </p>
                {/if}
              </div>
            {/if}

            {#if fontCfgLoading && !fontConfig.files.length}
              <p class="text-[var(--app-fg-muted)] text-xs">Loading…</p>
            {:else if fontCfgError && !fontConfig.files.length}
              <p class="text-red-400 text-xs">{fontCfgError}</p>
            {/if}

            <div
              class="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-4 space-y-3"
            >
              <div class="flex items-center justify-between gap-2 flex-wrap">
                <span
                  class="text-[10px] uppercase tracking-wider text-[var(--app-fg-muted)]"
                  >Import into app storage</span
                >
                <div class="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={fontCfgBusy}
                    onclick={() => void importFontFolder()}
                    class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-[var(--app-border)] bg-[var(--app-surface-elevated)] hover:bg-[var(--app-surface-hover)] disabled:opacity-50"
                  >
                    <FolderOpen size={14} /> Import folder
                  </button>
                  <button
                    type="button"
                    disabled={fontCfgBusy}
                    onclick={() => void importFontFiles()}
                    class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-[var(--app-border)] bg-[var(--app-surface-elevated)] hover:bg-[var(--app-surface-hover)] disabled:opacity-50"
                  >
                    <FileType size={14} /> Import files
                  </button>
                </div>
              </div>
              <p class="text-[11px] text-[var(--app-fg-muted)] leading-relaxed">
                All matching <code class="text-[var(--app-fg-secondary)]"
                  >.ttf</code
                >
                /
                <code class="text-[var(--app-fg-secondary)]">.otf</code> /
                <code class="text-[var(--app-fg-secondary)]">.ttc</code> /
                <code class="text-[var(--app-fg-secondary)]">.otc</code> files are
                copied recursively from a folder.
              </p>
              {#if fontConfig.files.length === 0}
                <p class="text-xs text-[var(--app-fg-muted)]">
                  No imported fonts yet.
                </p>
              {:else}
                <ul class="space-y-1.5 max-h-48 overflow-y-auto">
                  {#each fontConfig.files as file, i}
                    <li
                      class="flex items-start gap-2 text-xs text-[var(--app-fg-secondary)] bg-[var(--app-surface)] rounded px-2 py-1.5 border border-[var(--app-border)]"
                    >
                      <span
                        class="flex-1 min-w-0 font-medium truncate"
                        title={file}>{displayFontPath(file)}</span
                      >
                      <span
                        class="hidden sm:block flex-1 min-w-0 font-mono text-[10px] break-all opacity-70"
                        >{file}</span
                      >
                      <button
                        type="button"
                        disabled={fontCfgBusy}
                        onclick={() => void removeImportedFile(i)}
                        class="shrink-0 p-1 rounded hover:bg-[var(--app-surface-hover)] text-[var(--app-fg-muted)]"
                        title="Remove and delete copy"
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>

            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={fontCfgBusy}
                onclick={() => void exportFontConfigTemplate()}
                class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-[var(--app-border-strong)] bg-[var(--app-surface-elevated)] hover:bg-[var(--app-surface-hover)]"
              >
                <Download size={14} /> Export config template
              </button>
              <button
                type="button"
                disabled={fontCfgBusy}
                onclick={() => void importFontConfigMerge()}
                class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-[var(--app-border-strong)] bg-[var(--app-surface-elevated)] hover:bg-[var(--app-surface-hover)]"
              >
                <Upload size={14} /> Import JSON (merge, copies fonts)
              </button>
            </div>
            <p class="text-[10px] text-[var(--app-fg-muted)] leading-relaxed">
              Paths in <code class="text-[var(--app-fg-secondary)]"
                >typst-editor-fonts.json</code
              > (app config) only reference files inside import storage. JSON merge
              copies external paths into storage.
            </p>
            {#if fontCfgError && fontConfig.files.length > 0}
              <p class="text-red-400 text-xs">{fontCfgError}</p>
            {/if}
          </div>
        {:else}
          <div class="space-y-4 text-sm text-[var(--app-fg)]">
            <p class="text-[var(--app-fg-secondary)] text-xs leading-relaxed">
              Downloaded <code class="text-blue-400/90">@preview/…</code> packages
              from packages.typst.org are stored in the app&apos;s cache folder.
              On App Store builds this stays inside the app sandbox (no full disk
              access needed). Direct installs use the same app cache location.
            </p>

            {#if cacheLoading && !cacheInfo}
              <p class="text-[var(--app-fg-muted)] text-xs">Loading…</p>
            {:else if cacheError && !cacheInfo}
              <p class="text-red-400 text-xs">{cacheError}</p>
            {:else if cacheInfo}
              <div
                class="rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-4 space-y-3"
              >
                <div>
                  <div
                    class="text-[10px] uppercase tracking-wider text-[var(--app-fg-muted)] mb-1"
                  >
                    Size
                  </div>
                  <div
                    class="text-lg font-medium tabular-nums text-[var(--app-fg)]"
                  >
                    {formatBytes(cacheInfo.sizeBytes)}
                    <span
                      class="text-sm font-normal text-[var(--app-fg-muted)] ml-2"
                    >
                      ({cacheInfo.fileCount.toLocaleString()} files)
                    </span>
                  </div>
                </div>
                <div>
                  <div
                    class="text-[10px] uppercase tracking-wider text-[var(--app-fg-muted)] mb-1"
                  >
                    Location
                  </div>
                  <p
                    class="text-xs text-[var(--app-fg-secondary)] font-mono break-all leading-snug"
                    title={cacheInfo.path}
                  >
                    {cacheInfo.path}
                  </p>
                </div>
                {#if cacheInfo.locationNote}
                  <p class="text-[11px] text-[var(--app-fg-muted)]">
                    {cacheInfo.locationNote}
                  </p>
                {/if}
              </div>
            {/if}

            <div class="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                disabled={cacheLoading || clearBusy}
                onclick={() => void loadCacheInfo()}
                class="px-3 py-1.5 text-xs rounded-md border border-[var(--app-border-strong)] bg-[var(--app-surface-elevated)] hover:bg-[var(--app-surface-hover)] text-[var(--app-fg)] disabled:opacity-50"
              >
                Refresh
              </button>
              <button
                type="button"
                disabled={clearBusy ||
                  cacheLoading ||
                  (cacheInfo?.sizeBytes ?? 0) === 0}
                onclick={() => void clearCache()}
                class="px-3 py-1.5 text-xs rounded-md border border-red-900/50 bg-red-950/40 text-red-200 hover:bg-red-950/60 disabled:opacity-40"
              >
                {clearBusy ? "Clearing…" : "Clear cache"}
              </button>
            </div>
            {#if cacheError && cacheInfo}
              <p class="text-red-400 text-xs">{cacheError}</p>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .animate-in {
    animation-fill-mode: forwards;
  }
  .fade-in {
    animation: fadeIn 0.2s ease-out;
  }
  .zoom-in-95 {
    animation: zoomIn 0.2s ease-out;
  }
  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  @keyframes zoomIn {
    from {
      transform: scale(0.95);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }
</style>
