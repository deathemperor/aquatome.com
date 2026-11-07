import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type Anthropic from '@anthropic-ai/sdk'
import type { PageDoc } from '@aq/schema/app-page'
import { expect, test } from 'vitest'
import { answerQuestion, CHAT_LIMITS, firstMessage, LAST_WORD, SYSTEM } from '../chat/agent'
import { ANSWER_SCHEMA, fill, MAX_BLOCKS, MIN_TEXT, readAnswer, type Answer, type Choice } from '../chat/answer'
import { handbookOf, type Handbook, type Item, type Source } from '../chat/handbook'
import { fold, search, searchTopics } from '../chat/search'
import { topicsOf, type Topics } from '../chat/topics'
import { checkMates, type MatesCheck } from '../chat/mates'
import { chatTools, SECTION_CHARS, type Step } from '../chat/tools'
import { contract } from './contract'

// The fixture build's app index and page copies (pnpm test builds the site first), as the Worker reads them from its assets.
const DIST = fileURLToPath(new URL('../../dist/', import.meta.url).href)
const json = (file: string) => (existsSync(DIST + file) ? JSON.parse(readFileSync(DIST + file, 'utf8')) : null)
const source: Source = { index: async lang => json(`app/${lang}.json`), shard: async (lang, kind, n) => json(`app/pages/${lang}/${kind}-${n}.json`), topics: async lang => json(`app/chat/${lang}.json`) }
const hb = async (): Promise<Handbook> => (await handbookOf(source, 'vi'))!
const { misfits } = contract('chat.openapi.json')
const block = { $ref: '#/components/schemas/Block' }
const pick = (p: Partial<Choice>): Choice => ({ t: 'species', ids: [], path: null, heading: null, tool: null, fish: [], tank: null, ...p })
const answer = (blocks: Choice[], o: Partial<Answer> = {}): Answer => ({ text: 'x', covered: true, blocks, suggestions: [], ...o })
const run = async (name: string, input: Record<string, unknown>, h?: Handbook) => {
  const tool = chatTools({ handbook: h ?? (await hb()), tanks: async () => [] }).find(t => t.name === name)!
  return { step: tool.step?.(input), out: await tool.run(input, { photosLeft: 0 }) }
}

test('the search finds a page by its name as readers type it, a page named exactly that first, of one kind when asked', async () => {
  const h = await hb()
  expect(fold('Cá đĩa  Pigeon-Blood')).toBe('ca dia pigeon blood')
  expect(search(h.items, 'cá đĩa', null)[0]?.id).toBe('symphysodon-aequifasciatus')
  expect(search(h.items, 'ca dia', null)[0]?.id).toBe('symphysodon-aequifasciatus')
  expect(search(h.items, 'neon', null).map(i => i.id).slice(0, 2).sort()).toEqual(['paracheirodon-axelrodi', 'paracheirodon-innesi'])
  expect(search(h.items, 'Paracheirodon innesi', null)[0]?.id).toBe('paracheirodon-innesi')
  expect(search(h.items, 'neon', 'guide').every(i => i.kind === 'guide')).toBe(true)
  expect(search(h.items, 'thay nước', 'guide')[0]?.path).toBe('/vi/huong-dan/thay-nuoc-dung-cach/')
  expect(search(h.items, 'zzz', null)).toEqual([])
  const { step, out } = await run('search_handbook', { query: 'cá đĩa', kind: 'fish' })
  expect(step).toEqual({ kind: 'search', query: 'cá đĩa' })
  expect(JSON.parse(out as string)[0]).toEqual({ path: '/vi/ca/ca-dia/', kind: 'fish', name: 'Cá đĩa', id: 'symphysodon-aequifasciatus', sub: 'Symphysodon aequifasciatus' })
})

test('read_page gives a page\'s outline (a fish\'s or plant\'s figures too), then one section\'s text by its heading id; an unknown page or heading is an error Claude reads', async () => {
  const h0 = await hb()
  const guide = '/vi/huong-dan/phan-loai-ca-dia/'
  const outline = await run('read_page', { path: guide, heading: null })
  expect(outline.step).toEqual({ kind: 'read', page: { kind: 'guide', title: 'Phân loại cá dĩa', url: guide } })
  const o = JSON.parse(outline.out as string)
  expect(o.sections.map((s: { id: string | null }) => s.id)).toEqual([null, 'la-gi', 'can-chi-va-hoa-van', 'ten-dong-o-viet-nam'])
  expect(o.sections[0].text).toContain('Cá dĩa được chia thành 14 lớp')
  const section = await run('read_page', { path: guide, heading: 'can-chi-va-hoa-van' })
  expect(section.out).toBe('Can, chỉ và hoa văn\nCan là các sọc đứng trên thân, hiện rõ khi cá sợ.\n[photo: Các bộ phận của cá dĩa]\nChỉ là những đường ánh kim nằm ngang trên màu nền.')
  const fish = JSON.parse((await run('read_page', { path: '/vi/ca/ca-neon-xanh/', heading: null })).out as string)
  expect(fish).toMatchObject({ id: 'paracheirodon-innesi', facts: { tempC: { min: 20, max: 26 }, schoolMin: 6 } })
  const plant = JSON.parse((await run('read_page', { path: h0.byId('anubias-barteri-nana')!.path, heading: null })).out as string)
  expect(plant).toMatchObject({ id: 'anubias-barteri-nana', plant: { difficulty: 1, light: 'low' } })
  expect(plant).not.toHaveProperty('facts')
  await expect(run('read_page', { path: '/vi/ca/khong-co/', heading: null })).rejects.toThrow(/No page at/)
  await expect(run('read_page', { path: guide, heading: 'khong-co' })).rejects.toThrow(/No heading khong-co/)
  expect(SECTION_CHARS).toBeLessThanOrEqual(4000)
})

