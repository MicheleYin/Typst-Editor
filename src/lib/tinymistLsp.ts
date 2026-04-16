/**
 * JSON-RPC bridge to in-process tinymist (Tauri): `tinymist_lsp_send` + `tinymist-lsp` events.
 *
 * Workspace: `initialize` uses the app project root (`currentFolder` on desktop, `iosProjectPath` on
 * iOS) so tinymist’s VFS matches files opened via the same paths as `@tauri-apps/plugin-fs`.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import * as monaco from "monaco-editor";

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
  private nextId = 1;
  private unlisten: UnlistenFn | null = null;
  private disposed = false;
  private version = 1;
  private workspaceUri: string | null = null;
  private documentUri: string | null = null;
  private editor: monaco.editor.IStandaloneCodeEditor | null = null;

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

    const initId = this.nextId++;
    await invoke("tinymist_lsp_send", {
      message: {
        jsonrpc: "2.0",
        id: initId,
        method: "initialize",
        params: {
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
        },
      },
    });

    await invoke("tinymist_lsp_send", {
      message: {
        jsonrpc: "2.0",
        method: "initialized",
        params: {},
      },
    });

    await this.didOpen(initialText);
  }

  async onDidChangeText(_documentAbsPath: string, text: string): Promise<void> {
    if (this.disposed || !this.documentUri) return;
    this.version += 1;
    await invoke("tinymist_lsp_send", {
      message: {
        jsonrpc: "2.0",
        method: "textDocument/didChange",
        params: {
          textDocument: { uri: this.documentUri, version: this.version },
          contentChanges: [{ text }],
        },
      },
    });
  }

  private async didOpen(text: string): Promise<void> {
    if (!this.documentUri) return;
    await invoke("tinymist_lsp_send", {
      message: {
        jsonrpc: "2.0",
        method: "textDocument/didOpen",
        params: {
          textDocument: {
            uri: this.documentUri,
            languageId: "typst",
            version: this.version,
            text,
          },
        },
      },
    });
  }

  private handleServerMessage(msg: Record<string, unknown>): void {
    const method = msg.method as string | undefined;
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
    this.disposed = true;
    this.unlisten?.();
    this.unlisten = null;
    const m = this.editor?.getModel();
    if (m) monaco.editor.setModelMarkers(m, "tinymist", []);
    this.editor = null;
  }
}
