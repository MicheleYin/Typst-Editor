/**
 * JSON-RPC bridge to in-process tinymist (Tauri): `tinymist_lsp_send` + `tinymist-lsp` events.
 *
 * Workspace: `initialize` uses the app project root (`currentFolder` on desktop, `iosProjectPath` on
 * iOS) so tinymist’s VFS matches files opened via the same paths as `@tauri-apps/plugin-fs`.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import * as monaco from "monaco-editor";

type LspRange = {
  start: { line: number; character: number };
  end: { line: number; character: number };
};

type LspCompletionItem = {
  label: string;
  kind?: number;
  detail?: string;
  documentation?: string | { kind?: string; value: string };
  sortText?: string;
  filterText?: string;
  insertText?: string;
  insertTextFormat?: number;
  textEdit?:
    | { range: LspRange; newText: string }
    | { insert: LspRange; replace: LspRange; newText: string };
  additionalTextEdits?: { range: LspRange; newText: string }[];
  commitCharacters?: string[];
  deprecated?: boolean;
  preselect?: boolean;
  command?: { title: string; command: string; arguments?: unknown[] };
};

type LspCompletionResult =
  | LspCompletionItem[]
  | { isIncomplete?: boolean; items: LspCompletionItem[] }
  | null;

type PendingRequest = {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

let nextLspRequestId = 1;

function toMonacoRange(range: LspRange): monaco.Range {
  return new monaco.Range(
    range.start.line + 1,
    range.start.character + 1,
    range.end.line + 1,
    range.end.character + 1,
  );
}

function toMonacoCompletionItem(
  item: LspCompletionItem,
  model: monaco.editor.ITextModel,
  position: monaco.Position,
): monaco.languages.CompletionItem {
  const word = model.getWordUntilPosition(position);
  let range: monaco.languages.CompletionItem["range"] = new monaco.Range(
    position.lineNumber,
    word.startColumn,
    position.lineNumber,
    word.endColumn,
  );
  let insertText = item.insertText ?? item.label;

  if (item.textEdit) {
    insertText = item.textEdit.newText;
    range = "insert" in item.textEdit
      ? {
          insert: toMonacoRange(item.textEdit.insert),
          replace: toMonacoRange(item.textEdit.replace),
        }
      : toMonacoRange(item.textEdit.range);
  }

  const documentation = item.documentation;
  const suggestion: monaco.languages.CompletionItem = {
    label: item.label,
    kind:
      item.kind != null && item.kind >= 1 && item.kind <= 25
        ? (item.kind as monaco.languages.CompletionItemKind)
        : monaco.languages.CompletionItemKind.Text,
    insertText,
    range,
  };

  if (item.insertTextFormat === 2) {
    suggestion.insertTextRules =
      monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;
  }
  if (item.detail) suggestion.detail = item.detail;
  if (item.sortText) suggestion.sortText = item.sortText;
  if (item.filterText) suggestion.filterText = item.filterText;
  if (item.commitCharacters) suggestion.commitCharacters = item.commitCharacters;
  if (item.preselect) suggestion.preselect = true;
  if (item.deprecated) {
    suggestion.tags = [monaco.languages.CompletionItemTag.Deprecated];
  }
  if (documentation) {
    suggestion.documentation =
      typeof documentation === "string"
        ? documentation
        : { value: documentation.value, isTrusted: false, supportHtml: false };
  }
  if (item.additionalTextEdits) {
    suggestion.additionalTextEdits = item.additionalTextEdits.map((edit) => ({
      range: toMonacoRange(edit.range),
      text: edit.newText,
    }));
  }
  if (item.command) {
    suggestion.command = {
      id: item.command.command,
      title: item.command.title,
      arguments: item.command.arguments,
    };
  }
  return suggestion;
}

/** Convert an absolute filesystem path to a `file://` URI (POSIX + Windows). */
export function pathToFileUri(absPath: string): string {
  const p = absPath.replace(/\\/g, "/");
  if (p.startsWith("//")) {
    return "file:" + encodeURI(p);
  }
  if (/^[A-Za-z]:\//.test(p)) {
    return "file:///" + encodeURI(p);
  }
  return "file://" + encodeURI(p);
}

