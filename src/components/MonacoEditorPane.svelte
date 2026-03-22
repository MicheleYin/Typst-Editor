<script lang="ts">
  import { onMount, tick } from "svelte";
  import * as monaco from "monaco-editor";
  import * as typstLanguage from "../typst-language";
  import {
    discoverMonacoActions,
    ensureAppShortcutMetadataInStore,
    disposeMonacoShortcutOverridesOnly,
  } from "../lib/shortcuts";
  import {
    MONACO_CAT_LIGHT,
    MONACO_CAT_DARK,
    MONACO_THEME_ID_LIGHT,
    MONACO_THEME_ID_DARK,
  } from "../lib/catppuccinAltThemes";

  let {
    initialValue,
    languageId = "typst",
    readOnly = false,
    monacoTheme,
    onContentChange,
    onReady,
    onDispose,
  } = $props<{
    initialValue: string;
    languageId?: string;
    readOnly?: boolean;
    monacoTheme: string;
    onContentChange: (value: string) => void;
    onReady: (editor: monaco.editor.IStandaloneCodeEditor) => void;
    onDispose?: () => void;
  }>();

  let host: HTMLDivElement | undefined = $state();
  let editorInstance = $state<monaco.editor.IStandaloneCodeEditor | undefined>(
    undefined,
  );

  let typstRegistered = false;

  /** WebKit/iPad: wheel events must hit Monaco’s view + hidden textarea path for smooth inertial scroll; focus if the user scrolls before clicking. */
  function installScrollFocusBridge(ed: monaco.editor.IStandaloneCodeEditor) {
    const dom = ed.getDomNode();
    if (!dom) return () => {};

    const ensureFocused = () => {
      if (!ed.hasTextFocus()) {
        ed.focus();
      }
    };

    dom.addEventListener("pointerdown", ensureFocused, { capture: true });
    dom.addEventListener("wheel", ensureFocused, { capture: true, passive: true });

    return () => {
      dom.removeEventListener("pointerdown", ensureFocused, { capture: true });
      dom.removeEventListener("wheel", ensureFocused, { capture: true });
    };
  }

  onMount(() => {
    let ed: monaco.editor.IStandaloneCodeEditor | undefined;
    let cancelled = false;
    let removeScrollFocusBridge: (() => void) | undefined;
    let layoutRo: ResizeObserver | undefined;

    tick().then(() => {
      if (cancelled || !host) {
        if (!host && !cancelled) {
          console.error("MonacoEditorPane: host element missing");
        }
        return;
      }

      if (!typstRegistered) {
        monaco.languages.register({ id: "typst" });
        monaco.languages.setMonarchTokensProvider("typst", typstLanguage.language);
        monaco.languages.setLanguageConfiguration("typst", typstLanguage.conf);
        typstRegistered = true;
      }

      monaco.editor.defineTheme(MONACO_THEME_ID_LIGHT, MONACO_CAT_LIGHT);
      monaco.editor.defineTheme(MONACO_THEME_ID_DARK, MONACO_CAT_DARK);

      ed = monaco.editor.create(host, {
        value: initialValue,
        language: languageId,
        theme: monacoTheme,
        readOnly,
        minimap: { enabled: false },
        fontSize: 14,
        wordWrap: "on",
        /**
         * automaticLayout uses ResizeObserver + internal sizing; on iPad/WKWebView with transformed
         * ancestors it can disagree with the real box. We measure the host and call layout() explicitly.
         */
        automaticLayout: false,
        /** Extra blank scroll past the last line reads like “Monaco is taller than its slot” on touch. */
        scrollBeyondLastLine: false,
        scrollBeyondLastColumn: 0,
        /** Touch / trackpad momentum inside the editor instead of fighting the webview. */
        inertialScroll: true,
        /** Fewer compositor layers — helps some WebKit bugs with scaled/transformed shells. */
        disableLayerHinting: true,
        overviewRulerLanes: 0,
        scrollbar: {
          vertical: "auto",
          horizontal: "auto",
          useShadows: false,
        },
      });

      if (cancelled) {
        ed.dispose();
        ed = undefined;
        return;
      }

      ed.onDidChangeModelContent(() => {
        onContentChange(ed!.getValue());
      });

      try {
        discoverMonacoActions(ed);
        ensureAppShortcutMetadataInStore();
      } catch (e) {
        console.error("Failed to initialize shortcuts metadata:", e);
      }

      removeScrollFocusBridge = installScrollFocusBridge(ed);

      function layoutEditorToHost() {
        const instance = ed;
        if (!instance || !host) return;
        const w = Math.floor(host.clientWidth);
        const h = Math.floor(host.clientHeight);
        if (w < 2 || h < 2) return;
        instance.layout({ width: w, height: h });
      }

      layoutRo = new ResizeObserver(() => {
        requestAnimationFrame(() => layoutEditorToHost());
      });
      layoutRo.observe(host);
      requestAnimationFrame(() => layoutEditorToHost());

      editorInstance = ed;
      onReady(ed);
    });

    return () => {
      cancelled = true;
      layoutRo?.disconnect();
      layoutRo = undefined;
      removeScrollFocusBridge?.();
      disposeMonacoShortcutOverridesOnly();
      ed?.dispose();
      editorInstance = undefined;
      onDispose?.();
    };
  });

  $effect(() => {
    const ed = editorInstance;
    if (ed && monacoTheme) {
      monaco.editor.setTheme(monacoTheme);
    }
  });

  $effect(() => {
    const ed = editorInstance;
    const id = languageId;
    if (ed) {
      const m = ed.getModel();
      if (m) monaco.editor.setModelLanguage(m, id);
    }
  });

  $effect(() => {
    const ed = editorInstance;
    if (ed) ed.updateOptions({ readOnly });
  });
</script>

<div
  bind:this={host}
  class="h-full min-h-0 w-full min-w-0 flex-1 overflow-hidden"
></div>
