/// <reference types="vite/client" />

declare module 'monaco-editor/esm/vs/platform/commands/common/commands.js' {
  export const CommandsRegistry: {
    getCommands(): Map<string, unknown>;
  };
}
