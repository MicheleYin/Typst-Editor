<script lang="ts">
  import { Files, Settings, Info } from "lucide-svelte";

  let { 
    activeTab = "explorer",
    onTabClick
  } = $props<{
    activeTab?: string;
    onTabClick?: (id: string) => void;
  }>();

  const tabs = [
    { id: "explorer", icon: Files, label: "Explorer" },
  ];

  const bottomTabs = [
    { id: "settings", icon: Settings, label: "Settings" },
    { id: "info", icon: Info, label: "About" },
  ];
</script>

<div class="w-12 h-full bg-[#333333] flex flex-col items-center py-2 z-40 select-none">
  <div class="flex flex-col gap-1 w-full flex-1">
    {#each tabs as tab}
      <button
        onclick={() => onTabClick?.(tab.id)}
        class="w-full h-12 flex items-center justify-center relative group transition-colors {activeTab === tab.id ? 'text-white' : 'text-gray-400 hover:text-white'}"
        title={tab.label}
      >
        {#if activeTab === tab.id}
          <div class="absolute left-0 top-0 bottom-0 w-0.5 bg-white"></div>
        {/if}
        <tab.icon size={24} strokeWidth={1.5} />
        
        <!-- Tooltip (simplified placeholder) -->
        <div class="fixed left-14 bg-[#252526] text-white text-[11px] px-2 py-1 rounded shadow-lg border border-[#333] opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 whitespace-nowrap">
          {tab.label}
        </div>
      </button>
    {/each}
  </div>

  <div class="flex flex-col gap-1 w-full mt-auto">
    {#each bottomTabs as tab}
      <button
        class="w-full h-12 flex items-center justify-center relative group transition-colors text-gray-400 hover:text-white"
        title={tab.label}
      >
        <tab.icon size={24} strokeWidth={1.5} />
        
        <div class="fixed left-14 bg-[#252526] text-white text-[11px] px-2 py-1 rounded shadow-lg border border-[#333] opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 whitespace-nowrap">
          {tab.label}
        </div>
      </button>
    {/each}
  </div>
</div>