function lspSeverityToMonaco(sev?: number): monaco.MarkerSeverity {
  switch (sev) {
    case 1:
      return monaco.MarkerSeverity.Error;
    case 2:
      return monaco.MarkerSeverity.Warning;
    case 3:
      return monaco.MarkerSeverity.Info;
    case 4:
      return monaco.MarkerSeverity.Hint;
    default:
      return monaco.MarkerSeverity.Error;
  }
}

export class TinymistLspSession {
  private unlisten: UnlistenFn | null = null;
  private disposed = false;
  private version = 1;
  private workspaceUri: string | null = null;
  private documentUri: string | null = null;
  private editor: monaco.editor.IStandaloneCodeEditor | null = null;
  private completionProvider: monaco.IDisposable | null = null;
  private pendingRequests = new Map<number, PendingRequest>();
  private sendQueue: Promise<void> = Promise.resolve();
  private syncedText = "";

  async init(
    workspaceRootAbs: string,
    editor: monaco.editor.IStandaloneCodeEditor,
    documentAbsPath: string,
    initialText: string,
  ): Promise<void> {
    this.editor = editor;
    this.workspaceUri = pathToFileUri(workspaceRootAbs);
    this.documentUri = pathToFileUri(documentAbsPath);

    this.unlisten = await listen<Record<string, unknown>>("tinymist-lsp", (ev) => {
      if (this.disposed) return;
      this.handleServerMessage(ev.payload);
    });

    const initializeResult = await this.request<{
      capabilities?: {
        completionProvider?: { triggerCharacters?: string[] };
      };
    }>("initialize", {
          processId: null,
          clientInfo: { name: "typst-editor", version: "0.1.0" },
          rootUri: this.workspaceUri,
          workspaceFolders: [
            {
              uri: this.workspaceUri,
              name:
                workspaceRootAbs.split(/[/\\]/).filter(Boolean).at(-1) ?? "workspace",
            },
          ],
          capabilities: {
            textDocument: {
              publishDiagnostics: {},
              completion: {
                dynamicRegistration: false,
                contextSupport: true,
                completionItem: {
                  snippetSupport: true,
                  preselectSupport: true,
                  deprecatedSupport: true,
                  documentationFormat: ["markdown", "plaintext"],
                  tagSupport: { valueSet: [1] },
                },
              },
              synchronization: {
                dynamicRegistration: false,
                didSave: false,
                willSave: false,
                willSaveWaitUntil: false,
              },
            },
            workspace: {
              workspaceFolders: true,
            },
          },
        });

    await this.notify("initialized", {});

    await this.didOpen(initialText);
    const triggerCharacters =
      initializeResult.capabilities?.completionProvider?.triggerCharacters ?? [];
    this.registerCompletionProvider(triggerCharacters);
  }

  async onDidChangeText(_documentAbsPath: string, text: string): Promise<void> {
    if (this.disposed || !this.documentUri) return;
    if (text === this.syncedText) return;
    this.version += 1;
    this.syncedText = text;
    await this.notify("textDocument/didChange", {
      textDocument: { uri: this.documentUri, version: this.version },
      contentChanges: [{ text }],
    });
  }

