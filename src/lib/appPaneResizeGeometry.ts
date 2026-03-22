import {
  EDITOR_PANE_MIN,
  PREVIEW_PANE_MIN,
  SPLIT_GRIP_PX,
  SIDEBAR_MIN,
  SIDEBAR_MAX,
} from "./appLayoutStorage";

/** Returns new split ratio (editor share), or null if layout is degenerate. */
export function editorSplitRatioFromPointer(
  clientX: number,
  regionRect: DOMRect,
): number | null {
  const innerW = regionRect.width - SPLIT_GRIP_PX;
  if (innerW <= 0) return null;
  const minR = EDITOR_PANE_MIN / innerW;
  const maxR = 1 - PREVIEW_PANE_MIN / innerW;
  if (minR >= maxR) return null;
  const x = clientX - regionRect.left;
  return Math.min(maxR, Math.max(minR, x / innerW));
}

export function sidebarWidthFromPointer(
  clientX: number,
  mainRect: DOMRect,
): number {
  const { left, width: totalW } = mainRect;
  const editorPreviewMin = SPLIT_GRIP_PX + EDITOR_PANE_MIN + PREVIEW_PANE_MIN;
  const max = Math.max(
    SIDEBAR_MIN,
    Math.min(SIDEBAR_MAX, totalW - editorPreviewMin),
  );
  return Math.round(Math.min(max, Math.max(SIDEBAR_MIN, clientX - left)));
}
