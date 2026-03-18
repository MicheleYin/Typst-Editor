<script lang="ts">
  import * as monaco from "monaco-editor";
  import {
    Bold,
    Italic,
    Underline,
    List,
    ListOrdered,
    Sigma,
    Code,
    Braces,
    AtSign,
  } from "lucide-svelte";
  import FontSelectTypst from "./FontSelectTypst.svelte";
  import CustomSelect from "./CustomSelect.svelte";
  import type { TypstFontFace } from "../lib/typstFonts";

  const HEADING_OPTIONS = [
    { id: "plain", label: "Plain" },
    { id: "1", label: "H1" },
    { id: "2", label: "H2" },
    { id: "3", label: "H3" },
    { id: "4", label: "H4" },
    { id: "5", label: "H5" },
  ] as const;

  let {
    editor = undefined,
    typstFontFaces = [],
  } = $props<{
    editor: monaco.editor.IStandaloneCodeEditor | undefined;
    typstFontFaces?: TypstFontFace[];
  }>();

  type ToolbarActive = {
    bold: boolean;
    italic: boolean;
    underline: boolean;
    heading: 0 | 1 | 2 | 3 | 4 | 5;
    bullet: boolean;
    numbered: boolean;
    math: boolean;
    inlineCode: boolean;
  };

  let active = $state<ToolbarActive>({
    bold: false,
    italic: false,
    underline: false,
    heading: 0,
    bullet: false,
    numbered: false,
    math: false,
    inlineCode: false,
  });

  function withEditor(fn: (ed: monaco.editor.IStandaloneCodeEditor) => void) {
    const ed = editor;
    if (ed) fn(ed);
  }

  function refreshActive(ed: monaco.editor.IStandaloneCodeEditor) {
    const model = ed.getModel();
    const pos = ed.getPosition();
    const sel = ed.getSelection();
    if (!model || !pos || !sel) {
      active = {
        bold: false,
        italic: false,
        underline: false,
        heading: 0,
        bullet: false,
        numbered: false,
        math: false,
        inlineCode: false,
      };
      return;
    }
    const line = model.getLineContent(pos.lineNumber);
    const col0 = pos.column - 1;
    const selected = model.getValueInRange(sel);
    const hm = line.match(/^\s*(=+)\s/);
    const h = hm ? hm[1].length : 0;
    const headingLevel = h >= 1 && h <= 5 ? h : 0;

    const inSymmetric = (open: string, close: string, esc: RegExp) => {
      if (selected.length > 0) {
        return (
          selected.startsWith(open) &&
          selected.endsWith(close) &&
          selected.length >= open.length + close.length
        );
      }
      let m: RegExpExecArray | null;
      const re = esc;
      re.lastIndex = 0;
      while ((m = re.exec(line)) !== null) {
        if (col0 >= m.index && col0 <= m.index + m[0].length) return true;
      }
      return false;
    };

    active = {
      bold: inSymmetric("*", "*", /\*([^*]+)\*/g),
      italic: inSymmetric("_", "_", /_([^_]+)_/g),
      underline: (() => {
        if (selected.startsWith("#underline[") && selected.endsWith("]")) return true;
        const u = "#underline[";
        let i = 0;
        while ((i = line.indexOf(u, i)) !== -1) {
          const start = i + u.length;
          let depth = 1;
          let j = start;
          while (j < line.length && depth > 0) {
            const c = line[j];
            if (c === "[") depth++;
            else if (c === "]") depth--;
            j++;
          }
          if (depth === 0 && col0 >= i && col0 < j) return true;
          i++;
        }
        return false;
      })(),
      heading: headingLevel as 0 | 1 | 2 | 3 | 4 | 5,
      bullet: /^\s*[-*]\s/.test(line),
      numbered: /^\s*\+\s/.test(line),
      math: inSymmetric("$", "$", /\$([^$]+)\$/g),
      inlineCode:
        selected.startsWith("`") && selected.endsWith("`") && selected.length >= 2
          ? true
          : (() => {
              const re = /`([^`]+)`/g;
              let m: RegExpExecArray | null;
              while ((m = re.exec(line)) !== null) {
                if (col0 >= m.index && col0 <= m.index + m[0].length) return true;
              }
              return false;
            })(),
    };
  }

  $effect(() => {
    const ed = editor;
    if (!ed) {
      active = {
        bold: false,
        italic: false,
        underline: false,
        heading: 0,
        bullet: false,
        numbered: false,
        math: false,
        inlineCode: false,
      };
      return;
    }
    const run = () => refreshActive(ed);
    run();
    const d1 = ed.onDidChangeCursorSelection(run);
    const m = ed.getModel();
    const d2 = m?.onDidChangeContent(run);
    return () => {
      d1.dispose();
      d2?.dispose();
    };
  });

  function insertAtCursor(ed: monaco.editor.IStandaloneCodeEditor, text: string) {
    const sel = ed.getSelection();
    if (!sel) return;
    ed.executeEdits("typst-quick", [{ range: sel, text, forceMoveMarkers: true }]);
    ed.focus();
  }

  /** Toggle single-char symmetric wrap: *bold*, _italic_, $math$ */
  function toggleSymmetricWrap(
    ed: monaco.editor.IStandaloneCodeEditor,
    delim: string,
    placeholder: string,
  ) {
    const model = ed.getModel();
    const sel = ed.getSelection();
    if (!model || !sel) return;
    const start = sel.getStartPosition();
    const text = model.getValueInRange(sel);
    const line = model.getLineContent(start.lineNumber);
    const col0 = start.column - 1;

    const unwrapRange = (lineNum: number, fromCol: number, toCol: number, inner: string) => {
      ed.executeEdits("typst-quick", [
        {
          range: new monaco.Range(lineNum, fromCol, lineNum, toCol),
          text: inner,
          forceMoveMarkers: true,
        },
      ]);
      ed.setSelection(
        new monaco.Selection(lineNum, fromCol, lineNum, fromCol + inner.length),
      );
      ed.focus();
    };

    if (text.length > 0) {
      if (text.startsWith(delim) && text.endsWith(delim) && text.length >= 2) {
        const inner = text.slice(1, -1);
        ed.executeEdits("typst-quick", [
          { range: sel, text: inner, forceMoveMarkers: true },
        ]);
        ed.setSelection(
          new monaco.Selection(start.lineNumber, start.column, start.lineNumber, start.column + inner.length),
        );
      } else {
        const inner = text.length > 0 ? text : placeholder;
        const replacement = delim + inner + delim;
        ed.executeEdits("typst-quick", [
          { range: sel, text: replacement, forceMoveMarkers: true },
        ]);
        if (text.length === 0) {
          const col = start.column + 1;
          ed.setSelection(
            new monaco.Selection(start.lineNumber, col, start.lineNumber, col + placeholder.length),
          );
        }
      }
      ed.focus();
      refreshActive(ed);
      return;
    }

    const esc =
      delim === "*"
        ? /\*([^*]+)\*/g
        : delim === "_"
          ? /_([^_]+)_/g
          : /\$([^$]+)\$/g;
    let m: RegExpExecArray | null;
    esc.lastIndex = 0;
    while ((m = esc.exec(line)) !== null) {
      if (col0 >= m.index && col0 <= m.index + m[0].length) {
        unwrapRange(start.lineNumber, m.index + 1, m.index + m[0].length + 1, m[1]);
        refreshActive(ed);
        return;
      }
    }

    const inner = placeholder;
    const replacement = delim + inner + delim;
    ed.executeEdits("typst-quick", [
      {
        range: sel,
        text: replacement,
        forceMoveMarkers: true,
      },
    ]);
    const col = start.column + delim.length;
    ed.setSelection(
      new monaco.Selection(start.lineNumber, col, start.lineNumber, col + inner.length),
    );
    ed.focus();
    refreshActive(ed);
  }

  const UNDERLINE_OPEN = "#underline[";

  function toggleUnderline(ed: monaco.editor.IStandaloneCodeEditor) {
    const model = ed.getModel();
    const sel = ed.getSelection();
    if (!model || !sel) return;
    const start = sel.getStartPosition();
    const line = model.getLineContent(start.lineNumber);
    const col0 = start.column - 1;
    const text = model.getValueInRange(sel);

    const findUnderlineSpanAt = (col: number): { start: number; end: number; inner: string } | null => {
      let i = 0;
      while ((i = line.indexOf(UNDERLINE_OPEN, i)) !== -1) {
        const openEnd = i + UNDERLINE_OPEN.length;
        let depth = 1;
        let j = openEnd;
        while (j < line.length && depth > 0) {
          const c = line[j];
          if (c === "[") depth++;
          else if (c === "]") depth--;
          j++;
        }
        if (depth === 0 && col >= i && col < j) {
          return { start: i, end: j, inner: line.slice(openEnd, j - 1) };
        }
        i++;
      }
      return null;
    };

    if (text.length > 0) {
      if (text.startsWith(UNDERLINE_OPEN) && text.endsWith("]")) {
        let depth = 1;
        let j = UNDERLINE_OPEN.length;
        while (j < text.length - 1 && depth > 0) {
          const c = text[j];
          if (c === "[") depth++;
          else if (c === "]") depth--;
          j++;
        }
        if (depth === 0) {
          const inner = text.slice(UNDERLINE_OPEN.length, j);
          ed.executeEdits("typst-quick", [{ range: sel, text: inner, forceMoveMarkers: true }]);
          ed.setSelection(
            new monaco.Selection(
              start.lineNumber,
              start.column,
              start.lineNumber,
              start.column + inner.length,
            ),
          );
        } else {
          ed.executeEdits("typst-quick", [
            {
              range: sel,
              text: UNDERLINE_OPEN + text + "]",
              forceMoveMarkers: true,
            },
          ]);
          const innerEnd = start.column + UNDERLINE_OPEN.length + text.length;
          ed.setSelection(
            new monaco.Selection(
              start.lineNumber,
              innerEnd,
              start.lineNumber,
              innerEnd,
            ),
          );
        }
      } else {
        ed.executeEdits("typst-quick", [
          {
            range: sel,
            text: UNDERLINE_OPEN + text + "]",
            forceMoveMarkers: true,
          },
        ]);
        const innerEnd = start.column + UNDERLINE_OPEN.length + text.length;
        ed.setSelection(
          new monaco.Selection(
            start.lineNumber,
            innerEnd,
            start.lineNumber,
            innerEnd,
          ),
        );
      }
      ed.focus();
      refreshActive(ed);
      return;
    }

    const span = findUnderlineSpanAt(col0);
    if (span) {
      ed.executeEdits("typst-quick", [
        {
          range: new monaco.Range(
            start.lineNumber,
            span.start + 1,
            start.lineNumber,
            span.end + 1,
          ),
          text: span.inner,
          forceMoveMarkers: true,
        },
      ]);
      ed.setSelection(
        new monaco.Selection(
          start.lineNumber,
          span.start + 1,
          start.lineNumber,
          span.start + 1 + span.inner.length,
        ),
      );
      ed.focus();
      refreshActive(ed);
      return;
    }

    const repl = `${UNDERLINE_OPEN}]`;
    ed.executeEdits("typst-quick", [{ range: sel, text: repl, forceMoveMarkers: true }]);
    const inside = start.column + UNDERLINE_OPEN.length;
    ed.setSelection(
      new monaco.Selection(start.lineNumber, inside, start.lineNumber, inside),
    );
    ed.focus();
    refreshActive(ed);
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
        refreshActive(ed);
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
    refreshActive(ed);
  }

  function applyHeadingLevel(level: 1 | 2 | 3 | 4 | 5) {
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
      refreshActive(ed);
    });
  }

  function clearHeadingLine() {
    withEditor((ed) => {
      const model = ed.getModel();
      const pos = ed.getPosition();
      if (!model || !pos) return;
      const line = model.getLineContent(pos.lineNumber);
      if (!/^\s*=+\s/.test(line)) {
        ed.focus();
        return;
      }
      const body = line.replace(/^\s*=+\s*/, "").trimStart();
      ed.executeEdits("typst-quick", [
        {
          range: new monaco.Range(pos.lineNumber, 1, pos.lineNumber, line.length + 1),
          text: body,
          forceMoveMarkers: true,
        },
      ]);
      ed.focus();
      refreshActive(ed);
    });
  }

  function onHeadingDropdownChange(id: string) {
    if (id === "plain") clearHeadingLine();
    else applyHeadingLevel(Number(id) as 1 | 2 | 3 | 4 | 5);
  }

  const headingDropdownValue = $derived(
    active.heading === 0 ? "plain" : String(active.heading),
  );

  function toggleBackticks(ed: monaco.editor.IStandaloneCodeEditor) {
    const BT = "`";
    const model = ed.getModel();
    const sel = ed.getSelection();
    if (!model || !sel) return;
    const start = sel.getStartPosition();
    const line = model.getLineContent(start.lineNumber);
    const col0 = start.column - 1;
    const text = model.getValueInRange(sel);

    if (text.length > 0) {
      if (text.startsWith(BT) && text.endsWith(BT) && text.length >= 2) {
        const inner = text.slice(1, -1);
        ed.executeEdits("typst-quick", [{ range: sel, text: inner, forceMoveMarkers: true }]);
        ed.setSelection(
          new monaco.Selection(start.lineNumber, start.column, start.lineNumber, start.column + inner.length),
        );
      } else {
        ed.executeEdits("typst-quick", [
          { range: sel, text: BT + text + BT, forceMoveMarkers: true },
        ]);
      }
      ed.focus();
      refreshActive(ed);
      return;
    }

    const re = /`([^`]+)`/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      if (col0 >= m.index && col0 <= m.index + m[0].length) {
        ed.executeEdits("typst-quick", [
          {
            range: new monaco.Range(
              start.lineNumber,
              m.index + 1,
              start.lineNumber,
              m.index + m[0].length + 1,
            ),
            text: m[1],
            forceMoveMarkers: true,
          },
        ]);
        ed.setSelection(
          new monaco.Selection(
            start.lineNumber,
            m.index + 1,
            start.lineNumber,
            m.index + 1 + m[1].length,
          ),
        );
        ed.focus();
        refreshActive(ed);
        return;
      }
    }

    const ph = "code";
    const repl = BT + ph + BT;
    ed.executeEdits("typst-quick", [{ range: sel, text: repl, forceMoveMarkers: true }]);
    const col = start.column + 1;
    ed.setSelection(
      new monaco.Selection(start.lineNumber, col, start.lineNumber, col + ph.length),
    );
    ed.focus();
    refreshActive(ed);
  }

  function onFontPick(typstFont: string) {
    withEditor((ed) => {
      const escaped = typstFont.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      insertAtCursor(ed, `#set text(font: "${escaped}")\n`);
    });
  }

  const btnClass =
    "inline-flex items-center justify-center h-7 w-7 rounded-md border border-transparent text-[var(--app-fg-secondary)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-fg)] disabled:opacity-40 disabled:pointer-events-none transition-colors";
  const btnActive =
    "bg-[var(--app-surface-active)] text-[var(--app-fg)] ring-1 ring-[var(--app-border-strong)]";
  function btnClassWithActive(on: boolean) {
    return `${btnClass}${on ? ` ${btnActive}` : ""}`;
  }
