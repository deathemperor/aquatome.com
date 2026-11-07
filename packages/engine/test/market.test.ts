import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { TranslationSchema, type Translation } from '@aq/schema'
import { checkPages, RATCHETED, RULES } from '../src/content-rules'
import { buildNote, figuresOutsideTable, localNotes } from '../src/local-notes'
import { doseProblems, foreignProducts, guideText, hardProducts, PRODUCTS, REMEDIES, type Cited, type Remedy } from '../src/market'
import type { Page } from '../src/pages'
import { processPage } from '../src/process'
import { reviewTranslation } from '../src/quality'
import { makeTopic } from '../src/topics'
import { reviewDraft, writeDraft } from '../src/youtube'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const remedies = REMEDIES.vi!
const note = (text: string) => buildNote(text, id => `Tiêu đề của ${id}`)
const say = (...xs: string[]) => xs.join(' ')

/**
 * The table's doses as they were last read against the repository's files. The test reads them whenever the table changes.
 * After that a rewrite can change a guide's words, and this test must not stop a cycle over it (RATCHETED's comment says
 * why): the command leaves the guides whose note needs those words, and says so (`a figure gone from its file`, below).
 */
const TABLE_READ = '8bed0c1c115d5151'

test('every figure in the table is word for word in the file it cites, read whenever the table changes', async () => {
  const hash = createHash('sha256').update(JSON.stringify(remedies)).digest('hex').slice(0, 16)
  const problems = await doseProblems(ROOT)
  if (hash === TABLE_READ) {
    if (problems.length) console.warn('a rewrite changed the words of a dose in the market table; its guides wait for a note', problems)
    return
  }
  expect(problems).toEqual([])
  expect(hash, 'every figure holds: write this hash in TABLE_READ').toBe(TABLE_READ)
})

test('a figure that is no file\'s words, outside its words, or off its label is found', async () => {
  const root = await mkdtemp(join(tmpdir(), 'market-'))
  await mkdir(join(root, 'content/guides/g'), { recursive: true })
  await writeFile(join(root, 'content/guides/g/vi.json'), JSON.stringify({ body: '<p>Bạn dùng <strong>1 thìa</strong> cho 5 lít nước.</p>' }))
  await mkdir(join(root, 'sources'), { recursive: true })
  await writeFile(join(root, 'sources/a.md'), 'Use one spoon\nper gallon.')
  const of = (c: Cited): Remedy[] => [{ id: 'x', name: 'x', lead: { text: '', figures: [], refs: [] }, uses: [{ ...c, problem: 'ich' }], carried: /$^/, refs: [] }]
  const check = async (c: Cited) => (await doseProblems(root, of(c))).map(p => p.problem)
  expect(await check({ text: 'Dùng 1 thìa cho 5 lít nước.', words: ['1 thìa cho 5 lít nước'], guide: 'g', quotes: [{ file: 'sources/a.md', text: 'Use one spoon per gallon' }] })).toEqual([])
  // Invented, converted, or written beside the words the file has.
  expect(await check({ text: 'Dùng 2 thìa cho 5 lít nước.', words: ['2 thìa cho 5 lít nước'], guide: 'g' })).toEqual(['"2 thìa cho 5 lít nước" isn\'t in g'])
  expect(await check({ text: 'Dùng 1 thìa cho 5 lít nước trong 7 ngày.', words: ['1 thìa cho 5 lít nước'], guide: 'g' })).toEqual(['a figure outside its words: Dùng  trong 7 ngày.'])
  expect(await check({ text: 'Dùng 1 thìa cho 5 lít nước.', words: ['1 thìa cho 5 lít nước'] })).toEqual(['it cites neither a guide nor a label'])
  expect(await check({ text: 'Dùng 1 thìa cho 5 lít nước.', words: ['1 thìa cho 5 lít nước'], guide: 'g', quotes: [{ file: 'sources/a.md', text: 'Use two spoons' }] })).toEqual(['"Use two spoons" isn\'t in sources/a.md'])
  const label = { url: 'https://a.test/', readOn: '2026-11-07' }
  expect(await check({ text: 'Nhãn ghi 1 gói cho 38 lít.', words: ['1 gói cho 38 lít'], label: { ...label, quote: 'one packet per 10 gallons (38 L)' } })).toEqual([])
  expect(await check({ text: 'Nhãn ghi 1 gói cho 40 lít.', words: ['1 gói cho 40 lít'], label: { ...label, quote: 'one packet per 10 gallons (38 L)' } })).toEqual(['40 isn\'t on the label'])
})

