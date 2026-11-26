<script lang="ts" module>
  // Schlichte Linien-Symbole (24×24, Strich 2) für die aufklappbaren Boxen
  export const LINE_ICONS: Record<string, string> = {
    alert: 'M12 3.5 2.5 20h19L12 3.5zM12 10v4.5M12 17.5v.01',
    snow: 'M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 2 3-2M9 20l3-2 3 2M4 10.5l3.4-.3L6 7M20 13.5l-3.4.3L18 17M4 13.5l3.4.3L6 17M20 10.5l-3.4-.3L18 7',
    save: 'M5 3h11l3 3v15H5zM8 3v5h7V3M8 21v-7h8v7',
    pack: 'M8 7V5a4 4 0 0 1 8 0v2M5 9a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v12H5zM9 13h6M9 21v-4h6v4',
    download: 'M12 3v12M7 10l5 5 5-5M4 19h16',
    drop: 'M12 3s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11z',
    hut: 'M3 11 12 4l9 7M5 9.5V20h14V9.5M10 20v-5h4v5',
    eye: 'M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    bed: 'M3 6v14M3 17h18v3M21 17v-4a3 3 0 0 0-3-3h-8v7M6.5 13a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
    clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
    weather: 'M7 18h10a4 4 0 0 0 .5-8 5.5 5.5 0 0 0-10.6 1.5A3.3 3.3 0 0 0 7 18zM16 3.5v1.5M20.5 5.5l-1 1M22 10h-1.5',
  };
</script>

<script lang="ts">
  let { name, size = 20 }: { name: string; size?: number } = $props();
</script>

<svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d={LINE_ICONS[name]} />
</svg>
