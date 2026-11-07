import { execFileSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { LlmError, type Llm } from '../src/claude'
import { fitKey, fitText, type FitState } from '../src/fit'
import { changedFiles, fitPct, fitSummary, gate, gateCall, gateChecks, wrongChecks } from '../src/gate'
import { loadPages, type Page } from '../src/pages'

const FIXTURE = new URL('../../../apps/site/test/fixture-content', import.meta.url).pathname
const GUIDE = 'content/guides/youtube-r53ZQW0m8VM/vi.json'
const git = (root: string, ...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' })

/** The fixture content in a repository of its own, committed. */
async function repo() {
  const root = await mkdtemp(join(tmpdir(), 'gate-'))
  await cp(FIXTURE, join(root, 'content'), { recursive: true })
  await mkdir(join(root, 'engine-state'))
  git(root, 'init', '-q'); git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '.'); git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'base')
  return root
}
const readJson = async (root: string, f: string) => JSON.parse(await readFile(join(root, f), 'utf8'))
const edit = async (root: string, f: string, change: (t: Record<string, unknown>) => void) => {
  const t = await readJson(root, f); change(t); await writeFile(join(root, f), `${JSON.stringify(t, null, 2)}\n`)
}
/** A reader that finds a foreign shop wherever "Petco" is, and a shop's kit wherever "Aqueon" is. */
const reader = (calls: string[] = []): Llm => (async ({ prompt }: { prompt: string }) => {
  calls.push(prompt)
  return {
    findings: [
      ...(prompt.includes('Petco') ? [{ check: 'shop', part: 'P1', quote: 'Petco', why: 'a US shop', fix: '', product: '' }] : []),
      ...(prompt.includes('Aqueon') ? [{ check: 'kit', part: 'P1', quote: 'Aqueon', why: 'one shop\'s kit', fix: '', product: '' }] : []),
    ],
    products: [], doses: [],
  }
}) as Llm
const now = () => new Date('2026-11-09T00:00:00Z')

test('what the gate does with a page, from its checks now and before', () => {
  const s = (...c: string[]) => new Set(c) as Set<never>
  expect(gateCall(s('shop'), { isNew: true, wasHeld: false })).toEqual({ action: 'hold', checks: ['shop'] })
  expect(gateCall(s(), { isNew: true, wasHeld: false }).action).toBe('pass')
  expect(gateCall(s('units', 'shop'), { isNew: false, wasHeld: false, before: s('units') })).toEqual({ action: 'revert', checks: ['shop'] })
  expect(gateCall(s('units'), { isNew: false, wasHeld: false, before: s('units', 'shop') }).action).toBe('pass')
  expect(gateCall(s(), { isNew: false, wasHeld: true }).action).toBe('release')
  expect(gateCall(s('units'), { isNew: false, wasHeld: true }).action).toBe('hold')
  expect(gateCall(s('kit'), { isNew: false, wasHeld: false, before: s('kit') })).toEqual({ action: 'hold', checks: ['kit'] })
})

test('a new page that fails is held, and one that passes goes out', async () => {
  const root = await repo()
  const dir = 'content/guides/youtube-r53ZQW0m8VM'
  for (const id of ['new-bad', 'new-good']) await cp(join(root, dir), join(root, `content/guides/${id}`), { recursive: true })
  for (const id of ['new-bad', 'new-good']) await edit(root, `content/guides/${id}/entity.json`, e => { e.id = id })
  await edit(root, 'content/guides/new-bad/vi.json', t => { t.slug = 'new-bad'; t.body = '<p>Mua lọc ở Petco.</p>' })
  await edit(root, 'content/guides/new-good/vi.json', t => { t.slug = 'new-good'; t.body = '<p>Lọc vi sinh hợp bể nhỏ.</p>' })
  expect(changedFiles(root)).toEqual(expect.arrayContaining(['content/guides/new-bad/vi.json', 'content/guides/new-good/vi.json']))
  const { report } = await gate(root, { llm: reader(), now })
  expect((await readJson(root, 'content/guides/new-bad/vi.json')).held).toEqual({ checks: ['shop'], at: '2026-11-09' })
  expect((await readJson(root, 'content/guides/new-good/vi.json')).held).toBeUndefined()
  expect(report.hold).toHaveLength(1)
})

