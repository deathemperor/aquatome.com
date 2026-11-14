import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { researchDeny } from '../src/claude'
import { cycleOnlyHosts, refused, researchedPage } from '../src/cycle-only'

/** A checkout whose engine record says `record`. */
async function checkout(record: string) {
  const root = await mkdtemp(join(tmpdir(), 'aq-cycle-only-'))
  await mkdir(join(root, 'engine-state'), { recursive: true })
  await writeFile(join(root, 'engine-state', '_sources.json'), record)
  return root
}

// The chief of staff, 14 Nov 2026, on the owner's rule: a source that challenges us is read only the way the engine's
// cycle reads it, at its pace, and nothing goes round that; Spruce's pages are read by nobody by hand.
test('research never reads a source the engine reads only through the Archive, or one waiting for a person to pass its browser check', async () => {
  const root = await checkout('{}')
  const bare = await cycleOnlyHosts(root)
  const off = (url: string) => refused(bare, url)
  // By their config: Planet Catfish, 2hr Aquarist and Spruce, every host under each (a WebFetch rule "*.host" covers
  // "www." and a forum, never the host itself, so both are given); and the Archive's own copies.
  for (const u of ['https://planetcatfish.com/forum/viewtopic.php?p=1', 'https://www.planetcatfish.com/common/species.php?species_id=1', 'https://2hraquarist.com/blogs/a/b', 'https://www.2hraquarist.com/blogs/a/b', 'https://thesprucepets.com/x-1380726', 'https://www.thesprucepets.com/x-1380726', 'https://web.archive.org/web/2024/https://www.thesprucepets.com/', 'https://archive.org/details/x'])
    expect(off(u), u).toBe(true)
  // Every other copy of a page (the Writing Lead, 14 Nov 2026): archive.today's names, Google's cache and its Translate
  // proxy, whose host is made from any site's, and a reader proxy.
  for (const u of ['https://wayback.archive.org/web/x', 'https://archive.ph/abc', 'https://archive.is/abc', 'https://archive.today/abc', 'https://archive.li/abc', 'https://archive.md/abc', 'https://archive.vn/abc', 'https://webcache.googleusercontent.com/search?q=cache:x', 'https://r.jina.ai/https://www.thesprucepets.com/', 'https://www-thesprucepets-com.translate.goog/x', 'https://forum-planetcatfish-com.translate.goog/x'])
    expect(off(u), u).toBe(true)
  // Matched as WebFetch matches: any case, a trailing dot.
  expect(off('https://WWW.TheSprucePets.com./x')).toBe(true)
  // Sources the engine reads as it likes, and a path in a source's address pattern ("species.php"), are no host of it.
  for (const u of ['https://www.seriouslyfish.com/species/x/', 'https://www.loaches.com/x', 'https://www.aquariumcoop.com/blogs/x', 'https://notthesprucepets.com/x'])
    expect(off(u), u).toBe(false)
  expect(bare.filter(h => h.includes('species') || h.includes('seriouslyfish'))).toEqual([])
  // Moved to the Archive by the engine, or blocked by a browser check: off too, from the engine's own record, with every
  // host under it (Aquarium Co-op's forum is cited in research).
  const marked = await checkout(JSON.stringify({ loachesonline: { blockedAt: '2026-11-14T01:00:00.000Z' }, aquariumcoop: { archive: '2026-11-14T01:00:00.000Z' }, tropica: { blocks: ['2026-11-14T01:00:00.000Z'] } }))
  const now = await cycleOnlyHosts(marked)
  for (const u of ['https://loaches.com/x', 'https://www.loaches.com/x', 'https://aquariumcoop.com/x', 'https://forum.aquariumcoop.com/t/1'])
    expect(refused(now, u), u).toBe(true)
  // A single block noted, not yet a block on record, isn't a source waiting for a person.
  expect(refused(now, 'https://tropica.com/en/plants/x')).toBe(false)
  expect(researchDeny(now)).toEqual(expect.arrayContaining(['WebFetch(domain:shopee.vn)', 'WebFetch(domain:thesprucepets.com)', 'WebFetch(domain:*.thesprucepets.com)', 'WebFetch(domain:*.archive.org)', 'WebFetch(domain:*.aquariumcoop.com)']))
})

