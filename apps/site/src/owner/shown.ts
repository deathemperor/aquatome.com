// The photos that show on the screen, measured before the report's sheet opens: a modal sheet makes the rest of the page
// inert, and then nothing on it can be asked what's on top. capture.ts checks each of these came out in the picture.
export interface Shown {
  src: string
  /** The part on the screen, in the page's pixels. */
  visible: { x: number; y: number; width: number; height: number }
  /** The whole element, and how its picture sits in it. */
  box: { left: number; top: number; width: number; height: number }
  fit: string
  position: string
  natural: [number, number]
}

export function photosShowing(): Shown[] {
  const out: Shown[] = []
  for (const img of document.images) {
    if (!img.currentSrc || !img.naturalWidth) continue
    const r = img.getBoundingClientRect()
    const x = Math.max(r.left, 0), y = Math.max(r.top, 0)
    const width = Math.min(r.right, innerWidth) - x, height = Math.min(r.bottom, innerHeight) - y
    if (width < 16 || height < 16) continue
    const top = document.elementsFromPoint(x + width / 2, y + height / 2).find(e => !e.closest('[data-owner-report],[data-owner-bar]'))
    if (top !== img) continue
    const s = getComputedStyle(img)
    out.push({
      src: img.currentSrc,
      visible: { x, y, width, height },
      box: { left: r.left, top: r.top, width: r.width, height: r.height },
      fit: s.objectFit,
      position: s.objectPosition,
      natural: [img.naturalWidth, img.naturalHeight],
    })
  }
  return out
}
