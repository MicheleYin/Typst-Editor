import * as monaco from "monaco-editor";

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
};

type JsonRpcNotification = {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

type LspPosition = { line: number; character: number };
type LspRange = { start: LspPosition; end: LspPosition };
type LspLocation = { uri: string; range: LspRange };
type LspTextEdit = { range: LspRange; newText: string };

type InitResult = {
  capabilities?: {
    completionProvider?: {
      resolveProvider?: boolean;
      triggerCharacters?: string[];
      allCommitCharacters?: string[];
    };
    hoverProvider?: boolean;
    definitionProvider?: boolean;
    referencesProvider?: boolean;
    renameProvider?: boolean | Record<string, unknown>;
    documentHighlightProvider?: boolean;
    documentSymbolProvider?: boolean;
    documentLinkProvider?: boolean;
    foldingRangeProvider?: boolean;
    documentFormattingProvider?: boolean;
    codeActionProvider?: boolean | { codeActionKinds?: string[] };
    semanticTokensProvider?: {
      legend: { tokenTypes: string[]; tokenModifiers: string[] };
      full?: boolean | Record<string, unknown>;
    };
    inlayHintProvider?: boolean;
    colorProvider?: boolean;
    codeLensProvider?: { resolveProvider?: boolean } | boolean;
    signatureHelpProvider?: { triggerCharacters?: string[] };
    workspaceSymbolProvider?: boolean;
  };
};

const DEFAULT_TINYMIST_WS = "ws://127.0.0.1:7676";
const LANGUAGE_ID = "typst";
const LSP_SEMANTIC_TOKEN_TYPES = [
  "namespace",
  "type",
  "class",
  "enum",
  "interface",
  "struct",
  "typeParameter",
  "parameter",
  "variable",
  "property",
  "enumMember",
  "event",
  "function",
  "method",
  "macro",
  "keyword",
  "modifier",
  "comment",
  "string",
  "number",
  "regexp",
  "operator",
  "decorator",
];
const LSP_SEMANTIC_TOKEN_MODIFIERS = [
  "declaration",
  "definition",
  "readonly",
  "static",
  "deprecated",
  "abstract",
  "async",
  "modification",
  "documentation",
  "defaultLibrary",
];

function getTinymistWsUrl(): string {
  const envUrl = (import.meta as ImportMeta & { env?: Record<string, string> }).env
    ?.VITE_TINYMIST_LSP_WS_URL;
  if (envUrl && envUrl.trim()) return envUrl.trim();
  try {
    const fromStorage = window.localStorage.getItem("typstEditor.tinymistLspWsUrl");
    if (fromStorage && fromStorage.trim()) return fromStorage.trim();
  } catch {
    // Ignore localStorage read failures in strict sandboxed contexts.
  }
  return DEFAULT_TINYMIST_WS;
}

function uriFromModel(model: monaco.editor.ITextModel): string {
  const asString = model.uri.toString();
  if (asString && asString !== "inmemory://model/1") return asString;
  return `untitled:${model.uri.path || "/main.typ"}`;
}

function toLspPos(pos: monaco.Position): LspPosition {
  return { line: pos.lineNumber - 1, character: pos.column - 1 };
}

function toMonacoPos(pos: LspPosition): monaco.Position {
  return new monaco.Position(pos.line + 1, pos.character + 1);
}

function toMonacoRange(range: LspRange): monaco.Range {
  return new monaco.Range(
    range.start.line + 1,
    range.start.character + 1,
    range.end.line + 1,
    range.end.character + 1,
  );
}

function toLspRange(range: monaco.IRange): LspRange {
  return {
    start: { line: range.startLineNumber - 1, character: range.startColumn - 1 },
    end: { line: range.endLineNumber - 1, character: range.endColumn - 1 },
  };
}

function toMonacoLocation(loc: LspLocation): monaco.languages.Location {
  return { uri: monaco.Uri.parse(loc.uri), range: toMonacoRange(loc.range) };
}

function markdownOrString(value: unknown): monaco.IMarkdownString {
  if (typeof value === "string") return { value };
  const v = value as { kind?: string; value?: string } | null;
  if (v?.value) {
    return { value: v.value };
  }
  return { value: "" };
}

function mapSymbolKind(kind = 13): monaco.languages.SymbolKind {
  const k = Number(kind);
  const map: Record<number, monaco.languages.SymbolKind> = {
    1: monaco.languages.SymbolKind.File,
    2: monaco.languages.SymbolKind.Module,
    3: monaco.languages.SymbolKind.Namespace,
    4: monaco.languages.SymbolKind.Package,
    5: monaco.languages.SymbolKind.Class,
    6: monaco.languages.SymbolKind.Method,
    7: monaco.languages.SymbolKind.Property,
    8: monaco.languages.SymbolKind.Field,
    9: monaco.languages.SymbolKind.Constructor,
    10: monaco.languages.SymbolKind.Enum,
    11: monaco.languages.SymbolKind.Interface,
    12: monaco.languages.SymbolKind.Function,
    13: monaco.languages.SymbolKind.Variable,
    14: monaco.languages.SymbolKind.Constant,
    15: monaco.languages.SymbolKind.String,
    16: monaco.languages.SymbolKind.Number,
    17: monaco.languages.SymbolKind.Boolean,
    18: monaco.languages.SymbolKind.Array,
    19: monaco.languages.SymbolKind.Object,
    20: monaco.languages.SymbolKind.Key,
    21: monaco.languages.SymbolKind.Null,
    22: monaco.languages.SymbolKind.EnumMember,
    23: monaco.languages.SymbolKind.Struct,
    24: monaco.languages.SymbolKind.Event,
    25: monaco.languages.SymbolKind.Operator,
    26: monaco.languages.SymbolKind.TypeParameter,
  };
  return map[k] ?? monaco.languages.SymbolKind.Variable;
}

function mapCompletionItemKind(kind?: number): monaco.languages.CompletionItemKind {
  const k = Number(kind ?? 1);
  const map: Record<number, monaco.languages.CompletionItemKind> = {
    1: monaco.languages.CompletionItemKind.Text,
    2: monaco.languages.CompletionItemKind.Method,
    3: monaco.languages.CompletionItemKind.Function,
    4: monaco.languages.CompletionItemKind.Constructor,
    5: monaco.languages.CompletionItemKind.Field,
    6: monaco.languages.CompletionItemKind.Variable,
    7: monaco.languages.CompletionItemKind.Class,
    8: monaco.languages.CompletionItemKind.Interface,
    9: monaco.languages.CompletionItemKind.Module,
    10: monaco.languages.CompletionItemKind.Property,
    11: monaco.languages.CompletionItemKind.Unit,
    12: monaco.languages.CompletionItemKind.Value,
    13: monaco.languages.CompletionItemKind.Enum,
    14: monaco.languages.CompletionItemKind.Keyword,
    15: monaco.languages.CompletionItemKind.Snippet,
    16: monaco.languages.CompletionItemKind.Color,
    17: monaco.languages.CompletionItemKind.File,
    18: monaco.languages.CompletionItemKind.Reference,
    19: monaco.languages.CompletionItemKind.Folder,
    20: monaco.languages.CompletionItemKind.EnumMember,
    21: monaco.languages.CompletionItemKind.Constant,
    22: monaco.languages.CompletionItemKind.Struct,
    23: monaco.languages.CompletionItemKind.Event,
    24: monaco.languages.CompletionItemKind.Operator,
    25: monaco.languages.CompletionItemKind.TypeParameter,
  };
  return map[k] ?? monaco.languages.CompletionItemKind.Text;
}

/** TinyMist encodes semantic token `data` using *its* legend indices — never substitute a client guess. */
function semanticLegendFromServerCapabilities(
  cap: InitResult["capabilities"] | undefined,
): { tokenTypes: string[]; tokenModifiers: string[] } | null {
  const raw = cap?.semanticTokensProvider;
  if (!raw || typeof raw !== "object") return null;
  const legend = (raw as { legend?: { tokenTypes?: unknown; tokenModifiers?: unknown } }).legend;
  if (!legend || !Array.isArray(legend.tokenTypes) || legend.tokenTypes.length === 0) {
    return null;
  }
  const tokenTypes = legend.tokenTypes.filter((t): t is string => typeof t === "string");
  const tokenModifiers = Array.isArray(legend.tokenModifiers)
    ? legend.tokenModifiers.filter((m): m is string => typeof m === "string")
    : [];
  if (tokenTypes.length === 0) return null;
  return { tokenTypes, tokenModifiers };
}

type DecodedSemanticToken = {
  line: number;
  char: number;
  len: number;
  tokenType: number;
  tokenModifiers: number;
};

/** LSP delta encoding → absolute line/char (0-based), UTF-16 like Monaco. */
function decodeSemanticTokenDeltas(data: ReadonlyArray<number>): DecodedSemanticToken[] {
  const out: DecodedSemanticToken[] = [];
  let prevLine = 0;
  let prevChar = 0;
  for (let i = 0; i + 4 < data.length; i += 5) {
    const deltaLine = data[i]!;
    const deltaStart = data[i + 1]!;
    const length = data[i + 2]!;
    const tokenType = data[i + 3]!;
    const tokenModifiers = data[i + 4]!;
    const line = prevLine + deltaLine;
    const char = deltaLine === 0 ? prevChar + deltaStart : deltaStart;
    out.push({ line, char, len: length, tokenType, tokenModifiers });
    prevLine = line;
    prevChar = char;
  }
  return out;
}

function encodeSemanticTokenDeltas(tokens: DecodedSemanticToken[]): Uint32Array {
  const data: number[] = [];
  let prevLine = 0;
  let prevChar = 0;
  for (const t of tokens) {
    const deltaLine = t.line - prevLine;
    const deltaStart = deltaLine === 0 ? t.char - prevChar : t.char;
    data.push(deltaLine, deltaStart, t.len, t.tokenType, t.tokenModifiers);
    prevLine = t.line;
    prevChar = t.char;
  }
  return new Uint32Array(data);
}

/**
 * TinyMist occasionally emits spans that exceed Monaco's line length (UTF-16 drift / sync edge cases).
 * Monaco rejects the whole batch → no highlighting. Clamp to the model and drop empty tokens.
 */
function clampSemanticTokensToModel(
  model: monaco.editor.ITextModel,
  data: ReadonlyArray<number>,
): Uint32Array {
  const decoded = decodeSemanticTokenDeltas(data);
  const lineCount = model.getLineCount();
  const kept: DecodedSemanticToken[] = [];
  let dropped = 0;
  for (const t of decoded) {
    if (t.line < 0 || t.line >= lineCount) {
      dropped++;
      continue;
    }
    const lineNumber = t.line + 1;
    const lineLen = model.getLineLength(lineNumber);
    let char = t.char;
    let len = t.len;
    if (char < 0) char = 0;
    if (char > lineLen) {
      dropped++;
      continue;
    }
    if (char + len > lineLen) {
      len = lineLen - char;
    }
    if (len <= 0) {
      dropped++;
      continue;
    }
    kept.push({ line: t.line, char, len, tokenType: t.tokenType, tokenModifiers: t.tokenModifiers });
  }
  if (dropped > 0) {
    console.debug("[tinymist-lsp] semanticTokens clamped invalid/out-of-range spans", {
      dropped,
      kept: kept.length,
    });
  }
  return encodeSemanticTokenDeltas(kept);
}

/** Monaco CompletionTriggerKind (0..2) → LSP CompletionTriggerKind (1..3). */
function monacoCompletionTriggerToLsp(
  monacoKind: monaco.languages.CompletionTriggerKind,
): number {
  return (monacoKind as number) + 1;
}

const registeredMonacoCommandStubs = new Set<string>();

function ensureMonacoCommandStub(commandId: string): void {
  if (!commandId || registeredMonacoCommandStubs.has(commandId)) return;
  registeredMonacoCommandStubs.add(commandId);
  monaco.editor.addCommand({
    id: commandId,
    run: () => {
      console.info(`[typst-editor] TinyMist code lens command not wired in app: ${commandId}`);
    },
  });
}

class TinyMistLspSession {
  private socket: WebSocket | undefined;
  private initResult: InitResult | undefined;
  private idSeq = 1;
  private readonly pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private initPromise: Promise<void> | undefined;
  private readonly openDocs = new Set<string>();
  private providerDisposables: monaco.IDisposable[] = [];

  async ensureConnected(model: monaco.editor.ITextModel): Promise<void> {
    if (this.initPromise) return this.initPromise;
    const url = getTinymistWsUrl();
    this.initPromise = new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url);
      this.socket = ws;
      ws.onmessage = (ev) => this.handleMessage(ev.data);
      ws.onerror = () => reject(new Error(`TinyMist WebSocket error (${url})`));
      ws.onclose = () => {
        this.failPending(new Error("TinyMist WebSocket closed"));
      };
      ws.onopen = async () => {
        try {
          const rootUri =
            model.uri.scheme === "file"
              ? monaco.Uri.file(model.uri.path.split("/").slice(0, -1).join("/") || "/").toString()
              : null;
          const init = (await this.request("initialize", {
            processId: null,
            clientInfo: { name: "typst-editor", version: "0.1.0" },
            locale: "en",
            rootUri,
            capabilities: {
              textDocument: {
                hover: { contentFormat: ["markdown", "plaintext"] },
                definition: { linkSupport: true },
                references: {},
                documentSymbol: { hierarchicalDocumentSymbolSupport: true },
                foldingRange: {},
                rename: {},
                publishDiagnostics: { relatedInformation: true },
                semanticTokens: {
                  requests: { full: true },
                  tokenTypes: LSP_SEMANTIC_TOKEN_TYPES,
                  tokenModifiers: LSP_SEMANTIC_TOKEN_MODIFIERS,
                  formats: ["relative"],
                },
                inlayHint: {},
                codeAction: { codeActionLiteralSupport: { codeActionKind: { valueSet: [""] } } },
                documentLink: {},
                colorProvider: {},
                codeLens: {},
                signatureHelp: {},
                formatting: {},
              },
              workspace: { symbol: {} },
            },
            initializationOptions: {},
          })) as InitResult;
          this.initResult = init;
          console.info("TinyMist initialized", init.capabilities ?? {});
          this.notify("initialized", {});
          this.registerProviders();
          resolve();
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      };
    });
    return this.initPromise;
  }

  async openModel(model: monaco.editor.ITextModel): Promise<void> {
    await this.ensureConnected(model);
    const uri = uriFromModel(model);
    if (this.openDocs.has(uri)) return;
    this.notify("textDocument/didOpen", {
      textDocument: {
        uri,
        languageId: LANGUAGE_ID,
        version: model.getVersionId(),
        text: model.getValue(),
      },
    });
    this.openDocs.add(uri);
  }

  notifyDidChange(model: monaco.editor.ITextModel): void {
    const uri = uriFromModel(model);
    if (!this.openDocs.has(uri)) return;
    this.notify("textDocument/didChange", {
      textDocument: { uri, version: model.getVersionId() },
      contentChanges: [{ text: model.getValue() }],
    });
  }

  closeModel(model: monaco.editor.ITextModel): void {
    const uri = uriFromModel(model);
    if (!this.openDocs.has(uri)) return;
    this.notify("textDocument/didClose", { textDocument: { uri } });
    this.openDocs.delete(uri);
    monaco.editor.setModelMarkers(model, "tinymist", []);
  }

  async shutdown(): Promise<void> {
    if (!this.socket) return;
    try {
      await this.request("shutdown", {});
      this.notify("exit", {});
    } catch {
      // ignore shutdown transport errors
    }
    this.providerDisposables.forEach((d) => d.dispose());
    this.providerDisposables = [];
    this.socket.close();
    this.socket = undefined;
    this.initPromise = undefined;
    this.initResult = undefined;
    this.openDocs.clear();
  }

  private registerProviders(): void {
    if (!this.initResult) return;
    if (this.providerDisposables.length) return;
    const cap = this.initResult.capabilities ?? {};

    if (cap.hoverProvider !== false) {
      this.providerDisposables.push(
        monaco.languages.registerHoverProvider(LANGUAGE_ID, {
          provideHover: async (model, position) => {
            await this.openModel(model);
            const resp = (await this.request("textDocument/hover", {
              textDocument: { uri: uriFromModel(model) },
              position: toLspPos(position),
            })) as { contents?: unknown; range?: LspRange } | null;
            if (!resp?.contents) return null;
            return {
              range: resp.range ? toMonacoRange(resp.range) : undefined,
              contents: Array.isArray(resp.contents)
                ? resp.contents.map(markdownOrString)
                : [markdownOrString(resp.contents)],
            } satisfies monaco.languages.Hover;
          },
        }),
      );
    }

    {
      this.providerDisposables.push(
        monaco.languages.registerCompletionItemProvider(LANGUAGE_ID, {
          triggerCharacters: cap.completionProvider?.triggerCharacters ?? [
            ".",
            ":",
            "#",
            "@",
            "(",
            ",",
          ],
          provideCompletionItems: async (model, position, context) => {
            await this.openModel(model);
            const lspCtx: { triggerKind: number; triggerCharacter?: string } = {
              triggerKind: monacoCompletionTriggerToLsp(context.triggerKind),
            };
            if (context.triggerCharacter != null && context.triggerCharacter !== "") {
              lspCtx.triggerCharacter = context.triggerCharacter;
            }
            console.debug("[tinymist-lsp] completion request", {
              uri: uriFromModel(model),
              line: position.lineNumber,
              column: position.column,
              lspCtx,
            });
            const resp = (await this.request("textDocument/completion", {
              textDocument: { uri: uriFromModel(model) },
              position: toLspPos(position),
              context: lspCtx,
            })) as
              | { isIncomplete?: boolean; items?: unknown[] }
              | {
                  label: string;
                  kind?: number;
                  detail?: string;
                  documentation?: string | { value?: string };
                  insertText?: string;
                  filterText?: string;
                  sortText?: string;
                  insertTextFormat?: number;
                  textEdit?: { range: LspRange; newText: string };
                }[]
              | null;

            const lspItems = Array.isArray(resp) ? resp : (resp?.items ?? []);
            console.debug("[tinymist-lsp] completion response", {
              isArray: Array.isArray(resp),
              count: lspItems.length,
              incomplete: Array.isArray(resp) ? false : !!resp?.isIncomplete,
            });
            const suggestions: monaco.languages.CompletionItem[] = lspItems
              .map((raw) => {
                const i = raw as {
                  label: string;
                  kind?: number;
                  detail?: string;
                  documentation?: string | { value?: string };
                  insertText?: string;
                  filterText?: string;
                  sortText?: string;
                  insertTextFormat?: number;
                  textEdit?: { range: LspRange; newText: string };
                };
                const doc =
                  typeof i.documentation === "string"
                    ? i.documentation
                    : (i.documentation?.value ?? undefined);
                const range = i.textEdit?.range
                  ? toMonacoRange(i.textEdit.range)
                  : new monaco.Range(
                      position.lineNumber,
                      position.column,
                      position.lineNumber,
                      position.column,
                    );
                return {
                  label: i.label,
                  kind: mapCompletionItemKind(i.kind),
                  detail: i.detail,
                  documentation: doc ? { value: doc } : undefined,
                  insertText: i.textEdit?.newText ?? i.insertText ?? i.label,
                  filterText: i.filterText,
                  sortText: i.sortText,
                  range,
                  insertTextRules:
                    i.insertTextFormat === 2
                      ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                      : monaco.languages.CompletionItemInsertTextRule.None,
                } as monaco.languages.CompletionItem;
              })
              .filter((x) => !!x.label);

            return {
              suggestions,
              incomplete: Array.isArray(resp) ? false : !!resp?.isIncomplete,
            };
          },
        }),
      );
    }

    if (cap.definitionProvider !== false) {
      this.providerDisposables.push(
        monaco.languages.registerDefinitionProvider(LANGUAGE_ID, {
          provideDefinition: async (model, position) => {
            await this.openModel(model);
            const resp = (await this.request("textDocument/definition", {
              textDocument: { uri: uriFromModel(model) },
              position: toLspPos(position),
            })) as LspLocation | LspLocation[] | null;
            if (!resp) return [];
            return (Array.isArray(resp) ? resp : [resp]).map(toMonacoLocation);
          },
        }),
      );
    }

    if (cap.referencesProvider !== false) {
      this.providerDisposables.push(
        monaco.languages.registerReferenceProvider(LANGUAGE_ID, {
          provideReferences: async (model, position, context) => {
            await this.openModel(model);
            const resp = (await this.request("textDocument/references", {
              textDocument: { uri: uriFromModel(model) },
              position: toLspPos(position),
              context: { includeDeclaration: context.includeDeclaration },
            })) as LspLocation[] | null;
            return (resp ?? []).map(toMonacoLocation);
          },
        }),
      );
    }

    if (cap.documentHighlightProvider !== false) {
      this.providerDisposables.push(
        monaco.languages.registerDocumentHighlightProvider(LANGUAGE_ID, {
          provideDocumentHighlights: async (model, position) => {
            await this.openModel(model);
            const resp = (await this.request("textDocument/documentHighlight", {
              textDocument: { uri: uriFromModel(model) },
              position: toLspPos(position),
            })) as { range: LspRange; kind?: number }[] | null;
            return (resp ?? []).map((h) => ({
              range: toMonacoRange(h.range),
              kind:
                h.kind === 2
                  ? monaco.languages.DocumentHighlightKind.Write
                  : h.kind === 3
                    ? monaco.languages.DocumentHighlightKind.Text
                    : monaco.languages.DocumentHighlightKind.Read,
            }));
          },
        }),
      );
    }

    if (cap.documentLinkProvider !== false) {
      this.providerDisposables.push(
        monaco.languages.registerLinkProvider(LANGUAGE_ID, {
          provideLinks: async (model) => {
            await this.openModel(model);
            const resp = (await this.request("textDocument/documentLink", {
              textDocument: { uri: uriFromModel(model) },
            })) as { range: LspRange; target?: string }[] | null;
            return {
              links: (resp ?? []).map((l) => ({
                range: toMonacoRange(l.range),
                url: l.target,
              })),
            };
          },
        }),
      );
    }

    if (cap.documentSymbolProvider !== false) {
      this.providerDisposables.push(
        monaco.languages.registerDocumentSymbolProvider(LANGUAGE_ID, {
          provideDocumentSymbols: async (model) => {
            await this.openModel(model);
            const resp = (await this.request("textDocument/documentSymbol", {
              textDocument: { uri: uriFromModel(model) },
            })) as
              | { name: string; detail?: string; kind?: number; range: LspRange; selectionRange: LspRange }[]
              | null;
            return (resp ?? []).map((s) => ({
              name: s.name,
              detail: s.detail ?? "",
              kind: mapSymbolKind(s.kind),
              range: toMonacoRange(s.range),
              selectionRange: toMonacoRange(s.selectionRange ?? s.range),
              tags: [],
              containerName: "",
            }));
          },
        }),
      );
    }

    if (cap.foldingRangeProvider !== false) {
      this.providerDisposables.push(
        monaco.languages.registerFoldingRangeProvider(LANGUAGE_ID, {
          provideFoldingRanges: async (model) => {
            await this.openModel(model);
            const resp = (await this.request("textDocument/foldingRange", {
              textDocument: { uri: uriFromModel(model) },
            })) as { startLine: number; endLine: number; kind?: string }[] | null;
            return (resp ?? []).map((r) => ({
              start: r.startLine + 1,
              end: r.endLine + 1,
              kind:
                r.kind === "comment"
                  ? monaco.languages.FoldingRangeKind.Comment
                  : r.kind === "imports"
                    ? monaco.languages.FoldingRangeKind.Imports
                    : monaco.languages.FoldingRangeKind.Region,
            }));
          },
        }),
      );
    }

    if (cap.documentFormattingProvider !== false) {
      this.providerDisposables.push(
        monaco.languages.registerDocumentFormattingEditProvider(LANGUAGE_ID, {
          provideDocumentFormattingEdits: async (model, options) => {
            await this.openModel(model);
            const resp = (await this.request("textDocument/formatting", {
              textDocument: { uri: uriFromModel(model) },
              options: {
                tabSize: options.tabSize,
                insertSpaces: options.insertSpaces,
                trimTrailingWhitespace: true,
                insertFinalNewline: true,
                trimFinalNewlines: true,
              },
            })) as LspTextEdit[] | null;
            return (resp ?? []).map((e) => ({
              range: toMonacoRange(e.range),
              text: e.newText,
            }));
          },
        }),
      );
    }

    if (cap.codeActionProvider !== false) {
      this.providerDisposables.push(
        monaco.languages.registerCodeActionProvider(LANGUAGE_ID, {
          provideCodeActions: async (model, range, context) => {
            await this.openModel(model);
            const resp = (await this.request("textDocument/codeAction", {
              textDocument: { uri: uriFromModel(model) },
              range: toLspRange(range),
              context: {
                diagnostics: context.markers.map((m) => ({
                  range: toLspRange(m),
                  message: m.message,
                  severity: m.severity,
                  code: m.code,
                })),
                triggerKind: context.trigger,
              },
            })) as
              | {
                  title: string;
                  kind?: string;
                  edit?: { changes?: Record<string, LspTextEdit[]> };
                  command?: { title: string; command: string; arguments?: unknown[] };
                }[]
              | null;
            const actions = (resp ?? []).map((a) => {
              const edits: monaco.languages.IWorkspaceTextEdit[] = [];
              if (a.edit?.changes) {
                Object.entries(a.edit.changes).forEach(([uri, fileEdits]) => {
                  fileEdits.forEach((e) =>
                    edits.push({
                      resource: monaco.Uri.parse(uri),
                      versionId: undefined,
                      textEdit: { range: toMonacoRange(e.range), text: e.newText },
                    }),
                  );
                });
              }
              return {
                title: a.title,
                kind: a.kind,
                diagnostics: context.markers,
                edit: edits.length ? { edits } : undefined,
                command: a.command
                  ? {
                      id: a.command.command,
                      title: a.command.title || a.title,
                      arguments: a.command.arguments,
                    }
                  : undefined,
              } as monaco.languages.CodeAction;
            });
            return { actions, dispose: () => {} };
          },
        }),
      );
    }

    if (cap.renameProvider !== false) {
      this.providerDisposables.push(
        monaco.languages.registerRenameProvider(LANGUAGE_ID, {
          provideRenameEdits: async (model, position, newName) => {
            await this.openModel(model);
            const resp = (await this.request("textDocument/rename", {
              textDocument: { uri: uriFromModel(model) },
              position: toLspPos(position),
              newName,
            })) as { changes?: Record<string, LspTextEdit[]> } | null;
            const edits: monaco.languages.IWorkspaceTextEdit[] = [];
            if (resp?.changes) {
              Object.entries(resp.changes).forEach(([uri, fileEdits]) => {
                fileEdits.forEach((e) =>
                  edits.push({
                    resource: monaco.Uri.parse(uri),
                    versionId: undefined,
                    textEdit: { range: toMonacoRange(e.range), text: e.newText },
                  }),
                );
              });
            }
            return { edits };
          },
        }),
      );
    }

    {
      const legend = semanticLegendFromServerCapabilities(this.initResult?.capabilities);
      if (!legend) {
        console.warn(
          "[tinymist-lsp] semantic highlighting skipped: server did not advertise semanticTokensProvider.legend (or tokenTypes empty).",
          cap.semanticTokensProvider,
        );
      } else {
        console.info("[tinymist-lsp] using server semantic legend", {
          tokenTypes: legend.tokenTypes.length,
          tokenModifiers: legend.tokenModifiers.length,
        });
        this.providerDisposables.push(
          monaco.languages.registerDocumentSemanticTokensProvider(LANGUAGE_ID, {
            getLegend: () => ({
              tokenTypes: legend.tokenTypes,
              tokenModifiers: legend.tokenModifiers,
            }),
            provideDocumentSemanticTokens: async (model) => {
              await this.openModel(model);
              console.debug("[tinymist-lsp] semanticTokens request", {
                uri: uriFromModel(model),
                version: model.getVersionId(),
              });
              const resp = (await this.request("textDocument/semanticTokens/full", {
                textDocument: { uri: uriFromModel(model) },
              })) as { data?: number[]; resultId?: string } | null;
              const raw = resp?.data ?? [];
              const data = clampSemanticTokensToModel(model, raw);
              console.debug("[tinymist-lsp] semanticTokens response", {
                tokenInts: raw.length,
                tokenCount: Math.floor(raw.length / 5),
                afterClampInts: data.length,
                afterClampTokens: Math.floor(data.length / 5),
                resultId: resp?.resultId,
              });
              return {
                resultId: resp?.resultId ?? String(model.getVersionId()),
                data,
              };
            },
            releaseDocumentSemanticTokens: () => {},
          }),
        );
      }
    }

    if (cap.inlayHintProvider !== false) {
      this.providerDisposables.push(
        monaco.languages.registerInlayHintsProvider(LANGUAGE_ID, {
          provideInlayHints: async (model, range) => {
            await this.openModel(model);
            const resp = (await this.request("textDocument/inlayHint", {
              textDocument: { uri: uriFromModel(model) },
              range: toLspRange(range),
            })) as { position: LspPosition; label: string | { value: string }[]; kind?: number }[] | null;
            const hints = (resp ?? []).map((h) => ({
              position: toMonacoPos(h.position),
              kind:
                h.kind === 2
                  ? monaco.languages.InlayHintKind.Type
                  : monaco.languages.InlayHintKind.Parameter,
              label: Array.isArray(h.label) ? h.label.map((x) => x.value).join("") : h.label,
            }));
            return { hints, dispose: () => {} };
          },
        }),
      );
    }

    if (cap.colorProvider !== false) {
      this.providerDisposables.push(
        monaco.languages.registerColorProvider(LANGUAGE_ID, {
          provideDocumentColors: async (model) => {
            await this.openModel(model);
            const resp = (await this.request("textDocument/documentColor", {
              textDocument: { uri: uriFromModel(model) },
            })) as { range: LspRange; color: { red: number; green: number; blue: number; alpha: number } }[] | null;
            return (resp ?? []).map((c) => ({
              range: toMonacoRange(c.range),
              color: c.color,
            }));
          },
          provideColorPresentations: async (model, colorInfo) => {
            await this.openModel(model);
            const resp = (await this.request("textDocument/colorPresentation", {
              textDocument: { uri: uriFromModel(model) },
              color: colorInfo.color,
              range: toLspRange(colorInfo.range),
            })) as { label: string; textEdit?: LspTextEdit }[] | null;
            return (resp ?? []).map((p) => ({
              label: p.label,
              textEdit: p.textEdit
                ? {
                    range: toMonacoRange(p.textEdit.range),
                    text: p.textEdit.newText,
                  }
                : undefined,
              additionalTextEdits: [],
            }));
          },
        }),
      );
    }

    if (cap.codeLensProvider !== false) {
      this.providerDisposables.push(
        monaco.languages.registerCodeLensProvider(LANGUAGE_ID, {
          provideCodeLenses: async (model) => {
            await this.openModel(model);
            const resp = (await this.request("textDocument/codeLens", {
              textDocument: { uri: uriFromModel(model) },
            })) as { range: LspRange; command?: { title: string; command: string; arguments?: unknown[] } }[] | null;
            const lenses = (resp ?? []).map((l) => {
              if (l.command?.command) {
                ensureMonacoCommandStub(l.command.command);
              }
              return {
                range: toMonacoRange(l.range),
                id: `${l.range.start.line}:${l.range.start.character}`,
                command: l.command
                  ? {
                      id: l.command.command,
                      title: l.command.title,
                      arguments: l.command.arguments,
                    }
                  : undefined,
              };
            });
            return { lenses, dispose: () => {} };
          },
          resolveCodeLens: async (_, codeLens) => codeLens,
        }),
      );
    }

    if (cap.signatureHelpProvider) {
      this.providerDisposables.push(
        monaco.languages.registerSignatureHelpProvider(LANGUAGE_ID, {
          signatureHelpTriggerCharacters: cap.signatureHelpProvider.triggerCharacters ?? ["(", ","],
          signatureHelpRetriggerCharacters: [","],
          provideSignatureHelp: async (model, position) => {
            await this.openModel(model);
            const resp = (await this.request("textDocument/signatureHelp", {
              textDocument: { uri: uriFromModel(model) },
              position: toLspPos(position),
            })) as {
              signatures?: { label: string; documentation?: string }[];
              activeSignature?: number;
              activeParameter?: number;
            } | null;
            return {
              value: {
                signatures: (resp?.signatures ?? []).map((s) => ({
                  label: s.label,
                  documentation: s.documentation ? { value: s.documentation } : undefined,
                  parameters: [],
                })),
                activeSignature: resp?.activeSignature ?? 0,
                activeParameter: resp?.activeParameter ?? 0,
              },
              dispose: () => {},
            };
          },
        }),
      );
    }
  }

  private handleMessage(raw: string): void {
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }
    const msg = payload as JsonRpcResponse & JsonRpcNotification;
    if (typeof msg.id === "number") {
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      this.pending.delete(msg.id);
      if (msg.error) {
        pending.reject(new Error(msg.error.message || "LSP request failed"));
      } else {
        pending.resolve(msg.result);
      }
      return;
    }
    if (msg.method === "textDocument/publishDiagnostics") {
      const params = (msg.params ?? {}) as {
        uri: string;
        diagnostics: {
          range: LspRange;
          severity?: number;
          message: string;
          source?: string;
          code?: string | number;
        }[];
      };
      const model = monaco.editor.getModel(monaco.Uri.parse(params.uri));
      if (!model) return;
      monaco.editor.setModelMarkers(
        model,
        "tinymist",
        (params.diagnostics ?? []).map((d) => ({
          severity:
            d.severity === 1
              ? monaco.MarkerSeverity.Error
              : d.severity === 2
                ? monaco.MarkerSeverity.Warning
                : d.severity === 3
                  ? monaco.MarkerSeverity.Info
                  : monaco.MarkerSeverity.Hint,
          message: d.message,
          source: d.source || "tinymist",
          code: d.code == null ? undefined : String(d.code),
          startLineNumber: d.range.start.line + 1,
          startColumn: d.range.start.character + 1,
          endLineNumber: d.range.end.line + 1,
          endColumn: d.range.end.character + 1,
        })),
      );
    }
  }

  private failPending(err: Error): void {
    this.pending.forEach((p) => p.reject(err));
    this.pending.clear();
  }

  private send(message: JsonRpcRequest | JsonRpcNotification): void {
    const wire = JSON.stringify(message);
    this.socket?.send(wire);
  }

  private request(method: string, params?: unknown): Promise<unknown> {
    const id = this.idSeq++;
    const payload: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.send(payload);
    });
  }

  private notify(method: string, params?: unknown): void {
    const payload: JsonRpcNotification = { jsonrpc: "2.0", method, params };
    this.send(payload);
  }
}

