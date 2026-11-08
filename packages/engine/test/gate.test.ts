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
/** A reader that finds a foreign shop wherever "Petco" is, a shop's kit wherever "Aqueon" is, and harm wherever "tắt lọc" is. */
const reader = (calls: string[] = []): Llm => (async ({ prompt }: { prompt: string }) => {
  calls.push(prompt)
  return {
    findings: [
      ...(prompt.includes('Petco') ? [{ check: 'shop', part: 'P1', quote: 'Petco', why: 'a US shop', fix: '', product: '' }] : []),
      ...(prompt.includes('Aqueon') ? [{ check: 'kit', part: 'P1', quote: 'Aqueon', why: 'one shop\'s kit', fix: '', product: '' }] : []),
      ...(prompt.includes('tắt lọc') ? [{ check: 'harm', part: 'P1', quote: 'tắt lọc', why: 'fish suffocate', fix: '', product: '' }] : []),
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
  // Advice that would hurt holds a page as a kit does; a live page whose new text brought it gets its old text back.
  expect(gateCall(s('harm'), { isNew: true, wasHeld: false })).toEqual({ action: 'hold', checks: ['harm'] })
  expect(gateCall(s('harm'), { isNew: false, wasHeld: false, before: s('harm') })).toEqual({ action: 'hold', checks: ['harm'] })
  expect(gateCall(s('harm'), { isNew: false, wasHeld: false, before: s() })).toEqual({ action: 'revert', checks: ['harm'] })
  expect(gateCall(s('harm', 'kit'), { isNew: false, wasHeld: false, before: s('kit') })).toEqual({ action: 'revert', checks: ['harm'] })
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

test('with the accounts out, a new page waits held and a live one keeps its committed text; over the limit too', async () => {
  const root = await repo()
  const before = await readFile(join(root, GUIDE), 'utf8')
  const dir = 'content/guides/youtube-r53ZQW0m8VM'
  await cp(join(root, dir), join(root, 'content/guides/new-one'), { recursive: true })
  await edit(root, 'content/guides/new-one/entity.json', e => { e.id = 'new-one' })
  await edit(root, 'content/guides/new-one/vi.json', t => { t.slug = 'new-one'; t.body = '<p>Mới.</p>' })
  await edit(root, GUIDE, t => { t.body = '<p>Đã sửa.</p>' })
  const out = (async () => { throw new LlmError('usage limit reached') }) as Llm
  const { report } = await gate(root, { llm: out, now })
  expect(report.stopped).toContain('limit')
  expect((await readJson(root, 'content/guides/new-one/vi.json')).held).toEqual({ checks: [], at: '2026-11-09' })
  expect(report.unread).toHaveLength(2)
  expect(report.hold).toEqual([])
  expect(await readFile(join(root, GUIDE), 'utf8')).toBe(before)
  // Read next time, though the cycle didn't change it again.
  await gate(root, { llm: reader(), now })
  expect((await readJson(root, 'content/guides/new-one/vi.json')).held).toBeUndefined()

  // A limit of none reads nothing: the same.
  await edit(root, GUIDE, t => { t.body = '<p>Đã sửa lần nữa.</p>' })
  expect((await gate(root, { llm: reader(), now, limit: 0 })).report.unread).toHaveLength(1)
  expect(await readFile(join(root, GUIDE), 'utf8')).toBe(before)
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

test('a live page that harm was found on is held, changed or not; one a cycle made harmful gets its old text back', async () => {
  const root = await repo()
  const page = (await loadPages(join(root, 'content'), ['vi'])).find(p => p.id === 'youtube-r53ZQW0m8VM')!
  await writeFile(join(root, 'engine-state/_fit.json'), JSON.stringify({ [fitKey(page)]: { at: '2026-11-09', hash: fitText(page).hash, model: 'opus', checklist: 3, findings: [{ check: 'harm', part: 'P1', quote: 'Lọc', why: 'x', by: 'model' }], products: [] } }))
  await gate(root, { llm: reader(), now })
  expect((await readJson(root, GUIDE)).held).toEqual({ checks: ['harm'], at: '2026-11-09' })

  const fresh = await repo()
  const before = await readFile(join(fresh, GUIDE), 'utf8')
  await edit(fresh, GUIDE, t => { t.body = `${t.body as string}<p>Muốn bắt cá thì tắt lọc cho cá ngáp.</p>` })
  const r = await gate(fresh, { llm: reader(), now })
  expect(r.report.revert).toHaveLength(1)
  expect(await readFile(join(fresh, GUIDE), 'utf8')).toBe(before)
  expect((await readJson(fresh, GUIDE)).held).toBeUndefined()

  // With the accounts out, a changed page is put back, and held when its old text was read as harmful.
  const out = await repo()
  const committed = (await loadPages(join(out, 'content'), ['vi'])).find(p => p.id === 'youtube-r53ZQW0m8VM')!
  await writeFile(join(out, 'engine-state/_fit.json'), JSON.stringify({ [fitKey(committed)]: { at: '2026-11-09', hash: fitText(committed).hash, model: 'opus', checklist: 3, findings: [{ check: 'harm', part: 'P1', quote: 'Lọc', why: 'x', by: 'model' }], products: [] } }))
  const text = await readFile(join(out, GUIDE), 'utf8')
  await edit(out, GUIDE, t => { t.body = `${t.body as string}<p>Thay nước mỗi tuần.</p>` })
  const none = (async () => { throw new LlmError('usage limit reached') }) as Llm
  const o = await gate(out, { llm: none, now })
  expect(o.report.unread).toHaveLength(1)
  expect(JSON.parse(await readFile(join(out, GUIDE), 'utf8'))).toEqual({ ...JSON.parse(text), held: { checks: ['harm'], at: '2026-11-09' } })
})

test('harm found in one language holds the page in every language, read there or not, and once held it stays held as it was', async () => {
  const root = await repo()
  const th = GUIDE.replace('/vi.json', '/th.json')
  await writeFile(join(root, th), await readFile(join(root, GUIDE), 'utf8'))
  git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '.'); git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'th')
  const vi = (await loadPages(join(root, 'content'), ['vi'])).find(p => p.id === 'youtube-r53ZQW0m8VM')!
  await writeFile(join(root, 'engine-state/_fit.json'), JSON.stringify({ [fitKey(vi)]: { at: '2026-11-09', hash: fitText(vi).hash, model: 'opus', checklist: 3, findings: [{ check: 'harm', part: 'P1', quote: 'Lọc', why: 'x', by: 'model' }], products: [] } }))
  const calls: string[] = []
  await gate(root, { llm: reader(calls), now })
  expect(calls).toHaveLength(0)
  expect((await readJson(root, GUIDE)).held).toEqual({ checks: ['harm'], at: '2026-11-09' })
  expect((await readJson(root, th)).held).toEqual({ checks: ['harm'], at: '2026-11-09' })
  // The Thai page read since and passing: held still, while the Vietnamese one has it, from its first day.
  const thPage = (await loadPages(join(root, 'content'), ['th'])).find(p => p.id === 'youtube-r53ZQW0m8VM')!
  const state = await readJson(root, 'engine-state/_fit.json') as FitState
  state[fitKey(thPage)] = { at: '2026-11-10', hash: fitText(thPage).hash, model: 'opus', checklist: 3, findings: [], products: [] }
  await writeFile(join(root, 'engine-state/_fit.json'), JSON.stringify(state))
  const r = await gate(root, { llm: reader(), now: () => new Date('2026-11-10T00:00:00Z') })
  expect(r.report.release).toEqual([])
  expect((await readJson(root, th)).held).toEqual({ checks: ['harm'], at: '2026-11-09' })
})

test('a new guide that comes in two languages, one harmful, is held in both, whichever is read first', async () => {
  const root = await repo()
  const dir = 'content/guides/youtube-r53ZQW0m8VM'
  await cp(join(root, dir), join(root, 'content/guides/new-two'), { recursive: true })
  await edit(root, 'content/guides/new-two/entity.json', e => { e.id = 'new-two' })
  await edit(root, 'content/guides/new-two/vi.json', t => { t.slug = 'new-two'; t.body = '<p>Muốn bắt cá thì tắt lọc cho cá ngáp.</p>' })
  await writeFile(join(root, 'content/guides/new-two/th.json'), JSON.stringify({ ...(await readJson(root, 'content/guides/new-two/vi.json')), body: '<p>ปลาชอบน้ำสะอาด</p>' }))
  await gate(root, { llm: reader(), now })
  expect((await readJson(root, 'content/guides/new-two/vi.json')).held).toEqual({ checks: ['harm'], at: '2026-11-09' })
  expect((await readJson(root, 'content/guides/new-two/th.json')).held).toMatchObject({ checks: ['harm'] })
})

test('a dose the rules call harmful holds a page with no read, in every language; a text put back is held for its own, not for the one it replaced', async () => {
  const commit = (root: string) => { git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '.'); git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'x') }
  const th = GUIDE.replace('/vi.json', '/th.json')
  const overdose = (t: Record<string, unknown>) => { t.body = `${t.body as string}<p>Kanamycin ngâm: 2–5 g/L.</p>` }
  // Live, never read, the cycle didn't touch it: held with no call, and its Thai page with it.
  const root = await repo()
  await writeFile(join(root, th), await readFile(join(root, GUIDE), 'utf8'))
  await edit(root, GUIDE, overdose)
  commit(root)
  const calls: string[] = []
  await gate(root, { llm: reader(calls), now })
  expect(calls).toEqual([])
  expect((await readJson(root, GUIDE)).held).toEqual({ checks: ['harm'], at: '2026-11-09' })
  expect((await readJson(root, th)).held).toEqual({ checks: ['harm'], at: '2026-11-09' })

  // A cycle brings it: the old text comes back, not held, nor is its Thai page; read, or with the accounts out.
  const none = (async () => { throw new LlmError('usage limit reached') }) as Llm
  for (const llm of [reader(), none]) {
    const brought = await repo()
    await writeFile(join(brought, th), await readFile(join(brought, GUIDE), 'utf8'))
    commit(brought)
    const before = await readFile(join(brought, GUIDE), 'utf8')
    await edit(brought, GUIDE, overdose)
    await gate(brought, { llm, now })
    expect(await readFile(join(brought, GUIDE), 'utf8')).toBe(before)
    expect((await readJson(brought, th)).held).toBeUndefined()
  }

  // The committed text has it and the change can't be read: put back, and held for its own.
  const had = await repo()
  await edit(had, GUIDE, overdose)
  commit(had)
  const committed = await readFile(join(had, GUIDE), 'utf8')
  await edit(had, GUIDE, t => { t.body = (t.body as string).replace('<p>Kanamycin ngâm: 2–5 g/L.</p>', '<p>Thay nước mỗi tuần.</p>') })
  await gate(had, { llm: none, now })
  expect(JSON.parse(await readFile(join(had, GUIDE), 'utf8'))).toEqual({ ...JSON.parse(committed), held: { checks: ['harm'], at: '2026-11-09' } })
})

test('harm is counted from the text each language ends with: a rejected text holds no other page, a text put back holds them all, and the rules\' harm costs no read', async () => {
  const commitAll = (root: string) => { git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '.'); git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'x') }
  const th = GUIDE.replace('/vi.json', '/th.json')
  const overdose = (t: Record<string, unknown>) => { t.body = `${t.body as string}<p>Kanamycin ngâm: 2–5 g/L.</p>` }
  const harmless = (t: Record<string, unknown>) => { t.body = `${t.body as string}<p>Thay nước mỗi tuần.</p>` }
  const none = (async () => { throw new LlmError('usage limit reached') }) as Llm
  // Both languages changed, one new text harmful: it is put back and the other keeps its new text, unheld, whichever is
  // harmful, read or with the accounts out. The harmful text is never read.
  for (const [bad, good] of [[GUIDE, th], [th, GUIDE]] as const) {
    for (const llm of [reader, () => none]) {
      const root = await repo()
      await writeFile(join(root, th), await readFile(join(root, GUIDE), 'utf8'))
      commitAll(root)
      const committed = await readFile(join(root, bad), 'utf8')
      await edit(root, bad, overdose)
      await edit(root, good, harmless)
      const changedGood = await readFile(join(root, good), 'utf8')
      const calls: string[] = []
      await gate(root, { llm: llm === reader ? reader(calls) : none, now })
      expect(await readFile(join(root, bad), 'utf8')).toBe(committed)
      expect(calls.some(c => c.includes('Kanamycin'))).toBe(false)
      if (llm === reader) expect(await readFile(join(root, good), 'utf8')).toBe(changedGood)
      expect((await readJson(root, good)).held).toBeUndefined()
      expect((await readJson(root, bad)).held).toBeUndefined()
    }
  }
  // The committed text has the harm and its change, which can't be read, is put back: the page is held in every language
  // in that run.
  const had = await repo()
  await writeFile(join(had, th), await readFile(join(had, GUIDE), 'utf8'))
  await edit(had, GUIDE, overdose)
  commitAll(had)
  await edit(had, GUIDE, t => { t.body = (t.body as string).replace('<p>Kanamycin ngâm: 2–5 g/L.</p>', '<p>Thay nước mỗi tuần.</p>') })
  await gate(had, { llm: none, now })
  expect((await readJson(had, GUIDE)).held).toEqual({ checks: ['harm'], at: '2026-11-09' })
  expect((await readJson(had, th)).held).toEqual({ checks: ['harm'], at: '2026-11-09' })
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

/** A card in the repository's working tree: its entity and one language's text. */
async function card(root: string, id: string, text: Record<string, unknown>, lang = 'vi') {
  await mkdir(join(root, 'content/cards', id), { recursive: true })
  const entity = { id, type: 'trivia', about: [], sources: [{ url: 'https://example.org/a', title: 'A', publisher: 'P', date: '2026-11-01', accessed: '2026-11-08' }], show: { from: '2026-11-10', until: '2026-12-01' }, updatedAt: '2026-11-08' }
  await writeFile(join(root, 'content/cards', id, 'entity.json'), `${JSON.stringify(entity, null, 2)}\n`)
  await writeFile(join(root, 'content/cards', id, `${lang}.json`), `${JSON.stringify({ eyebrow: 'Có thể bạn chưa biết', title: 'Cá betta thở bằng mê lộ', ...text }, null, 2)}\n`)
}

test("a card is read and held like a page; the report and the owner's number leave it out", async () => {
  const root = await repo()
  await card(root, 'card-bad', { body: '<p>Mua ở Petco.</p>' })
  await card(root, 'card-good', { body: '<p>Cá betta lên mặt nước đớp khí.</p>' })
  expect(changedFiles(root)).toEqual(expect.arrayContaining(['content/cards/card-bad/vi.json', 'content/cards/card-good/vi.json']))
  const r = await gate(root, { llm: reader(), now })
  expect((await readJson(root, 'content/cards/card-bad/vi.json')).held).toEqual({ checks: ['shop'], at: '2026-11-09' })
  expect((await readJson(root, 'content/cards/card-good/vi.json')).held).toBeUndefined()
  expect(r.report.hold).toEqual(['/vi/cards/card-bad/ (shop)'])
  expect(r.pages.some(p => p.kind === 'cards')).toBe(false)
  expect(fitSummary(r.pages, r.state, r.held, '2026-11-09').langs.vi?.held).toBe(0)
})

test('a held card that passes now is let out: the gate sees held cards, which the build leaves out', async () => {
  const root = await repo()
  await card(root, 'card-held', { body: '<p>Cá betta lên mặt nước đớp khí.</p>', held: { checks: ['shop'], at: '2026-11-08' } })
  git(root, 'add', '.'); git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'a held card')
  const r = await gate(root, { llm: reader(), now })
  expect((await readJson(root, 'content/cards/card-held/vi.json')).held).toBeUndefined()
  expect(r.report.release).toEqual(['/vi/cards/card-held/'])
})