test('read_tanks reads the reader\'s tanks, says when there are none, and is an error when they can\'t be read', async () => {
  const h = await hb()
  const tank = { name: 'Bể 60', dims: { l: 60, w: 30, h: 36 }, fish: [{ name: 'Cá neon xanh', id: 'paracheirodon-innesi', count: 10 }] }
  const tool = (tanks: () => Promise<unknown>) => chatTools({ handbook: h, tanks: tanks as never }).find(t => t.name === 'read_tanks')!
  expect(JSON.parse(await tool(async () => [tank]).run({}, { photosLeft: 0 }) as string)).toEqual([tank])
  expect(await tool(async () => []).run({}, { photosLeft: 0 })).toBe('The reader has no saved tanks.')
  await expect(tool(async () => null).run({}, { photosLeft: 0 })).rejects.toThrow(/can't be read/)
  expect(tool(async () => []).step?.({})).toEqual({ kind: 'tanks' })
})

/** A check as a block carries it: what the app's tank check draws, without what only Claude reads. */
const drawn = ({ fish: _f, tank: _t, answer: _a, ...c }: MatesCheck) => c

test('the blocks are filled from the handbook, each of the contract\'s shape: a card\'s facts the index\'s, a breed as its species, a section\'s own blocks, a tool\'s own link and its check', async () => {
  const h = await hb()
  // The tank-mates block's fish and tank, as Claude checked them first (a breed as its species, its count rounded).
  const checked = checkMates([{ id: 'paracheirodon-innesi', count: 10 }, { id: 'pigeon-blood-discus', count: 2 }], { l: 60, w: 30, h: 36 }, h)
  const { blocks, dropped } = await fill(answer([
    pick({ t: 'species', ids: ['paracheirodon-innesi'] }),
    pick({ t: 'compare', ids: ['paracheirodon-innesi', 'paracheirodon-axelrodi', 'paracheirodon-innesi'] }),
    pick({ t: 'section', path: '/vi/huong-dan/phan-loai-ca-dia/', heading: 'la-gi' }),
    pick({ t: 'section', path: '/vi/huong-dan/phan-loai-ca-dia/', heading: null }),
    pick({ t: 'tool', tool: 'tank-mates', fish: [{ id: 'paracheirodon-innesi', count: 10 }, { id: 'pigeon-blood-discus', count: 2.4 }], tank: { l: 60, w: 30, h: 36 } }),
  ]), h, [checked])
  expect(dropped).toEqual([])
  for (const b of blocks) expect(misfits(b, block), JSON.stringify(b)).toEqual([])
  expect(blocks[0]).toEqual({ t: 'species', page: { id: 'paracheirodon-innesi', kind: 'species', name: 'Cá neon xanh', sci: 'Paracheirodon innesi', url: '/vi/ca/ca-neon-xanh/', img: h.byId('paracheirodon-innesi')!.img },
    facts: expect.objectContaining({ tempC: { min: 20, max: 26 }, schoolMin: 6 }) })
  expect(blocks[1]).toMatchObject({ t: 'compare', items: [{ page: { id: 'paracheirodon-innesi' } }, { page: { id: 'paracheirodon-axelrodi' } }] })
  expect(blocks[2]).toEqual({ t: 'section', page: { kind: 'guide', title: 'Phân loại cá dĩa', url: '/vi/huong-dan/phan-loai-ca-dia/' }, heading: { text: 'Là gì', id: 'la-gi' },
    blocks: [{ t: 'p', c: ['Bảng phân lớp chia cá dĩa thành 14 lớp: bốn lớp hoang dã, năm lớp hoa văn và năm lớp màu.'] }] })
  expect(blocks[3]).toMatchObject({ t: 'section', blocks: [{ t: 'summary' }] })
  expect(blocks[3]).not.toHaveProperty('heading')
  // A breed is checked as the species it is a form of (the tool's own link names species), its count rounded.
  expect(blocks[4]).toEqual({ t: 'tool', tool: 'tank-mates', name: h.byPath('/vi/cong-cu/nuoi-chung/')!.short ?? h.byPath('/vi/cong-cu/nuoi-chung/')!.name, url: '/vi/cong-cu/nuoi-chung/?ca=ca-neon-xanh:10,ca-dia:2&l=60&w=30&h=36', check: drawn(checked) })
  // The check as the app's tank check draws it: the verdict, then how full this tank would be.
  expect(checked.verdict).toBeDefined()
  expect(checked.stocking).toMatchObject({ percent: expect.any(Number), level: expect.stringMatching(/^(light|ok|full|over)$/) })
  // A breed's card: its own figures (its page's data card), not its species'; a plant's on the plants' scale.
  const breed = await fill(answer([pick({ ids: ['pigeon-blood-discus'] }), pick({ ids: ['oranda-goldfish'] }), pick({ ids: ['anubias-barteri-nana'] })]), h)
  // The figures as the fixture's pages have them, read from the index: the breed's card differs from its species'.
  const own = h.byId('pigeon-blood-discus')!.card!
  expect(own.tempC).toBeDefined()
  expect(own.tempC).not.toEqual(h.byId('symphysodon-aequifasciatus')!.tempC)
  expect(breed.blocks[0]).toEqual(expect.objectContaining({ page: expect.objectContaining({ id: 'pigeon-blood-discus', kind: 'breed' }), facts: { tempC: own.tempC, sizeCm: own.sizeCm } }))
  expect(breed.blocks[1]).toMatchObject({ page: { id: 'oranda-goldfish', kind: 'breed' }, facts: { tempC: { min: 18, max: 24 }, lifeYears: { min: 10, max: 15 } } })
  expect(breed.blocks[2]).toEqual(expect.objectContaining({ page: expect.objectContaining({ id: 'anubias-barteri-nana', kind: 'plant' }), plant: { difficulty: 1, light: 'low', co2: 'none', growth: 'slow', placement: ['foreground', 'epiphyte'] } }))
  expect(breed.blocks[2]).not.toHaveProperty('facts')
  for (const b of breed.blocks) expect(misfits(b, block), JSON.stringify(b)).toEqual([])
  const volume = await fill(answer([pick({ t: 'tool', tool: 'tank-volume', tank: { l: 60, w: 30.04, h: 36 } }), pick({ t: 'tool', tool: 'tank-volume' })]), h)
  expect(volume.blocks.map(b => (b as { url: string }).url)).toEqual(['/vi/cong-cu/the-tich-be/?hinh=chu-nhat&l=60&w=30&h=36', '/vi/cong-cu/the-tich-be/'])
})

test('a pick the handbook doesn\'t have is dropped with its reason, and the rest still go out', async () => {
  const h = await hb()
  const { blocks, dropped } = await fill(answer([
    pick({ t: 'species', ids: ['no-such-fish'] }),
    pick({ t: 'species', ids: [] }),
    pick({ t: 'compare', ids: ['paracheirodon-innesi', 'no-such-fish'] }),
    pick({ t: 'section', path: '/vi/huong-dan/khong-co/', heading: null }),
    pick({ t: 'section', path: '/vi/huong-dan/phan-loai-ca-dia/', heading: 'khong-co' }),
  ]), h)
  expect(blocks).toEqual([])
  expect(dropped).toEqual([
    'species: no fish or plant "no-such-fish"', 'species: no fish or plant null', 'compare: 1 of ["paracheirodon-innesi","no-such-fish"] found',
    'section: no page "/vi/huong-dan/khong-co/"', 'section: nothing under "khong-co" on /vi/huong-dan/phan-loai-ca-dia/',
  ])
  const tools = await fill(answer([
    pick({ t: 'tool', tool: 'tank-mates', fish: [{ id: 'no-such-fish', count: 3 }] }),
    pick({ t: 'tool', tool: null }),
    pick({ t: 'species', ids: ['anubias-barteri-nana'] }), pick({ t: 'species', ids: ['anubias-barteri-nana'] }), pick({ t: 'species', ids: ['anubias-barteri-nana'] }), pick({ t: 'species', ids: ['anubias-barteri-nana'] }), pick({ t: 'species', ids: ['anubias-barteri-nana'] }),
  ]), h)
  expect(tools.dropped).toEqual(['tool: tank-mates with none of ["no-such-fish"]', 'tool: no null in vi', '2 blocks past 5'])
  expect(tools.blocks.map(b => b.t)).toEqual(['species', 'species', 'species'])
  expect(tools.blocks).toHaveLength(MAX_BLOCKS - 2)
})

test('check_tank_mates checks fish as the tank-mates tool does, in the reader\'s language; a tank-mates block goes out only with the check of its fish, counts and tank, and carries it', async () => {
  const h = await hb()
  const checks: MatesCheck[] = []
  const tool = chatTools({ handbook: h, tanks: async () => [], checks }).find(t => t.name === 'check_tank_mates')!
  expect(tool.step?.({})).toBeUndefined()
  const out = JSON.parse(await tool.run({ fish: [{ id: 'paracheirodon-innesi', count: 10 }, { id: 'pigeon-blood-discus', count: 2 }], tank: null }, { photosLeft: 0 }) as string) as MatesCheck
  // Each fish as checked: a breed as its species, as the block's link names it.
  expect(out.fish).toEqual([
    { id: 'paracheirodon-innesi', name: 'Cá neon xanh', path: '/vi/ca/ca-neon-xanh/', count: 10 },
    { id: 'symphysodon-aequifasciatus', name: h.byId('symphysodon-aequifasciatus')!.name, path: h.byId('symphysodon-aequifasciatus')!.path, count: 2 },
  ])
  // The tool's verdict, and its parts: the sentence the tool writes is the head and the reasons.
  expect(out.answer).toMatchObject({ level: 'no', head: 'Không nên nuôi chung' })
  expect(out.verdict).toEqual({ level: 'no', text: `${out.answer!.head}: ${out.answer!.reasons.join('; ')}.` })
  // No tank given: the shortest tank they all need, as the tool says it.
  expect(out.minTank).toMatch(/^Bể dài tối thiểu cho cả nhóm: \d+ cm\.$/)
  expect(out.tank).toBeNull()
  expect(out).not.toHaveProperty('stocking')
  expect(checks).toEqual([out])
  await expect(tool.run({ fish: [{ id: 'no-such-fish', count: 2 }], tank: null }, { photosLeft: 0 })).rejects.toThrow('None of these ids is a fish')
  const two = [{ id: 'paracheirodon-innesi', count: 10 }, { id: 'symphysodon-aequifasciatus', count: 2 }]
  // In the reader's language: the check's own words, as the site's Indonesian tool has them (the fixture's Indonesian
  // index is too small for these fish: the Vietnamese one, read as Indonesian).
  const strings = JSON.parse(readFileSync(fileURLToPath(new URL('../chat/tank-check-strings.json', import.meta.url).href), 'utf8')) as Record<string, Record<string, string>>
  const viaId = checkMates(two, null, { ...h, lang: 'id' })
  expect(viaId.answer?.head).toBe(strings.id!['Không nên nuôi chung'])
  expect(viaId.answer?.head).not.toBe('Không nên nuôi chung')
  const cm = /\d+/.exec(out.minTank!)![0]
  expect(viaId.minTank).toBe(strings.id!['Bể dài tối thiểu cho cả nhóm: <strong>{n} cm</strong>.']!.replace('{n}', cm).replace(/<\/?strong>/g, ''))
  // A block of fish not checked, or checked with other counts or in another tank, isn't shown; one fish has nothing to check.
  const mates = (fish: { id: string; count: number }[]) => pick({ t: 'tool', tool: 'tank-mates', fish })
  expect((await fill(answer([mates(two)]), h)).dropped).toEqual(['tool: tank-mates ca-dia:2,ca-neon-xanh:10 not checked'])
  const other = checkMates([{ id: 'paracheirodon-innesi', count: 6 }, { id: 'symphysodon-aequifasciatus', count: 2 }], null, h)
  expect((await fill(answer([mates(two)]), h, [other])).blocks).toEqual([])
  const shown = await fill(answer([mates(two)]), h, [other, out])
  expect(shown.blocks).toMatchObject([{ t: 'tool', tool: 'tank-mates', check: drawn(out) }])
  for (const b of shown.blocks) expect(misfits(b, block), JSON.stringify(b)).toEqual([])
  // Checked with no tank, the block of a sized tank isn't shown, nor the other way round: the check that went out is
  // the one Claude read (an overfull tank's meter isn't left off a block that names the tank).
  const tank = { l: 60, w: 30, h: 36 }
  const inTank = (t: typeof tank | null) => pick({ t: 'tool', tool: 'tank-mates', fish: two, tank: t })
  expect((await fill(answer([inTank(tank)]), h, [out])).dropped).toEqual(['tool: tank-mates ca-dia:2,ca-neon-xanh:10 in 60×30×36 not checked'])
  const sized = checkMates(two, tank, h)
  expect((await fill(answer([inTank(null)]), h, [sized])).blocks).toEqual([])
  expect((await fill(answer([inTank({ l: 100, w: 40, h: 40 })]), h, [sized])).blocks).toEqual([])
  const both = await fill(answer([inTank(tank)]), h, [out, sized])
  expect(both.blocks).toMatchObject([{ check: drawn(sized) }])
  expect(both.blocks[0]).toHaveProperty('check.stocking')
  for (const b of both.blocks) expect(misfits(b, block), JSON.stringify(b)).toEqual([])
  const one = await fill(answer([mates([{ id: 'paracheirodon-innesi', count: 8 }])]), h)
  expect(one.dropped).toEqual([])
  expect(one.blocks[0]).not.toHaveProperty('check')
})

test('a section is every block under its heading, to the next heading, however many: the part of the page the site draws', async () => {
  const path = '/vi/huong-dan/dai/'
  const paras = Array.from({ length: 12 }, (_, i) => ({ t: 'p', c: [`Đoạn ${i + 1}.`] }))
  const doc = { kind: 'guide', title: 'Dài', blocks: [{ t: 'p', c: ['Mở đầu.'] }, { t: 'h', text: 'Một', id: 'mot' }, ...paras, { t: 'h', text: 'Hai', id: 'hai' }, { t: 'p', c: ['Sau.'] }] }
  const long: Source = { index: async () => ({ lang: 'vi', items: [{ kind: 'guide', name: 'Dài', path }], shards: { guide: { n: 1 } } }), shard: async () => ({ v: 1, pages: { [path]: doc } }) as never }
  const h = (await handbookOf(long, 'vi'))!
  const { blocks } = await fill(answer([pick({ t: 'section', path, heading: 'mot' }), pick({ t: 'section', path, heading: null })]), h)
  expect(blocks[0]).toMatchObject({ t: 'section', heading: { id: 'mot' }, blocks: paras })
  expect(blocks[1]).toMatchObject({ t: 'section', blocks: [{ t: 'p', c: ['Mở đầu.'] }] })
  for (const b of blocks) expect(misfits(b, block), JSON.stringify(b)).toEqual([])
})

test('a guide is found by a section heading or a FAQ question past its title, with the section to open it at; its title still first', async () => {
  const h = await hb()
  // The build's /app/chat/vi.json is every guide's headings and FAQ questions, as the app's copy of each guide has them.
  const guides = (readdirSync(`${DIST}app/pages/vi`).filter(f => f.startsWith('guide-')).flatMap(f => Object.values(json(`app/pages/vi/${f}`).pages))) as PageDoc[]
  expect(await h.topics()).toEqual(topicsOf(guides))
  const algae = '/vi/huong-dan/cach-han-che-reu-hai-trong-be-thuy-sinh/'
  expect((await h.topics())!.pages[algae]).toEqual([['khoi-dong-be-moi', 'Khởi động bể mới'], ['anh-sang-va-co2', 'Ánh sáng và CO2'], ['bat-dau-tu-dau', 'Bắt đầu từ đâu'], ['bat-dau-tu-dau', 'Nên thay nước lúc nào?']])
  // No title says CO2; a heading of the algae guide does. A FAQ question, at the section that holds it.
  const searched = async (query: string, kind: string | null = null) => JSON.parse((await run('search_handbook', { query, kind }, h)).out as string)
  expect(await searched('CO2')).toEqual([expect.objectContaining({ path: algae, kind: 'guide', section: { id: 'anh-sang-va-co2', text: 'Ánh sáng và CO2' } })])
  expect((await searched('thay nước lúc nào'))[0]).toMatchObject({ path: algae, section: { id: 'bat-dau-tu-dau', text: 'Nên thay nước lúc nào?' } })
  // A guide named for it comes first, without a section; the same guide isn't listed twice.
  const water = await searched('thay nước', 'guide')
  expect(water[0]).toEqual({ path: '/vi/huong-dan/thay-nuoc-dung-cach/', kind: 'guide', name: 'Thay nước đúng cách' })
  expect(water.filter((x: { path: string }) => x.path === algae)).toHaveLength(1)
  // "phân": the fertiliser guide is named for it and two of its headings have it too; it is listed once, by its name,
  // and the topic search gives a guide once, at its best topic.
  const fertiliser = '/vi/huong-dan/bon-phan-cho-cay-thuy-sinh/'
  const paths = (await searched('phân', 'guide')).map((x: { path: string }) => x.path)
  expect(paths).toContain(fertiliser)
  expect(new Set(paths).size).toBe(paths.length)
  expect((await searched('phân', 'guide')).find((x: { path: string }) => x.path === fertiliser)).not.toHaveProperty('section')
  const byTopic = searchTopics((await h.topics())!, h.byPath, 'phân').map(x => x.item.path)
  expect(byTopic.filter(p => p === fertiliser)).toHaveLength(1)
  expect(new Set(byTopic).size).toBe(byTopic.length)
  // Another kind than guides, or topics that can't be read: names only.
  expect(await run('search_handbook', { query: 'CO2', kind: 'fish' }, h).then(r => r.out)).toMatch(/^No page by that name/)
  const bare = (await handbookOf({ ...source, topics: async () => null }, 'vi'))!
  expect((await run('search_handbook', { query: 'CO2', kind: null }, bare)).out).toMatch(/^No page by that name/)
  expect(searchTopics({ v: 1, pages: {} }, h.byPath, 'CO2')).toEqual([])
  // A topics file of another shape (a later version, no pages): names only, not a failed search.
  for (const odd of [{ v: 2, pages: {} }, { v: 1 }, { v: 1, pages: { [algae]: 'Ánh sáng và CO2' } }, { v: 1, pages: { [algae]: [[null]] } }]) {
    const other = (await handbookOf({ ...source, topics: async () => odd as never }, 'vi'))!
    expect(await other.topics()).toBeNull()
    expect(JSON.parse((await run('search_handbook', { query: 'thay nước', kind: 'guide' }, other)).out as string)[0]).toMatchObject({ path: '/vi/huong-dan/thay-nuoc-dung-cach/' })
  }
})

test("a guide named for the query past the eighth name, whose heading matches too, isn't lost when headings fill the list", async () => {
  // Twelve guides named for it; five with a matching heading, the first of them the tenth by name. Eight names, then four
  // headings: the tenth guide is among them, with its section, not dropped from both.
  const items = Array.from({ length: 12 }, (_, i) => ({ kind: 'guide', name: `Lọc nước ${i}`, path: `/vi/huong-dan/loc-${i}/` }) as Item)
  const others = Array.from({ length: 4 }, (_, i) => ({ kind: 'guide', name: `Bể ${i}`, path: `/vi/huong-dan/be-${i}/` }) as Item)
  const topics: Topics = { v: 1, pages: Object.fromEntries([items[9]!, ...others].map(g => [g.path, [['loc-nuoc', 'Lọc nước']]])) }
  const h = (await handbookOf({ index: async () => ({ lang: 'vi', items: [...items, ...others] }), shard: async () => null, topics: async () => topics }, 'vi'))!
  const listed = JSON.parse((await run('search_handbook', { query: 'lọc nước', kind: 'guide' }, h)).out as string) as { path: string; section?: unknown }[]
  expect(listed).toHaveLength(12)
  expect(listed.slice(0, 8).map(x => x.path)).toEqual(items.slice(0, 8).map(i => i.path))
  expect(listed.find(x => x.path === '/vi/huong-dan/loc-9/')).toMatchObject({ section: { id: 'loc-nuoc', text: 'Lọc nước' } })
  expect(new Set(listed.map(x => x.path)).size).toBe(12)
  // With only the tenth guide's heading matching, room is left for names past the eighth: the tenth is still listed
  // once, by its heading, and the other names fill the list.
  const one = (await handbookOf({ index: async () => ({ lang: 'vi', items: [...items, ...others] }), shard: async () => null, topics: async () => ({ v: 1, pages: { [items[9]!.path]: [['loc-nuoc', 'Lọc nước']] } }) }, 'vi'))!
  const fewer = JSON.parse((await run('search_handbook', { query: 'lọc nước', kind: 'guide' }, one)).out as string) as { path: string; section?: unknown }[]
  expect(fewer.map(x => x.path)).toEqual([...items.slice(0, 8), items[9]!, items[8]!, items[10]!, items[11]!].map(i => i.path))
  expect(fewer[8]).toMatchObject({ section: { id: 'loc-nuoc' } })
})

test("a question's words weigh by how rare they are among the headings: its subject isn't dropped, and an accent tells words apart", () => {
  // As the live headings have them: "ốc bùng phát" finds where snails come from, though that heading has no "phát" (by
  // titles' rule, the snail word dropped, it found only the outbreaks); "tép chết", shrimp, not every death; "cá otto"
  // still finds Otto, whose heading has no "cá"; "đèn" (a light) isn't "đen" (black), which folds alike.
  const topics: Topics = {
    v: 1,
    pages: {
      '/vi/huong-dan/oc/': [['oc-tu-dau-ra', 'Ốc từ đâu ra, vì sao bùng số lượng']],
      '/vi/huong-dan/tao-nau/': [['tao-nau', 'Tảo nâu bùng phát'], ['ca-an-tao', 'Cá ăn tảo']],
      '/vi/huong-dan/nuoc-duc/': [['vi-khuan', 'Vi khuẩn bùng phát làm nước đục']],
      '/vi/huong-dan/tep/': [['tep-chet', 'Vì sao tép chết']],
      '/vi/huong-dan/tep-an/': [['tep-an-gi', 'Tép ăn gì']],
      '/vi/huong-dan/ca-chet/': [['ca-chet', 'Cá chết hàng loạt'], ['ca-noi-dau', 'Cá nổi đầu']],
      '/vi/huong-dan/cay-chet/': [['cay-chet', 'Cây chết rễ']],
      '/vi/huong-dan/don-reu/': [['otto', 'Otto: thợ dọn rêu của bể'], ['ca-don-be', 'Cá dọn bể khác']],
      '/vi/huong-dan/den/': [['chon-den', 'Chọn đèn cho bể']],
      '/vi/huong-dan/reu/': [['reu-rau-den', 'Rêu râu đen bám lũa']],
      '/vi/huong-dan/ca/': [['ca-bo-an', 'Cá bỏ ăn'], ['ca-lo-do', 'Cá bơi lờ đờ']],
      '/vi/huong-dan/cay-khoe/': [['cay-khoe', 'Giữ cây khỏe']],
      '/vi/huong-dan/nam/': [['nam', 'Cá bị nấm trắng']],
      '/vi/huong-dan/betta/': [['chuan-bi', 'Danh sách cần chuẩn bị cho cá betta']],
      '/vi/huong-dan/nam-sau/': [['mot-nam', 'Bể cá sau một năm'], ['ba-nam', 'Ba năm nuôi cá'], ['mien-nam', 'Cá miền Nam']],
      '/vi/huong-dan/oto/': [['oto', 'Otocinclus ăn rêu nâu']],
      '/vi/huong-dan/thay-1/': [['thay-dinh-ky', 'Thay nước định kỳ cho bể cá lớn']],
      '/vi/huong-dan/thay-2/': [['thay-nuoc', 'Thay nước']],
    },
  }
  const byPath = (path: string) => ({ kind: 'guide', name: path, path }) as Item
  const found = (query: string) => searchTopics(topics, byPath, query).map(h => h.section)
  expect(found('ốc bùng phát')).toEqual(['oc-tu-dau-ra'])
  expect(found('tép chết')).toEqual(['tep-chet'])
  expect(found('cá otto')).toEqual(['otto'])
  expect(found('đèn')).toEqual(['chon-den'])
  // Typed without accents, either can be meant.
  expect(found('den')).toEqual(['chon-den', 'reu-rau-den'])
  // The tone mark on either vowel: "khoẻ" is the guides' "khỏe".
  expect(found('khoẻ')).toEqual(['cay-khoe'])
  // A word's rarity as written: "nấm" (fungus) is rare though "nam" also folds "năm" (a year) and "Nam" (south), so the
  // fungus heading comes before a betta checklist with no fungus in it.
  expect(found('cá betta bị nấm')[0]).toBe('nam')
  // A word heading words begin ("otocin", Otocinclus) has a rarity; one no heading has weighs nothing, and doesn't
  // keep the rest from matching.
  expect(found('otocin')).toEqual(['oto'])
  expect(found('cá otto propan')).toEqual(['otto'])
  // Of two headings with all of the query, the one with fewer other words first; a word asked twice counts once.
  expect(found('thay nước').slice(0, 2)).toEqual(['thay-nuoc', 'thay-dinh-ky'])
  expect(found('tép tép chết')).toEqual(['tep-chet'])
  // A Thai word beside accented Vietnamese isn't halved: Thai has no accents to fold, and its headings aren't split
  // into words as written.
  const mixed: Topics = { v: 1, pages: { '/th/a/': [['a', 'กำจัดตะไคร่น้ำ']], '/vi/b/': [['b', 'Đèn bể']], '/vi/c/': [['c', 'Đèn LED']], '/vi/d/': [['d', 'Mua đèn']] } }
  expect(searchTopics(mixed, byPath, 'ตะไคร่ đèn').map(h => h.section)).toEqual(['a'])
})

test('Thai, written without spaces, is searched by its words: a word inside a title, a fish without "ปลา"', () => {
  const items = [
    { kind: 'guide', name: 'ไฟดับ ทำอย่างไรให้ปลารอด', path: '/th/guides/power-cut/' },
    { kind: 'fish', name: 'ปลาหมอสี', id: 'cichlid', path: '/th/fish/cichlid/' },
    { kind: 'guide', name: 'โรคครีบเปื่อยในปลา', path: '/th/guides/fin-rot/' },
  ] as Item[]
  expect(search(items, 'ไฟดับ', null).map(i => i.path)).toEqual(['/th/guides/power-cut/'])
  expect(search(items, 'หมอสี', null).map(i => i.id)).toEqual(['cichlid'])
  expect(search(items, 'ครีบเปื่อย', 'guide').map(i => i.path)).toEqual(['/th/guides/fin-rot/'])
  expect(search(items, 'ปลาทอง', null)).toEqual([])
  // Vietnamese as before: accents folded.
  expect(fold('Cá Đĩa')).toBe('ca dia')
})

test('the chat\'s forced last call is told to answer from what it read', async () => {
  const bodies: Anthropic.MessageCreateParamsNonStreaming[] = []
  const final = { text: 'Cá neon xanh sống theo đàn.', covered: true, blocks: [], suggestions: [] }
  const out = await answerQuestion({
    send: async body => { bodies.push(body); return message([{ type: 'text', text: JSON.stringify(final) }]) },
    model: 'claude-opus-5-5', lang: 'vi', question: 'Nuôi cá neon thế nào?', earlier: [], start: {}, handbook: await hb(), tanks: async () => [], limits: { calls: 1 },
  })
  expect(out.stopped).toBe('calls')
  expect(bodies[0]!.tool_choice).toEqual({ type: 'none' })
  expect(JSON.stringify(bodies[0]!.messages.at(-1)!.content)).toContain(JSON.stringify(LAST_WORD).slice(1, -1))
})

test('the run ends within fish ID\'s time, so it outlives a dropped connection (the platform keeps it 30 s), and an answer with no text is none', () => {
  expect(CHAT_LIMITS.ms).toBeLessThanOrEqual(27_000)
  const said = (text: string) => readAnswer(message([{ type: 'text', text: JSON.stringify({ text, covered: true, blocks: [], suggestions: [] }) }]))
  expect(said('x')).toBeUndefined()
  expect(said('   ')).toBeUndefined()
  expect(said('Nuôi theo đàn.')?.text).toBe('Nuôi theo đàn.')
  expect(MIN_TEXT).toBeLessThanOrEqual(10)
})

test('the answer\'s schema and every tool\'s input are what structured outputs take: objects closed, every field required, no length or number limits', () => {
  const problems: string[] = []
  const walk = (s: Record<string, unknown>, at: string) => {
    for (const k of ['minLength', 'maxLength', 'minimum', 'maximum', 'minItems', 'maxItems', 'pattern', 'format']) if (k in s) problems.push(`${at}: ${k}`)
    if (s.type === 'object') {
      if (s.additionalProperties !== false) problems.push(`${at}: not closed`)
      const props = Object.keys((s.properties ?? {}) as object)
      if (JSON.stringify([...(s.required as string[] ?? [])].sort()) !== JSON.stringify(props.sort())) problems.push(`${at}: not every field required`)
    }
    for (const [k, v] of Object.entries(s)) {
      if (k === 'properties') for (const [p, sub] of Object.entries(v as object)) walk(sub, `${at}.${p}`)
      else if (k === 'items' || k === 'anyOf') [v].flat().forEach((sub, i) => walk(sub as Record<string, unknown>, `${at}.${k}[${i}]`))
    }
  }
  walk(ANSWER_SCHEMA as unknown as Record<string, unknown>, 'answer')
  for (const t of chatTools({ handbook: {} as Handbook, tanks: async () => [] })) walk(t.input_schema as Record<string, unknown>, t.name)
  expect(problems).toEqual([])
})

const message = (content: unknown[], stop: Anthropic.Message['stop_reason'] = 'end_turn'): Anthropic.Message =>
  ({ id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content, stop_reason: stop, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 50 } }) as unknown as Anthropic.Message

