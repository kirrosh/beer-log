<script lang="ts">
  // Офиц. изображение (логотип пивоварни / этикетка сорта, task-15) с фоллбэком.
  // src — рехостнутый локальный путь или null. Битый файл ловим onerror → монограмма.
  import { monogram, tintHue } from "$lib/catalog";

  let {
    src = null,
    name,
    size = 40,
    shape = "round",
  }: { src?: string | null; name: string; size?: number; shape?: "round" | "rounded" } = $props();

  // показывать монограмму, если картинки нет ИЛИ она не загрузилась
  let broken = $state(false);
  const showImg = $derived(!!src && !broken);
  const hue = $derived(tintHue(name));
  const radius = $derived(shape === "round" ? "50%" : "8px");
</script>

<span
  class="thumb"
  class:img={showImg}
  style="--sz: {size}px; --r: {radius}; --bg: hsl({hue} 30% 24%); --fg: hsl({hue} 65% 78%)"
  aria-hidden="true"
>
  {#if showImg}
    <img {src} alt="" loading="lazy" onerror={() => (broken = true)} />
  {:else}
    <span class="mono">{monogram(name)}</span>
  {/if}
</span>

<style>
  .thumb {
    display: inline-flex; align-items: center; justify-content: center;
    width: var(--sz); height: var(--sz); min-width: var(--sz);
    border-radius: var(--r); overflow: hidden; background: var(--bg);
    border: 1px solid var(--line); flex: 0 0 auto;
  }
  .thumb.img { background: var(--bg-elev-2); }
  .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .mono {
    font-family: var(--font-display); font-weight: 600; color: var(--fg);
    font-size: calc(var(--sz) * 0.38); letter-spacing: 0.5px; line-height: 1;
    user-select: none;
  }
</style>
