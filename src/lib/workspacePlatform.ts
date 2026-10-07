/**
 * Build-time workspace mode from Tauri’s `TAURI_ENV_PLATFORM`.
 * Must stay aligned with Rust `workspace_projects_use_document_dir` (`target_os = "ios"`).
 */
export const SUPPORTED_TAURI_ENV_PLATFORMS = [
  "ios",
  "darwin",
  "windows",
  "linux",
] as const;

export type SupportedTauriEnvPlatform =
  (typeof SUPPORTED_TAURI_ENV_PLATFORMS)[number];

function isSupportedTauriEnvPlatform(
  platform: string,
): platform is SupportedTauriEnvPlatform {
  return (SUPPORTED_TAURI_ENV_PLATFORMS as readonly string[]).includes(platform);
}

/** `true` = document-dir projects (iOS); `false` = folders on disk (desktop). */
export function projectsUseDocumentDirForPlatform(
  platform: string | undefined = import.meta.env.TAURI_ENV_PLATFORM,
): boolean {
  if (platform === undefined || platform === "") {
    throw new Error(
      "TAURI_ENV_PLATFORM is missing. Run via `tauri dev` / `tauri build`, or set " +
        `TAURI_ENV_PLATFORM to one of: ${SUPPORTED_TAURI_ENV_PLATFORMS.join(", ")}.`,
    );
  }
  if (!isSupportedTauriEnvPlatform(platform)) {
    throw new Error(
      `Unsupported TAURI_ENV_PLATFORM ${JSON.stringify(platform)}. ` +
        `Expected one of: ${SUPPORTED_TAURI_ENV_PLATFORMS.join(", ")}.`,
    );
  }
  switch (platform) {
    case "ios":
      return true;
    case "darwin":
    case "windows":
    case "linux":
      return false;
  }
}
