<script lang="ts">
  import * as monaco from "monaco-editor";
  import {
    Bold,
    Italic,
    Underline,
    Heading1,
    List,
    ListOrdered,
    Sigma,
    Code,
    Braces,
    AtSign,
  } from "lucide-svelte";

  let { editor = undefined } = $props<{
    editor: monaco.editor.IStandaloneCodeEditor | undefined;
  }>();

  const FONT_PRESETS: { label: string; font: string }[] = [
    { label: "Font…", font: "" },
    { label: "New Computer Modern", font: "New Computer Modern" },
    { label: "Linux Libertine", font: "Linux Libertine" },
    { label: "DejaVu Sans", font: "DejaVu Sans" },
    { label: "DejaVu Sans Mono", font: "DejaVu Sans Mono" },
    { label: "IBM Plex Sans", font: "IBM Plex Sans" },
    { label: "Source Serif 4", font: "Source Serif 4" },
  ];

  let fontSelectValue = $state("");

  function withEditor(fn: (ed: monaco.editor.IStandaloneCodeEditor) => void) {
    const ed = editor;
    if (ed) fn(ed);
  }

  function wrapSelection(
    ed: monaco.editor.IStandaloneCodeEditor,
    before: string,
    after: string,
    emptyPlaceholder: string,
  ) {
    const model = ed.getModel();
    const sel = ed.getSelection();
    if (!model || !sel) return;
    const text = model.getValueInRange(sel);
    const inner = text.length > 0 ? text : emptyPlaceholder;
    const replacement = before + inner + after;
    ed.executeEdits("typst-quick", [{ range: sel, text: replacement, forceMoveMarkers: true }]);
    if (text.length === 0) {
      const start = sel.getStartPosition();
      const col = start.column + before.length;
      ed.setSelection(
        new monaco.Selection(start.lineNumber, col, start.lineNumber, col + emptyPlaceholder.length),
      );
    } else {
      ed.focus();
    }
  }

  function insertAtCursor(ed: monaco.editor.IStandaloneCodeEditor, text: string) {
    const sel = ed.getSelection();
    if (!sel) return;
    ed.executeEdits("typst-quick", [{ range: sel, text, forceMoveMarkers: true }]);
    ed.focus();
  }

  function currentLinePrefix(
    ed: monaco.editor.IStandaloneCodeEditor,
    prefix: string,
    altPrefixes: string[] = [],
  ) {
    const model = ed.getModel();
    const pos = ed.getPosition();
    if (!model || !pos) return;
    const line = model.getLineContent(pos.lineNumber);
    const all = [prefix, ...altPrefixes];
    for (const p of all) {
      if (line.startsWith(p)) {
        const rest = line.slice(p.length);
        ed.executeEdits("typst-quick", [
          {
            range: new monaco.Range(pos.lineNumber, 1, pos.lineNumber, line.length + 1),
            text: rest || "",
            forceMoveMarkers: true,
          },
        ]);
        ed.focus();
        return;
      }
    }
    const newLine = prefix + line.replace(/^\s*/, "");
    ed.executeEdits("typst-quick", [
      {
        range: new monaco.Range(pos.lineNumber, 1, pos.lineNumber, line.length + 1),
        text: newLine,
        forceMoveMarkers: true,
      },
    ]);
    ed.focus();
  }

  function setHeadingLevel(level: 1 | 2 | 3 | 4) {
    withEditor((ed) => {
      const model = ed.getModel();
      const pos = ed.getPosition();
      if (!model || !pos) return;
      const line = model.getLineContent(pos.lineNumber);
      const body = line.replace(/^\s*=+\s*/, "").trimStart();
      const prefix = `${"=".repeat(level)} `;
      ed.executeEdits("typst-quick", [
        {
          range: new monaco.Range(pos.lineNumber, 1, pos.lineNumber, line.length + 1),
          text: prefix + body,
          forceMoveMarkers: true,
        },
      ]);
      ed.focus();
    });
  }

  function cycleHeading() {
    withEditor((ed) => {
      const model = ed.getModel();
      const pos = ed.getPosition();
      if (!model || !pos) return;
      const line = model.getLineContent(pos.lineNumber);
      const m = line.match(/^(\s*)(=+)\s/);
      const current = m ? m[2].length : 0;
      const next = current >= 4 || current === 0 ? 1 : current + 1;
      const body = line.replace(/^\s*=+\s*/, "").trimStart();
      const prefix = `${"=".repeat(next)} `;
      ed.executeEdits("typst-quick", [
        {
          range: new monaco.Range(pos.lineNumber, 1, pos.lineNumber, line.length + 1),
          text: prefix + body,
          forceMoveMarkers: true,
        },
      ]);
      ed.focus();
    });
  }

  function onFontChange() {
    const preset = FONT_PRESETS.find((f) => f.font === fontSelectValue);
    if (!preset?.font) return;
    withEditor((ed) => {
      insertAtCursor(ed, `#set text(font: "${preset.font}")\n`);
    });
    fontSelectValue = "";
  }

  const BT = "`";

  const btnClass =
    "inline-flex items-center justify-center h-7 w-7 rounded-md border border-transparent text-[var(--app-fg-secondary)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-fg)] disabled:opacity-40 disabled:pointer-events-none transition-colors";
  const labelClass = "text-[10px] text-[var(--app-fg-muted)] uppercase tracking-wide hidden sm:block max-w-[4.5rem] truncate";

  function wrapInBackticks() {
    withEditor((ed) => wrapSelection(ed, BT, BT, "code"));
  }
