import { invoke } from "@tauri-apps/api/core";
import { dirname, join } from "@tauri-apps/api/path";
import { readFile, writeFile, BaseDirectory } from "@tauri-apps/plugin-fs";
import { save, message } from "@tauri-apps/plugin-dialog";
import { isIpadOs } from "./ipadOs";
import type { ExportTypstKindPayload } from "./exportTypstKindPayload";
import { exportStagingRelPath } from "./appExportStaging";
import type { CompileDiagnostic } from "./appCompileTypst";

export async function runTypstExportFromModal(args: {
  payload: ExportTypstKindPayload;
  projectsUseDocumentDir: boolean;
  content: string;
  currentFilePath: string | null;
  /** Opened project / workspace folder; used to load project-local font files. */
  projectFolderPath: string | null;
  setExportBusy: (busy: boolean) => void;
}): Promise<void> {
  const {
    payload,
    projectsUseDocumentDir,
    content,
    currentFilePath,
    projectFolderPath,
    setExportBusy,
  } = args;
  const base = currentFilePath ? currentFilePath.replace(/\.typ$/i, "") : "document";
  const ext =
    payload.kind === "pdf"
      ? "pdf"
      : payload.kind === "svg"
        ? "svg"
        : payload.kind === "png"
          ? "png"
          : "html";
  const defaultPath = `${base}.${ext}`;
  const filterName =
    payload.kind === "pdf"
      ? "PDF"
      : payload.kind === "svg"
        ? "SVG"
        : payload.kind === "png"
          ? "PNG"
          : "HTML";

  if (projectsUseDocumentDir) {
    setExportBusy(true);
    let stage: {
      warnings: CompileDiagnostic[];
      stagingId: string;
      fileNames: string[];
      bundleZip: boolean;
    } | null = null;
    try {
      stage = await invoke<{
        warnings: CompileDiagnostic[];
        stagingId: string;
        fileNames: string[];
        bundleZip: boolean;
      }>("export_typst_stage", {
        content,
        mainPath: currentFilePath ?? null,
        projectFolderPath,
        outputPath: defaultPath,
        exportKind: payload,
      });
      const saveExt = stage.bundleZip ? "zip" : ext;
      const saveDefault = `${base}.${saveExt}`;
      if (isIpadOs()) {
        const rel = exportStagingRelPath(stage.stagingId, stage.fileNames[0]);
        const data = await readFile(rel, { baseDir: BaseDirectory.Document });
        const file = new File([data], stage.fileNames[0], {
          type:
            payload.kind === "pdf"
              ? "application/pdf"
              : payload.kind === "svg"
                ? "image/svg+xml"
                : payload.kind === "png"
                  ? "image/png"
                  : "text/html",
        });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: "Export" });
          } catch (e) {
            if ((e as Error).name !== "AbortError") {
              throw e;
            }
          }
        } else {
          // Fallback if sharing is not supported
          const path = await save({
            defaultPath: saveDefault,
            filters: stage.bundleZip
              ? [{ name: "ZIP archive", extensions: ["zip"] }]
              : [{ name: filterName, extensions: [ext] }],
          });
          if (path === null) return;
          await writeFile(path, data);
        }
      } else {
        const path = await save({
          defaultPath: saveDefault,
          filters: stage.bundleZip
            ? [{ name: "ZIP archive", extensions: ["zip"] }]
            : [{ name: filterName, extensions: [ext] }],
        });
        if (path === null) return;
        if (stage.fileNames.length === 1) {
          const rel = exportStagingRelPath(stage.stagingId, stage.fileNames[0]);
          const data = await readFile(rel, { baseDir: BaseDirectory.Document });
          await writeFile(path, data);
        } else {
          const dir = await dirname(path);
          for (const name of stage.fileNames) {
            const rel = exportStagingRelPath(stage.stagingId, name);
            const data = await readFile(rel, { baseDir: BaseDirectory.Document });
            const dest = await join(dir, name);
            await writeFile(dest, data);
          }
        }
      }
      const w = stage.warnings ?? [];
      const zipNote = stage.bundleZip
        ? "\n\nMulti-page export is saved as a ZIP archive (one file per page)."
        : "";
      const title =
        payload.kind === "pdf"
          ? "Export PDF"
          : payload.kind === "svg"
            ? "Export SVG"
            : payload.kind === "png"
              ? "Export PNG"
              : "Export HTML";
      if (!isIpadOs()) {
        if (w.length > 0) {
          const detail = w.map((d) => d.message).join("\n");
          await message(
            `Export finished.${zipNote}\n\nCompiler warnings (${w.length}):\n${detail}\n\nTip: this app does not load system fonts for Typst — add font files in your project folder, import them in Settings → Typst fonts, or ship them in resources/fonts/bundled.`,
            { title, kind: "info" },
          );
        } else {
          await message(`Export finished.${zipNote}`, { title, kind: "info" });
        }
      }
    } catch (e) {
      await message(String(e), {
        title: "Export failed",
        kind: "error",
      });
    } finally {
      if (stage) {
        await invoke("export_typst_stage_cleanup", {
          stagingId: stage.stagingId,
        }).catch(() => {});
      }
      setExportBusy(false);
    }
    return;
  }

  const path = await save({
    defaultPath,
    filters: [{ name: filterName, extensions: [ext] }],
  });
  if (path === null) return;
  setExportBusy(true);
  try {
    const exportResult = await invoke<{
      warnings: CompileDiagnostic[];
      outputPaths: string[];
    }>("export_typst", {
      content,
      mainPath: currentFilePath ?? null,
      projectFolderPath,
      outputPath: path,
      exportKind: payload,
    });
    const w = exportResult?.warnings ?? [];
    const outs = exportResult?.outputPaths ?? [path];
    const filesNote =
      outs.length > 1
        ? `\n\nFiles written (${outs.length}):\n${outs.map((p) => `• ${p}`).join("\n")}`
        : "";
    const title =
      payload.kind === "pdf"
        ? "Export PDF"
        : payload.kind === "svg"
          ? "Export SVG"
          : payload.kind === "png"
            ? "Export PNG"
            : "Export HTML";
    if (w.length > 0) {
      const detail = w.map((d) => d.message).join("\n");
        await message(
          `Export finished.${filesNote}\n\nCompiler warnings (${w.length}):\n${detail}\n\nTip: this app does not load system fonts for Typst — add font files in your project folder, import them in Settings → Typst fonts, or ship them in resources/fonts/bundled.`,
          { title, kind: "info" },
        );
    } else {
      await message(`Export finished.${filesNote}`, { title, kind: "info" });
    }
  } catch (e) {
    await message(String(e), {
      title: "Export failed",
      kind: "error",
    });
  } finally {
    setExportBusy(false);
  }
}
