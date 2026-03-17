<script lang="ts">
  import { Settings } from "lucide-svelte";

  let { onShowShortcuts, filePath = null, isDirty = false, lastSaved = null } = $props<{
    onShowShortcuts: () => void;
    filePath?: string | null;
    isDirty?: boolean;
    lastSaved?: Date | null;
  }>();

  function formatRelativeTime(date: Date | null | undefined) {
    if (!date) return "";
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);

    if (seconds < 10) return "just now";
    if (seconds < 60) return `${seconds}s ago`;
    if (minutes < 60) return `${minutes}m ago`;
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

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
      <div class="flex items-center gap-2 bg-[#2d2d2d] px-3 py-1 rounded-full border border-[#333]">
        <span class="text-xs text-gray-400">
          {filePath.split('/').pop()}
        </span>
        {#if isDirty}
          <div class="flex items-center gap-1.5 pl-1 border-l border-[#444] ml-1">
            <div class="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
            <span class="text-[10px] uppercase font-bold tracking-wider text-blue-400">Edited</span>
          </div>
        {:else if lastSaved}
          <div class="flex items-center gap-1.5 pl-1 border-l border-[#444] ml-1">
            <div class="w-1.5 h-1.5 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.3)]"></div>
            <span class="text-[10px] uppercase font-bold tracking-wider text-emerald-500 opacity-80">Saved {formatRelativeTime(lastSaved)}</span>
          </div>
        {/if}
      </div>
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
