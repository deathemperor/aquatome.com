// The countries' outlines the range maps draw (src/lib/world.json, lib/range-map.ts), from Natural Earth's 1:110m Admin 0
// countries (public domain): `pnpm exec tsx scripts/world-outline.ts ne_110m_admin_0_countries.geojson` (from
// github.com/nvkelso/natural-earth-vector, geojson/). Run again only to change the outline.
import { readFileSync, writeFileSync } from 'node:fs'
import { isCountryCode } from '@aq/schema'

type Ring = [number, number][]
type Feature = { properties: Record<string, string>; geometry: { type: 'Polygon'; coordinates: Ring[] } | { type: 'MultiPolygon'; coordinates: Ring[][] } }

const file = process.argv[2]
if (!file) throw new Error('usage: pnpm exec tsx scripts/world-outline.ts <ne_110m_admin_0_countries.geojson>')
const { features } = JSON.parse(readFileSync(file, 'utf8')) as { features: Feature[] }
const out: Record<string, number[][]> = {}
for (const f of features) {
  // ISO_A2 is -99 for France and Norway; ISO_A2_EH has them. Northern Cyprus and Somaliland have no code: land only ('-').
  const own = f.properties.ISO_A2_EH!
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
  for (const poly of polys) {
    // Holes are left out: at this scale they are lakes the map doesn't draw. French Guiana is France's polygon in South America.
    const ring = poly[0]!
    const code = own === 'FR' && ring.every(([lon]) => lon < -40) ? 'GF' : own
    const key = isCountryCode(code) ? code : '-'
    // 0.1° steps from the first point, without the closing point or a step of nothing.
    const pts = ring.slice(0, -1).map(([lon, lat]) => [Math.round(lon * 10), Math.round(lat * 10)] as const)
    const flat: number[] = [pts[0]![0], pts[0]![1]]
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i]![0] - pts[i - 1]![0], dy = pts[i]![1] - pts[i - 1]![1]
      if (dx || dy) flat.push(dx, dy)
    }
    if (flat.length >= 6) (out[key] ??= []).push(flat)
  }
}
const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)))
const lines = Object.entries(sorted).map(([k, rings]) => `  ${JSON.stringify(k)}: ${JSON.stringify(rings)}`)
writeFileSync(new URL('../src/lib/world.json', import.meta.url), `{\n${lines.join(',\n')}\n}\n`)
console.log(`${Object.keys(sorted).length} countries, ${Object.values(sorted).flat().reduce((n, r) => n + r.length / 2, 0)} points`)
