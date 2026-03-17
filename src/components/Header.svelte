<script lang="ts">
  import { Settings } from "lucide-svelte";

  let { onShowShortcuts, filePath = null } = $props<{
    onShowShortcuts: () => void;
    filePath?: string | null;
  }>();

</script>

<header
  class="h-10 bg-[#1e1e1e] border-b border-[#333] flex items-center px-4 gap-2 z-50 select-none"
>
  <div class="flex items-center gap-1 mr-4">
    <div class="w-6 h-6 bg-blue-600 rounded flex items-center justify-center">
      <span class="text-[10px] font-bold">T</span>
    </div>
    <span class="text-xs font-semibold text-gray-300">Typst Editor</span>
  </div>

  <div class="flex-1 flex items-center justify-center">
    {#if filePath}
      <span class="text-xs text-gray-400 bg-[#2d2d2d] px-3 py-1 rounded-full border border-[#333]">
        {filePath.split('/').pop()}
      </span>
    {/if}
  </div>

  <div class="ml-auto flex items-center gap-4">
    <button 
      onclick={onShowShortcuts}
      class="p-1.5 hover:bg-[#333] rounded text-gray-400 hover:text-white transition-colors"
      title="Keyboard Shortcuts"
    >
      <Settings size={16} />
    </button>
    <div class="text-[10px] text-gray-500 hidden sm:block">
      Typst 0.14.2
    </div>
  </div>
</header>

<style>
  /* Keep it clean */
</style>
