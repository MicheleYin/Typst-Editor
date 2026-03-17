<script lang="ts">
  import { FolderOpen, FilePlus, Save, Settings, Info } from "lucide-svelte";

  let { onOpenFile, onOpenFolder, onSave, onSaveAs, filePath = null } = $props<{
    onOpenFile: () => void;
    onOpenFolder: () => void;
    onSave: () => void;
    onSaveAs: () => void;
    filePath?: string | null;
  }>();



  let activeMenu = $state<string | null>(null);

  const menus = [
    {
      id: "file",
      label: "File",
      items: [
        {
          label: "New File",
          icon: FilePlus,
          action: () => console.log("New File"),
        },
        { label: "Open File...", icon: FolderOpen, action: () => onOpenFile() },
        { label: "Open Folder...", icon: FolderOpen, action: () => onOpenFolder() },
        { label: "Save", icon: Save, action: () => onSave(), shortcut: "⌘S" },
        { label: "Save As...", icon: Save, action: () => onSaveAs(), shortcut: "⇧⌘S" },
      ],

    },
    {
      id: "edit",
      label: "Edit",
      items: [
        {
          label: "Undo",
          icon: null,
          action: () => console.log("Undo"),
          shortcut: "⌘Z",
        },
        {
          label: "Redo",
          icon: null,
          action: () => console.log("Redo"),
          shortcut: "⇧⌘Z",
        },
      ],
    },
    {
      id: "view",
      label: "View",
      items: [
        {
          label: "Zoom In",
          icon: null,
          action: () => console.log("Zoom In"),
          shortcut: "⌘+",
        },
        {
          label: "Zoom Out",
          icon: null,
          action: () => console.log("Zoom Out"),
          shortcut: "⌘-",
        },
      ],
    },
    {
      id: "help",
      label: "Help",
      items: [
        {
          label: "Documentation",
          icon: Info,
          action: () => console.log("Docs"),
        },
        {
          label: "Settings",
          icon: Settings,
          action: () => console.log("Settings"),
        },
      ],
    },
  ];

  function toggleMenu(menuId: string) {
    if (activeMenu === menuId) {
      activeMenu = null;
    } else {
      activeMenu = menuId;
    }
  }

  function handleOutsideClick(e: MouseEvent) {
    if (activeMenu && !(e.target as HTMLElement).closest(".menu-container")) {
      activeMenu = null;
    }
  }
</script>

<svelte:window onmousedown={handleOutsideClick} />

<header
  class="h-10 bg-[#1e1e1e] border-b border-[#333] flex items-center px-4 gap-2 z-50 select-none"
>
  <div class="flex items-center gap-1 mr-4">
    <div class="w-6 h-6 bg-blue-600 rounded flex items-center justify-center">
      <span class="text-[10px] font-bold">T</span>
    </div>
    <span class="text-xs font-semibold text-gray-300">Typst Editor</span>
  </div>

  <div class="flex items-center">
    {#each menus as menu}
      <div class="relative menu-container">
        <button
          onclick={() => toggleMenu(menu.id)}
          class="px-3 py-1 text-xs hover:bg-[#333] rounded transition-colors {activeMenu ===
          menu.id
            ? 'bg-[#333] text-white'
            : 'text-gray-400'}"
        >
          {menu.label}
        </button>

        {#if activeMenu === menu.id}
          <div
            class="absolute top-full left-0 mt-1 w-48 bg-[#252526] border border-[#333] rounded shadow-xl py-1 animate-in fade-in slide-in-from-top-1 duration-100"
          >
            {#each menu.items as item}
              <button
                onclick={() => {
                  item.action();
                  activeMenu = null;
                }}
                class="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-blue-600 hover:text-white flex items-center justify-between group"
              >
                <div class="flex items-center gap-2">
                  {#if item.icon}
                    <item.icon
                      size={14}
                      class="text-gray-500 group-hover:text-white"
                    />
                  {:else}
                    <div class="w-[14px]"></div>
                  {/if}
                  <span>{item.label}</span>
                </div>
                {#if item.shortcut}
                  <span
                    class="text-[10px] text-gray-500 group-hover:text-white ml-auto"
                    >{item.shortcut}</span
                  >
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <div class="ml-auto text-[10px] text-gray-500 flex items-center gap-4">
    {#if filePath}
      <span class="text-blue-400">{filePath.split('/').pop()}</span>
    {/if}
    <span>Typst 0.14.2</span>
  </div>

</header>

<style>
  .animate-in {
    animation: fadeIn 0.1s ease-out;
  }
  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
