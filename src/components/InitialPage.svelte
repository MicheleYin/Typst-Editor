<script lang="ts">
  import { FilePlus, FileUp, FolderOpen } from "lucide-svelte";

  let { appName, onNewFile, onOpenFile, onOpenFolder } = $props<{
    appName: string;
    onNewFile: () => void;
    onOpenFile: () => void;
    onOpenFolder: () => void;
  }>();
</script>

<div
  class="absolute inset-0 z-[60] flex flex-col items-center justify-center bg-[var(--app-bg)] p-8 overflow-y-auto text-[var(--app-fg)]"
>
  <div
    class="max-w-md w-full text-center space-y-8 animate-in fade-in zoom-in duration-500"
  >
    <div class="flex flex-col items-center space-y-4">
      <div
        class="w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-500/20"
      >
        <span class="text-4xl font-bold text-white">T</span>
      </div>
      <h1 class="text-3xl font-bold tracking-tight">{appName}</h1>
      <p class="text-[var(--app-fg-secondary)]">
        The professional way to write and typeset documents.
      </p>
    </div>

    <div class="grid gap-3 pt-4">
      <button
        type="button"
        onclick={onNewFile}
        class="flex items-center gap-3 p-4 bg-[var(--app-surface-elevated)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-card-border)] rounded-xl transition-all group text-left text-[var(--app-fg)]"
      >
        <FilePlus class="text-blue-500 group-hover:scale-110 transition-transform shrink-0" />
        <div>
          <div class="text-sm font-semibold">New File</div>
          <div class="text-xs text-[var(--app-fg-muted)]">Start with a blank document</div>
        </div>
      </button>

      <button
        type="button"
        onclick={onOpenFile}
        class="flex items-center gap-3 p-4 bg-[var(--app-surface-elevated)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-card-border)] rounded-xl transition-all group text-left text-[var(--app-fg)]"
      >
        <FileUp class="text-purple-500 group-hover:scale-110 transition-transform shrink-0" />
        <div>
          <div class="text-sm font-semibold">Open File</div>
          <div class="text-xs text-[var(--app-fg-muted)]">Open an existing .typ file</div>
        </div>
      </button>

      <button
        type="button"
        onclick={onOpenFolder}
        class="flex items-center gap-3 p-4 bg-[var(--app-surface-elevated)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-card-border)] rounded-xl transition-all group text-left text-[var(--app-fg)]"
      >
        <FolderOpen class="text-amber-500 group-hover:scale-110 transition-transform shrink-0" />
        <div>
          <div class="text-sm font-semibold">Open Folder</div>
          <div class="text-xs text-[var(--app-fg-muted)]">Open a workspace or project</div>
        </div>
      </button>
    </div>
  </div>
</div>
