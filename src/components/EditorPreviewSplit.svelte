<script lang="ts">
  import * as monaco from "monaco-editor";
  import type { ComponentProps } from "svelte";
  import type { TypstFontFace } from "../lib/typstFonts";
  import type { AppAppearance } from "../lib/monacoThemes";
  import type { EmbedPdfDiskSaveApi } from "../lib/embedPdfAppChrome";
  import EditorQuickActions from "./EditorQuickActions.svelte";
  import FilePreviewPane from "./FilePreviewPane.svelte";

  type FilePreviewPaneMode = ComponentProps<typeof FilePreviewPane>["mode"];
  import MonacoEditorPane from "./MonacoEditorPane.svelte";
  import PaneResizeGrip from "./PaneResizeGrip.svelte";

  let {
    editorPreviewRegion = $bindable<HTMLDivElement | undefined>(undefined),
    isPreviewOnlyMedia,
    previewVisible,
    editorPaneMin,
    previewPaneMin,
    splitGripPx,
    splitRatio,
    isResizingSplit,
    onSplitGripPointerDown,
    filePreviewMode,
    resolvedAppearance,
    onPdfDirty,
    onPdfDiskApiReady,
    currentPage = $bindable(0),
    scale = $bindable(1),
    translateX = $bindable(0),
    translateY = $bindable(0),
    editor,
    typstFontFaces,
    showTypstToolbar,
    content,
    editorLanguageId,
    readOnly,
    monacoThemeResolved,
    onContentChange,
    onMonacoReady,
    onMonacoDispose,
  } = $props<{
    editorPreviewRegion?: HTMLDivElement | undefined; // set via bind:
    isPreviewOnlyMedia: boolean;
    previewVisible: boolean;
    editorPaneMin: number;
    previewPaneMin: number;
    splitGripPx: number;
    splitRatio: number;
    isResizingSplit: boolean;
    onSplitGripPointerDown: (e: PointerEvent) => void;
    filePreviewMode: FilePreviewPaneMode;
    resolvedAppearance: AppAppearance;
    onPdfDirty: () => void;
    onPdfDiskApiReady: (api: EmbedPdfDiskSaveApi | null) => void;
    currentPage?: number;
    scale?: number;
    translateX?: number;
    translateY?: number;
    editor: monaco.editor.IStandaloneCodeEditor | undefined;
    typstFontFaces: TypstFontFace[];
    showTypstToolbar: boolean;
    content: string;
    editorLanguageId: string;
    readOnly: boolean;
    monacoThemeResolved: string;
    onContentChange: (v: string) => void;
    onMonacoReady: (ed: monaco.editor.IStandaloneCodeEditor) => void;
    onMonacoDispose: () => void;
  }>();
</script>

<div
  bind:this={editorPreviewRegion}
  class="flex-1 min-h-0 min-w-0 {isPreviewOnlyMedia
    ? 'flex'
    : previewVisible
      ? 'grid'
      : 'flex'}"
  style:grid-template-columns={!isPreviewOnlyMedia && previewVisible
    ? `minmax(${editorPaneMin}px, ${Math.max(1, Math.round(splitRatio * 1000))}fr) ${splitGripPx}px minmax(${previewPaneMin}px, ${Math.max(1, Math.round((1 - splitRatio) * 1000))}fr)`
    : undefined}
>
  {#if isPreviewOnlyMedia}
    <div class="h-full flex flex-col min-w-0 min-h-0 flex-1 overflow-hidden">
      <FilePreviewPane
        mode={filePreviewMode}
        appAppearance={resolvedAppearance}
        {onPdfDirty}
        {onPdfDiskApiReady}
        bind:currentPage
        bind:scale
        bind:translateX
        bind:translateY
      />
    </div>
  {:else}
    <div
      class="h-full relative min-w-0 flex flex-col border-r border-[var(--app-border)] overflow-hidden {previewVisible
        ? 'min-h-0'
        : 'flex-1 min-h-0'}"
    >
      <EditorQuickActions {editor} {typstFontFaces} {showTypstToolbar} />
      <div class="relative flex-1 min-h-0 min-w-0 flex flex-col">
        <MonacoEditorPane
          initialValue={content}
          languageId={editorLanguageId}
          {readOnly}
          monacoTheme={monacoThemeResolved}
          onContentChange={onContentChange}
          onReady={onMonacoReady}
          onDispose={onMonacoDispose}
        />
      </div>
    </div>

    {#if previewVisible}
      <PaneResizeGrip
        active={isResizingSplit}
        onPointerDown={onSplitGripPointerDown}
        ariaLabel="Resize editor and preview"
      />

      <div class="h-full flex flex-col min-w-0 min-h-0 overflow-hidden">
        <FilePreviewPane
          mode={filePreviewMode}
          appAppearance={resolvedAppearance}
          {onPdfDirty}
          {onPdfDiskApiReady}
          bind:currentPage
          bind:scale
          bind:translateX
          bind:translateY
        />
      </div>
    {/if}
  {/if}
</div>
