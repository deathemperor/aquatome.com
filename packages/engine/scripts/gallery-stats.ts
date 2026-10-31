// Galleries per tier against their targets, from content/ (for a PR body or a quick look): tsx scripts/gallery-stats.ts [root] [gallery dir]
// A second argument reads the galleries from elsewhere (an older commit's, unpacked) against today's tiers.
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { galleryPlan, TARGETS, TIER_ORDER } from '../src/gallery-plan'

const root = resolve(process.argv[2] ?? join(import.meta.dirname, '../../..'))
const plan = await galleryPlan(root)
const dir = process.argv[3] ? resolve(process.argv[3]) : join(root, 'content/gallery')
const have = new Map(await Promise.all(plan.map(async t => [t.id, ((JSON.parse(await readFile(join(dir, `${t.id}.json`), 'utf8').catch(() => 'null')) as { photos: unknown[] } | null)?.photos.length ?? 0)] as const)))
const rows = TIER_ORDER.map(tier => {
  const r = plan.filter(t => t.tier === tier)
  const at = r.filter(t => have.get(t.id)! >= t.target).length
  return { tier, target: TARGETS[tier], species: r.filter(t => t.kind === 'species').length, plants: r.filter(t => t.kind === 'plants').length, atTarget: at, below: r.length - at, photos: r.reduce((n, t) => n + have.get(t.id)!, 0) }
})
console.log(JSON.stringify({ rows, total: { pages: plan.length, atTarget: rows.reduce((n, r) => n + r.atTarget, 0), photos: rows.reduce((n, r) => n + r.photos, 0), withGallery: [...have.values()].filter(n => n > 0).length } }, null, 1))