  private request<T>(method: string, params: unknown): Promise<T> {
    if (this.disposed) return Promise.reject(new Error("Tinymist session is disposed"));
    const id = nextLspRequestId++;
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Tinymist request timed out: ${method}`));
      }, 15000);
      this.pendingRequests.set(id, {
        resolve: (result) => resolve(result as T),
        reject,
        timeout,
      });
      void this.sendMessage({ jsonrpc: "2.0", id, method, params }).catch((error: unknown) => {
        const pending = this.pendingRequests.get(id);
        if (!pending) return;
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(id);
        pending.reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  private async notify(method: string, params: unknown): Promise<void> {
    await this.sendMessage({ jsonrpc: "2.0", method, params });
  }

  private sendMessage(message: Record<string, unknown>): Promise<void> {
    const sending = this.sendQueue.then(() =>
      invoke<void>("tinymist_lsp_send", { message }),
    );
    this.sendQueue = sending.catch(() => undefined);
    return sending;
  }

  private registerCompletionProvider(triggerCharacters: string[]): void {
    if (!this.documentUri) return;
    this.completionProvider = monaco.languages.registerCompletionItemProvider("typst", {
      triggerCharacters,
      provideCompletionItems: async (model, position, context, token) => {
        if (
          this.disposed ||
          model.uri.toString() !== this.documentUri ||
          token.isCancellationRequested
        ) {
          return { suggestions: [] };
        }

        try {
          await this.onDidChangeText(this.documentUri, model.getValue());
          const result = await this.request<LspCompletionResult>(
            "textDocument/completion",
            {
              textDocument: { uri: this.documentUri },
              position: {
                line: position.lineNumber - 1,
                character: position.column - 1,
              },
              context: {
                triggerKind: context.triggerCharacter
                  ? 2
                  : context.triggerKind ===
                      monaco.languages.CompletionTriggerKind.TriggerForIncompleteCompletions
                    ? 3
                    : 1,
                ...(context.triggerCharacter
                  ? { triggerCharacter: context.triggerCharacter }
                  : {}),
              },
            },
          );
          if (token.isCancellationRequested || this.disposed) {
            return { suggestions: [] };
          }
          const items = Array.isArray(result) ? result : (result?.items ?? []);
          return {
            suggestions: items.map((item) =>
              toMonacoCompletionItem(item, model, position),
            ),
            incomplete: !Array.isArray(result) && Boolean(result?.isIncomplete),
          };
        } catch (error) {
          if (!token.isCancellationRequested && !this.disposed) {
            console.warn("Tinymist completion request failed:", error);
          }
          return { suggestions: [] };
        }
      },
    });
  }

  private async didOpen(text: string): Promise<void> {
    if (!this.documentUri) return;
    this.syncedText = text;
    await this.notify("textDocument/didOpen", {
      textDocument: {
        uri: this.documentUri,
        languageId: "typst",
        version: this.version,
        text,
      },
    });
  }

  private handleServerMessage(msg: Record<string, unknown>): void {
    const method = msg.method as string | undefined;
    if (!method && typeof msg.id === "number") {
      const pending = this.pendingRequests.get(msg.id);
      if (!pending) return;
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(msg.id);
      const error = msg.error as { message?: string } | undefined;
      if (error) {
        pending.reject(new Error(error.message ?? "Tinymist request failed"));
      } else {
        pending.resolve(msg.result);
      }
      return;
    }
    if (method === "textDocument/publishDiagnostics") {
      const params = msg.params as { uri?: string; diagnostics?: unknown[] } | undefined;
      const uri = params?.uri;
      const diags = (params?.diagnostics ?? []) as Array<{
        range?: {
          start: { line: number; character: number };
          end: { line: number; character: number };
        };
        message: string;
        severity?: number;
        source?: string;
      }>;
      if (!uri || !this.editor || uri !== this.documentUri) return;
      const model = this.editor.getModel();
      if (!model) return;
      const markers: monaco.editor.IMarkerData[] = diags.map((d) => ({
        severity: lspSeverityToMonaco(d.severity),
        message: d.message,
        startLineNumber: (d.range?.start.line ?? 0) + 1,
        startColumn: (d.range?.start.character ?? 0) + 1,
        endLineNumber: (d.range?.end.line ?? 0) + 1,
        endColumn: (d.range?.end.character ?? 0) + 1,
        source: d.source ?? "tinymist",
      }));
      monaco.editor.setModelMarkers(model, "tinymist", markers);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    if (this.documentUri) {
      void this.notify("textDocument/didClose", {
        textDocument: { uri: this.documentUri },
      }).catch(() => undefined);
    }
    this.disposed = true;
    this.completionProvider?.dispose();
    this.completionProvider = null;
    this.unlisten?.();
    this.unlisten = null;
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Tinymist session is disposed"));
    }
    this.pendingRequests.clear();
    const m = this.editor?.getModel();
    if (m) monaco.editor.setModelMarkers(m, "tinymist", []);
    this.editor = null;
  }
}
