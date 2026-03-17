<script lang="ts">
  import { X } from "lucide-svelte";
  import { onMount } from "svelte";

  let { isOpen, onClose, title, children } = $props<{
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: any;
  }>();

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && isOpen) {
      onClose();
    }
  }

  onMount(() => {
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  });
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
    onclick={onClose}
  >
    <div
      class="bg-[#252526] border border-[#333] rounded-lg shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
      onclick={(e) => e.stopPropagation()}
    >
      <div class="flex items-center justify-between px-6 py-4 border-b border-[#333]">
        <h2 class="text-sm font-semibold text-gray-200">{title}</h2>
        <button
          onclick={onClose}
          class="p-1 hover:bg-[#333] rounded transition-colors text-gray-400 hover:text-white"
        >
          <X size={18} />
        </button>
      </div>

      <div class="flex-1 overflow-auto p-6">
        {@render children()}
      </div>
    </div>
  </div>
{/if}

<style>
  .animate-in {
    animation-fill-mode: forwards;
  }
  .fade-in {
    animation: fadeIn 0.2s ease-out;
  }
  .zoom-in-95 {
    animation: zoomIn 0.2s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes zoomIn {
    from { transform: scale(0.95); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }
</style>