test('a live page that got worse gets its committed text back; one no worse keeps its new text', async () => {
  const root = await repo()
  const before = await readFile(join(root, GUIDE), 'utf8')
  await edit(root, GUIDE, t => { t.body = `${t.body as string}<p>Mua ở Petco.</p>` })
  const calls: string[] = []
  const r = await gate(root, { llm: reader(calls), now })
  expect(await readFile(join(root, GUIDE), 'utf8')).toBe(before)
  expect(r.report.revert).toHaveLength(1)
  expect(calls).toHaveLength(2) // the new text, and the old one, never read before
  // The saved read is the old text's, as it stays.
  const page = (await loadPages(join(root, 'content'), ['vi'])).find(p => p.id === 'youtube-r53ZQW0m8VM')!
  expect(r.state[fitKey(page)]!.hash).toBe(fitText(page).hash)

  await edit(root, GUIDE, t => { t.body = `${t.body as string}<p>Thay nước mỗi tuần.</p>` })
  const again = await gate(root, { llm: reader(), now })
  expect(again.report.pass).toHaveLength(1)
  expect(await readFile(join(root, GUIDE), 'utf8')).toContain('Thay nước mỗi tuần')
})

test('a fault the old text had too, found again on a fresh read, is not worse', async () => {
  const root = await repo()
  await edit(root, GUIDE, t => { t.body = `<p>Mua ở Petco.</p>${t.body as string}` })
  git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qam', 'Petco')
  // The old text's saved read missed it; the new text is found with it.
  const old = (await loadPages(join(root, 'content'), ['vi'])).find(p => p.id === 'youtube-r53ZQW0m8VM')!
  await writeFile(join(root, 'engine-state/_fit.json'), JSON.stringify({ [fitKey(old)]: { at: '2026-11-08', hash: fitText(old).hash, model: 'opus', checklist: 2, findings: [], products: [] } } satisfies FitState))
  await edit(root, GUIDE, t => { t.body = `${t.body as string}<p>Thay nước mỗi tuần.</p>` })
  const r = await gate(root, { llm: reader(), now })
  expect(r.report.pass).toHaveLength(1)
  expect(await readFile(join(root, GUIDE), 'utf8')).toContain('Thay nước mỗi tuần')
})

test('a held page that changed and passes is let out; a kit holds a page the cycle didn\'t touch', async () => {
  const root = await repo()
  await edit(root, GUIDE, t => { t.held = { checks: ['shop'], at: '2026-11-08' } })
  git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qam', 'held')
  await edit(root, GUIDE, t => { t.body = '<p>Lọc vi sinh hợp bể nhỏ.</p>' })
  await gate(root, { llm: reader(), now })
  expect((await readJson(root, GUIDE)).held).toBeUndefined()

  git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qam', 'out')
  const page = (await loadPages(join(root, 'content'), ['vi'])).find(p => p.id === 'youtube-r53ZQW0m8VM')!
  const state = await readJson(root, 'engine-state/_fit.json') as FitState
  state[fitKey(page)]!.findings = [{ check: 'kit', part: 'P1', quote: 'Lọc vi sinh', why: 'kit', by: 'model' }]
  await writeFile(join(root, 'engine-state/_fit.json'), JSON.stringify(state))
  const calls: string[] = []
  await gate(root, { llm: reader(calls), now })
  expect(calls).toHaveLength(0)
  expect((await readJson(root, GUIDE)).held).toEqual({ checks: ['kit'], at: '2026-11-09' })
})

test('with the accounts out, a new page waits held and a live one goes on as the cycle made it', async () => {
  const root = await repo()
  const dir = 'content/guides/youtube-r53ZQW0m8VM'
  await cp(join(root, dir), join(root, 'content/guides/new-one'), { recursive: true })
  await edit(root, 'content/guides/new-one/entity.json', e => { e.id = 'new-one' })
  await edit(root, 'content/guides/new-one/vi.json', t => { t.slug = 'new-one'; t.body = '<p>Mới.</p>' })
  await edit(root, GUIDE, t => { t.body = '<p>Đã sửa.</p>' })
  const out = (async () => { throw new LlmError('usage limit reached') }) as Llm
  const { report } = await gate(root, { llm: out, now })
  expect(report.stopped).toContain('limit')
  expect((await readJson(root, 'content/guides/new-one/vi.json')).held).toEqual({ checks: [], at: '2026-11-09' })
  expect(report.unread).toHaveLength(1)
  expect((await readJson(root, GUIDE)).body).toBe('<p>Đã sửa.</p>')
  // Read next time, though the cycle didn't change it again.
  await gate(root, { llm: reader(), now })
  expect((await readJson(root, 'content/guides/new-one/vi.json')).held).toBeUndefined()
})

