<script lang="ts">
  import { tick } from "svelte";
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
    /**
     * Render the listbox on `document.body` with fixed positioning so it is not clipped
     * or counted inside a parent with `overflow: auto` (e.g. modals).
     */
    portal = false,
    /** When `portal` is true, value for inline `max-width` on the listbox */
    portalMenuMaxWidth = "min(100vw - 16px, 16rem)",
    /** Extra classes on the listbox (both inline and portal modes) */
    menuClass = "",
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
    portal?: boolean;
    portalMenuMaxWidth?: string;
    menuClass?: string;
  }>();

  let open = $state(false);
  let rootEl: HTMLDivElement | undefined = $state();
  let menuEl: HTMLDivElement | undefined = $state();
  let triggerEl: HTMLButtonElement | undefined = $state();
  let menuStyle = $state("");

  type Opt = { id: string; label: string };

  const selectedLabel = $derived(
    options.find((o: Opt) => o.id === value)?.label ?? value,
  );

  const listId = $derived(`${id}-listbox`);

  const PORTAL_Z = 10000;

  function scrollableAncestors(el: HTMLElement | undefined): HTMLElement[] {
    const out: HTMLElement[] = [];
    let p = el?.parentElement ?? null;
    while (p) {
      const st = getComputedStyle(p);
      if (/(auto|scroll)/.test(st.overflowY) || /(auto|scroll)/.test(st.overflowX)) {
        out.push(p);
      }
      p = p.parentElement;
    }
    return out;
  }

  function updatePortalMenuPosition() {
    if (!portal || !open || !triggerEl) return;
    const rect = triggerEl.getBoundingClientRect();
    const pad = 8;
    const gap = 4;
    const top = rect.bottom + gap;
    const maxH = Math.max(120, Math.min(window.innerHeight - top - pad, window.innerHeight * 0.55));
    const maxW = portalMenuMaxWidth;
    if (align === "end") {
      menuStyle = `top:${top}px;right:${Math.max(pad, window.innerWidth - rect.right)}px;min-width:${rect.width}px;max-width:${maxW};max-height:${maxH}px;overflow-y:auto;z-index:${PORTAL_Z};`;
    } else {
      menuStyle = `top:${top}px;left:${Math.max(pad, rect.left)}px;min-width:${rect.width}px;max-width:${maxW};max-height:${maxH}px;overflow-y:auto;z-index:${PORTAL_Z};`;
    }
  }

  function portalToBody(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      },
    };
  }

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
        if (portal) updatePortalMenuPosition();
        const first = menuEl?.querySelector<HTMLElement>('[role="option"]');
        first?.focus();
      });
    }
  });

  $effect(() => {
    if (!open || !portal || !triggerEl) return;

    updatePortalMenuPosition();

    const onWin = () => updatePortalMenuPosition();
    window.addEventListener("resize", onWin);
    const scrollEls = scrollableAncestors(triggerEl);
    for (const el of scrollEls) {
      el.addEventListener("scroll", onWin, { passive: true });
    }

    return () => {
      window.removeEventListener("resize", onWin);
      for (const el of scrollEls) {
        el.removeEventListener("scroll", onWin);
      }
    };
  });

  /**
   * Close on outside interaction. Uses capture-phase `pointerdown` so it still runs when ancestors
   * stop propagation on `click`. Waits for `tick()` so portaled `menuEl` is bound before listening.
   */
  $effect(() => {
    if (!open) return;

    const ac = new AbortController();

    void tick().then(() => {
      if (ac.signal.aborted) return;

      const onPointerDown = (e: PointerEvent) => {
        const t = e.target as Node | null;
        if (!t || !rootEl) return;
        if (rootEl.contains(t)) return;
        if (menuEl?.contains(t)) return;
        close();
      };

      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.preventDefault();
          close();
        }
      };

      document.addEventListener("pointerdown", onPointerDown, {
        capture: true,
        signal: ac.signal,
      });
      document.addEventListener("keydown", onKey, { signal: ac.signal });
    });

    return () => ac.abort();
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
    bind:this={triggerEl}
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

  {#if open && !portal}
    <div
      bind:this={menuEl}
      id={listId}
      role="listbox"
      aria-label={label || title || "Options"}
      tabindex="-1"
      class="absolute top-full z-[200] mt-1 min-w-full max-w-[min(100vw-2rem,16rem)] overflow-hidden rounded-md border border-[var(--app-border)] bg-[var(--app-dropdown-list-bg)] py-0.5 shadow-lg {align === 'end'
        ? 'right-0'
        : 'left-0'} {menuClass}"
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

{#if open && portal}
  <div
    use:portalToBody
    bind:this={menuEl}
    id={listId}
    role="listbox"
    aria-label={label || title || "Options"}
    tabindex="-1"
    class="fixed rounded-md border border-[var(--app-border)] bg-[var(--app-dropdown-list-bg)] py-0.5 shadow-lg {menuClass}"
    style={menuStyle}
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
