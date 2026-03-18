<script lang="ts">
  import { onMount, tick } from "svelte";
  import { ChevronDown } from "lucide-svelte";

  let {
    value = "",
    options = [],
    onChange,
    label = "",
    title = "",
    id = "custom-select",
    /** Align dropdown to trigger start or end (e.g. end for header toolbar) */
    align = "start",
    disabled = false,
    class: className = "",
  } = $props<{
    value: string;
    options: { id: string; label: string }[];
    onChange: (id: string) => void;
    label?: string;
    title?: string;
    id?: string;
    align?: "start" | "end";
    disabled?: boolean;
    class?: string;
  }>();

  let open = $state(false);
  let rootEl: HTMLDivElement | undefined = $state();
  let menuEl: HTMLDivElement | undefined = $state();

  type Opt = { id: string; label: string };

  const selectedLabel = $derived(
    options.find((o: Opt) => o.id === value)?.label ?? value,
  );

  const listId = $derived(`${id}-listbox`);

  function close() {
    open = false;
  }

  function pick(idVal: string) {
    onChange(idVal);
    close();
  }

  function toggle(e: MouseEvent) {
    e.stopPropagation();
    if (disabled) return;
    open = !open;
  }

  $effect(() => {
    if (open) {
      void tick().then(() => {
        const first = menuEl?.querySelector<HTMLElement>('[role="option"]');
        first?.focus();
      });
    }
  });

  onMount(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!open || !rootEl) return;
      if (!rootEl.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  });

  function onMenuKeydown(e: KeyboardEvent) {
    const items = menuEl?.querySelectorAll<HTMLElement>('[role="option"]');
    if (!items?.length) return;
    const list = [...items];
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = i < 0 ? 0 : Math.min(i + 1, list.length - 1);
      list[next]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = i <= 0 ? list.length - 1 : i - 1;
      list[next]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      list[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      list[list.length - 1]?.focus();
    }
  }
</script>

<div class="relative shrink-0 {className}" bind:this={rootEl}>
  {#if label}
    <label class="sr-only" for={id}>{label}</label>
  {/if}
  <button
    type="button"
    {id}
    {disabled}
    class="group flex max-w-32 min-w-[6.5rem] items-center gap-1 rounded-md border px-2 py-1 text-left text-[11px] transition-all duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-link)]/35 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--app-bg)] disabled:pointer-events-none disabled:opacity-40 {open
      ? 'border-[var(--app-link)]/40 bg-[var(--app-surface-hover)] text-[var(--app-fg)] shadow-sm'
      : 'border-[var(--app-border-strong)] bg-[var(--app-chip-bg)] text-[var(--app-fg)] hover:opacity-95'}"
    aria-expanded={open}
    aria-haspopup="listbox"
    aria-controls={listId}
    {title}
    onclick={toggle}
  >
    <span class="min-w-0 flex-1 truncate">{selectedLabel}</span>
    <ChevronDown
      size={14}
      class="shrink-0 transition-transform duration-200 {open ? 'rotate-180 text-[var(--app-link)]' : 'text-[var(--app-icon-muted)]'}"
      strokeWidth={2}
      aria-hidden="true"
    />
  </button>

  {#if open}
    <div
      bind:this={menuEl}
      id={listId}
      role="listbox"
      aria-label={label || title || "Options"}
      tabindex="-1"
      class="absolute top-full z-[200] mt-1 min-w-full max-w-[min(100vw-2rem,16rem)] overflow-hidden rounded-md border border-[var(--app-border)] bg-[var(--app-dropdown-list-bg)] py-0.5 shadow-lg {align === 'end'
        ? 'right-0'
        : 'left-0'}"
      onkeydown={onMenuKeydown}
    >
      {#each options as opt (opt.id)}
        <button
          type="button"
          role="option"
          aria-selected={value === opt.id}
          class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] transition-colors hover:bg-[var(--app-surface-hover)] focus:bg-[var(--app-surface-hover)] focus:outline-none {value === opt.id
            ? 'bg-[color-mix(in_srgb,var(--app-link)_12%,transparent)] text-[var(--app-fg)] font-medium'
            : 'text-[var(--app-fg-secondary)]'}"
          onclick={(e) => {
            e.stopPropagation();
            pick(opt.id);
          }}
        >
          {#if value === opt.id}
            <span class="w-3.5 shrink-0 text-[var(--app-link)]" aria-hidden="true">✓</span>
          {:else}
            <span class="w-3.5 shrink-0" aria-hidden="true"></span>
          {/if}
          <span class="min-w-0 truncate">{opt.label}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>
