import type * as monaco from "monaco-editor";
import { selectAllInMonaco } from "./appMonacoSelect";
import type { ShortcutAction } from "./shortcuts";

export type SettingsTab = "shortcuts" | "packageCache" | "fonts" | "faq";

/** Shared handlers for native menus, in-app menu, and keyboard shortcuts. */
export type AppCommandContext = {
  monacoMenuRef: { current: monaco.editor.IStandaloneCodeEditor | undefined };
  handleOpenFile: () => void | Promise<void>;
  hubImportFolderShortcut: () => void | Promise<void>;
  leaveIosProject: () => void | Promise<void>;
  runOpenDesktopProjectFolder: () => void | Promise<void>;
  iosHandleImportTyp: () => void | Promise<void>;
  iosHandleExportProject: () => void | Promise<void>;
  runImportProjectFromZip: () => void | Promise<void>;
  handleSave: () => void | Promise<void>;
  handleSaveAs: () => void | Promise<void>;
  openExportTypstModal: () => void;
  appZoomIn: () => void;
  appZoomOut: () => void;
  resetAppZoom: () => void;
  toggleSidebar: () => void;
  openSettings: (tab?: SettingsTab) => void;
  runEditUndo: () => void;
  runEditRedo: () => void;
  nextPage: () => void;
  prevPage: () => void;
  runNewFileShortcut: () => void | Promise<void>;
};

export function dispatchAppMenuId(id: string, ctx: AppCommandContext): void {
  console.log("[typst-editor:menu] dispatchMenuId:", id);
  switch (id) {
    case "file-new":
      void ctx.runNewFileShortcut();
      break;
    case "file-open":
      void ctx.handleOpenFile();
      break;
    case "file-open-folder":
      void ctx.hubImportFolderShortcut();
      break;
    case "desktop-back-start":
      void ctx.leaveIosProject();
      break;
    case "desktop-open-project-folder":
      void ctx.runOpenDesktopProjectFolder();
      break;
    case "ios-import-typ":
      void ctx.iosHandleImportTyp();
      break;
    case "ios-export-project":
      void ctx.iosHandleExportProject();
      break;
    case "ios-back-projects":
      void ctx.leaveIosProject();
      break;
    case "ios-import-folder-project":
      void ctx.runImportProjectFromZip();
      break;
    case "file-save":
      void ctx.handleSave();
      break;
    case "file-save-as":
      void ctx.handleSaveAs();
      break;
    case "file-export-typst":
      ctx.openExportTypstModal();
      break;
    case "view-zoom-in":
      ctx.appZoomIn();
      break;
    case "view-zoom-out":
      ctx.appZoomOut();
      break;
    case "view-reset-zoom":
      ctx.resetAppZoom();
      break;
    case "view-toggle-sidebar":
      ctx.toggleSidebar();
      break;
    case "help-faq":
      ctx.openSettings("faq");
      break;
    case "help-shortcuts":
      ctx.openSettings("shortcuts");
      break;
    case "help-package-cache":
      ctx.openSettings("packageCache");
      break;
    case "help-fonts":
      ctx.openSettings("fonts");
      break;
    case "edit-select-all": {
      requestAnimationFrame(() => {
        const ed = ctx.monacoMenuRef.current;
        const ae = document.activeElement as HTMLElement | null;
        const inMonaco = ae?.closest?.(".monaco-editor") != null;
        if (inMonaco && ed) {
          selectAllInMonaco(ed);
        } else if (ae instanceof HTMLInputElement || ae instanceof HTMLTextAreaElement) {
          ae.select();
        } else if (ae?.isContentEditable) {
          const sel = document.getSelection();
          const range = document.createRange();
          range.selectNodeContents(ae);
          sel?.removeAllRanges();
          sel?.addRange(range);
        } else if (ed) {
          selectAllInMonaco(ed);
        }
      });
      break;
    }
    case "edit-undo":
      ctx.runEditUndo();
      break;
    case "edit-redo":
      ctx.runEditRedo();
      break;
    case "edit-cut": {
      const ed = ctx.monacoMenuRef.current;
      ed?.focus();
      ed?.trigger("keyboard", "editor.action.clipboardCutAction", null);
      break;
    }
    case "edit-copy": {
      const ed = ctx.monacoMenuRef.current;
      ed?.focus();
      ed?.trigger("keyboard", "editor.action.clipboardCopyAction", null);
      break;
    }
    case "edit-paste": {
      const ed = ctx.monacoMenuRef.current;
      ed?.focus();
      ed?.trigger("keyboard", "editor.action.clipboardPasteAction", null);
      break;
    }
    default:
      console.log("[typst-editor:menu] unhandled menu id:", id);
  }
}

export async function runShortcutAction(
  action: ShortcutAction,
  ctx: AppCommandContext,
): Promise<void> {
  switch (action) {
    case "file.new":
      await ctx.runNewFileShortcut();
      break;
    case "file.open":
      await ctx.handleOpenFile();
      break;
    case "file.openFolder":
      await ctx.hubImportFolderShortcut();
      break;
    case "file.save":
      await ctx.handleSave();
      break;
    case "file.saveAs":
      await ctx.handleSaveAs();
      break;
    case "file.exportTypst":
      ctx.openExportTypstModal();
      break;
    case "view.zoomIn":
      ctx.appZoomIn();
      break;
    case "view.zoomOut":
      ctx.appZoomOut();
      break;
    case "view.resetZoom":
      ctx.resetAppZoom();
      break;
    case "view.nextPage":
      ctx.nextPage();
      break;
    case "view.prevPage":
      ctx.prevPage();
      break;
    case "view.toggleSidebar":
      ctx.toggleSidebar();
      break;
    case "settings.shortcuts":
      ctx.openSettings("shortcuts");
      break;
    case "edit.undo":
      ctx.runEditUndo();
      break;
    case "edit.redo":
      ctx.runEditRedo();
      break;
  }
}