// The chief of staff, 14 Nov 2026: research doesn't open the magazine read for ideas at all, since nothing records what it
// opens; and a site read for ideas that refused us its listing is kept off as the cycle's are (ideas.ts).
test('research never opens the magazine read for ideas, nor a site read for ideas that refused us its listing', async () => {
  const bare = await cycleOnlyHosts(await checkout('{}'))
  for (const u of ['https://www.practicalfishkeeping.co.uk/features/x/', 'https://practicalfishkeeping.co.uk/x', 'https://PRACTICALFISHKEEPING.co.uk./x'])
    expect(refused(bare, u), u).toBe(true)
  expect(researchDeny(bare)).toEqual(expect.arrayContaining(['WebFetch(domain:practicalfishkeeping.co.uk)', 'WebFetch(domain:*.practicalfishkeeping.co.uk)']))
  // The shops read for ideas stay open to research, which may cite one for a Vietnamese name, until one refuses its listing.
  for (const u of ['https://aquazonefish.vn/blogs/kien-thuc/x', 'https://aquahouse.vn/x', 'https://cacanhtailoc.com/blogs/tin-tuc/x'])
    expect(refused(bare, u), u).toBe(false)
  const marked = await cycleOnlyHosts(await checkout(JSON.stringify({ aquazonefish: { blockedAt: '2026-11-14T01:00:00.000Z' } })))
  expect(refused(marked, 'https://aquazonefish.vn/blogs/kien-thuc/x')).toBe(true)
  expect(refused(marked, 'https://www.aquazonefish.vn/x')).toBe(true)
  expect(refused(marked, 'https://aquahouse.vn/x')).toBe(false)
})

test('with no record of the sources, or one not of its shape, there is no list to keep to, and research has none (Astra\'s read)', async () => {
  const missing = await mkdtemp(join(tmpdir(), 'aq-cycle-only-'))
  await expect(cycleOnlyHosts(missing)).rejects.toThrow()
  const folder = await mkdtemp(join(tmpdir(), 'aq-cycle-only-'))
  await mkdir(join(folder, 'engine-state', '_sources.json'), { recursive: true })
  await expect(cycleOnlyHosts(folder)).rejects.toThrow()
  for (const record of ['', ' ', '{', '[]', '42', 'true', '"broken"', 'null', '{"loachesonline":true}', '{"loachesonline":{"blockedAt":1}}', '{"tropica":{"blocks":"x"}}'])
    await expect(cycleOnlyHosts(await checkout(record)), record).rejects.toThrow()
})

test('a page research names, fetched by the engine itself, is never one of those, at any redirect (Astra\'s read)', async () => {
  const root = await checkout(JSON.stringify({ aquariumcoop: { archive: '2026-11-14T01:00:00.000Z' } }))
  const asked: string[] = []
  const moves: Record<string, string> = { 'https://shop.example/lua': 'https://www.2hraquarist.com/blogs/a/b', 'https://shop.example/old': '/new' }
  const fake = (async (url: string) => {
    asked.push(url)
    const to = moves[url]
    return to ? new Response(null, { status: 302, headers: { location: to } }) : new Response('<p>150.000đ</p>', { status: 200 })
  }) as typeof fetch
  const get = researchedPage(root, fake)
  for (const u of ['https://www.2hraquarist.com/blogs/a/b', 'https://planetcatfish.com/forum/x', 'https://forum.aquariumcoop.com/t/1', 'https://web.archive.org/web/x', 'https://shopee.vn/x'])
    await expect(get(u), u).rejects.toThrow()
  expect(asked).toEqual([])
  // A shop's page that moves to one of them: the move is followed by hand, and refused before it's asked for.
  await expect(get('https://shop.example/lua')).rejects.toThrow(/own pace/)
  expect(asked).toEqual(['https://shop.example/lua'])
  // A shop's page, moved or not, is read as before.
  expect(await get('https://shop.example/old')).toBe('<p>150.000đ</p>')
  expect(asked.slice(1)).toEqual(['https://shop.example/old', 'https://shop.example/new'])
})

// Codex's read of 20b579b6f, 14 Nov 2026: the marketplaces were denied as their bare hosts alone, and a WebFetch domain rule
// matches its host only ("*.host" those under it), so research could open www.tokopedia.com or www.shopee.vn.
test("research's deny list holds every marketplace host: bare, its www., and the other countries' Shopee and Lazada", () => {
  const rules = researchDeny().map(r => /^WebFetch\(domain:(.+)\)$/.exec(r)![1]!)
  const denied = (host: string) => rules.some(r => (r.startsWith('*.') ? host.endsWith(r.slice(1)) : host === r))
  for (const host of ['shopee.vn', 'www.shopee.vn', 'tokopedia.com', 'www.tokopedia.com', 'tokopedia.link', 'www.lazada.vn', 'tiki.vn', 'vn.shp.ee', 'shopee.co.id', 'www.lazada.co.th', 'shopee.com.my', 'www.lazada.com.my'])
    expect(denied(host), host).toBe(true)
  expect(denied('aquahouse.vn')).toBe(false)
})