</script>

<div
  class="flex flex-wrap items-center gap-1 px-2 py-1 border-b border-[var(--app-border)] bg-[var(--app-surface-toolbar)] shrink-0 gap-y-1"
  role="toolbar"
  aria-label="Typst quick actions"
>
  <FontSelectTypst faces={typstFontFaces} disabled={!editor} onPick={onFontPick} />

  <span class="w-px h-5 bg-[var(--app-border)] mx-0.5 shrink-0" aria-hidden="true"></span>

  <button
    type="button"
    class={btnClassWithActive(active.bold)}
    disabled={!editor}
    title="Bold (*text*) — click again to remove"
    aria-pressed={active.bold}
    onclick={() => withEditor((ed) => toggleSymmetricWrap(ed, "*", "bold"))}
  >
    <Bold size={15} strokeWidth={2.25} />
  </button>
  <button
    type="button"
    class={btnClassWithActive(active.italic)}
    disabled={!editor}
    title="Italic (_text_) — click again to remove"
    aria-pressed={active.italic}
    onclick={() => withEditor((ed) => toggleSymmetricWrap(ed, "_", "italic"))}
  >
    <Italic size={15} strokeWidth={2.25} />
  </button>
  <button
    type="button"
    class={btnClassWithActive(active.underline)}
    disabled={!editor}
    title="Underline (#underline[]) — click again to remove"
    aria-pressed={active.underline}
    onclick={() => withEditor((ed) => toggleUnderline(ed))}
  >
    <Underline size={15} strokeWidth={2.25} />
  </button>

  <span class="w-px h-5 bg-[var(--app-border)] mx-0.5 shrink-0" aria-hidden="true"></span>

  <CustomSelect
    id="quick-heading"
    label="Heading"
    title="Heading level (= … =====)"
    class="[&_button]:h-7 [&_button]:min-h-7 [&_button]:max-h-7 [&_button]:min-w-[4.5rem] [&_button]:max-w-[5.5rem] [&_button]:py-0 [&_button]:px-2 [&_button]:text-[10px] [&_button]:leading-none"
    value={headingDropdownValue}
    options={[...HEADING_OPTIONS]}
    disabled={!editor}
    onChange={onHeadingDropdownChange}
  />

  <span class="w-px h-5 bg-[var(--app-border)] mx-0.5 shrink-0" aria-hidden="true"></span>

  <button
    type="button"
    class={btnClassWithActive(active.bullet)}
    disabled={!editor}
    title="Bullet list (-) — toggle off"
    aria-pressed={active.bullet}
    onclick={() => withEditor((ed) => currentLinePrefix(ed, "- ", ["+ ", "* "]))}
  >
    <List size={15} strokeWidth={2.25} />
  </button>
  <button
    type="button"
    class={btnClassWithActive(active.numbered)}
    disabled={!editor}
    title="Numbered list (+) — toggle off"
    aria-pressed={active.numbered}
    onclick={() => withEditor((ed) => currentLinePrefix(ed, "+ ", ["- ", "* "]))}
  >
    <ListOrdered size={15} strokeWidth={2.25} />
  </button>

  <span class="w-px h-5 bg-[var(--app-border)] mx-0.5 shrink-0" aria-hidden="true"></span>

  <button
    type="button"
    class={btnClassWithActive(active.math)}
    disabled={!editor}
    title="Inline math ($x$) — click again to remove"
    aria-pressed={active.math}
    onclick={() => withEditor((ed) => toggleSymmetricWrap(ed, "$", "x"))}
  >
    <Sigma size={15} strokeWidth={2.25} />
  </button>
  <button
    type="button"
    class={btnClassWithActive(active.inlineCode)}
    disabled={!editor}
    title="Inline code (`code`) — click again to remove"
    aria-pressed={active.inlineCode}
    onclick={() => withEditor((ed) => toggleBackticks(ed))}
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