// The guide names enough of each, and every problem: the note with the most in it.
const ALL = say('Ich-X, Ich-X, Maracyn, Maracyn, ParaCleanse, ParaCleanse, Slime Out, Slime Out.', 'đốm trắng,', 'nấm nấm nấm,', 'thối vây thối vây thối vây,', 'cách ly cách ly cách ly cách ly cách ly cách ly,', 'tảo lam,', 'ký sinh.')
const NOTES: Record<string, string> = {
  all: ALL,
  ich: 'Ich-X Ich-X trị đốm trắng',
  maracyn: 'Maracyn Maracyn',
  finRot: 'Maracyn Maracyn trị thối vây thối vây thối vây',
  worms: 'ParaCleanse ParaCleanse trị giun',
  cyano: 'Slime Out Slime Out trị tảo lam',
}

test('a note says what is true and nothing the owner ruled out', () => {
  for (const [name, text] of Object.entries(NOTES)) {
    const n = note(text)!
    const plain = n.html.replace(/<[^>]+>/g, ' ')
    expect(n.html, name).toMatch(/^<h3>Ở Việt Nam: /)
    expect(n.html, name).toContain('Mục này do AquaTome thêm') // labelled as ours
    expect(n.refs.length, name).toBeGreaterThan(0)
    expect(figuresOutsideTable(n.html), name).toEqual([])
    // Never that a product isn't sold here: marketplaces and Facebook sellers weren't checked.
    expect(plain, name).not.toMatch(/không (có )?bán|không mua được|khó mua|khó tìm|không có ở Việt Nam/i)
    // No author, channel or video on a page.
    expect(plain, name).not.toMatch(/video|kênh|tác giả|bài gốc/i)
    // A legal claim, and what has no dose at the strength sold here or no disease to treat.
    expect(plain, name).not.toMatch(/cấm|thông tư|luật/i)
    expect(plain, name).not.toMatch(/xanh methylen|baking soda|thuốc tím|muối biển hột/i)
    expect(plain, name).not.toMatch(/gallon|2\.303|2,303|35%/i)
    // A human medicine's dose: none (Maracyn's label gives 200 mg a packet, and the note leaves it out).
    expect(plain, name).not.toMatch(/\bmg\b|nhà thuốc.{0,40}(erythromycin|metronidazole|praziquantel)/i)
  }
})

test('xanh malachite is named only as what Ich-X has in it, and Slime Out is never called erythromycin', () => {
  const ich = note(NOTES.ich!)!.html
  expect(ich).toContain('Ich-X có hoạt chất là formaldehyde và xanh malachite (malachite green chloride).')
  expect(ich).toContain('không ghi liều cho các chất trên và không khuyên mua riêng')
  expect(ich.match(/malachite/gi)).toHaveLength(2) // both in that one sentence
  for (const r of remedies) expect(JSON.stringify(r)).not.toMatch(/malachite/i)
  const cyano = note(NOTES.cyano!)!.html
  expect(cyano).not.toMatch(/erythromycin/i)
  expect(cyano).toContain('chưa tìm được nguồn nêu rõ hoạt chất')
  expect(foreignProducts('vi')).toMatch(/Slime Out: không rõ hoạt chất, đừng ghi hoạt chất nào, kể cả erythromycin/)
})

