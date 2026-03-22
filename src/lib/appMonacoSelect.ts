import * as monaco from "monaco-editor";

export function selectAllInMonaco(ed: monaco.editor.IStandaloneCodeEditor) {
  const model = ed.getModel();
  if (!model) return;
  const lastLine = model.getLineCount();
  const endCol = model.getLineMaxColumn(lastLine);
  ed.focus();
  ed.setSelection(new monaco.Selection(1, 1, lastLine, endCol));
}
