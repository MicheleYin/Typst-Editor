/** App Documents-relative root for [`export_typst_stage`] output (iOS). */
export const EXPORT_STAGING_ROOT = "typst-editor-export-staging";

export function exportStagingRelPath(stagingId: string, fileName: string): string {
  return `${EXPORT_STAGING_ROOT}/${stagingId}/${fileName}`;
}
