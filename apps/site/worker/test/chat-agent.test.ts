import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type Anthropic from '@anthropic-ai/sdk'
import type { PageDoc } from '@aq/schema/app-page'
import { LANGS } from '@aq/schema/langs'
import { expect, test, vi } from 'vitest'
import { answerQuestion, CHAT_LIMITS, firstMessage, openedTank, HANDBOOK, HANDOVER_MS, LAST_TRY, LAST_WORD, MAX_TOKENS, OPENING_SYSTEM, SYSTEM, unaccented, type ChatOptions, type Start } from '../chat/agent'
import { ANSWER_SCHEMA, fill, MAX_BLOCKS, MIN_TEXT, OFF_TOPIC, picksReader, readAnswer, textReader, type Answer, type Choice } from '../chat/answer'
import { handbookOf, type Handbook, type Item, type Source } from '../chat/handbook'
import { fold, search, searchTopics } from '../chat/search'
import { heldOf, topicsOf, type Topics } from '../chat/topics'
import { checkMates, drawnOf, type MatesCheck } from '../chat/mates'
import { chatTools, NOTES_CHARS, SECTION_CHARS, type Step, type Tank } from '../chat/tools'
import { tankCheck, type TankFish } from '../../src/scripts/tank-check'
import { factsOf } from '../chat/handbook'
import { contract } from './contract'

// The fixture build's app index and page copies (pnpm test builds the site first), as the Worker reads them from its assets.
const DIST = fileURLToPath(new URL('../../dist/', import.meta.url).href)
const json = (file: string) => (existsSync(DIST + file) ? JSON.parse(readFileSync(DIST + file, 'utf8')) : null)
const source: Source = { index: async lang => json(`app/${lang}.json`), shard: async (lang, kind, n) => json(`app/pages/${lang}/${kind}-${n}.json`), topics: async lang => json(`app/chat/${lang}.json`) }
const hb = async (): Promise<Handbook> => (await handbookOf(source, 'vi'))!
const { misfits } = contract('chat.openapi.json')
const block = { $ref: '#/components/schemas/Block' }
const pick = (p: Partial<Choice>): Choice => ({ t: 'species', ids: [], path: null, heading: null, tool: null, fish: [], tank: null, tankId: null, ...p })
const answer = (blocks: Choice[], o: Partial<Answer> = {}): Answer => ({ offTopic: false, text: 'x', covered: true, blocks, suggestions: [], clashes: [], ...o })
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

test('a page read twice in a turn, its outline then a section, is one read step; the next turn shows it again', async () => {
  const h = await hb()
  const read = (tools: ReturnType<typeof chatTools>, path: string, heading: string | null) => tools.find(t => t.name === 'read_page')!.step?.({ path, heading })
  const turn = chatTools({ handbook: h, tanks: async () => [] })
  const guide = '/vi/huong-dan/phan-loai-ca-dia/'
  expect(read(turn, guide, null)).toEqual({ kind: 'read', page: { kind: 'guide', title: 'Phân loại cá dĩa', url: guide } })
  expect(read(turn, guide, 'la-gi')).toBeUndefined()
  expect(read(turn, '/vi/ca/ca-neon-xanh/', null)).toMatchObject({ kind: 'read', page: { url: '/vi/ca/ca-neon-xanh/' } })
  expect(read(chatTools({ handbook: h, tanks: async () => [] }), guide, 'la-gi')).toMatchObject({ kind: 'read', page: { url: guide } })
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

test('a guide written from one video is marked so in the search and its outline, and no other page is', async () => {
  const h = await hb()
  const tools = chatTools({ handbook: h, tanks: async () => [] })
  const run = (name: string, input: Record<string, unknown>) => tools.find(t => t.name === name)!.run(input, { photosLeft: 0 }) as Promise<string>
  const found = JSON.parse(await run('search_handbook', { query: 'bón phân', kind: 'guide' })) as { path: string; oneVideo?: boolean }[]
  expect(found.find(f => f.path === '/vi/huong-dan/bon-phan-cho-cay-thuy-sinh/')?.oneVideo).toBe(true)
  const setup = JSON.parse(await run('search_handbook', { query: 'setup bể thủy sinh đầu tiên', kind: 'guide' })) as { path: string; oneVideo?: boolean }[]
  expect(setup.find(f => f.path === '/vi/huong-dan/setup-be-thuy-sinh-dau-tien/')).not.toHaveProperty('oneVideo')
  expect(JSON.parse(await run('read_page', { path: '/vi/huong-dan/bon-phan-cho-cay-thuy-sinh/', heading: null }))).toMatchObject({ oneVideo: true })
  expect(JSON.parse(await run('read_page', { path: '/vi/huong-dan/setup-be-thuy-sinh-dau-tien/', heading: null }))).not.toHaveProperty('oneVideo')
  expect(JSON.parse(await run('read_page', { path: '/vi/ca/ca-neon-xanh/', heading: null }))).not.toHaveProperty('oneVideo')
  expect(SYSTEM).toContain('oneVideo')
})

test('a glossary term named inside a longer search is found after every other match, unless its name is common', () => {
  const term = (name: string, aka: string[] = []) => ({ kind: 'glossary', name, aka, path: `/vi/thuat-ngu/${fold(name)}/` }) as Item
  const guide = (name: string, n: number) => ({ kind: 'guide', name, path: `/vi/huong-dan/g${n}/` }) as Item
  const tanin = term('Tanin', ['Tannins']), nitrit = term('Nitrit', ['Nitrite']), water = term('Nước')
  const yellow = guide('Nước vàng trong bể mới', 0)
  const items = [tanin, nitrit, water, yellow, ...Array.from({ length: 13 }, (_, i) => guide(`Nước máy ${i}`, i + 1))]
  expect(search(items, 'driftwood tannin', 'glossary')).toEqual([tanin])
  expect(search(items, 'nitrite ngộ độc', 'glossary')).toEqual([nitrit])
  // "Nước" is in 14 pages' names, so it says nothing about what's asked; and the guide that has most of the words comes first.
  expect(search(items, 'nước vàng tannin', null)).toEqual([yellow, tanin])
  expect(search(items, 'nước vàng', 'glossary')).toEqual([])
  // A Thai name has no spaces, so "current" in an electrical query isn't the start of the term for water current.
  expect(search([...items, term('กระแสน้ำ')], 'ค่ากระแสไฟฟ้า', 'glossary')).toEqual([])
})

test('the prompt answers about the fish: the card wins, no talk of pages disagreeing, the method read and given, no care question handed on, no pointing at earlier answers', () => {
  expect(SYSTEM).toContain('is the answer over any passage')
  expect(SYSTEM).toContain('Never say that the pages or their sources disagree')
  expect(SYSTEM).toContain('Put the two places in clashes')
  expect(SYSTEM).toContain('read the guide that gives it as well as the fish\'s page')
  expect(SYSTEM).toContain('Search for that guide (kind guide) in your first call')
  expect(SYSTEM).toContain('a longer search finds nothing')
  expect(SYSTEM).toContain('as a fact about the fish, without "the handbook says"')
  expect(SYSTEM).toContain('empty of numbers isn\'t')
  expect(SYSTEM).toContain('the share of tap water is the target GH divided by the tap\'s')
  expect(SYSTEM).toContain('A care question is yours to answer')
  expect(SYSTEM).toContain('names the next step the keeper takes')
  expect(SYSTEM).toContain('A vet may be named beside that step, never in place of it')
  expect(SYSTEM).toContain('say plainly you don\'t have it, and say what to ask for or look for')
  expect(SYSTEM).toContain('Never point at your earlier answers')
  expect(ANSWER_SCHEMA.required).toContain('clashes')
})

test('a problem\'s steps each carry a figure, with no cap of five, and the answer asks last for the readings that would decide the cause', () => {
  expect(SYSTEM).not.toContain('at most five')
  expect(SYSTEM).toContain('as many as the problem needs')
  expect(SYSTEM).toContain('each one action for their tank with its figure')
  expect(SYSTEM).toContain('ask for the one to three readings that decide it')
  expect(SYSTEM).toContain('Ask only for what would change your answer, never for what they told you')
  // The forced last call writes most answers (the board, 13 Nov 2026: 184 of 225), so it says the same.
  expect(LAST_WORD).toContain('each with its figure')
  expect(LAST_WORD).toContain('the readings that would decide the cause')
  expect(ANSWER_SCHEMA.properties.text.description).toContain('each with its figure')
  expect(ANSWER_SCHEMA.properties.text.description).toContain('and last the readings that would decide the cause when the reader hasn\'t given them')
  // A safe reading is none on the kit: "under 0.25 mg/l" mixes total ammonia with the free ammonia that harms fish (the review, 13 Nov).
  expect(SYSTEM).toContain('amoniac và nitrit về 0 trên bộ test')
  expect(SYSTEM).not.toContain('0,25 mg/l')
})

test('read_tanks reads the reader\'s tanks with their ids, says when there are none, and is an error when they can\'t be read', async () => {
  const h = await hb()
  const tank: Tank = { id: 't1', name: 'Bể 60', dims: { l: 60, w: 30, h: 36 }, species: [{ id: 'paracheirodon-innesi', count: 10 }], unlisted: [{ name: 'Cá lạ', kind: 'fish', count: 2 }, { name: 'Rong lạ', kind: 'plant' }] }
  const tool = (tanks: () => Promise<unknown>) => chatTools({ handbook: h, tanks: tanks as never }).find(t => t.name === 'read_tanks')!
  // Its fish as the handbook names them, one without a page by the reader's name; a plant isn't a fish, it's a plant.
  expect(JSON.parse(await tool(async () => [tank]).run({}, { photosLeft: 0 }) as string)).toEqual([
    { id: 't1', name: 'Bể 60', dims: { l: 60, w: 30, h: 36 }, fish: [{ name: 'Cá neon xanh', id: 'paracheirodon-innesi', count: 10 }, { name: 'Cá lạ', count: 2 }], plants: ['Rong lạ'] },
  ])
  // What else the reader saved: plants (a page's by its name, one without a page by theirs), substrate, how long ago it
  // was saved, each light's schedule in a line, what its plugs power, and the notes as their own words, cut.
  const full: Tank = {
    ...tank, plants: ['taxiphyllum-barbieri'], substrate: 'soil', days: 12, notes: `Thay 30% nước mỗi tuần. ${'x'.repeat(NOTES_CHARS)}`,
    lights: [
      { name: 'WRGB II', schedule: { on: '13:00', off: '21:30', ramp: 30, levels: [80, 70, 60, 50] } }, { name: 'Đèn phụ', manual: [40] },
      // A schedule that ends at midnight, then set by hand since.
      { name: 'Đèn tối', schedule: { on: '16:00', off: '00:00', ramp: 0, levels: [60] }, manual: [100] },
    ],
    power: ['co2', 'heater'],
  }
  const read = JSON.parse(await tool(async () => [full]).run({}, { photosLeft: 0 }) as string)[0]
  expect(read).toMatchObject({
    plants: [h.byId('taxiphyllum-barbieri')?.name ?? 'taxiphyllum-barbieri', 'Rong lạ'], substrate: 'soil', savedDaysAgo: 12,
    lights: [
      'WRGB II: 13:00–21:30, 8.5 h lit, ramp 30 min, levels 80/70/60/50%', 'Đèn phụ: no schedule running, last set by hand to 40%',
      'Đèn tối: 16:00–00:00, 8 h lit, ramp 0 min, levels 60%; since then set by hand to 100%',
    ],
    plugsPower: ['co2', 'heater'],
  })
  expect(read.readerNotes.startsWith('Thay 30% nước mỗi tuần.')).toBe(true)
  expect(read.readerNotes.length).toBe(NOTES_CHARS)
  expect(await tool(async () => []).run({}, { photosLeft: 0 })).toBe('The reader has no saved tanks.')
  await expect(tool(async () => null).run({}, { photosLeft: 0 })).rejects.toThrow(/can't be read/)
  expect(tool(async () => []).step?.({})).toEqual({ kind: 'tanks' })
})

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
  expect(blocks[4]).toEqual({ t: 'tool', tool: 'tank-mates', name: h.byPath('/vi/cong-cu/nuoi-chung/')!.short ?? h.byPath('/vi/cong-cu/nuoi-chung/')!.name, url: '/vi/cong-cu/nuoi-chung/?ca=ca-neon-xanh:10,ca-dia:2&l=60&w=30&h=36', check: drawnOf(checked) })
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
    ...['anubias-barteri-nana', 'paracheirodon-innesi', 'paracheirodon-axelrodi', 'pterophyllum-scalare', 'danio-margaritatus'].map(id => pick({ t: 'species', ids: [id] })),
  ]), h)
  expect(tools.dropped).toEqual(['tool: tank-mates with none of ["no-such-fish"]', 'tool: no null in vi', '2 blocks past 5'])
  expect(tools.blocks.map(b => b.t)).toEqual(['species', 'species', 'species'])
  expect(tools.blocks).toHaveLength(MAX_BLOCKS - 2)
})

