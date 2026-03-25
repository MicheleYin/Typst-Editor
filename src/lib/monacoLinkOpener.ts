import * as monaco from "monaco-editor";

let linkOpenerDisposable: monaco.IDisposable | undefined;

function isTauriRuntime(): boolean {
  return typeof globalThis !== "undefined" && "__TAURI_INTERNALS__" in globalThis;
}

async function openExternalHref(href: string): Promise<void> {
  if (isTauriRuntime()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(href);
    return;
  }
  globalThis.open(href, "_blank", "noopener,noreferrer");
}

/**
 * Monaco’s default opener uses `window.open`, which is often blocked in Tauri’s WebView.
 * Registered openers run first; returning true skips the built-in handler.
 */
export function registerMonacoExternalLinkOpener(): void {
  if (linkOpenerDisposable) return;
  linkOpenerDisposable = monaco.editor.registerLinkOpener({
    open: async (resource) => {
      const scheme = resource.scheme.toLowerCase();
      if (scheme === "http" || scheme === "https" || scheme === "mailto") {
        try {
          await openExternalHref(resource.toString());
          return true;
        } catch (e) {
          console.warn("[typst-editor] Could not open link:", e);
          return false;
        }
      }
      if (scheme === "file" && isTauriRuntime()) {
        try {
          const { openPath } = await import("@tauri-apps/plugin-opener");
          await openPath(resource.fsPath);
          return true;
        } catch (e) {
          console.warn("[typst-editor] Could not open file link:", e);
          return false;
        }
      }
      return false;
    },
  });
}
