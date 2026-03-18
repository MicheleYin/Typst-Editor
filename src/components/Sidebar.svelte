<script lang="ts">
  import { FileText, Folder, ChevronRight, ChevronDown, X } from "lucide-svelte";

  interface SidebarFileItem {
    name: string;
    path: string;
    isDirectory: boolean;
  }

  let { 
    width,
    openFiles, 
    activeFile, 
    currentFolder, 
    folderFiles, 
    onSelectFile, 
    onCloseFile 
  } = $props<{
    width: number;
    openFiles: { path: string; name: string; isDirty?: boolean; lastSaved?: Date | null }[];
    activeFile: string | null;
    currentFolder: string | null;
    folderFiles: SidebarFileItem[];
    onSelectFile: (path: string) => void;
    onCloseFile: (path: string) => void;
  }>();


  let explorerOpen = $state(true);
  let openEditorsOpen = $state(true);

  function formatRelativeTime(date: Date | null | undefined) {
    if (!date) return "";
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (seconds < 10) return "just now";
    if (seconds < 60) return `${seconds}s ago`;
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  }
</script>

<aside
  style:width="{width}px"
  class="h-full shrink-0 bg-[#252526] flex flex-col select-none text-gray-400 overflow-hidden border-r border-[#333]/30 min-w-0 max-w-full"
>
  <!-- No top header to keep it simpler -->

  <!-- Open Editors Section -->
  <div class="flex flex-col">
    <button 
      onclick={() => openEditorsOpen = !openEditorsOpen}
      class="flex items-center gap-1 px-2 py-1.5 bg-[#333]/20 hover:bg-[#333]/40 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-[#333]/30"
    >
      {#if openEditorsOpen}
        <ChevronDown size={14} />
      {:else}
        <ChevronRight size={14} />
      {/if}
      Open Editors
    </button>
    
    {#if openEditorsOpen}
      <div class="flex flex-col py-0.5">
        {#each openFiles as file}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div 
            class="group flex items-center justify-between px-4 py-1 text-xs hover:bg-[#2a2d2e] cursor-pointer {activeFile === file.path ? 'bg-[#37373d] text-white' : ''}"
            onclick={() => onSelectFile(file.path)}
          >
            <div class="flex items-center gap-2 overflow-hidden flex-1">
              <div class="relative">
                <FileText size={14} class={activeFile === file.path ? 'text-blue-400' : 'text-gray-500'} />
                {#if file.isDirty}
                  <div class="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full border border-[#252526]"></div>
                {/if}
              </div>
              <span class="truncate flex-1">{file.name}</span>
              {#if file.lastSaved && !file.isDirty}
                <span class="text-[9px] text-gray-500 whitespace-nowrap opacity-60 group-hover:opacity-100 transition-opacity">
                  {formatRelativeTime(file.lastSaved)}
                </span>
              {/if}
            </div>
            <button 
              type="button"
              onclick={(e) => { e.stopPropagation(); onCloseFile(file.path); }}
              class="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-[#454545] rounded transition-opacity"
            >
              <X size={12} />
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Explorer Section -->
  <div class="flex flex-col flex-1 border-t border-[#333]">
    <button 
      onclick={() => explorerOpen = !explorerOpen}
      class="flex items-center gap-1 px-2 py-1.5 bg-[#333]/20 hover:bg-[#333]/40 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-[#333]/30"
    >
      {#if explorerOpen}
        <ChevronDown size={14} />
      {:else}
        <ChevronRight size={14} />
      {/if}
      {currentFolder ? currentFolder.split('/').pop() : 'No Folder Opened'}
    </button>
    
    {#if explorerOpen}
      <div class="flex flex-1 flex-col py-0.5 overflow-y-auto">
        {#if !currentFolder}
          <div class="p-4 text-center">
            <p class="text-[11px] text-gray-500 leading-relaxed">
              You have not yet opened a folder.
            </p>
          </div>
        {:else}
          {#each folderFiles as item}
            <button 
              type="button"
              class="flex w-full items-center gap-2 px-4 py-0.5 text-xs hover:bg-[#2a2d2e] cursor-pointer {activeFile === item.path ? 'bg-[#37373d] text-white' : ''}"
              onclick={() => onSelectFile(item.path)}
            >
              {#if item.isDirectory}
                <Folder size={14} class="text-blue-400" />
              {:else}
                <FileText size={14} class="text-gray-500" />
              {/if}
              <span class="truncate text-left">{item.name}</span>
            </button>
          {/each}
        {/if}
      </div>
    {/if}
  </div>
</aside>