test('several pages put back in one run, read three at a time', async () => {
  const root = await repo()
  const files = ['content/guides/youtube-r53ZQW0m8VM/vi.json', 'content/guides/youtube-vl1Lx9iWDYU/vi.json']
  const before = await Promise.all(files.map(f => readFile(join(root, f), 'utf8')))
  for (const f of files) await edit(root, f, t => { t.body = `${t.body as string}<p>Mua ở Petco.</p>` })
  const { report } = await gate(root, { llm: reader(), now, jobs: 3 })
  expect(report.revert).toHaveLength(2)
  expect(report.failed).toEqual([])
  expect(await Promise.all(files.map(f => readFile(join(root, f), 'utf8')))).toEqual(before)
})

test('a product whose market here is unknown counts against a page, but holds nothing back', () => {
  const th: Page = { lang: 'th', kind: 'guides', id: 'g', title: 'T', path: '/th/x/g/', fields: [{ field: 'body', html: '<p>API General Cure</p>' }], lines: [], captions: [], latinNames: [], card: [] }
  const e = { at: '2026-11-09', hash: fitText(th).hash, model: 'opus', findings: [], products: ['API General Cure'] }
  expect([...wrongChecks(th, e)]).toEqual(['product'])
  expect([...gateChecks(th, e)]).toEqual([])
  // In Vietnamese the table knows: a product hard to find here holds a page.
  const vi = { ...th, lang: 'vi' as const }
  expect([...gateChecks(vi, { ...e, hash: fitText(vi).hash, products: ['Maracyn'] })]).toEqual(['product'])
})

const guidePage = async (root: string) => (await loadPages(join(root, 'content'), ['vi'])).find(p => p.id === 'youtube-r53ZQW0m8VM')!
const saveState = (root: string, state: FitState) => writeFile(join(root, 'engine-state/_fit.json'), JSON.stringify(state))
const commit = (root: string, m: string) => git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qam', m)
const ELSEWHERE = { check: 'elsewhere' as const, part: 'P1', quote: 'Cây cần phân đều đặn', why: 'x', by: 'model' as const }

test('a fault the old text\'s saved read had is not worse, though a fresh read would miss it', async () => {
  const root = await repo()
  const old = await guidePage(root)
  await saveState(root, { [fitKey(old)]: { at: '2026-11-08', hash: fitText(old).hash, model: 'opus', checklist: 2, findings: [ELSEWHERE], products: [] } })
  await edit(root, GUIDE, t => { t.body = `${t.body as string}<p>Thay nước mỗi tuần.</p>` })
  const calls: string[] = []
  // This reader finds it on the new text only.
  const llm = (async (a: { prompt: string }) => { calls.push(a.prompt); return { findings: a.prompt.includes('Thay nước') ? [{ ...ELSEWHERE, fix: '', product: '' }] : [], products: [], doses: [] } }) as Llm
  const r = await gate(root, { llm, now })
  expect(r.report.pass).toHaveLength(1)
  expect(calls).toHaveLength(1)
  expect(await readFile(join(root, GUIDE), 'utf8')).toContain('Thay nước mỗi tuần')
})

test('a held page a batch read has since passed is let out, with no call; one still failing keeps its date', async () => {
  const root = await repo()
  await edit(root, GUIDE, t => { t.held = { checks: [], at: '2026-11-08' } })
  commit(root, 'held unread')
  const p = await guidePage(root)
  await saveState(root, { [fitKey(p)]: { at: '2026-11-09', hash: fitText(p).hash, model: 'opus', checklist: 2, findings: [], products: [] } })
  const calls: string[] = []
  await gate(root, { llm: reader(calls), now })
  expect(calls).toHaveLength(0)
  expect((await readJson(root, GUIDE)).held).toBeUndefined()

  commit(root, 'out')
  await edit(root, GUIDE, t => { t.held = { checks: ['elsewhere'], at: '2026-11-08' } })
  commit(root, 'held')
  await saveState(root, { [fitKey(p)]: { at: '2026-11-09', hash: fitText(p).hash, model: 'opus', checklist: 2, findings: [ELSEWHERE], products: [] } })
  const r = await gate(root, { llm: reader(), now })
  expect((await readJson(root, GUIDE)).held).toEqual({ checks: ['elsewhere'], at: '2026-11-08' })
  expect(r.report.hold).toEqual([])
})

