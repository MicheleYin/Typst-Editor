<script lang="ts">
  import { GripVertical } from "lucide-svelte";

  let {
    active = false,
    onPointerDown,
    ariaLabel,
    title: gripTitle = "Drag to resize",
  } = $props<{
    active?: boolean;
    onPointerDown: (e: PointerEvent) => void;
    ariaLabel: string;
    title?: string;
  }>();
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  onpointerdown={onPointerDown}
  class="resize-grip-host touch-none shrink-0 z-10 relative group flex w-2 items-stretch justify-center cursor-col-resize"
  title={gripTitle}
  role="separator"
  aria-orientation="vertical"
  aria-label={ariaLabel}
>
  <div
    class="w-px self-stretch min-h-[120px] max-h-[80vh] my-auto rounded-full transition-colors bg-[var(--app-grip)] hover:bg-[var(--app-grip-hover)] {active
      ? 'bg-[var(--app-grip-active)]'
      : ''}"
  ></div>
  <div
    class="resize-grip-hint pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-10 w-6 flex items-center justify-center rounded-md bg-[var(--app-bg)] border border-[var(--app-border)]"
  >
    <GripVertical size={16} class="text-[var(--app-icon-muted)]" />
  </div>
</div>

<style>
  /*
   * Resize grip badge (GripVertical): was opacity-0 until :hover, which iPadOS never gets.
   * Show always on touch / coarse pointer; keep hover-to-reveal on fine-pointer desktops.
   */
  .resize-grip-hint {
    opacity: 1;
    transition: opacity 0.15s ease;
  }

  @media (hover: hover) and (pointer: fine) {
    .resize-grip-hint {
      opacity: 0;
    }
    .resize-grip-host:hover .resize-grip-hint {
      opacity: 1;
    }
  }

  @media (pointer: coarse), (hover: none) {
    .resize-grip-hint {
      opacity: 1;
    }
    .resize-grip-host:hover .resize-grip-hint {
      opacity: 1;
    }
  }

  @media (max-width: 639px) and (hover: hover) and (pointer: fine) {
    .resize-grip-hint {
      display: none !important;
    }
  }
</style>
