import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { researchDeny } from '../src/claude'
import { cycleOnlyHosts } from '../src/cycle-only'

// The chief of staff, 14 Nov 2026, on the owner's rule: a source that challenges us is read only the way the engine's
// cycle reads it, at its pace, and nothing goes round that; Spruce's pages are read by nobody by hand.
test('research never reads a source the engine reads only through the Archive, or one waiting for a person to pass its browser check', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aq-cycle-only-'))
  const bare = await cycleOnlyHosts(root)
  // By their config: Planet Catfish, 2hr Aquarist and Spruce; and the Archive's own copies.
  for (const h of ['planetcatfish.com', 'www.planetcatfish.com', '2hraquarist.com', 'thesprucepets.com', 'www.thesprucepets.com', 'web.archive.org', 'archive.org']) expect(bare).toContain(h)
  expect(bare).not.toContain('seriouslyfish.com')
  expect(bare).not.toContain('loaches.com')
  // Moved to the Archive by the engine, or blocked by a browser check: off too, from the engine's own record.
  await mkdir(join(root, 'engine-state'), { recursive: true })
  await writeFile(join(root, 'engine-state', '_sources.json'), JSON.stringify({ loachesonline: { blockedAt: '2026-11-14T01:00:00.000Z' }, aquariumcoop: { archive: '2026-11-14T01:00:00.000Z' }, tropica: { blocks: ['2026-11-14T01:00:00.000Z'] } }))
  const now = await cycleOnlyHosts(root)
  for (const h of ['loaches.com', 'www.loaches.com', 'aquariumcoop.com']) expect(now).toContain(h)
  // A single block noted, not yet a block on record, isn't a source waiting for a person.
  expect(now).not.toContain('tropica.com')
  expect(researchDeny(now)).toEqual(expect.arrayContaining(['WebFetch(domain:shopee.vn)', 'WebFetch(domain:thesprucepets.com)', 'WebFetch(domain:web.archive.org)']))
})
