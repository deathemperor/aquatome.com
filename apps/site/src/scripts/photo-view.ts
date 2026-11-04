/** The photo viewer's arithmetic and history (photo-viewer.ts draws it): no DOM, so it is tested on its own. */

export type Size = { w: number; h: number }
export type Point = { x: number; y: number }

/** How far a photo zooms in: pinch, double-tap and the wheel stop here. */
export const MAX_ZOOM = 4
/** A click (a mouse) or a double tap (a finger) zooms to this, or back to 1×. */
export const TAP_ZOOM = 2.5

/** Photo `i` of `n`, going round: after the last comes the first, before the first the last. */
export const wrap = (i: number, n: number) => ((i % n) + n) % n

/** A photo's size on screen at 1×: as large as fits the stage, never past its own pixels. */
export function fit(photo: Size, stage: Size): Size {
  const k = Math.min(stage.w / photo.w, stage.h / photo.h, 1)
  return { w: photo.w * k, h: photo.h * k }
}

/**
 * A pan (the photo's centre from the stage's) for a photo of `box` at 1× zoomed to `scale`: centred along a side it
 * doesn't fill, and along one it overfills, no further than its edge.
 */
export function clampPan(pan: Point, scale: number, box: Size, stage: Size): Point {
  const x = Math.max(0, (box.w * scale - stage.w) / 2)
  const y = Math.max(0, (box.h * scale - stage.h) / 2)
  return { x: Math.min(x, Math.max(-x, pan.x)) || 0, y: Math.min(y, Math.max(-y, pan.y)) || 0 }
}

/** The pan that keeps the photo's point under `at` (from the stage's centre) there as it zooms from `scale` to `next`. */
export const zoomAt = (pan: Point, scale: number, next: number, at: Point): Point =>
  ({ x: at.x - ((at.x - pan.x) * next) / scale, y: at.y - ((at.y - pan.y) * next) / scale })

/**
 * Where a swipe goes when the finger lifts: 1 to the next photo, -1 to the one before, 0 back. `dx`: how far it moved
 * (px, to the right positive), `speed`: px/ms at the end. A quarter of the width, or a flick, is enough.
 */
export function swipeStep(dx: number, speed: number, width: number, n: number): -1 | 0 | 1 {
  if (n < 2 || dx === 0) return 0
  return Math.abs(dx) > width / 4 || (Math.abs(speed) > 0.4 && Math.abs(dx) > 16 && Math.sign(speed) === Math.sign(dx)) ? (dx < 0 ? 1 : -1) : 0
}

/** "#a5" → 4: the gallery photo an address opens, if the gallery has it. */
export function photoOfHash(hash: string, n: number): number | null {
  const m = /^#a(\d+)$/.exec(hash)
  const i = m ? Number(m[1]) - 1 : -1
  return i >= 0 && i < n ? i : null
}

export type Hist = Pick<History, 'state' | 'pushState' | 'replaceState' | 'back'>

/**
 * The viewer's place in the browser's history: an entry of its own while it is open, so the phone's Back button closes
 * it. Stepping through photos changes that entry rather than adding one; closing it any other way goes back past it.
 * The viewer is open exactly when the current entry is its own: on load and on each Back or Forward it shows
 * `current()`, or closes when that is null. `id` tells two viewers' entries apart.
 */
export function viewerHistory(h: Hist, id: string) {
  const mine = (s: unknown): number | null => {
    const e = s as { viewer?: unknown; photo?: unknown } | null
    return e?.viewer === id && Number.isInteger(e.photo) ? (e.photo as number) : null
  }
  const step = (i: number, url?: string) => h.replaceState({ viewer: id, photo: i }, '', url)
  return {
    current: () => mine(h.state),
    /**
     * Opened from the page. `url`: the address while photo `i` is open (a gallery's #aN), or the page's own. `under`:
     * the address for the entry below, when the page was opened on a photo's own address (#a5): Back then shows the
     * gallery, not the photo again.
     */
    open(i: number, url?: string, under?: string) {
      if (mine(h.state) !== null) return step(i, url)
      if (under !== undefined) h.replaceState(h.state, '', under)
      h.pushState({ viewer: id, photo: i }, '', url)
    },
    step,
    /** Closed by its button, Esc or a tap outside it: back to the entry below. */
    close() { if (mine(h.state) !== null) h.back() },
  }
}
