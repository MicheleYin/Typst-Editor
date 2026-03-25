<script lang="ts">
  import { onMount, tick } from "svelte";
  import * as monaco from "monaco-editor";
  import * as typstLanguage from "../typst-language";
  import { bindTinyMistToMonacoEditor } from "../lib/tinymistLsp";
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
    filePath = null,
    languageId = "typst",
    readOnly = false,
    monacoTheme,
    onContentChange,
    onReady,
    onDispose,
  } = $props<{
    initialValue: string;
    filePath?: string | null;
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
    let lspBinding: { dispose: () => void } | null = null;
    let cancelled = false;
    let overflowWidgetsDomNode: HTMLDivElement | undefined;

    tick().then(() => {
      if (cancelled || !host) {
        if (!host && !cancelled) {
          console.error("MonacoEditorPane: host element missing");
        }
        return;
      }

      overflowWidgetsDomNode = document.createElement("div");
      overflowWidgetsDomNode.className = "typst-monaco-overflow-root monaco-component";
      overflowWidgetsDomNode.setAttribute("aria-hidden", "true");
      document.body.appendChild(overflowWidgetsDomNode);

      if (!typstRegistered) {
        monaco.languages.register({ id: "typst" });
        monaco.languages.setLanguageConfiguration("typst", typstLanguage.conf);
        typstRegistered = true;
      }

      monaco.editor.defineTheme(MONACO_THEME_ID_LIGHT, MONACO_CAT_LIGHT);
      monaco.editor.defineTheme(MONACO_THEME_ID_DARK, MONACO_CAT_DARK);

      const initialUri = filePath
        ? monaco.Uri.file(filePath)
        : monaco.Uri.parse("untitled:/main.typ");
      const model =
        monaco.editor.getModel(initialUri) ??
        monaco.editor.createModel(initialValue, languageId, initialUri);

      ed = monaco.editor.create(host, {
        model,
        theme: monacoTheme,
        readOnly,
        minimap: { enabled: false },
        fontSize: 14,
        wordWrap: "on",
        quickSuggestions: true,
        suggestOnTriggerCharacters: true,
        automaticLayout: true,
        "semanticHighlighting.enabled": true,
        links: true,
        /** Middle-click opens links without a modifier (Cmd/Ctrl+click still works). */
        mouseMiddleClickAction: "openLink",
        /** Hover/suggest above adjacent split panes (e.g. PDF). */
        fixedOverflowWidgets: true,
        overflowWidgetsDomNode,
      });

      if (cancelled) {
        ed.dispose();
        overflowWidgetsDomNode.remove();
        ed = undefined;
        return;
      }

      ed.onDidChangeModelContent(() => {
        onContentChange(ed!.getValue());
      });

      if (languageId === "typst") {
        void bindTinyMistToMonacoEditor(ed)
          .then((binding) => {
            lspBinding = binding;
          })
          .catch((e) => {
            console.warn("TinyMist LSP disabled:", e);
          });
      }

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
      lspBinding?.dispose();
      ed?.dispose();
      overflowWidgetsDomNode?.remove();
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
      const uri = filePath
        ? monaco.Uri.file(filePath)
        : monaco.Uri.parse("untitled:/main.typ");
      const current = ed.getModel();
      let next = monaco.editor.getModel(uri);
      if (!next) {
        next = monaco.editor.createModel(
          current?.getValue() ?? initialValue,
          id,
          uri,
        );
      } else if (current && next !== current && next.getValue() !== current.getValue()) {
        next.pushEditOperations(
          [],
          [
            {
              range: next.getFullModelRange(),
              text: current.getValue(),
            },
          ],
          () => null,
        );
      }
      if (ed.getModel() !== next) ed.setModel(next);
      monaco.editor.setModelLanguage(next, id);
    }
  });

  $effect(() => {
    const ed = editorInstance;
    if (ed) ed.updateOptions({ readOnly });
  });
</script>

<div bind:this={host} class="h-full w-full min-h-0 flex-1"></div>
