export const SPLIT_RATIO_KEY = "typst-editor-editor-preview-ratio";
export const EDITOR_PANE_MIN = 100;
export const PREVIEW_PANE_MIN = 100;
export const SPLIT_GRIP_PX = 4;
export const APP_MIN_WIDTH_PX = 400;
export const APP_MIN_HEIGHT_PX = 300;

export const SIDEBAR_W_KEY = "typst-editor-sidebar-width";
export const SIDEBAR_MIN = 160;
export const SIDEBAR_MAX = 560;

export function readStoredSplitRatio(): number {
  try {
    const v = parseFloat(localStorage.getItem(SPLIT_RATIO_KEY) ?? "");
    if (Number.isFinite(v) && v >= 0.08 && v <= 0.92) return v;
  } catch {
    /* ignore */
  }
  return 0.5;
}

export function readStoredSidebarWidth(): number {
  try {
    const v = parseInt(localStorage.getItem(SIDEBAR_W_KEY) ?? "", 10);
    if (Number.isFinite(v)) {
      return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, v));
    }
  } catch {
    /* ignore */
  }
  return 260;
}