test('check_tank_mates checks fish as the tank-mates tool does, in the reader\'s language; a tank-mates block goes out only with the check of its fish, counts and tank, and carries it', async () => {
  const h = await hb()
  const checks: MatesCheck[] = []
  const tool = chatTools({ handbook: h, tanks: async () => [], checks }).find(t => t.name === 'check_tank_mates')!
  // The reader sees that the fish were checked together ("Đã kiểm tra nuôi chung").
  expect(tool.step?.({})).toEqual({ kind: 'mates' })
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
  // An id that isn't a fish (a plant, a typo) is refused by name, not left out: the rest may be one fish, unchecked.
  await expect(tool.run({ fish: [{ id: 'no-such-fish', count: 2 }], tank: null }, { photosLeft: 0 })).rejects.toThrow('Not fish: no-such-fish.')
  await expect(tool.run({ fish: [{ id: 'paracheirodon-innesi', count: 10 }, { id: 'anubias-barteri-nana', count: 1 }], tank: null }, { photosLeft: 0 })).rejects.toThrow('Not fish: anubias-barteri-nana.')
  await expect(tool.run({ fish: [], tank: null }, { photosLeft: 0 })).rejects.toThrow('None of these ids is a fish')
  expect(checks).toEqual([out])
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
  expect(shown.blocks).toMatchObject([{ t: 'tool', tool: 'tank-mates', check: drawnOf(out) }])
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
  expect(both.blocks).toMatchObject([{ check: drawnOf(sized) }])
  expect(both.blocks[0]).toHaveProperty('check.stocking')
  for (const b of both.blocks) expect(misfits(b, block), JSON.stringify(b)).toEqual([])
  const one = await fill(answer([mates([{ id: 'paracheirodon-innesi', count: 8 }])]), h)
  expect(one.dropped).toEqual([])
  expect(one.blocks[0]).not.toHaveProperty('check')
  // A block naming something that isn't a fish isn't shown: its one fish left would go out unchecked.
  const plant = await fill(answer([mates([{ id: 'paracheirodon-innesi', count: 8 }, { id: 'anubias-barteri-nana', count: 1 }])]), h)
  expect(plant).toEqual({ blocks: [], dropped: ['tool: tank-mates with ["anubias-barteri-nana"], not fish'] })
})