test('a dose goes with the problem its source names, the risks with it, and at the strength sold here', () => {
  // Ich: salt at the level its source gives for ich.
  const ich = note(NOTES.ich!)!.html
  expect(ich).toContain('<h3>Ở Việt Nam: trị bệnh đốm trắng bằng muối hột</h3>')
  expect(ich).toContain('1 muỗng canh muối cho mỗi 7,6 lít nước')
  expect(ich).not.toContain('11,4 lít') // not the level for other problems
  expect(ich).toContain('Muối không dùng được với phần lớn cây thủy sinh và ốc.')
  expect(ich).toContain('Đừng dùng muối ăn, muối biển hay muối Epsom.')
  // Maracyn with no problem a source answers: the ingredient, and plainly no dose.
  const maracyn = note(NOTES.maracyn!)!.html
  expect(maracyn).toContain('<h3>Ở Việt Nam: Maracyn là thuốc gì</h3>')
  expect(maracyn).toContain('Maracyn là kháng sinh erythromycin. Maracyn Two là thuốc khác, hoạt chất là minocycline.')
  expect(maracyn).toContain('không ghi liều cho các chất trên')
  expect(maracyn).not.toContain('muối')
  // Fin rot, which its source treats with salt, more slowly.
  expect(note(NOTES.finRot!)!.html).toContain('Với thối vây, bạn bắt đầu từ 1 muỗng canh muối cho 11,4 lít nước')
  expect(note(NOTES.finRot!)!.html).toContain('thường lâu khỏi hơn thuốc')
  expect(note(NOTES.finRot!)!.refs.map(r => r.url)).toContain('https://www.aquariumcoop.com/blogs/aquarium/fin-rot')
  // ParaCleanse: the same two actives, never the same dose.
  const worms = note(NOTES.worms!)!
  expect(worms.html).toContain('có cùng hai hoạt chất với ParaCleanse')
  expect(worms.html).toContain('đừng lấy liều của thuốc này áp cho thuốc kia')
  expect(worms.html).toContain('1 gói cho mỗi 38 lít nước')
  expect(worms.refs.map(r => r.title)).toContain('API GENERAL CURE- metronidazole praziquantel powder (DailyMed)')
  // Slime Out: 3% peroxide, as the blue-green algae guide's note does.
  const cyano = note(NOTES.cyano!)!.html
  expect(cyano).toContain('<h3>Ở Việt Nam: trị tảo lam bằng oxy già 3%</h3>')
  expect(cyano).toContain('liều 3 ml cho mỗi 4 lít nước')
  expect(cyano).toContain('Chỉ dùng loại 3%.')
  expect(cyano).toContain('Oxy già có thể làm bỏng mang')
})

test('a guide that already gives a dose gets a line saying so, not the dose again', () => {
  const salt = note('Ich-X Ich-X trị đốm trắng. Bạn dùng 1 muỗng canh muối cho khoảng 11 lít nước.')!
  expect(salt.html).toContain('Liều, cách làm và rủi ro có ở phần dưới của bài.')
  expect(salt.html).not.toContain('7,6 lít')
  expect(salt.cited).toEqual([])
  const peroxide = note('Slime Out Slime Out trị tảo lam. Hút oxy già 3% vào xi lanh, liều 3 ml cho mỗi 4 lít nước.')!
  expect(peroxide.html).toContain('Liều, cách làm và rủi ro có ở phần dưới của bài.')
  expect(peroxide.html).not.toContain('Oxy già có thể làm bỏng mang')
})

test('treatments only, and only where the guide names one twice', () => {
  // A fertilizer or a mineral, however often: a note first in the guide would be out of proportion.
  expect(note('Easy Green Easy Green Easy Carbo Easy Root Tabs Wonder Shell Wonder Shell')).toBeNull()
  expect(note('Dùng thuốc Ich-X hoặc muối cho đốm trắng')).toBeNull()
  expect(note('Maracyn-Two Maracyn-Two Maracyn 2')).toBeNull() // sold here, and another antibiotic
  expect(note('Dùng muối cho đốm trắng')).toBeNull()
  // Named twice in one way or another.
  expect(note('Ich X, Ich-X')).not.toBeNull()
  expect(note('Maracyn Two và Maracyn, rồi Maracyn')).not.toBeNull()
})

