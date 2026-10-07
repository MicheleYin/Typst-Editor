/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Set by `tauri dev` / `tauri build`. Required allowlist:
   * `ios` | `darwin` | `windows` | `linux`.
   */
  readonly TAURI_ENV_PLATFORM?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'monaco-editor/esm/vs/platform/commands/common/commands.js' {
  export const CommandsRegistry: {
    getCommands(): Map<string, unknown>;
  };
}