test('check_tank_mates in the reader\'s tank checks it as the tank page does, with the fish added; its block names the tank, and links every kind up to six', async () => {
  const h = await hb()
  const dims = { l: 60, w: 30, h: 36 }
  const tank: Tank = {
    id: 'tank-1', name: 'Bể phòng khách', dims,
    species: [{ id: 'paracheirodon-innesi', count: 6 }, { id: 'pigeon-blood-discus', count: 2 }],
    unlisted: [{ name: 'Cá lạ', kind: 'fish', count: 3 }, { name: 'Rong lạ', kind: 'plant' }, { name: 'Neon đỏ', kind: 'fish', sci: 'Paracheirodon cf. axelrodi', count: 4 }],
  }
  const other: Tank = { ...tank, id: 'tank-2', name: 'Bể 2', dims: { l: 100, w: 40, h: 40 } }
  const checks: MatesCheck[] = []
  let tanks: Tank[] | null = [tank, other]
  const tool = chatTools({ handbook: h, tanks: async () => tanks, checks }).find(t => t.name === 'check_tank_mates')!
  const ask = async (input: Record<string, unknown>) => JSON.parse(await tool.run({ tank: null, ...input }, { photosLeft: 0 }) as string) as MatesCheck
  // A size given with the tank isn't the tank's: its own is.
  const out = await ask({ fish: [{ id: 'paracheirodon-innesi', count: 4 }], tank: { l: 1, w: 1, h: 1 }, tankId: 'tank-1' })
  expect(out.mine).toEqual({
    id: 'tank-1', name: 'Bể phòng khách', dims,
    fish: [{ name: 'Cá neon xanh', count: 6 }, { name: 'Cá đĩa Pigeon Blood', count: 2 }, { name: 'Cá lạ', count: 3 }, { name: 'Cá neon vua', count: 4 }],
    added: [{ name: 'Cá neon xanh', count: 4 }],
  })
  // The rows the tank page makes (TankCheckView.swift): a breed under its species, with its own name; an entry without
  // a page by its scientific name, else not checked; no plants; then the fish added, as if put on the tank.
  const facts = (id: string) => factsOf(h.byId(id)!)
  const rows = [
    { name: 'Cá neon xanh', ...facts('paracheirodon-innesi'), count: 6, key: 'paracheirodon-innesi' },
    { name: 'Cá đĩa Pigeon Blood', ...facts('symphysodon-aequifasciatus'), count: 2, key: 'symphysodon-aequifasciatus', species: 'Cá đĩa' },
    { name: 'Cá neon vua', ...facts('paracheirodon-axelrodi'), count: 4, key: 'paracheirodon-axelrodi' },
    { name: 'Cá neon xanh', ...facts('paracheirodon-innesi'), count: 4, key: 'paracheirodon-innesi' },
  ] as TankFish[]
  const ct = (s: string, v?: Record<string, string | number>) => (v ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m)) : s)
  const fmt = (n: number, d = 1) => new Intl.NumberFormat('vi', { maximumFractionDigits: d }).format(n)
  expect(drawnOf(out)).toEqual(tankCheck(rows, { dims }, ct, fmt, ['Cá lạ']))
  expect(out.stocking).toBeDefined()
  expect(out.unchecked).toContain('Cá lạ')
  expect(out.unchecked).not.toContain('Rong lạ')
  // Its block: the check, the tank, and the tool's link with every kind, counts summed (a breed as its species).
  const mates = (fish: { id: string; count: number }[], tankId: string | null) => pick({ t: 'tool', tool: 'tank-mates', fish, tankId })
  const neon4 = [{ id: 'paracheirodon-innesi', count: 4 }]
  const { blocks, dropped } = await fill(answer([mates(neon4, 'tank-1')]), h, checks)
  expect(dropped).toEqual([])
  expect(blocks).toEqual([{ t: 'tool', tool: 'tank-mates', name: expect.any(String), url: '/vi/cong-cu/nuoi-chung/?ca=ca-neon-xanh:10,ca-dia:2,ca-neon-vua:4&l=60&w=30&h=36', check: drawnOf(out), tank: out.mine }])
  for (const b of blocks) expect(misfits(b, block), JSON.stringify(b)).toEqual([])
  // Another tank, or other fish added, wasn't checked; the same fish with no tank is a check of their own.
  expect((await fill(answer([mates(neon4, 'tank-2')]), h, checks)).dropped).toEqual(['tool: tank-mates in tank tank-2 adding ca-neon-xanh:4 not checked'])
  expect((await fill(answer([mates([{ id: 'paracheirodon-innesi', count: 5 }], 'tank-1')]), h, checks)).blocks).toEqual([])
  const loose = await fill(answer([mates([...neon4, { id: 'symphysodon-aequifasciatus', count: 2 }], null)]), h, [await ask({ fish: [...neon4, { id: 'symphysodon-aequifasciatus', count: 2 }], tankId: 'tank-1' })])
  expect(loose.dropped).toEqual(['tool: tank-mates ca-dia:2,ca-neon-xanh:4 not checked'])
  // Two tanks with the same fish added: each block its own tank's check.
  const there = await ask({ fish: neon4, tankId: 'tank-2' })
  expect((await fill(answer([mates(neon4, 'tank-2')]), h, checks)).blocks).toMatchObject([{ tank: { id: 'tank-2', dims: other.dims }, check: drawnOf(there) }])
  // The tank as it is: nothing added.
  const asIs = await ask({ fish: [], tankId: 'tank-1' })
  expect(asIs.mine!.added).toEqual([])
  expect((await fill(answer([mates([], 'tank-1')]), h, checks)).blocks).toMatchObject([{ url: '/vi/cong-cu/nuoi-chung/?ca=ca-neon-xanh:6,ca-dia:2,ca-neon-vua:4&l=60&w=30&h=36', tank: { added: [] } }])
  // Past six kinds the tool's page would check other fish: no link, the block is the whole answer.
  const full: Tank = { id: 'tank-3', name: 'Bể lớn', dims: { l: 120, w: 50, h: 50 }, unlisted: [], species: ['paracheirodon-innesi', 'paracheirodon-axelrodi', 'pterophyllum-scalare', 'mikrogeophagus-ramirezi', 'danio-margaritatus', 'boraras-brigittae'].map(id => ({ id })) }
  tanks = [full]
  const seven = await ask({ fish: [{ id: 'apistogramma-cacatuoides', count: 2 }], tankId: 'tank-3' })
  expect(seven.kinds).toHaveLength(7)
  const big = await fill(answer([mates([{ id: 'apistogramma-cacatuoides', count: 2 }], 'tank-3')]), h, checks)
  expect(big.blocks).toEqual([{ t: 'tool', tool: 'tank-mates', name: expect.any(String), check: drawnOf(seven), tank: seven.mine }])
  for (const b of big.blocks) expect(misfits(b, block), JSON.stringify(b)).toEqual([])
  // Counts not saved are the schools'.
  expect(seven.kinds![0]).toEqual({ path: '/vi/ca/ca-neon-xanh/', count: 6 })
  // Litres only: how full it is from them, and the shortest tank they all need.
  tanks = [{ ...full, dims: undefined, litres: 300 }]
  const round = await ask({ fish: [], tankId: 'tank-3' })
  expect(round.stocking).toBeDefined()
  expect(round.minTank).toBeDefined()
  // A species and its breed added: counted together, so a check with the breed isn't taken for one without it.
  tanks = [tank]
  const discus = [{ id: 'symphysodon-aequifasciatus', count: 2 }]
  const withBreed = [...discus, { id: 'pigeon-blood-discus', count: 3 }]
  const plain = await ask({ fish: discus, tankId: 'tank-1' })
  const both = await ask({ fish: withBreed, tankId: 'tank-1' })
  expect(both.fish).toEqual([expect.objectContaining({ path: '/vi/ca/ca-dia/', count: 5 })])
  expect((await fill(answer([mates(withBreed, 'tank-1')]), h, [plain, both])).blocks).toMatchObject([{ check: drawnOf(both) }])
  expect((await fill(answer([mates(discus, 'tank-1')]), h, [plain, both])).blocks).toMatchObject([{ check: drawnOf(plain) }])
  // No link when the tool's page would check something else: a fish it doesn't list (a breed with no species), more
  // than 200 of one, a tank of litres only; nor with nothing it lists. Fish without a page are left out by both.
  const linkOf = async (t: Tank, fish: { id: string; count: number }[] = []) => {
    tanks = [t]
    const c = await ask({ fish, tankId: t.id })
    const b = await fill(answer([mates(fish, t.id)]), h, [c])
    for (const x of b.blocks) expect(misfits(x, block), JSON.stringify(x)).toEqual([])
    return (b.blocks[0] as { url?: string } | undefined)?.url
  }
  const base = { id: 'tank-4', name: 'Bể 4', dims, unlisted: [] }
  expect(await linkOf({ ...base, species: [{ id: 'oranda-goldfish', count: 2 }, { id: 'paracheirodon-innesi', count: 6 }] })).toBeUndefined()
  expect(await linkOf({ ...base, species: [{ id: 'paracheirodon-innesi', count: 300 }] }, [{ id: 'paracheirodon-axelrodi', count: 6 }])).toBeUndefined()
  expect(await linkOf({ ...base, dims: undefined, litres: 54, species: [{ id: 'paracheirodon-innesi', count: 6 }] }, [{ id: 'paracheirodon-axelrodi', count: 6 }])).toBeUndefined()
  expect(await linkOf({ ...base, species: [], unlisted: [{ name: 'Cá lạ', kind: 'fish', count: 3 }] })).toBeUndefined()
  expect(await linkOf({ ...base, species: [{ id: 'paracheirodon-innesi', count: 6 }], unlisted: [{ name: 'Cá lạ', kind: 'fish' }] })).toBe('/vi/cong-cu/nuoi-chung/?ca=ca-neon-xanh:6&l=60&w=30&h=36')
  // Without a tank too: a breed the tool's page doesn't list, no link; the check still shown.
  const odd = [{ id: 'oranda-goldfish', count: 2 }, { id: 'paracheirodon-innesi', count: 6 }]
  const oddCheck = checkMates(odd, null, h)
  expect((await fill(answer([mates(odd, null)]), h, [oddCheck])).blocks).toEqual([{ t: 'tool', tool: 'tank-mates', name: expect.any(String), check: drawnOf(oddCheck) }])
  // A tank that isn't the reader's, one that can't be read, or an empty one with nothing added: an error Claude reads.
  tanks = [tank]
  await expect(tool.run({ fish: neon4, tank: null, tankId: 'tank-9' }, { photosLeft: 0 })).rejects.toThrow('No tank tank-9')
  tanks = [{ id: 'empty', name: 'Bể trống', species: [], unlisted: [] }]
  await expect(tool.run({ fish: [], tank: null, tankId: 'empty' }, { photosLeft: 0 })).rejects.toThrow('That tank has no fish')
  tanks = null
  await expect(tool.run({ fish: neon4, tank: null, tankId: 'tank-1' }, { photosLeft: 0 })).rejects.toThrow(/can't be read/)
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

test('a page the site leaves out (held by the reader-fit gate, or removed) is no page to the chat, of any kind, in any language', async () => {
  // The site's build leaves a held or removed page out of its app index (apps/site/test/held.test.ts), and the chat's
  // handbook is that index: a page not in it is never found, read, carded or shown, even with its copy still in a shard.
  const all = (await source.index('vi'))!
  // A material page is no page to the chat even when listed (the test after this one).
  const kinds = [...new Set(all.items.map(i => i.kind))].filter(k => k !== 'tool' && (k as string) !== 'material').sort()
  expect(kinds).toEqual(['equipment', 'fish', 'glossary', 'guide', 'plant', 'video'])
  for (const lang of LANGS) {
    for (const kind of kinds) {
      const gone = all.items.find(i => i.kind === kind)!
      const left = { ...all, items: all.items.filter(i => i !== gone) }
      // The same pages under each language: the handbook's code is the same for all of them.
      const h = (await handbookOf({ ...source, index: async () => left, shard: (_l, k, n) => source.shard('vi', k, n) }, lang))!
      const at = `${lang} ${kind} ${gone.path}`
      expect(Object.values((await source.shard('vi', kind as PageDoc['kind'], 0))?.pages ?? {}).length, at).toBeGreaterThan(0)
      expect(h.byPath(gone.path), at).toBeUndefined()
      if (gone.id) expect(h.byId(gone.id), at).toBeUndefined()
      expect(await h.page(gone.path), at).toBeUndefined()
      const out = (await run('search_handbook', { query: gone.name, kind: null }, h)).out as string
      expect(out.startsWith('No page') ? [] : JSON.parse(out).map((x: { path: string }) => x.path), at).not.toContain(gone.path)
      await expect(run('read_page', { path: gone.path, heading: null }, h), at).rejects.toThrow(/No page at/)
      const picks = [pick({ t: 'section', path: gone.path }), ...(gone.id ? [pick({ t: 'species', ids: [gone.id] })] : [])]
      const { blocks } = await fill(answer(picks), h)
      expect(blocks, at).toEqual([])
    }
  }
})

test('a material page, listed in the app index for the app to open on the web, is no page to the chat: it has no copy to read', async () => {
  // The app index lists Vietnamese material pages (kind material) with no shards: the chat could only find one and name
  // it, never read it, and its id is no fish's or plant's.
  const all = (await source.index('vi'))!
  const m = all.items.find(i => (i.kind as string) === 'material')!
  expect(m, 'the fixture build lists a material page').toBeTruthy()
  const h = await hb()
  expect(h.items.map(i => i.path)).not.toContain(m.path)
  expect(h.byPath(m.path)).toBeUndefined()
  if (m.id) expect(h.byId(m.id)).toBeUndefined()
  const out = (await run('search_handbook', { query: m.name, kind: null }, h)).out as string
  expect(out.startsWith('No page') ? [] : JSON.parse(out).map((x: { path: string }) => x.path)).not.toContain(m.path)
})

test('a guide held out of the chat (a video guide being checked again) is never found, read or shown; the others are', async () => {
  const algae = '/vi/huong-dan/cach-han-che-reu-hai-trong-be-thuy-sinh/'
  // The build lists a guide marked quality.chat: false, by its path in the language, and leaves out its topics.
  const guides = [{ t: { slug: 'cach-han-che-reu-hai-trong-be-thuy-sinh', quality: { chat: false as const } } }, { t: { slug: 'thay-nuoc', quality: {} } }]
  expect(heldOf(guides, p => p)).toEqual([algae])
  expect(heldOf(guides, p => p.replace('/vi/huong-dan/', '/id/panduan/'))).toEqual(['/id/panduan/cach-han-che-reu-hai-trong-be-thuy-sinh/'])
  const docs = (readdirSync(`${DIST}app/pages/vi`).filter(f => f.startsWith('guide-')).flatMap(f => Object.values(json(`app/pages/vi/${f}`).pages))) as PageDoc[]
  const topics = topicsOf(docs, [algae])
  expect(topics.held).toEqual([algae])
  expect(topics.pages[algae]).toBeUndefined()
  expect(topicsOf(docs)).not.toHaveProperty('held')
  const h = (await handbookOf({ ...source, topics: async () => topics }, 'vi'))!
  // Not in the chat's handbook at all; the other video guide is.
  expect(h.byPath(algae)).toBeUndefined()
  expect(h.items.some(i => i.path === algae)).toBe(false)
  expect(h.byPath('/vi/huong-dan/bon-phan-cho-cay-thuy-sinh/')).toBeDefined()
  // Not by its name, nor by a heading only it has (CO2), nor read (no step names it), nor shown as a section.
  const found = async (query: string) => {
    const out = (await run('search_handbook', { query, kind: null }, h)).out as string
    return out.startsWith('No page') ? [] : JSON.parse(out).map((x: { path: string }) => x.path)
  }
  expect(await found('hạn chế rêu hại')).not.toContain(algae)
  expect((await run('search_handbook', { query: 'CO2', kind: null }, h)).out).toMatch(/^No page/)
  await expect(run('read_page', { path: algae, heading: null }, h)).rejects.toThrow(/No page at/)
  expect(chatTools({ handbook: h, tanks: async () => [] }).find(t => t.name === 'read_page')!.step?.({ path: algae, heading: null })).toBeUndefined()
  const { blocks, dropped } = await fill(answer([pick({ t: 'section', path: algae, heading: 'anh-sang-va-co2' })]), h)
  expect(blocks).toEqual([])
  expect(dropped).toEqual([`section: no page "${algae}"`])
  // Without the hold, the same search finds it.
  expect(JSON.parse((await run('search_handbook', { query: 'hạn chế rêu hại', kind: null })).out as string).map((x: { path: string }) => x.path)).toContain(algae)
  // With no topics file to say which, every video guide is held, and no other page.
  const blind = (await handbookOf({ ...source, topics: async () => null }, 'vi'))!
  expect(blind.byPath(algae)).toBeUndefined()
  expect(blind.byPath('/vi/huong-dan/bon-phan-cho-cay-thuy-sinh/')).toBeUndefined()
  expect(blind.byPath('/vi/huong-dan/thay-nuoc-dung-cach/')).toBeDefined()
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

test('a card or section shown earlier in the conversation, or twice in one answer, isn\'t shown again; a comparison or tool may be', async () => {
  const h = await hb()
  const neon = pick({ t: 'species', ids: ['paracheirodon-innesi'] })
  const section = pick({ t: 'section', path: '/vi/huong-dan/phan-loai-ca-dia/', heading: 'la-gi' })
  const compare = pick({ t: 'compare', ids: ['paracheirodon-innesi', 'paracheirodon-axelrodi'] })
  const volume = pick({ t: 'tool', tool: 'tank-volume', tank: { l: 60, w: 30, h: 36 } })
  const before = (await fill(answer([neon, section, compare, volume]), h)).blocks
  const again = await fill(answer([neon, section, compare, volume, pick({ t: 'species', ids: ['paracheirodon-axelrodi'] })]), h, [], before)
  expect(again.blocks.map(b => b.t)).toEqual(['compare', 'tool', 'species'])
  expect(again.dropped).toEqual(['species: paracheirodon-innesi shown before', 'section: /vi/huong-dan/phan-loai-ca-dia/#la-gi shown before'])
  // The page's opening is another section than its heading's; one answer's twin card goes once.
  const opening = await fill(answer([pick({ t: 'section', path: '/vi/huong-dan/phan-loai-ca-dia/', heading: null }), neon, neon]), h)
  expect(opening.blocks.map(b => b.t)).toEqual(['section', 'species'])
  expect(opening.dropped).toEqual(['species: paracheirodon-innesi shown before'])
  // The agent hands fill the earlier turns' blocks.
  const out = await answerQuestion({
    send: async () => message([{ type: 'text', text: JSON.stringify(answer([neon, compare], { text: 'Cá neon xanh sống theo đàn.' })) }]),
    model: 'claude-opus-5-5', lang: 'vi', question: 'Còn gì nữa?', earlier: [{ question: 'Nuôi cá này thế nào?', text: 'x', blocks: before }], start: {}, handbook: h, tanks: async () => [],
  })
  expect(out.blocks.map(b => b.t)).toEqual(['compare'])
})

test("the card of the fish whose page the chat was opened from counts as shown; from fish ID or search it doesn't, and another fish's card goes out", async () => {
  const h = await hb()
  const turn = (start: Start) => answerQuestion({
    send: async () => message([{ type: 'text', text: JSON.stringify(answer([pick({ t: 'species', ids: ['paracheirodon-innesi'] }), pick({ t: 'species', ids: ['paracheirodon-axelrodi'] })], { text: 'Cá neon xanh dễ nuôi.' })) }]),
    model: 'claude-opus-5-5', lang: 'vi', question: 'Có dễ nuôi không?', earlier: [], start, handbook: h, tanks: async () => [],
  })
  const onPage = await turn({ from: 'species', about: 'paracheirodon-innesi' })
  expect(onPage.blocks.map(b => b.t === 'species' && b.page.id)).toEqual(['paracheirodon-axelrodi'])
  expect(onPage.dropped).toEqual(['species: paracheirodon-innesi shown before'])
  expect((await turn({ from: 'fish-id', about: 'paracheirodon-innesi' })).blocks.map(b => b.t === 'species' && b.page.id)).toEqual(['paracheirodon-innesi', 'paracheirodon-axelrodi'])
  expect((await turn({ from: 'search', about: 'paracheirodon-innesi' })).blocks.map(b => b.t === 'species' && b.page.id)).toEqual(['paracheirodon-innesi', 'paracheirodon-axelrodi'])
  const told = (start: Start) => (firstMessage('vi', 'Có dễ nuôi không?', [], start, h).content as Anthropic.TextBlockParam[])[0]!.text
  expect(told({ from: 'species', about: 'paracheirodon-innesi' })).toContain('They opened it from that page, so they have seen its card')
  expect(told({ from: 'fish-id', about: 'paracheirodon-innesi' })).not.toContain('They opened it from that page')
  expect(told({ about: 'paracheirodon-innesi' })).not.toContain('They opened it from that page')
})

test('the chat\'s forced last call is told to answer from what it read and its own knowledge, as the instructions say', async () => {
  const bodies: Anthropic.MessageCreateParamsNonStreaming[] = []
  const final = { text: 'Cá neon xanh sống theo đàn.', covered: true, blocks: [], suggestions: [] }
  const out = await answerQuestion({
    send: async body => { bodies.push(body); return message([{ type: 'text', text: JSON.stringify(final) }]) },
    model: 'claude-opus-5-5', lang: 'vi', question: 'Nuôi cá neon thế nào?', earlier: [], start: {}, handbook: await hb(), tanks: async () => [], limits: { calls: 1 },
  })
  expect(out.stopped).toBe('calls')
  expect(bodies[0]!.tool_choice).toEqual({ type: 'none' })
  expect(JSON.stringify(bodies[0]!.messages.at(-1)!.content)).toContain(JSON.stringify(LAST_WORD).slice(1, -1))
  // Most hard questions end on this call: it must not take back the general knowledge the owner allowed.
  expect(LAST_WORD).toContain('your own knowledge of fishkeeping')
  // Written at low effort when time is short, it slipped Vietnamese's "cẩm nang" into Malay answers without this.
  expect(LAST_WORD).toContain('only in the reader\'s language')
})

test('the call that writes the answer has room for a whole forum post\'s: its thinking and an answer of every part', async () => {
  // A many-part post (setup-01-post in the eval): the forced call thought for 13 s, then ran out at 4,096 tokens with
  // its answer half written, 2 runs in 3. Here an answer that needs 7,000 tokens with its thinking.
  const final = { text: 'Bể 60 lít của bạn: 1. Chạy lọc 4 tuần trước khi thả cá. 2. Thay 30% nước mỗi tuần.', covered: true, blocks: [], suggestions: [] }
  const sent: number[] = []
  const out = await answerQuestion({
    send: async body => {
      sent.push(body.max_tokens)
      return body.max_tokens < 7_000 ? message([{ type: 'text', text: JSON.stringify(final).slice(0, 40) }], 'max_tokens') : message([{ type: 'text', text: JSON.stringify(final) }])
    },
    model: 'claude-opus-5-5', lang: 'vi', question: 'Mình mới set bể 60 lít, hỏi nhiều thứ...', earlier: [], start: {}, handbook: await hb(), tanks: async () => [], limits: { calls: 1 },
  })
  expect(sent).toEqual([MAX_TOKENS])
  expect(out.answer?.text).toBe(final.text)
})

test('a slow turn answers sooner, and quickly: the chat keeps the answer\'s time from its own pace', async () => {
  // Calls of 4 s: after one, another leaves 27 - 4 - 4 = 19 s, over 4 × 4 = 16 s, so the second reads; after two, 15 s,
  // under 6.5 × 4 = 26 s, so the third answers, at low: 19 s is under 7 × 4 = 28 s. Calls of 3.1 s: after two, another
  // leaves 17.7 s, under 6.5 × 3.1 = 20.15 s (over 5.5 × 3.1, which read on), and 20.8 s is under 7 × 3.1 = 21.7 s.
  for (const ms of [4_000, 3_100]) {
    const bodies: Anthropic.MessageCreateParamsNonStreaming[] = []
    let now = 0
    const final = { text: 'Cá neon xanh sống theo đàn.', covered: true, blocks: [], suggestions: [] }
    const out = await answerQuestion({
      send: async body => {
        bodies.push(body)
        now += ms
        return bodies.length < 3
          ? message([{ type: 'tool_use', id: `t${bodies.length}`, name: 'search_handbook', input: { query: 'neon' } }], 'tool_use')
          : message([{ type: 'text', text: JSON.stringify(final) }])
      },
      model: 'claude-opus-5-5', lang: 'vi', question: 'Nuôi cá neon thế nào?', earlier: [], start: {}, handbook: await hb(), tanks: async () => [], clock: () => now,
    })
    expect(out.stopped, `${ms} ms`).toBe('time')
    expect(bodies.map(b => [b.tool_choice!.type, b.output_config!.effort]), `${ms} ms`).toEqual([['auto', 'medium'], ['auto', 'medium'], ['none', 'low']])
  }
})

test('the run ends within fish ID\'s time, so it outlives a dropped connection (the platform keeps it 30 s), and an answer with no text is none', () => {
  expect(CHAT_LIMITS.ms).toBeLessThanOrEqual(27_000)
  expect(CHAT_LIMITS.ms + CHAT_LIMITS.writingGraceMs!).toBeLessThanOrEqual(30_000)
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
    model: 'claude-opus-5-5', lang: 'vi', question: 'Nuôi cá này thế nào?', earlier: [], start: { from: 'fish-id', about: 'paracheirodon-innesi' },
    handbook: h, tanks: async () => [], onStep: s => steps.push(s),
  })
  expect(steps).toEqual([{ kind: 'read', page: { kind: 'fish', title: 'Cá neon xanh', url: '/vi/ca/ca-neon-xanh/' } }])
  expect(out.answer?.text).toBe('Cá neon xanh sống theo đàn.')
  expect(out.blocks.map(b => b.t)).toEqual(['species'])
  expect(out.dropped).toEqual(['species: no fish or plant "nope"'])
  expect(bodies[0]!.system).toBe(SYSTEM)
  // The handbook by the site's own word for it, the reader's language's only: the prompt shared by every language has none.
  for (const word of Object.values(HANDBOOK)) expect(SYSTEM).not.toContain(word)
  for (const lang of ['vi', 'id', 'th', 'ms'] as const) {
    const said = JSON.stringify(firstMessage(lang, 'x', [], {}, h).content)
    for (const word of Object.values(HANDBOOK)) expect(said.includes(word), `${lang}: ${word}`).toBe(HANDBOOK[lang].includes(word))
  }
  expect(bodies[0]!.output_config).toEqual({ effort: 'medium', format: { type: 'json_schema', schema: ANSWER_SCHEMA } })
  expect(bodies[0]!.tools!.map(t => (t as Anthropic.Tool).name)).toEqual(['search_handbook', 'read_page', 'check_tank_mates', 'read_tanks'])
  // A refusal, or an answer cut short, is no answer: no blocks.
  expect(readAnswer(message([{ type: 'text', text: '{"text":' }], 'max_tokens'))).toBeUndefined()
  expect(readAnswer(message([], 'refusal'))).toBeUndefined()
})

test('a chat opened from a saved tank says so first, with the tank as every handed tank is, without its name; a tank the reader doesn\'t hold says nothing', async () => {
  const h = await hb()
  const tank: Tank = { id: 't1', name: 'Bể phòng khách', dims: { l: 60, w: 30, h: 36 }, species: [{ id: 'paracheirodon-innesi', count: 10 }], unlisted: [] }
  const tanks = async () => [tank]
  const line = await openedTank({ from: 'tank', tank: 't1' }, tanks, h, false)
  expect(line).toContain('They opened the chat from one of their saved tanks, id t1: what they ask is about that tank unless they say otherwise.')
  expect(line).toContain('"count":10')
  expect(line).not.toContain('Bể phòng khách')
  // With every tank handed over already, the line alone.
  expect(await openedTank({ from: 'tank', tank: 't1' }, tanks, h, true)).toBe('They opened the chat from one of their saved tanks, id t1: what they ask is about that tank unless they say otherwise.')
  // Not synced yet, deleted, or the tanks unreadable: answered as if no tank was named.
  expect(await openedTank({ from: 'tank', tank: 'gone' }, tanks, h, false)).toBeUndefined()
  expect(await openedTank({ from: 'tank', tank: 't1' }, async () => null, h, false)).toBeUndefined()
  expect(await openedTank({ from: 'species', about: 'paracheirodon-innesi' }, tanks, h, false)).toBeUndefined()
  // The run's first call carries it after the question.
  const bodies: Anthropic.MessageCreateParamsNonStreaming[] = []
  await answerQuestion({
    send: async b => { bodies.push(b); return message([{ type: 'text', text: JSON.stringify(answer([])) }]) },
    model: 'claude-opus-5-5', lang: 'vi', question: 'Bể này ổn không?', earlier: [], start: { from: 'tank', tank: 't1' }, handbook: h, tanks,
  })
  const first = JSON.stringify(bodies[0]!.messages[0]!.content)
  expect(first.indexOf('The reader asks:')).toBeLessThan(first.indexOf('id t1: what they ask is about that tank'))
})

test('asked whether their tank is all right, the chat reviews it with the tank-mates check on that tank, says what to fix first, and asks for the readings it lacks', async () => {
  expect(SYSTEM).toContain('whether it is all right ("bể này ổn không"), review that tank. With fish in it: check_tank_mates with its id')
  expect(SYSTEM).toContain('and no fish to add, once')
  expect(SYSTEM).toContain('Open with the check\'s verdict, or, with one kind of fish, when it gives none, with how full the tank is and its notes')
  expect(SYSTEM).toContain('With no fish in it there is nothing to check: don\'t call it.')
  expect(SYSTEM).toContain('end by asking for the one to three they haven\'t given that would change your advice')
  // What the prompt leans on, from the check itself: a verdict with two kinds or more; with one, none, but how full the
  // tank is and its notes; with none, an error (the review, 13 Nov).
  const h = await hb()
  const dims = { l: 60, w: 30, h: 36 }
  const tanks: Tank[] = [
    { id: 'two', name: 'Bể 1', dims, species: [{ id: 'paracheirodon-innesi', count: 6 }, { id: 'pigeon-blood-discus', count: 2 }], unlisted: [] },
    { id: 'one', name: 'Bể 2', dims, species: [{ id: 'paracheirodon-innesi', count: 3 }], unlisted: [] },
    { id: 'none', name: 'Bể 3', dims, species: [], unlisted: [{ name: 'Rong lạ', kind: 'plant' }] },
  ]
  const tool = chatTools({ handbook: h, tanks: async () => tanks }).find(t => t.name === 'check_tank_mates')!
  const review = async (tankId: string) => JSON.parse(await tool.run({ fish: [], tank: null, tankId }, { photosLeft: 0 }) as string) as MatesCheck
  const two = await review('two')
  expect(two.answer?.head).toEqual(expect.any(String))
  expect(two.verdict).toBeDefined()
  const one = await review('one')
  expect(one.answer).toBeUndefined()
  expect(one.verdict).toBeUndefined()
  expect(one.stocking?.notes.length).toBeGreaterThan(0)
  await expect(review('none')).rejects.toThrow('That tank has no fish')
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

/** What a reader of the answer's text gives for these parts of a call's raw text, part by part. */
const pieces = (parts: string[]) => { const read = textReader(); return parts.map(read) }
/** A streamed answer's JSON up to its text's first character. */
const ON = '{"offTopic":false,"text":"'
/** A call as the handler streams it: each text block's raw JSON to `onText` in parts of `n` characters, then the message. */
const streamed = (content: unknown[], stop: Anthropic.Message['stop_reason'] = 'end_turn', n = 3) => async (_: unknown, opts: { onText?: (delta: string) => void }) => {
  for (const b of content as { type: string; text?: string }[]) if (b.type === 'text') for (let i = 0; i < b.text!.length; i += n) opts.onText?.(b.text!.slice(i, i + n))
  return message(content, stop)
}
const readPage = { type: 'tool_use', id: 't1', name: 'read_page', input: { path: '/vi/ca/ca-neon-xanh/', heading: null } }

test('the answer\'s text comes out as Claude writes it: an escape or a surrogate pair cut between parts waits for the rest', () => {
  // An escape cut after its backslash, and inside its four digits.
  expect(pieces([`${ON}Nuôi\\`, 'nđàn \\u00', 'e1 x'])).toEqual(['Nuôi', '\nđàn ', 'á x'])
  // An emoji's pair, escaped: cut inside the first half, between the halves, then inside the second.
  expect(pieces([`${ON}cá \\ud8`, '3d', '\\u', 'dc1f!'])).toEqual(['cá ', '', '', '🐟!'])
  // And written as it is, cut between its halves.
  expect(pieces([`${ON}cá ${'🐟'[0]}`, `${'🐟'[1]}"`])).toEqual(['cá ', '🐟'])
  // A high surrogate the string ends on goes out with the end.
  expect(pieces([`${ON}a\\ud83d`, '"'])).toEqual(['a', '\ud83d'])
  // Every escape JSON has.
  expect(pieces([`${ON}\\"\\\\\\/\\b\\f\\n\\r\\t"`])).toEqual(['"\\/\b\f\n\r\t'])
})

test('a call\'s JSON that doesn\'t open with the text gives nothing; space around it is JSON\'s, and nothing past the text\'s closing quote is read', () => {
  expect(pieces(['{"covered":true,"text":"Nuôi theo đàn."}'])).toEqual([''])
  expect(pieces(['{"te', 'xts":"Nuôi theo đàn."'])).toEqual(['', ''])
  expect(pieces(['Để tôi đọc trang cá neon.', '{"text":"x"'])).toEqual(['', ''])
  expect(pieces([' \n{ ', '"offTopic" ', ':\t', ' false ,', ' "text" ', ': ', ' "Nuôi', ' theo đàn."', ',"suggestions":["text"]}'])).toEqual(['', '', '', '', '', '', 'Nuôi', ' theo đàn.', ''])
  // The schema keeps offTopic, then the text, first: structured outputs write the keys in its order.
  expect(Object.keys(ANSWER_SCHEMA.properties).slice(0, 2)).toEqual(['offTopic', 'text'])
})

test('an answer on fishkeeping streams after offTopic false; an off-topic one gives nothing, whatever its text', () => {
  expect(pieces(['{"offTopic"', ': false, "te', 'xt":"Nuôi', ' theo đàn."}'])).toEqual(['', '', 'Nuôi', ' theo đàn.'])
  expect(pieces(['{"offTopic":true,"text":"Real Madrid thắng 2-1."}'])).toEqual([''])
  expect(pieces(['{"offTopic":tr', 'ue,"text":"x"}'])).toEqual(['', ''])
  // Only an answer that has said it is on topic streams, whatever the order of its keys; a space never splits a word of the JSON.
  expect(pieces(['{"text":"Real Madrid thắng 2-1.","offTopic":true}'])).toEqual([''])
  expect(pieces(['{"offTopic":fal se,"text":"x"}'])).toEqual([''])
})

test('an off-topic question gets the Worker\'s own line in the reader\'s language: nothing Claude wrote, no blocks, no suggestions, nothing streamed', async () => {
  const said: string[] = []
  const wrote = { offTopic: true, text: 'Real Madrid thắng 2-1 tối qua.', covered: true, blocks: [{ t: 'card', ids: ['paracheirodon-innesi'], path: null, heading: null, tool: null, fish: [], tank: null, tankId: null }], suggestions: ['Ai ghi bàn?'] }
  for (const lang of ['vi', 'th'] as const) {
    const out = await answerQuestion({
      send: streamed([{ type: 'text', text: JSON.stringify(wrote) }]),
      model: 'claude-opus-5-5', lang, question: 'Tối qua Real Madrid đá thế nào?', earlier: [], start: {}, handbook: await hb(), tanks: async () => [],
      onText: p => said.push(p),
    })
    expect(out.answer).toEqual({ offTopic: true, text: OFF_TOPIC[lang], covered: true, blocks: [], suggestions: [], clashes: [] })
    expect(out.blocks).toEqual([])
  }
  expect(said.join('')).toBe('')
})

test('the pieces joined are the answer\'s text, however its JSON is cut and whatever it escapes', () => {
  const text = 'Cá neon "xanh" sống theo đàn 🐟 \\ từ 6 con,\n\tnhiệt độ 20–26 °C / 25 °C.\r\b\f'
  const plain = JSON.stringify({ offTopic: false, text, covered: true, blocks: [], suggestions: ['Còn "text" thì sao?'] })
  // The same JSON with every character past ASCII as \uXXXX (an emoji as its pair) and every slash escaped.
  const escaped = plain.replace(/[^\x20-\x7e]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`).replaceAll('/', '\\/')
  for (const raw of [plain, escaped]) {
    expect(JSON.parse(raw).text).toBe(text)
    for (const n of [1, 2, 3, 5, 7, raw.length]) {
      const read = textReader()
      const out: string[] = []
      for (let i = 0; i < raw.length; i += n) out.push(read(raw.slice(i, i + n)))
      expect(out.join(''), `${n}`).toBe(text)
      expect(out.some(p => /[\ud800-\udbff]$/.test(p) || p.includes('\\u')), `${n}`).toBe(false)
    }
  }
})

test('each pick comes out as Claude closes it, once, however the JSON is cut and whatever its strings hold; nothing after the blocks', () => {
  const picks = [
    pick({ ids: ['paracheirodon-innesi'] }),
    pick({ t: 'section', path: '/vi/huong-dan/a/', heading: 'b' }),
    pick({ t: 'tool', tool: 'tank-mates', fish: [{ id: 'paracheirodon-innesi', count: 8 }, { id: 'betta-splendens', count: 1 }], tank: { l: 60, w: 30, h: 36 } }),
  ]
  // Braces, brackets, commas, quotes and backslashes in strings: in the text, and in the suggestions after the blocks.
  const raw = JSON.stringify({ offTopic: false, text: 'Bể {60} cm ["blocks"], 1, 2 \\ "x" }]', covered: true, blocks: picks, suggestions: ['{"t":"species"} [x]?'] })
  for (const n of [1, 2, 3, 7, 13, raw.length]) {
    const read = picksReader()
    const got: { to: number; p: Choice }[] = []
    for (let i = 0; i < raw.length; i += n) for (const p of read(raw.slice(i, i + n))) got.push({ to: Math.min(i + n, raw.length), p })
    expect(got.map(g => g.p), `${n}`).toEqual(picks)
    // Each from the part that closes it.
    got.forEach((g, k) => { const end = raw.indexOf(JSON.stringify(picks[k])) + JSON.stringify(picks[k]).length; expect(g.to - n < end && end <= g.to, `${n}: pick ${k}`).toBe(true) })
  }
  // JSON's space around its marks; no blocks.
  expect(picksReader()(' { "offTopic" : false , "text" : "x" , "blocks" : [ { "t" : "species" , "ids" : [ "a" ] } ] }')).toEqual([{ t: 'species', ids: ['a'] }])
  expect(picksReader()('{"offTopic":false,"text":"x","blocks":[],"suggestions":[{"t":"species"}]}')).toEqual([])
})

test('with onBlock, each block goes out as Claude picks it, after its text, in order, and they are the run\'s blocks; none from a call whose text didn\'t stream', async () => {
  const blocks = [pick({ ids: ['paracheirodon-innesi'] }), pick({ ids: ['no-such-fish'] }), pick({ t: 'tool', tool: 'tank-volume', tank: { l: 60, w: 30, h: 36 } })]
  const final = { offTopic: false, text: 'Cá neon xanh sống theo đàn, từ 6 con.', covered: true, blocks, suggestions: [] }
  const order: string[] = []
  const out = await answerQuestion({
    send: streamed([{ type: 'text', text: JSON.stringify(final) }]),
    model: 'claude-opus-5-5', lang: 'vi', question: 'Nuôi cá neon thế nào?', earlier: [], start: {}, handbook: await hb(), tanks: async () => [],
    onText: () => order.push('text'), onBlock: b => order.push(b.t),
  })
  expect(out.blocks.map(b => b.t)).toEqual(['species', 'tool'])
  expect(out.dropped).toHaveLength(1)
  expect(order.filter(x => x !== 'text')).toEqual(['species', 'tool'])
  expect(order.lastIndexOf('text')).toBeLessThan(order.indexOf('species'))
  // The same answer with its keys in another order: its text doesn't stream, and its blocks come with the run's end only.
  const late: string[] = []
  const plain = await answerQuestion({
    send: streamed([{ type: 'text', text: JSON.stringify({ text: final.text, offTopic: false, covered: true, blocks, suggestions: [] }) }]),
    model: 'claude-opus-5-5', lang: 'vi', question: 'Nuôi cá neon thế nào?', earlier: [], start: {}, handbook: await hb(), tanks: async () => [],
    onText: () => late.push('text'), onBlock: b => late.push(b.t),
  })
  expect(plain.blocks.map(b => b.t)).toEqual(['species', 'tool'])
  expect(late).toEqual([])
})

test('a call that has given the reader text is the answer: a tool call after it doesn\'t run, and the run ends on it', async () => {
  const final = { offTopic: false, text: 'Cá neon xanh sống theo đàn, từ 6 con.', covered: true, blocks: [], suggestions: [] }
  const said: string[] = []
  const steps: Step[] = []
  const out = await answerQuestion({
    send: streamed([{ type: 'text', text: JSON.stringify(final) }, readPage], 'tool_use'),
    model: 'claude-opus-5-5', lang: 'vi', question: 'Nuôi cá neon thế nào?', earlier: [], start: {}, handbook: await hb(), tanks: async () => [],
    onStep: s => steps.push(s), onText: p => said.push(p),
  })
  expect(out).toMatchObject({ calls: 1, tools: 0, stopped: 'answer', answer: final })
  expect(steps).toEqual([])
  expect(out.message!.content.map(b => b.type)).toEqual(['text'])
  expect(out.message!.stop_reason).toBe('end_turn')
  expect(said.join('')).toBe(final.text)
})

test('the reader gets the answer\'s text in pieces that join to it; each call is read afresh, and one with only words before its tool call gives nothing', async () => {
  const final: Answer = answer([pick({ t: 'species', ids: ['paracheirodon-innesi'] })], { text: 'Cá neon "xanh" sống theo đàn 🐟, từ 6 con.\nBể 60 lít là vừa.' })
  const said: string[] = []
  let calls = 0
  const out = await answerQuestion({
    send: (body, opts) => (++calls === 1
      ? streamed([{ type: 'text', text: 'Để tôi đọc trang cá neon.' }, readPage], 'tool_use')
      : streamed([{ type: 'thinking', thinking: 'Đủ rồi.', signature: 's' }, { type: 'text', text: JSON.stringify(final) }]))(body, opts),
    model: 'claude-opus-5-5', lang: 'vi', question: 'Nuôi cá neon thế nào?', earlier: [], start: {}, handbook: await hb(), tanks: async () => [], onText: p => said.push(p),
  })
  expect(out).toMatchObject({ calls: 2, tools: 1, stopped: 'answer' })
  expect(out.blocks.map(b => b.t)).toEqual(['species'])
  expect(said.length).toBeGreaterThan(1)
  expect(said.every(p => p.length > 0)).toBe(true)
  expect(said.join('')).toBe(out.answer!.text)
})

test('words before a tool call that look like broken JSON never fail the call: brackets, and quotes around a line break or a bad escape', async () => {
  const final: Answer = answer([pick({ t: 'species', ids: ['paracheirodon-innesi'] })], { text: 'Cá neon xanh sống theo đàn, từ 6 con.' })
  for (const words of ['Để tôi đọc [trang "cá\nneon"] trước.', 'Xem {"a\\\'b"} và ["x\ty"', '{"blocks":[{"t":"species"']) {
    const cards: string[] = []
    let calls = 0
    const out = await answerQuestion({
      send: (body, opts) => (++calls === 1
        ? streamed([{ type: 'text', text: words }, readPage], 'tool_use', 2)
        : streamed([{ type: 'text', text: JSON.stringify(final) }]))(body, opts),
      model: 'claude-opus-5-5', lang: 'vi', question: 'Nuôi cá neon thế nào?', earlier: [], start: {}, handbook: await hb(), tanks: async () => [],
      onText: () => {}, onBlock: b => cards.push(b.t),
    })
    expect(out, words).toMatchObject({ calls: 2, tools: 1, stopped: 'answer' })
    expect(out.error, words).toBeUndefined()
    expect(cards, words).toEqual(['species'])
  }
})

test('an answer the reader is already reading gets the chat\'s grace past the run\'s limit', async () => {
  const opts: { timeoutMs: number; writingMs?: number }[] = []
  await answerQuestion({
    send: async (_, o) => { opts.push(o); return message([{ type: 'text', text: JSON.stringify({ offTopic: false, text: 'Cá neon xanh sống theo đàn, từ 6 con.', covered: true, blocks: [], suggestions: [] }) }]) },
    model: 'claude-opus-5-5', lang: 'vi', question: 'Nuôi cá neon thế nào?', earlier: [], start: {}, handbook: await hb(), tanks: async () => [], clock: () => 0,
  })
  expect(opts.map(o => [o.timeoutMs, o.writingMs])).toEqual([[20_000, 30_000]])
})

test('a call still silent as time runs out is given up for a short answer; once the reader has words, there is no second answer', async () => {
  const final = { offTopic: false, text: 'Cá neon xanh sống theo đàn, từ 6 con.', covered: true, blocks: [], suggestions: [] }
  const ask = { model: 'claude-haiku-5-5', lang: 'vi' as const, question: 'Nuôi cá neon thế nào?', earlier: [], start: {}, handbook: await hb(), tanks: async () => [] }
  let now = 0
  const bodies: Anthropic.MessageCreateParamsNonStreaming[] = []
  const out = await answerQuestion({ ...ask, clock: () => now, send: async (b, o) => {
    bodies.push(b)
    if (bodies.length === 1) { now += o.timeoutMs; throw new Error('Request timed out.') }
    return message([{ type: 'text', text: JSON.stringify(final) }])
  } })
  expect(out).toMatchObject({ calls: 2, stopped: 'time', answer: final })
  expect(bodies[1]).toMatchObject({ thinking: { type: 'disabled' }, max_tokens: LAST_TRY.maxTokens, tool_choice: { type: 'none' } })

  let tries = 0
  const said: string[] = []
  const cut = await answerQuestion({ ...ask, clock: () => now, onText: p => said.push(p), send: async (_, o) => {
    tries++
    o.onText?.('{"offTopic":false,"text":"Cá neon xanh sống')
    now += o.timeoutMs
    throw new Error('Request timed out.')
  } })
  expect(said.join('')).toContain('Cá neon')
  expect(tries).toBe(1)
  expect(cut.stopped).toBe('error')
})

test('without onText a run is as before: no call is asked to stream, and a tool call after an answer\'s text still runs', async () => {
  const final = { offTopic: false, text: 'Cá neon xanh sống theo đàn, từ 6 con.', covered: true, blocks: [], suggestions: [] }
  const opts: object[] = []
  const out = await answerQuestion({
    send: async (_, o) => {
      opts.push(o)
      return opts.length === 1 ? message([{ type: 'text', text: JSON.stringify(final) }, readPage], 'tool_use') : message([{ type: 'text', text: JSON.stringify(final) }])
    },
    model: 'claude-opus-5-5', lang: 'vi', question: 'Nuôi cá neon thế nào?', earlier: [], start: {}, handbook: await hb(), tanks: async () => [],
  })
  expect(opts.map(o => Object.keys(o))).toEqual([['timeoutMs', 'writingMs', 'call'], ['timeoutMs', 'writingMs', 'call']])
  expect(out).toMatchObject({ calls: 2, tools: 1, stopped: 'answer', answer: final })
})

test('Vietnamese typed without accents is read as a keeper means it: the first message says so, and only then', async () => {
  const h = await hb()
  const said = (lang: 'vi' | 'id', q: string) => JSON.stringify(firstMessage(lang, q, [], {}, h).content)
  expect(unaccented('ca neon bi nam trang tren lung, chua sao a')).toBe(true)
  expect(said('vi', 'ca neon bi nam trang tren lung, chua sao a')).toContain('They type without Vietnamese accents')
  // Accented, one accent is enough; a word or two of English or a figure is no unaccented question; nor another language.
  for (const q of ['cá neon bị nấm trắng trên lưng', 'ca neon bi nấm trang', 'pH 7?', 'Neon']) expect(said('vi', q), q).not.toContain('without Vietnamese accents')
  expect(said('id', 'ikan neon ada jamur putih')).not.toContain('without Vietnamese accents')
})

test('a long post\'s first line is written from its end; the run still reads the whole post', async () => {
  const h = await hb()
  const final = answer([], { text: 'Chia đèn hai đợt được.' })
  const bodies: { call: number; body: Anthropic.MessageCreateParamsNonStreaming }[] = []
  const question = `Dòng đầu của bài viết. ${'Bể em set 3 tháng, đèn 8 tiếng, thay nước mỗi tuần. '.repeat(12)}Lá ráy có đốm rêu xanh. Có nên chia đèn không?`
  await answerQuestion({
    send: async (body, opts) => {
      bodies.push({ call: opts.call, body })
      return message([{ type: 'text', text: opts.call === 0 ? '-' : JSON.stringify(final) }])
    },
    model: 'claude-haiku-5-5', lang: 'vi', question, earlier: [], start: {}, handbook: h, tanks: async () => [], opening: true,
  })
  const said = (n: number) => JSON.stringify(bodies.find(b => b.call === n)!.body.messages)
  expect(said(0)).toContain('Có nên chia đèn không?')
  expect(said(0)).not.toContain('Dòng đầu của bài viết')
  expect(said(1)).toContain('Dòng đầu của bài viết')
})

test('the first line comes from a call of its own beside the run\'s first, before the first step; it counts in the turn\'s tokens, and the run\'s calls are as without it', async () => {
  const h = await hb()
  const final = answer([], { text: 'Cá neon xanh sống theo đàn.' })
  const events: string[] = []
  const bodies: { call: number; body: Anthropic.MessageCreateParamsNonStreaming }[] = []
  let lineSent!: () => void
  const lineDone = new Promise<void>(r => { lineSent = r })
  const out = await answerQuestion({
    send: async (body, opts) => {
      bodies.push({ call: opts.call, body })
      if (opts.call === 0) { lineSent(); return message([{ type: 'text', text: '  Mình đang tra cẩm nang về cá neon xanh cho bạn. ' }]) }
      // The run's first call ends after the line's, as it does on the API (it reads far more).
      if (opts.call === 1) { await lineDone; await new Promise(r => setTimeout(r, 0)); return message([readPage], 'tool_use') }
      return streamed([{ type: 'text', text: JSON.stringify(final) }])(body, opts)
    },
    model: 'claude-haiku-5-5', lang: 'vi', question: 'Nuôi cá neon thế nào?', earlier: [], start: {}, handbook: h, tanks: async () => [],
    opening: true, onOpening: l => events.push(`opening: ${l}`), onStep: s => events.push(s.kind), onText: () => { if (events.at(-1) !== 'text') events.push('text') },
  })
  expect(events).toEqual(['opening: Mình đang tra cẩm nang về cá neon xanh cho bạn.', 'read', 'text'])
  expect(out.opening).toBe('Mình đang tra cẩm nang về cá neon xanh cho bạn.')
  const line = bodies.find(b => b.call === 0)!.body
  expect([line.system, line.tools, line.thinking, line.messages]).toEqual([OPENING_SYSTEM, undefined, { type: 'disabled' }, [firstMessage('vi', 'Nuôi cá neon thế nào?', [], {}, h)]])
  // The run's own calls are what they are without a line: its prompt, its tools, its limits.
  const runs = bodies.filter(b => b.call > 0).map(b => b.body)
  expect(runs[0]!.system).toBe(SYSTEM)
  expect(runs[0]!.tools!.map(t => (t as Anthropic.Tool).name)).toEqual(['search_handbook', 'read_page', 'check_tank_mates', 'read_tanks'])
  expect(out.spent.input).toBe(300)
})

test('what\'s handed over goes after the question in every call of the run, never in the first line\'s, which doesn\'t wait for it; one that fails is no handover', async () => {
  const h = await hb()
  const final = answer([], { text: 'Cá neon xanh sống theo đàn.' })
  const run = async (handover: ChatOptions['handover'], sawLine?: () => void) => {
    const bodies: { call: number; body: Anthropic.MessageCreateParamsNonStreaming }[] = []
    const out = await answerQuestion({
      send: async (body, opts) => {
        bodies.push({ call: opts.call, body: structuredClone(body) })
        if (opts.call === 0) { sawLine?.(); return message([{ type: 'text', text: '-' }]) }
        return opts.call === 1 ? message([readPage], 'tool_use') : message([{ type: 'text', text: JSON.stringify(final) }])
      },
      model: 'claude-haiku-5-5', lang: 'vi', question: 'Nuôi cá neon thế nào?', earlier: [], start: {}, handbook: h, tanks: async () => [], opening: true, handover,
    })
    return { out, bodies }
  }
  let lineSent = false
  const { out, bodies } = await run(async () => { await Promise.resolve(); expect(lineSent).toBe(true); return { text: 'Handed text', sections: [{ path: '/vi/ca/ca-neon-xanh/', heading: null }] } }, () => { lineSent = true })
  expect(out.answer?.text).toBe(final.text)
  expect(out.handed).toEqual([{ path: '/vi/ca/ca-neon-xanh/', heading: null }])
  const first = firstMessage('vi', 'Nuôi cá neon thế nào?', [], {}, h)
  expect(bodies.find(b => b.call === 0)!.body.messages).toEqual([first])
  const runs = bodies.filter(b => b.call !== 0)
  expect(runs.length).toBeGreaterThan(1)
  for (const b of runs) expect(b.body.messages[0]!.content).toEqual([...(first.content as unknown[]), { type: 'text', text: 'Handed text' }])
  const failed = await run(async () => { throw new Error('no') })
  expect(failed.out.answer?.text).toBe(final.text)
  expect(failed.out.handed).toBeUndefined()
  expect(failed.bodies.find(b => b.call === 1)!.body.messages[0]).toEqual(first)
})

test('a handover that takes too long is none, and what it took comes out of the run\'s time', async () => {
  const h = await hb()
  const final = answer([], { text: 'Cá neon xanh sống theo đàn.' })
  const ask = { model: 'claude-haiku-5-5', lang: 'vi', question: 'Nuôi cá neon thế nào?', earlier: [], start: {}, handbook: h, tanks: async () => [] } as const
  const send = async () => message([{ type: 'text', text: JSON.stringify(final) }])
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  try {
    const run = answerQuestion({ ...ask, earlier: [], send, handover: () => new Promise(() => undefined) })
    await vi.advanceTimersByTimeAsync(HANDOVER_MS)
    const out = await run
    expect(out.answer?.text).toBe(final.text)
    expect(out.handed).toBeUndefined()
  } finally { vi.useRealTimers() }
  let now = 0
  const spent = await answerQuestion({ ...ask, earlier: [], send, clock: () => now, limits: { ms: 1500 }, handover: async () => { now += 1000; return undefined } })
  expect(spent.stopped).toBe('error')
})

test('no first line is shown when it says the question is off topic, isn\'t in the reader\'s language, comes after the first step or the run, or its call fails; one shown is kept', async () => {
  const h = await hb()
  const final = answer([], { text: 'Cá neon xanh sống theo đàn.' })
  const turn = async (o: { lang?: ChatOptions['lang']; line: () => Promise<Anthropic.Message>; first?: () => Promise<void>; text?: string; direct?: boolean; onOpening?: (l: string) => void }) => {
    const shown: string[] = []
    const out = await answerQuestion({
      send: async (_, opts) => {
        if (opts.call === 0) return o.line()
        if (opts.call === 1 && !o.direct) { await o.first?.(); return message([readPage], 'tool_use') }
        return message([{ type: 'text', text: o.text ?? JSON.stringify(final) }])
      },
      model: 'claude-haiku-5-5', lang: o.lang ?? 'vi', question: 'x', earlier: [], start: {}, handbook: h, tanks: async () => [],
      opening: true, onOpening: o.onOpening ?? (l => shown.push(l)), onStep: () => stepped(),
    })
    return { shown, opening: out.opening, answered: out.answer?.text, output: out.spent.output }
  }
  let stepped = () => {}
  const text = (t: string) => async () => message([{ type: 'text', text: t }])
  // The run's first call ends a moment after the line's (a task later: the line's call is all done by then).
  const later = () => new Promise<void>(r => setTimeout(r, 0))
  expect(await turn({ line: text('-') })).toMatchObject({ shown: [], opening: undefined, answered: final.text })
  // A line the word list holds, even wrongly, loses the line and nothing else; its tokens still count, 50 each call.
  expect(await turn({ line: text('Mình đang tra cẩm nang về cá to vl trong bể của bạn.'), first: later })).toMatchObject({ shown: [], opening: undefined, answered: final.text, output: 150 })
  // Nor does sending the line (a reader who has left) cost the answer.
  expect(await turn({ line: text('Mình đang tra cẩm nang về cá neon xanh.'), first: later, onOpening: () => { throw new Error('the reader has left') } })).toMatchObject({ answered: final.text })
  expect(await turn({ lang: 'id', line: text('Mình sedang mencari panduan tentang air keruh.') })).toMatchObject({ shown: [], opening: undefined, answered: final.text })
  expect(await turn({ line: async () => { throw Object.assign(new Error('overloaded'), { status: 529 }) } })).toMatchObject({ shown: [], opening: undefined, answered: final.text, output: 100 })
  // The line's call answers only once the first step is out.
  const after = new Promise<void>(r => { stepped = r })
  expect(await turn({ line: async () => { await after; return message([{ type: 'text', text: 'Mình đang tra cẩm nang về cá neon xanh.' }]) } })).toMatchObject({ shown: [], opening: undefined, answered: final.text })
  stepped = () => {}
  // Nor once the run has ended with no step (an off-topic answer, sent whole): its tokens still count, 50 each call.
  const late = await turn({ direct: true, line: async () => { await new Promise(r => setTimeout(r, 20)); return message([{ type: 'text', text: 'Mình đang tra cẩm nang về cá neon xanh.' }]) }, text: JSON.stringify({ ...final, offTopic: true }) })
  expect(late).toMatchObject({ shown: [], opening: undefined, output: 100 })
  // Shown, then the answer is off topic: the run keeps the line it showed, for the transcript (the turn leaves it out: api.ts).
  const offTopic = await turn({ line: text('Mình đang tra cẩm nang về cá neon xanh.'), first: later, text: JSON.stringify({ ...final, offTopic: true }) })
  expect([offTopic.shown.length, offTopic.opening]).toEqual([1, 'Mình đang tra cẩm nang về cá neon xanh.'])
})
