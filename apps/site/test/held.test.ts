import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

// The reader-fit gate (the engine's gate.ts) marks a page it holds back with `held` in that language's file; the site
// leaves it out, so no list, search, sitemap or app index has it, until the gate lets it out.
test('a page the reader-fit gate holds back is left out of the site, in that language only', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aq-held-'))
  await cp(fileURLToPath(new URL('./fixture-content', import.meta.url)), dir, { recursive: true })
  const id = 'aquariumcoop-blogs-aquarium-5-gallon-fish'
  const file = join(dir, 'guides', id, 'vi.json')
  await writeFile(file, JSON.stringify({ ...JSON.parse(await readFile(file, 'utf8')), held: { checks: ['kit'], at: '2026-11-08' } }))
  const was = process.env.CONTENT_ROOT
  process.env.CONTENT_ROOT = dir
  try {
    const { getContent } = await import('../src/lib/content')
    expect((await getContent('vi')).guides.map(g => g.id)).not.toContain(id)
    expect((await getContent('ms')).guides.map(g => g.id)).toContain(id)
  } finally {
    process.env.CONTENT_ROOT = was
  }
})
