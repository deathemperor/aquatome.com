import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { computeContentStats, GALLERY_MIN } from '../scripts/content-stats'
import { GALLERY_MIN as PAGE_GALLERY_MIN } from '../src/lib/gallery'

// The chief of staff's rule, 14 Nov 2026, agreed with the Photo Sourcing Lead: species pages (shrimp and snails
// included) a reader can open that show no photo: not held back in Vietnamese, none of their own, and no album of 6 or
// more. The dashboard counted held pages, which a reader gets a 404 for, and pages whose album shows photos.
const photo = (n: number) => ({ url: `https://media.aquatome.com/x/${n}.webp`, licence: 'CC0', author: 'A', sourceUrl: `https://example.org/${n}` })
function content(pages: Record<string, { own?: number; album?: number[]; held?: boolean }>) {
  const root = mkdtempSync(join(tmpdir(), 'aq-no-photo-'))
  for (const [id, p] of Object.entries(pages)) {
    mkdirSync(join(root, 'content/species', id), { recursive: true })
    writeFileSync(join(root, 'content/species', id, 'entity.json'), JSON.stringify({
      id, scientificName: id, sections: [{ key: 'overview', source: 'seriouslyfish', html: '<p>Một loài cá.</p>' }], photos: Array.from({ length: p.own ?? 0 }, (_, i) => photo(i)),
    }))
    writeFileSync(join(root, 'content/species', id, 'vi.json'), JSON.stringify({ slug: `ca-${id}`, name: `Cá ${id}`, ...(p.held ? { held: { at: '2026-11-11T00:00:00Z', checks: ['source'] } } : {}) }))
    if (p.album) {
      mkdirSync(join(root, 'content/gallery'), { recursive: true })
      writeFileSync(join(root, 'content/gallery', `${id}.json`), JSON.stringify({ id, photos: p.album.map(photo) }))
    }
  }
  mkdirSync(join(root, 'dist'))
  return root
}

test('a species page counts as showing no photo only when a reader can open it and it has neither its own photo nor an album', () => {
  expect(GALLERY_MIN).toBe(PAGE_GALLERY_MIN)
  const root = content({
    bare: {}, // counted
    album: { album: [1, 2, 3, 4, 5, 6] }, // an album of 6 shows on the page: not counted
    small: { album: [1, 2, 3, 4, 5] }, // 5 show nowhere: counted
    twice: { album: [1, 2, 3, 4, 5, 5] }, // 6 files, 5 pictures: counted
    held: { held: true }, // the source check holds it back, the page isn't built: not counted
    own: { own: 1 }, // not counted
  })
  const s = computeContentStats({ contentRoot: join(root, 'content'), engineState: join(root, 'none'), dist: join(root, 'dist'), publicBuild: false, now: new Date('2026-11-14T05:00:00Z') })
  expect(s.gaps.fish!.noPhoto!.top.map(([path]) => path).sort()).toEqual(['/ca/ca-bare/', '/ca/ca-small/', '/ca/ca-twice/'])
  expect(s.gaps.fish!.noPhoto!.n).toBe(3)
  // The owner's hidden pages come off too, as for every gap.
  const hidden = computeContentStats({ contentRoot: join(root, 'content'), engineState: join(root, 'none'), dist: join(root, 'dist'), publicBuild: false, hidden: new Set(['/ca/ca-bare/']) })
  expect(hidden.gaps.fish!.noPhoto!.n).toBe(2)
})