test('a turn: Claude reads the handbook, then answers; the steps are shown as they happen and the blocks it picked are filled', async () => {
  const h = await hb()
  const bodies: Anthropic.MessageCreateParamsNonStreaming[] = []
  const steps: Step[] = []
  const final: Answer = answer([pick({ t: 'species', ids: ['paracheirodon-innesi'] }), pick({ t: 'species', ids: ['nope'] })], { text: 'Cá neon xanh sống theo đàn.', suggestions: ['Nuôi chung với cá gì?'] })
  const out = await answerQuestion({
    send: async body => {
      bodies.push(body)
      return bodies.length === 1
        ? message([{ type: 'tool_use', id: 't1', name: 'read_page', input: { path: '/vi/ca/ca-neon-xanh/', heading: null } }], 'tool_use')
        : message([{ type: 'text', text: JSON.stringify(final) }])
    },
    model: 'claude-opus-5-5', lang: 'vi', question: 'Nuôi cá này thế nào?', earlier: [], start: { from: 'species', about: 'paracheirodon-innesi' },
    handbook: h, tanks: async () => [], onStep: s => steps.push(s),
  })
  expect(steps).toEqual([{ kind: 'read', page: { kind: 'fish', title: 'Cá neon xanh', url: '/vi/ca/ca-neon-xanh/' } }])
  expect(out.answer?.text).toBe('Cá neon xanh sống theo đàn.')
  expect(out.blocks.map(b => b.t)).toEqual(['species'])
  expect(out.dropped).toEqual(['species: no fish or plant "nope"'])
  expect(bodies[0]!.system).toBe(SYSTEM)
  // The handbook by the site's own word for it in each language (its title: "Cẩm nang cá cảnh & thủy sinh").
  for (const word of ['cẩm nang', 'panduan', 'คู่มือ']) expect(SYSTEM).toContain(word)
  expect(bodies[0]!.output_config).toEqual({ effort: 'medium', format: { type: 'json_schema', schema: ANSWER_SCHEMA } })
  expect(bodies[0]!.tools!.map(t => (t as Anthropic.Tool).name)).toEqual(['search_handbook', 'read_page', 'check_tank_mates', 'read_tanks'])
  // A refusal, or an answer cut short, is no answer: no blocks.
  expect(readAnswer(message([{ type: 'text', text: '{"text":' }], 'max_tokens'))).toBeUndefined()
  expect(readAnswer(message([], 'refusal'))).toBeUndefined()
})