test('a problem named in passing doesn\'t bring its remedy, and the ich pattern isn\'t the product\'s name', () => {
  expect(note('Ich-X Ich-X nấm nấm')!.html).not.toContain('muối hột')
  expect(note('Ich-X Ich-X nấm nấm nấm')!.html).toContain('Với nhiễm khuẩn và nhiễm nấm nhẹ')
  expect(note('Ich X, Ich-X')!.html).not.toContain('muối hột')
  expect(note('Ich-X Ich-X trị (Ich)')!.html).toContain('Với bệnh đốm trắng')
})

const pageOf = (html: string, o: Partial<Page> = {}): Page => ({ lang: 'vi', kind: 'guides', id: 'g', title: 'T', path: '/vi/huong-dan/g/', fields: [{ field: 'body', html }], lines: [], captions: [], latinNames: [], card: [], ...o })

// A note goes into the page's text, and the sweep can't mend what isn't in `body`: a finding here would stop every cycle.
test('a note has nothing the sweep holds at zero, and no content rule finds anything on it', () => {
  for (const [name, text] of Object.entries(NOTES)) {
    const html = `${note(text)!.html}<p>Bài hướng dẫn.</p>`
    const r = checkPages([pageOf(html, { credited: ['Kênh Cá'], localNote: true })])
    expect(r.errors, name).toEqual([])
    expect(r.findings.map(f => `${f.rule}: ${f.detail}`), name).toEqual([])
    expect(checkPages([pageOf(html)], RULES.filter(x => x.id in RATCHETED)).findings, name).toEqual([])
  }
})

const seed = async (root: string, guides: Record<string, Partial<Translation>>) => {
  const words = new Map<string, string[]>()
  for (const r of remedies) for (const c of [...r.uses, ...(r.how ? [r.how] : [])]) {
    if (c.guide) words.set(c.guide, [...(words.get(c.guide) ?? []), ...c.words])
    for (const q of c.quotes ?? []) {
      await mkdir(dirname(join(root, q.file)), { recursive: true })
      const before = await readFile(join(root, q.file), 'utf8').catch(() => '')
      await writeFile(join(root, q.file), `${before} ${q.text}`)
    }
  }
  const files: Record<string, Partial<Translation>> = { ...Object.fromEntries([...words].map(([id, w]) => [id, { body: `<p>${w.join('. ')}</p>` }])), ...guides }
  for (const [id, g] of Object.entries(files)) {
    await mkdir(join(root, 'content/guides', id), { recursive: true })
    await writeFile(join(root, 'content/guides', id, 'vi.json'), `${JSON.stringify({ slug: id, name: `Bài ${id}`, altNames: [], sections: {}, body: '', quality: { score: 0.8, indexable: true }, ...g }, null, 2)}\n`)
  }
}