test('a text put back that no rewording fixes is held', async () => {
  const root = await repo()
  await edit(root, GUIDE, t => { t.body = `<p>Bể Aqueon.</p>${t.body as string}` })
  commit(root, 'kit')
  await edit(root, GUIDE, t => { t.body = (t.body as string).replace('<p>Bể Aqueon.</p>', '<p>Mua ở Petco.</p>') })
  const r = await gate(root, { llm: reader(), now })
  expect(r.report.revert).toHaveLength(1)
  expect(await readJson(root, GUIDE)).toMatchObject({ body: expect.stringContaining('Bể Aqueon'), held: { checks: ['kit'], at: '2026-11-09' } })
})

test('outside Vietnam, a dose of a product no table knows the market for holds nothing back', () => {
  const th: Page = { lang: 'th', kind: 'guides', id: 'g', title: 'T', path: '/th/x/g/', fields: [{ field: 'body', html: '<p>Seachem Prime 5 ml ต่อ 40 ลิตร</p>' }], lines: [], captions: [], latinNames: [], card: [] }
  const e = { at: '2026-11-09', hash: fitText(th).hash, model: 'opus', findings: [{ check: 'dose' as const, part: 'P1', quote: 'Seachem Prime 5 ml', why: 'x', product: 'Seachem Prime', by: 'model' as const }], products: [] }
  expect(wrongChecks(th, e).has('dose')).toBe(true)
  expect(gateChecks(th, e).has('dose')).toBe(false)
})

test('the owner\'s number counts a page whose dose clashes with another page\'s, as the baseline did', () => {
  const p = (id: string, quote: string, amount: number): [Page, FitState[string]] => {
    const q: Page = { lang: 'vi', kind: 'guides', id, title: id, path: `/vi/x/${id}/`, fields: [{ field: 'body', html: `<p>${quote}</p>` }], lines: [], captions: [], latinNames: [], card: [] }
    return [q, { at: '2026-11-08', hash: fitText(q).hash, model: 'opus', findings: [], products: [], doses: [{ treatment: 'salt', strength: '', amount, amountMax: 0, unit: 'g', per: 1, perUnit: 'litre', use: 'fungus', method: 'wholeTank', quote }] }]
  }
  const xs = [p('a', '1 g muối mỗi lít', 1), p('b', '10 g muối mỗi lít', 10)]
  expect(fitPct(xs.map(x => x[0]), Object.fromEntries(xs.map(([q, e]) => [fitKey(q), e])), 'vi')).toMatchObject({ wrong: 2, pct: 100 })
})

test('the owner\'s number: pages wrong for the reader, scaled kind by kind from the pages read', async () => {
  const p = (kind: Page['kind'], id: string): Page => ({ lang: 'vi', kind, id, title: id, path: `/vi/x/${id}/`, fields: [{ field: 'body', html: `<p>${id}</p>` }], lines: [], captions: [], latinNames: [], card: [] })
  // 2 guides of 4 read, one wrong; 1 species of 4 read, passing: (4 × 1/2 + 4 × 0) / 8.
  const pages = [...['g1', 'g2', 'g3', 'g4'].map(id => p('guides', id)), ...['s1', 's2', 's3', 's4'].map(id => p('species', id))]
  const e = (q: Page, findings: FitState[string]['findings'] = []) => ({ at: '2026-11-08', hash: fitText(q).hash, model: 'opus', findings, products: [] })
  const state: FitState = { [fitKey(pages[0]!)]: e(pages[0]!, [{ check: 'units', part: 'P1', quote: 'g1', why: 'x', by: 'model' }]), [fitKey(pages[1]!)]: e(pages[1]!), [fitKey(pages[4]!)]: e(pages[4]!) }
  expect(fitPct(pages, state, 'vi')).toEqual({ pages: 8, read: 3, wrong: 1, pct: 25 })
  const s = fitSummary(pages, state, new Map(), '2026-11-09')
  expect(s.langs.vi).toEqual({ pages: 8, read: 3, wrong: 1, pct: 25, held: 0 })
  expect(s.sample).toHaveLength(3)
  expect(s.labels.kit).toBeTruthy()
  expect(fitSummary(pages, state, new Map(), '2026-11-09').sample).toEqual(s.sample)
})
