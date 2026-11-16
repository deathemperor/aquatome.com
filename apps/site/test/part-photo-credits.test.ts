import { readdirSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

// 16 Nov 2026: four part photos on three video guides carried another photo's credit, caption and size (a canister filter
// credited and captioned as a riccia tank). A 9 Nov push that mixed two versions of each guide's file crossed them. The
// picture step names a part photo's address after its Commons page (packages/engine/src/video-images.ts: the page's
// address in base64url, its last 16 characters), so the address says whose record it is.
const GUIDES = new URL('../../../content/guides/', import.meta.url)

test("every video guide's part photo carries its own Commons page, by its address", () => {
  const crossed: string[] = []
  for (const id of readdirSync(GUIDES).filter(x => x.startsWith('youtube-'))) {
    const e = JSON.parse(readFileSync(new URL(`${id}/entity.json`, GUIDES), 'utf8')) as { video?: { figures?: { photo?: { url: string; sourceUrl: string } }[] } }
    for (const f of e.video?.figures ?? []) {
      const tail = f.photo?.url.match(/\/p\d+-(.+)\.webp$/)?.[1]
      if (tail && Buffer.from(f.photo!.sourceUrl).toString('base64url').slice(-16) !== tail) crossed.push(`${id} ${f.photo!.url}`)
    }
  }
  expect(crossed).toEqual([])
})
