/**
 * A guide's cover (GuideCard, for a guide with no picture): where its two sets of rings start and how far apart they
 * are, and the small shift in its cloth's tone and hue, all from its address (FNV-1a), so no two covers in a list look
 * alike. The same at build time (GuideCard.astro) and in the browser (scripts/guide-card.ts). The Design Lead, 15 Nov 2026.
 */
export function coverStyle(slug: string): string {
  let h = 2166136261
  for (const ch of slug) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  h >>>= 0
  const p = (shift: number, lo: number, span: number) => lo + ((h >>> shift) % span)
  return `--x1:${p(0, 4, 34)}%;--y1:${p(6, 6, 88)}%;--x2:${p(12, 62, 34)}%;--y2:${p(18, 6, 88)}%;--s1:${p(24, 5, 3)}%;--s2:${p(27, 8, 4)}%;--dl:${[-0.035, 0, 0.035][h % 3]};--dh:${[-10, 0, 10][(h >>> 3) % 3]}`
}