</script>

<div
  class="flex flex-wrap items-center gap-1 px-2 py-1 border-b border-[var(--app-border)] bg-[var(--app-surface-toolbar)] shrink-0 gap-y-1"
  role="toolbar"
  aria-label="Typst quick actions"
>
  <select
    class="h-7 max-w-[140px] rounded-md border border-[var(--app-border)] bg-[var(--app-input-bg)] text-[var(--app-input-fg)] text-xs px-1.5 focus:outline-none focus:ring-1 focus:ring-[var(--app-link)] disabled:opacity-40"
    bind:value={fontSelectValue}
    onchange={onFontChange}
    disabled={!editor}
    title="Insert font (#set text)"
  >
    {#each FONT_PRESETS as f}
      <option value={f.font}>{f.label}</option>
    {/each}
  </select>

  <span class="w-px h-5 bg-[var(--app-border)] mx-0.5 shrink-0" aria-hidden="true"></span>

  <button
    type="button"
    class={btnClass}
    disabled={!editor}
    title="Bold (*text*)"
    onclick={() => withEditor((ed) => wrapSelection(ed, "*", "*", "bold"))}
  >
    <Bold size={15} strokeWidth={2.25} />
  </button>
  <button
    type="button"
    class={btnClass}
    disabled={!editor}
    title="Italic (_text_)"
    onclick={() => withEditor((ed) => wrapSelection(ed, "_", "_", "italic"))}
  >
    <Italic size={15} strokeWidth={2.25} />
  </button>
  <button
    type="button"
    class={btnClass}
    disabled={!editor}
    title="Underline (#underline[])"
    onclick={() =>
      withEditor((ed) => wrapSelection(ed, "#underline[", "]", "text"))}
  >
    <Underline size={15} strokeWidth={2.25} />
  </button>

  <span class="w-px h-5 bg-[var(--app-border)] mx-0.5 shrink-0" aria-hidden="true"></span>

  <div class="flex items-center gap-0.5">
    <button
      type="button"
      class={btnClass}
      disabled={!editor}
      title="Cycle heading level (= … ====)"
      onclick={cycleHeading}
    >
      <Heading1 size={15} strokeWidth={2.25} />
    </button>
    <span class={labelClass} title="Heading">H1–H4</span>
    <div class="flex rounded-md border border-[var(--app-border)] overflow-hidden">
      {#each [1, 2, 3, 4] as lv}
        <button
          type="button"
          class="h-7 min-w-[1.5rem] px-1 text-[11px] font-medium text-[var(--app-fg-secondary)] hover:bg-[var(--app-surface-hover)] disabled:opacity-40"
          disabled={!editor}
          title="Heading level {lv}"
          onclick={() => setHeadingLevel(lv as 1 | 2 | 3 | 4)}
        >
          {lv}
        </button>
      {/each}
    </div>
  </div>

  <span class="w-px h-5 bg-[var(--app-border)] mx-0.5 shrink-0" aria-hidden="true"></span>

  <button
    type="button"
    class={btnClass}
    disabled={!editor}
    title="Bullet list (- )"
    onclick={() => withEditor((ed) => currentLinePrefix(ed, "- ", ["+ ", "* "]))}
  >
    <List size={15} strokeWidth={2.25} />
  </button>
  <button
    type="button"
    class={btnClass}
    disabled={!editor}
    title="Numbered list (+ )"
    onclick={() => withEditor((ed) => currentLinePrefix(ed, "+ ", ["- ", "* "]))}
  >
    <ListOrdered size={15} strokeWidth={2.25} />
  </button>

  <span class="w-px h-5 bg-[var(--app-border)] mx-0.5 shrink-0" aria-hidden="true"></span>

  <button
    type="button"
    class={btnClass}
    disabled={!editor}
    title="Inline math — dollar wrap"
    onclick={() => withEditor((ed) => wrapSelection(ed, "$", "$", "x"))}
  >
    <Sigma size={15} strokeWidth={2.25} />
  </button>
  <button
    type="button"
    class={btnClass}
    disabled={!editor}
    title="Inline code (backticks)"
    onclick={() => wrapInBackticks()}
  >
    <Braces size={15} strokeWidth={2.25} />
  </button>
  <button
    type="button"
    class={btnClass}
    disabled={!editor}
    title="Block code (```)"
    onclick={() =>
      withEditor((ed) =>
        insertAtCursor(ed, "```\ncode\n```\n"),
      )}
  >
    <Code size={15} strokeWidth={2.25} />
  </button>

  <span class="w-px h-5 bg-[var(--app-border)] mx-0.5 shrink-0" aria-hidden="true"></span>

  <button
    type="button"
    class={btnClass}
    disabled={!editor}
    title="Reference (@label — after &lt;label&gt;)"
    onclick={() => withEditor((ed) => insertAtCursor(ed, "@"))}
  >
    <AtSign size={15} strokeWidth={2.25} />
  </button>
  <button
    type="button"
    class="hidden sm:inline-flex h-7 items-center rounded-md px-2 text-xs text-[var(--app-fg-muted)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-fg)] disabled:opacity-40"
    disabled={!editor}
    title="Bibliography cite (@key)"
    onclick={() => withEditor((ed) => insertAtCursor(ed, "@key "))}
  >
    @cite
  </button>
</div>