test('the command writes only the note, most-named first, up to its limit, and leaves a guide that has one', async () => {
  const root = await mkdtemp(join(tmpdir(), 'notes-'))
  const own = { html: '<h3>Ở Việt Nam: của người viết</h3><p>x</p>', refs: [{ url: 'https://a.test/', title: 'A' }] }
  await seed(root, {
    a: { body: '<p>Ich-X Ich-X trị đốm trắng. "Nguyên văn" &amp; <em>thế</em>.</p>', quality: { score: 0.6, indexable: false, chat: false } },
    b: { body: '<p>Ich-X Ich-X Ich-X Ich-X trị đốm trắng.</p>' },
    c: { body: '<p>Ich-X Ich-X trị đốm trắng.</p>', localNote: own },
    d: { body: '<p>Easy Green Easy Green.</p>' },
    e: { body: '<p>Ich-X trị đốm trắng.</p>' },
  })
  const before = await readFile(join(root, 'content/guides/a/vi.json'), 'utf8')
  expect(await localNotes(root, { limit: 1 })).toEqual({ written: ['b'], skipped: [] })
  expect(await localNotes(root, { limit: 5 })).toEqual({ written: ['a'], skipped: [] })
  expect(await localNotes(root, { limit: 5 })).toEqual({ written: [], skipped: [] })
  const a = JSON.parse(await readFile(join(root, 'content/guides/a/vi.json'), 'utf8')) as Translation
  expect(a.localNote!.html).toMatch(/^<h3>Ở Việt Nam: trị bệnh đốm trắng bằng muối hột/)
  expect(a.localNote!.html).toContain(`"Bài ${remedies[0]!.more}"`) // the guide with the rest of it, by its own title
  expect(TranslationSchema.parse(a).localNote).toEqual(a.localNote)
  // The rest of the file as it was, line for line: its text, its score, its hold from the chat.
  const { localNote: _, ...rest } = a
  expect(`${JSON.stringify(rest, null, 2)}\n`).toBe(before)
  expect((JSON.parse(await readFile(join(root, 'content/guides/c/vi.json'), 'utf8')) as Translation).localNote).toEqual(own)
  expect(await readFile(join(root, 'content/guides/d/vi.json'), 'utf8')).not.toContain('localNote')
  expect(await readFile(join(root, 'content/guides/e/vi.json'), 'utf8')).not.toContain('localNote')
})

test('a figure gone from its file: the guide that needs it waits, says why, and stops nothing else', async () => {
  const root = await mkdtemp(join(tmpdir(), 'notes-'))
  await seed(root, {
    needsSalt: { body: '<p>Ich-X Ich-X trị đốm trắng.</p>' },
    needsPeroxide: { body: '<p>Slime Out Slime Out trị tảo lam.</p>' },
    [remedies[0]!.uses[0]!.guide!]: { body: '<p>Một guide viết lại, không còn con số nào.</p>' },
  })
  const r = await localNotes(root, { limit: 5 })
  expect(r.written).toEqual(['needsPeroxide'])
  expect(r.skipped.map(s => s.id)).toEqual(['needsSalt'])
  expect(r.skipped[0]!.why).toContain('"1 muỗng canh muối cho mỗi 7,6 lít nước" isn\'t in')
  expect(await readFile(join(root, 'content/guides/needsSalt/vi.json'), 'utf8')).not.toContain('localNote')
})

test('the table: a product by its name, in the language whose shops were searched', () => {
  const names = (text: string) => hardProducts('vi', text).map(p => p.name)
  expect(names('Ich X, Maracyn, Para Cleanse, Fritz Slime-Out, EasyGreen, Easy Root Tab, EasyCarbo, Wonder Shells')).toEqual(['Ich-X', 'Maracyn', 'ParaCleanse', 'Slime Out', 'Easy Green', 'Easy Root Tabs', 'Easy Carbo', 'Wonder Shell'])
  expect(names('Maracyn-Two, Maracyn 2, Seachem Prime, API General Cure, Melafix, thích xem')).toEqual([]) // sold here, or no product
  expect(names('Easy Carbon')).toEqual([]) // Aquarium Co-Op's, another product
  expect(hardProducts('id', 'Ich-X')).toEqual([]) // Indonesian shops weren't searched
  for (const p of PRODUCTS) expect(p.market.vi?.checkedOn, p.name).toMatch(/^\d{4}-\d{2}-\d{2}$/) // every status has its date
})

