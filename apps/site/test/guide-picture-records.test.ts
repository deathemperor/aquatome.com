import { readdirSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

// The records of a video guide's pictures, over the real content, so an engine run whose push crosses them keeps its
// work unpublished (the content step reads this file). Engine runs that rewrote one guide's file at once mixed lines of
// the two versions on 8, 9 and 15 Nov and on 16 Nov: the file parsed, and pictures took other pictures' records.
const GUIDES = new URL('../../../content/guides/', import.meta.url)
type Figure = { photo?: { url: string; sourceUrl: string }; moments?: { url: string; person?: boolean }[] }
const figures = (): [string, Figure][] =>
  readdirSync(GUIDES).filter(x => x.startsWith('youtube-')).flatMap(id =>
    ((JSON.parse(readFileSync(new URL(`${id}/entity.json`, GUIDES), 'utf8')) as { video?: { figures?: Figure[] } }).video?.figures ?? []).map(f => [id, f] as [string, Figure]))

// 16 Nov: four part photos on three guides carried another photo's credit, licence and caption (a canister filter
// credited and captioned as a riccia tank). The picture step names a part photo's address after its Commons page
// (packages/engine/src/video-images.ts: the page's address in base64url, its last 16 characters), so the address says
// whose record it is.
test("every video guide's part photo carries its own Commons page, by its address", () => {
  const crossed: string[] = []
  for (const [id, f] of figures()) {
    const tail = f.photo?.url.match(/\/p\d+-(.+)\.webp$/)?.[1]
    if (tail && Buffer.from(f.photo!.sourceUrl).toString('base64url').slice(-16) !== tail) crossed.push(`${id} ${f.photo!.url}`)
  }
  expect(crossed).toEqual([])
})

// 16 Nov: 17 stills on four guides showed as "no one in it" with no verdict of their own, five with hands in them. A still
// shows only when its record says no one is in it, and the photo check, or the stills step for a frame it swaps in, keeps
// that verdict under the still's own address (engine-state/_photo-guides.json).
test("every video guide's still marked 'no one in it' has the photo check's verdict at its own address", () => {
  const verdicts = JSON.parse(readFileSync(new URL('../../../engine-state/_photo-guides.json', import.meta.url), 'utf8')) as Record<string, { person?: boolean }>
  const unjudged: string[] = []
  for (const [id, f] of figures()) for (const m of f.moments ?? []) if (m.person === false && verdicts[m.url]?.person !== false) unjudged.push(`${id} ${m.url}`)
  expect(unjudged).toEqual([])
})
