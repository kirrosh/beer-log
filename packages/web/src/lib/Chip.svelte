<script lang="ts">
  import { catMeta } from "./styles";
  let { category, count = null as number | null, dim = false }: {
    category: string | null | undefined;
    count?: number | null;
    dim?: boolean;
  } = $props();
  const m = $derived(catMeta(category));
</script>

<span class="chip" class:dim style="--c: {m.color}">
  <span class="dot"></span>
  <span class="lbl">{m.label}</span>
  {#if count !== null}<span class="cnt mono">{count}</span>{/if}
</span>

<style>
  .chip {
    display: inline-flex; align-items: center; gap: 7px;
    padding: 2px 9px 2px 8px; border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--c) 38%, transparent);
    background: color-mix(in srgb, var(--c) 12%, transparent);
    font-size: 12.5px; line-height: 1.7; white-space: nowrap;
    color: color-mix(in srgb, var(--c) 75%, var(--ink));
  }
  .chip.dim { opacity: 0.45; filter: grayscale(0.4); }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--c); box-shadow: 0 0 7px color-mix(in srgb, var(--c) 60%, transparent); }
  .cnt { color: var(--ink-dim); font-size: 11.5px; }
</style>
