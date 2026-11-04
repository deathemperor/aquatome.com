import { CELL_DEG, type SpeciesRange } from '@aq/schema'
import world from './world.json' with { type: 'json' }

/**
 * A species' wild records on a small map (the species page's "Phân bố tự nhiên", lib/range.ts): its GBIF cells on an
 * equirectangular frame cropped to them, over the countries' outlines (world.json, Natural Earth 1:110m, made by
 * scripts/world-outline.ts), its native countries shaded. One SVG, a few paths: the page draws it inline in the site's
 * colours, the app gets it as a PNG (pages/app/range/[file].png.ts) in the light ones.
 *
 * A cell is drawn as its own square, solid when all its records are in a native country, hollow when none is, and both
 * (half solid, outlined) when it holds both, so shape tells them apart and not colour alone. A range with no native
 * countries has one kind of square. Where the frame is so wide that a cell would be smaller than MIN_SQUARE, cells are
 * drawn together, a square of the same grid a few cells wide.
 */

/** The map's width, in its own units (its viewBox and its width on a computer, in px). */
export const MAP_W = 600
/** The smallest square drawn, in map units. */
const MIN_SQUARE = 10
/** The smallest frame (degrees): a few cells still show where on a continent they are. */
const MIN_W = 45, MIN_H = 25
/** The frame's width over its height, at most and at least: never a strip, never taller than a phone shows whole. */
const MAX_ASPECT = 2, MIN_ASPECT = 1.25

export type SquareKind = 'in' | 'out' | 'both' | 'rec'
export type RangeMap = {
  w: number; h: number
  /** The frame, in degrees. */
  frame: { west: number; east: number; south: number; north: number }
  /** A square's side, in cells (1 when each cell is drawn on its own). */
  step: number
  /** Path data: the other countries, the native ones, solid squares and halves, hollow squares, squares of a range with no native countries. */
  paths: { land: string; native: string; in: string; out: string; rec: string }
  /** The kinds of square the map has, in the legend's order. */
  kinds: SquareKind[]
}

type Ring = { code: string; pts: [number, number][]; west: number; east: number; south: number; north: number }
let rings: Ring[] | undefined
/** The outline's rings in degrees, each with its extent, decoded once (world.json: 0.1° steps from a first point). */
function outline(): Ring[] {
  if (rings) return rings
  rings = []
  for (const [code, list] of Object.entries(world as Record<string, number[][]>)) {
    for (const flat of list) {
      const pts: [number, number][] = []
      for (let i = 0, lon = 0, lat = 0; i < flat.length; i += 2) {
        lon += flat[i]!; lat += flat[i + 1]!
        pts.push([lon / 10, lat / 10])
      }
      const lons = pts.map(p => p[0]), lats = pts.map(p => p[1])
      rings.push({ code, pts, west: Math.min(...lons), east: Math.max(...lons), south: Math.min(...lats), north: Math.max(...lats) })
    }
  }
  return rings
}

/** The records' cells' extent, padded, at least MIN_W × MIN_H, its aspect within bounds, inside the world. */
export function frameOf(cells: NonNullable<SpeciesRange['records']>['cells']) {
  let west = Math.min(...cells.map(c => c[0])), east = Math.max(...cells.map(c => c[0] + CELL_DEG))
  let south = Math.min(...cells.map(c => c[1])), north = Math.max(...cells.map(c => c[1] + CELL_DEG))
  const grow = (lo: number, hi: number, size: number) => { const d = (size - (hi - lo)) / 2; return d > 0 ? [lo - d, hi + d] : [lo, hi] }
  ;[west, east] = grow(west, east, Math.max(MIN_W, (east - west) * 1.3))
  ;[south, north] = grow(south, north, Math.max(MIN_H, (north - south) * 1.3))
  ;[south, north] = grow(south, north, (east - west) / MAX_ASPECT)
  ;[west, east] = grow(west, east, (north - south) * MIN_ASPECT)
  // Inside the world: a frame past an edge slides back, one wider than the world is the world.
  const fit = (lo: number, hi: number, min: number, max: number) => {
    const size = Math.min(hi - lo, max - min)
    const start = Math.min(Math.max(lo, min), max - size)
    return [start, start + size]
  }
  ;[west, east] = fit(west, east, -180, 180)
  ;[south, north] = fit(south, north, -90, 90)
  return { west, east, south, north }
}