test('the first message says where the chat started, what fish ID named, the earlier turns and what they showed, then the question', async () => {
  const h = await hb()
  const m = firstMessage('vi', 'Bể 60 lít nuôi được bao nhiêu con?', [{ question: 'Nuôi cá này thế nào?', text: 'Nuôi theo đàn.', blocks: [{ t: 'tool', tool: 'tank-mates', name: 'Nuôi chung', url: '/vi/cong-cu/nuoi-chung/?ca=ca-neon-xanh:6' }] }],
    { from: 'fish-id', about: 'paracheirodon-innesi', identified: { verdict: 'fish', results: [{ scientificName: 'Paracheirodon innesi', id: 'paracheirodon-innesi', confidence: 0.86 }] } }, h)
  const text = (m.content as Anthropic.TextBlockParam[])[0]!.text
  expect(text).toContain('answer in Vietnamese')
  expect(text).toContain('fish ID, which named their photo (fish): Paracheirodon innesi (id paracheirodon-innesi), 86%')
  expect(text).toContain('The chat is about Cá neon xanh (Paracheirodon innesi), id paracheirodon-innesi, page /vi/ca/ca-neon-xanh/.')
  expect(text).toContain('1. Reader: Nuôi cá này thế nào?\nYou: Nuôi theo đàn.\nShown: tool: /vi/cong-cu/nuoi-chung/?ca=ca-neon-xanh:6')
  expect(text.endsWith('The reader asks:\nBể 60 lít nuôi được bao nhiêu con?')).toBe(true)
})