test('the writers name the ingredient with no dose, and their reviewers are told it is no added fact', async () => {
  const seen: string[] = []
  const llm = (async (o: { prompt: string; schema?: { required?: string[] } }) => {
    seen.push(o.prompt)
    if (o.schema?.required?.includes('found')) return { found: true, facts: [{ section: 'treatment', fact: 'Ich-X', source: 0 }], species: [], sources: [{ url: 'https://a.test/', title: 'A', kind: 'article' }] }
    if (o.schema?.required?.includes('body')) return { name: 'Bài', summary: ['Ý'], body: '<p>x</p>', faq: [] }
    return { kind: 'skip', relevant: false, viTitle: '', summary: [], body: '', faq: [], chapters: [], score: 1, notes: [] }
  }) as never
  const line = '- Ich-X: formaldehyde và xanh malachite (malachite green chloride)'
  const clear = () => seen.splice(0, seen.length)

  await processPage(llm, { source: 'aquariumcoop', url: 'https://a.test/', title: 'T', outline: 'x', glossary: [] })
  expect(seen[0]).toContain(line)
  expect(seen[0]).toContain('add no dose, amount, use or advice with it')
  expect(seen[0]).toContain('do not add facts') // the rule stays, with its one exception named
  clear()

  await reviewTranslation(llm, [{ en: 'a', vi: 'b' }])
  expect(seen[0]).toContain(line)
  expect(seen[0]).toMatch(/naming a product's active ingredient beside it, before or after the brand[^.]*no change of meaning and no added fact/)
  expect(seen[0]).toContain('below 0.75: any omitted or added facts') // a dose is still one
  clear()

  await writeDraft(llm, { title: 'T', channel: 'C', chapters: [], description: '', lang: 'en' } as never, 'transcript').catch(() => undefined)
  expect(seen[0]).toContain(line)
  expect(seen[0]).toContain('Liều, công dụng hay lời khuyên nào video không nói thì vẫn không viết.')
  expect(seen[0]).toContain('Video không nói thì không viết') // the rule stays, with its one exception named
  clear()

  await reviewDraft(llm, 'transcript', { viTitle: 'T', summary: [], body: '<p>x</p>', faq: [] })
  expect(seen[0]).toContain(line)
  expect(seen[0]).toContain('That is no change of meaning and no added fact')
  expect(seen[0]).toContain('A dose, amount, use or advice with it that the video doesn\'t give is still a fault.')
  clear()

  const root = await mkdtemp(join(tmpdir(), 'topic-'))
  await mkdir(join(root, 'content/guides'), { recursive: true })
  await makeTopic(root, { research: llm, llm }, { topic: 'Đốm trắng', kind: 'disease' })
  const [, write, check] = seen
  expect(write).toContain(line)
  expect(write).toContain('Chỉ ghi hoạt chất, không thêm liều hay công dụng.')
  expect(check).toContain(line) // the checker holds the guide to its facts: the ingredient isn't a claim of its own
  expect(check).toContain('A dose, amount or use with it is not.')
  for (const p of seen) expect(p).not.toContain('{{FOREIGN_PRODUCTS}}')
})

// Held on the real files, as the engine leaves them.
test('every note the engine wrote has only figures the table holds', async () => {
  const dir = join(ROOT, 'content/guides')
  const left: Record<string, string[]> = {}
  for (const id of await readdir(dir)) {
    const raw = await readFile(join(dir, id, 'vi.json'), 'utf8').catch(() => null)
    const t = raw?.includes('"localNote"') ? JSON.parse(raw) as Translation : undefined
    // Written by hand (2026-11-07), with its own figures from its own sources (real-content.test.ts).
    if (!t?.localNote || id === 'aquariumcoop-blogs-aquarium-blue-green-algae') continue
    const out = figuresOutsideTable(t.localNote.html)
    if (out.length) left[id] = out
  }
  expect(left).toEqual({})
})

test('a guide\'s text for these checks has no tags or entities', () => {
  expect(guideText({ name: 'A', body: '<p>B &amp; <strong>C</strong></p>', summary: ['D'], faq: [{ q: 'E', a: 'F' }] })).toBe('A B & C D E F')
})
