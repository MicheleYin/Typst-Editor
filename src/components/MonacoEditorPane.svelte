<script lang="ts">
  import { onMount, tick } from "svelte";
  import * as monaco from "monaco-editor";
  import * as typstLanguage from "../typst-language";
  import {
    discoverMonacoActions,
    ensureAppShortcutMetadataInStore,
    disposeAllShortcutBindings,
  } from "../lib/shortcuts";

  let {
    initialValue,
    appZoom,
    monacoTheme = "vs-dark",
    onContentChange,
    onReady,
    onDispose,
  } = $props<{
    initialValue: string;
    appZoom: number;
    /** Monaco built-in theme id: vs, vs-dark, hc-black, hc-light */
    monacoTheme?: string;
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

      ed = monaco.editor.create(host, {
        value: initialValue,
        language: "typst",
        theme: monacoTheme,
        minimap: { enabled: false },
        fontSize: 14 * appZoom,
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
      disposeAllShortcutBindings();
      ed?.dispose();
      editorInstance = undefined;
      onDispose?.();
    };
  });

  $effect(() => {
    const ed = editorInstance;
    if (ed && appZoom) {
      ed.updateOptions({ fontSize: 14 * appZoom });
    }
  });

  $effect(() => {
    const ed = editorInstance;
    if (ed && monacoTheme) {
      monaco.editor.setTheme(monacoTheme);
    }
  });
</script>

<div bind:this={host} class="h-full w-full min-h-0"></div>
