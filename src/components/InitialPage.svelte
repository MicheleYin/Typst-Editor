<script lang="ts">
  import { FilePlus, FileUp, FolderOpen } from "lucide-svelte";

  let {
    onNewFile,
    onOpenFile,
    onOpenFolder,
  } = $props<{
    onNewFile: () => void;
    onOpenFile: () => void;
    onOpenFolder: () => void;
  }>();
</script>

<div
  class="absolute inset-0 z-[60] flex flex-col items-center justify-center bg-[#1e1e1e] p-8"
>
  <div
    class="max-w-md w-full text-center space-y-8 animate-in fade-in zoom-in duration-500"
  >
    <div class="flex flex-col items-center space-y-4">
      <div
        class="w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-500/20"
      >
        <span class="text-4xl font-bold">T</span>
      </div>
      <h1 class="text-3xl font-bold tracking-tight">Typst Editor</h1>
      <p class="text-gray-400">
        The professional way to write and typeset documents.
      </p>
    </div>

    <div class="grid gap-3 pt-4">
      <button
        type="button"
        onclick={onNewFile}
        class="flex items-center gap-3 p-4 bg-[#2d2d2d] hover:bg-[#333] border border-[#3d3d3d] rounded-xl transition-all group"
      >
        <FilePlus class="text-blue-500 group-hover:scale-110 transition-transform" />
        <div class="text-left">
          <div class="text-sm font-semibold">New File</div>
          <div class="text-xs text-gray-500">Start with a blank document</div>
        </div>
      </button>

      <button
        type="button"
        onclick={onOpenFile}
        class="flex items-center gap-3 p-4 bg-[#2d2d2d] hover:bg-[#333] border border-[#3d3d3d] rounded-xl transition-all group"
      >
        <FileUp class="text-purple-500 group-hover:scale-110 transition-transform" />
        <div class="text-left">
          <div class="text-sm font-semibold">Open File</div>
          <div class="text-xs text-gray-500">Open an existing .typ file</div>
        </div>
      </button>

      <button
        type="button"
        onclick={onOpenFolder}
        class="flex items-center gap-3 p-4 bg-[#2d2d2d] hover:bg-[#333] border border-[#3d3d3d] rounded-xl transition-all group"
      >
        <FolderOpen class="text-amber-500 group-hover:scale-110 transition-transform" />
        <div class="text-left">
          <div class="text-sm font-semibold">Open Folder</div>
          <div class="text-xs text-gray-500">Open a workspace or project</div>
        </div>
      </button>
    </div>

    <div class="pt-8 text-xs text-gray-600">
      Press <kbd
        class="px-1.5 py-0.5 rounded bg-[#2d2d2d] border border-[#3d3d3d] text-gray-400"
        >Cmd</kbd
      >
      +
      <kbd
        class="px-1.5 py-0.5 rounded bg-[#2d2d2d] border border-[#3d3d3d] text-gray-400"
        >K</kbd
      >
      <kbd
        class="px-1.5 py-0.5 rounded bg-[#2d2d2d] border border-[#3d3d3d] text-gray-400"
        >S</kbd
      > for shortcuts
    </div>
  </div>
</div>