const sessions = new Map<string, TinyMistLspSession>();

type BoundSession = {
  dispose: () => void;
};

export async function bindTinyMistToMonacoEditor(
  editor: monaco.editor.IStandaloneCodeEditor,
): Promise<BoundSession | null> {
  const model = editor.getModel();
  if (!model || model.getLanguageId() !== LANGUAGE_ID) return null;
  const key = LANGUAGE_ID;
  let session = sessions.get(key);
  if (!session) {
    session = new TinyMistLspSession();
    sessions.set(key, session);
  }
  await session.openModel(model);

  const disposables: monaco.IDisposable[] = [];
  disposables.push(
    model.onDidChangeContent(() => {
      session?.notifyDidChange(model);
    }),
  );
  disposables.push(
    editor.onDidChangeModel((ev) => {
      if (ev.oldModelUrl) {
        const oldModel = monaco.editor.getModel(ev.oldModelUrl);
        if (oldModel && oldModel.getLanguageId() === LANGUAGE_ID) session?.closeModel(oldModel);
      }
      const newModel = editor.getModel();
      if (newModel && newModel.getLanguageId() === LANGUAGE_ID) {
        void session?.openModel(newModel);
      }
    }),
  );

  return {
    dispose: () => {
      const m = editor.getModel();
      if (m && m.getLanguageId() === LANGUAGE_ID) {
        session?.closeModel(m);
      }
      disposables.forEach((d) => d.dispose());
    },
  };
}