/** A ring cut to a rectangle (Sutherland–Hodgman): what of it lies inside, closed by the rectangle's edges. */
function clip(ring: [number, number][], x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const edges: [(p: [number, number]) => boolean, (a: [number, number], b: [number, number]) => [number, number]][] = [
    [p => p[0] >= x0, (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])]],
    [p => p[0] <= x1, (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])]],
    [p => p[1] >= y0, (a, b) => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0]],
    [p => p[1] <= y1, (a, b) => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1]],
  ]
  let out = ring
  for (const [inside, cross] of edges) {
    const pts = out
    out = []
    pts.forEach((p, i) => {
      const prev = pts[(i + pts.length - 1) % pts.length]!
      if (inside(p)) {
        if (!inside(prev)) out.push(cross(prev, p))
        out.push(p)
      } else if (inside(prev)) out.push(cross(prev, p))
    })
    if (!out.length) break
  }
  return out
}

/** Numbers as path data writes them: a minus sign is its own separator. */
const nums = (xs: number[]) => xs.map((n, i) => (i && n >= 0 ? ` ${n}` : `${n}`)).join('')
const r1 = (n: number) => Math.round(n * 10) / 10

/** A line with the points it can do without gone: none further than `tol` from the line that skips it (Douglas–Peucker). */
function simplify(pts: [number, number][], tol: number): [number, number][] {
  if (pts.length < 3) return pts
  const keep = new Uint8Array(pts.length)
  keep[0] = keep[pts.length - 1] = 1
  const stack: [number, number][] = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    const [ax, ay] = pts[a]!, [bx, by] = pts[b]!
    const len = Math.hypot(bx - ax, by - ay)
    let far = -1, dist = tol
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i]!
      const d = len ? Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len : Math.hypot(px - ax, py - ay)
      if (d > dist) { far = i; dist = d }
    }
    if (far >= 0) { keep[far] = 1; stack.push([a, far], [far, b]) }
  }
  return pts.filter((_, i) => keep[i])
}

/** A ring in map units, as path data: its first point, then each step, whole units; none when it shrinks to a speck. */
function ringPath(ring: [number, number][]): string {
  const xs = ring.map(p => p[0]), ys = ring.map(p => p[1])
  if (Math.max(...xs) - Math.min(...xs) < 2 && Math.max(...ys) - Math.min(...ys) < 2) return ''
  // Closed through its first point, so the simplified ring keeps it.
  const pts = simplify([...ring, ring[0]!], 0.6).slice(0, -1)
  const xy = pts.map(([x, y]) => [Math.round(x), Math.round(y)] as const)
  const steps: number[] = []
  for (let i = 1; i < xy.length; i++) {
    const dx = xy[i]![0] - xy[i - 1]![0], dy = xy[i]![1] - xy[i - 1]![1]
    if (dx || dy) steps.push(dx, dy)
  }
  return steps.length >= 4 ? `M${nums([xy[0]![0], xy[0]![1]])}l${nums(steps)}z` : ''
}

