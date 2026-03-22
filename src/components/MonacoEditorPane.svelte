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

  onMount(() => {
    let ed: monaco.editor.IStandaloneCodeEditor | undefined;
    let cancelled = false;

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
        automaticLayout: true,
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

      editorInstance = ed;
      onReady(ed);
    });

    return () => {
      cancelled = true;
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

<div bind:this={host} class="h-full w-full min-h-0 flex-1"></div>
