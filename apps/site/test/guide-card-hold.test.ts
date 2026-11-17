import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, vi } from 'vitest'

// A guide's card skips a photo the calendar keeps off cards (content/curation.json `avoid`), a still of its own video too.
// The site sets that list as it loads its content (content.ts, withOffCards), and without it every hold lifts with no
// error: a reader of the change found nothing tested that the loader sets it (16 Nov). So this loads the fixture content
// the way the site does, once with the guide's still on the hold and once without.
const FIXTURE = fileURLToPath(new URL('./fixture-content', import.meta.url))
const GUIDE = 'youtube-vl1Lx9iWDYU'
const STILL = 'https://media.aquatome.com/video/vl1Lx9iWDYU/at95-hd.webp'

async function card(avoid?: Record<string, string>): Promise<string | undefined> {
  const root = mkdtempSync(join(tmpdir(), 'aq-card-hold-'))
  const was = process.env.CONTENT_ROOT
  try {
    cpSync(FIXTURE, root, { recursive: true })
    if (avoid) writeFileSync(join(root, 'curation.json'), JSON.stringify({ version: 1, weeks: [], days: [], avoid }))
    process.env.CONTENT_ROOT = root
    vi.resetModules()
    const { getContent } = await import('../src/lib/content')
    const { guideImage } = await import('../src/lib/mentions')
    const c = await getContent('vi')
    return guideImage(c, c.guides.find(g => g.id === GUIDE)!)?.url
  } finally {
    if (was === undefined) delete process.env.CONTENT_ROOT
    else process.env.CONTENT_ROOT = was
    rmSync(root, { recursive: true, force: true })
  }
}

test("the site's content loader keeps a photo the calendar holds off cards off a guide's card, a still of its own video too", async () => {
  expect(await card()).toBe(STILL)
  expect(await card({ [STILL]: 'a test' })).not.toBe(STILL)
}, 60_000)