/** The map of a range's records; none without records. */
export function rangeMap(range: SpeciesRange | undefined): RangeMap | undefined {
  const cells = range?.records?.cells ?? []
  if (!cells.length) return undefined
  const frame = frameOf(cells)
  const k = MAP_W / (frame.east - frame.west)
  const h = Math.round((frame.north - frame.south) * k)
  const x = (lon: number) => (lon - frame.west) * k
  const y = (lat: number) => (frame.north - lat) * k

  // The countries in the frame, cut to it (a little past it, so no edge of the land shows at the frame's own).
  const pad = 2 / k
  const native = new Set(range?.native?.countries ?? [])
  const land: string[] = [], shaded: string[] = []
  for (const r of outline()) {
    if (r.east < frame.west - pad || r.west > frame.east + pad || r.north < frame.south - pad || r.south > frame.north + pad) continue
    const cut = clip(r.pts, frame.west - pad, frame.south - pad, frame.east + pad, frame.north + pad)
    const d = cut.length >= 3 ? ringPath(cut.map(([lon, lat]) => [x(lon), y(lat)])) : ''
    if (d) (native.has(r.code) ? shaded : land).push(d)
  }

  // Cells drawn together on a coarser square of the same grid when one alone would be smaller than MIN_SQUARE.
  const step = Math.max(1, Math.ceil(MIN_SQUARE / (CELL_DEG * k)))
  const size = CELL_DEG * step
  const bins = new Map<string, { west: number; south: number; n: number; inside: number }>()
  for (const [west, south, n, inside = 0] of cells) {
    const bw = -180 + Math.floor((west + 180) / size + 1e-9) * size, bs = -90 + Math.floor((south + 90) / size + 1e-9) * size
    const b = bins.get(`${bw},${bs}`) ?? bins.set(`${bw},${bs}`, { west: bw, south: bs, n: 0, inside: 0 }).get(`${bw},${bs}`)!
    b.n += n
    b.inside += inside
  }
  const paths = { land: land.join(''), native: shaded.join(''), in: '', out: '', rec: '' }
  const kinds = new Set<SquareKind>()
  const s = size * k
  for (const b of [...bins.values()].sort((a, c) => c.south - a.south || a.west - c.west)) {
    const kind: SquareKind = !native.size ? 'rec' : b.inside === b.n ? 'in' : b.inside === 0 ? 'out' : 'both'
    kinds.add(kind)
    const bx = x(b.west), by = y(b.south + size)
    // A solid square with a hairline between neighbours; a hollow one's outline inside its square.
    const solid = (inset: number) => `M${nums([r1(bx + inset), r1(by + inset)])}h${r1(s - 2 * inset)}v${r1(s - 2 * inset)}h${r1(-(s - 2 * inset))}z`
    if (kind === 'in') paths.in += solid(0.5)
    if (kind === 'rec') paths.rec += solid(0.5)
    if (kind === 'out' || kind === 'both') paths.out += solid(1.5)
    // Both: the lower-left half solid, under its outline.
    if (kind === 'both') paths.in += `M${nums([r1(bx + 2.5), r1(by + 2.5)])}v${r1(s - 5)}h${r1(s - 5)}z`
  }
  return { w: MAP_W, h, frame, step, paths, kinds: (['in', 'both', 'out', 'rec'] as const).filter(x => kinds.has(x)) }
}

/** The map's colours as the app's PNG has them: the site's light ones (styles/tokens.css), mixed as the page mixes them. */
const LIGHT = { sea: '#fbf8f1', land: '#e0dfd8', native: '#c2d1c4', in: '#2f6b4f', out: '#a0522d', rec: '#4d5a52' }

/**
 * The map as SVG. `web`: inline in the page, coloured by its classes (the page's styles, so it follows the theme), named
 * by `title`. `png`: standalone at twice the size, in the light colours, for the app's picture.
 */
export function mapSvg(m: RangeMap, as: 'web' | 'png', title = ''): string {
  const paint = (k: keyof typeof LIGHT) => (as === 'web' ? `class="${k}"` : k === 'out' ? `fill="${LIGHT.sea}" stroke="${LIGHT.out}" stroke-width="2"` : k === 'land' || k === 'native' ? `fill="${LIGHT[k]}" stroke="${LIGHT.sea}" stroke-width="0.75" stroke-linejoin="round"` : `fill="${LIGHT[k]}"`)
  const body = [
    `<rect ${paint('sea')} width="${m.w}" height="${m.h}"/>`,
    ...(['land', 'native', 'rec', 'out', 'in'] as const).filter(k => m.paths[k]).map(k => `<path ${paint(k)} d="${m.paths[k]}"/>`),
  ].join('')
  return as === 'web'
    ? `<svg class="map" viewBox="0 0 ${m.w} ${m.h}" width="${m.w}" height="${m.h}" role="img" aria-label="${title.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}">${body}</svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${m.w} ${m.h}" width="${m.w * 2}" height="${m.h * 2}">${body}</svg>`
}
