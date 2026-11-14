import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { LlmError, type Llm } from '../src/claude'
import { fitKey, fitText, type FitFinding, type FitState } from '../src/fit'
import { changedFiles, fitPct, fitSummary, gate, gateCall, gateChecks, HELD_BY_HAND, putBackFile, wrongChecks } from '../src/gate'
import { localizeSpecies, partHash } from '../src/localize'
import { loadPages, type Page } from '../src/pages'
import { plantsWithoutPlanting } from '../src/planting'
import { lastKept, logReviews, readReviews } from '../src/review-log'
import { needsFetch, type UrlState } from '../src/state'
import { rewriteExisting } from '../src/vi-backfill'
import { VI_WRITE } from '../src/vi-rewrite'

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

test('a text put back is the page\'s again in the review log: reviews of the text it replaced stop counting', async () => {
  const root = await repo()
  const guide = { id: 'guides/youtube-r53ZQW0m8VM', lang: 'vi' }
  const other = { id: 'species/betta-splendens', lang: 'vi' }
  const old = { score: 0.8, notes: ['the text readers have'] }
  await logReviews(root, 'video-guide', guide, [old], old, { now: new Date('2026-11-01T00:00:00Z') })
  git(root, 'add', '.'); git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'reviews')
  // This run rewrites the guide and reviews it, and reviews another page it doesn't put back.
  await edit(root, GUIDE, t => { t.body = `${t.body as string}<p>Mua ở Petco.</p>` })
  const rewritten = { score: 0.9, notes: ['the rewrite'] }
  await logReviews(root, 'video-guide', guide, [rewritten], rewritten, { now: new Date('2026-11-09T00:00:00Z') })
  await logReviews(root, 'translation', other, [rewritten], rewritten, { now: new Date('2026-11-09T00:00:00Z') })

  expect((await gate(root, { llm: reader(), now })).report.revert).toHaveLength(1)
  expect((await lastKept(root, guide, ['video-guide']))?.notes).toEqual(['the text readers have'])
  expect((await readReviews(root, 'video-guide'))['vi/guides/youtube-r53ZQW0m8VM']!.map(t => t.kept)).toEqual([false, true])
  expect((await lastKept(root, other, ['translation']))?.notes).toEqual(['the rewrite'])
})

const PUT_BACK = 'engine-state/put-back/guides/youtube-r53ZQW0m8VM.vi.json'
/** A mender that takes the paragraphs naming Petco out of the guide, as the video's editor would, and says what it was sent. */
const cutter = (root: string, sent: FitFinding[][] = [], file = GUIDE) => async (_p: Page, findings: FitFinding[]) => {
  sent.push(findings)
  await edit(root, file, t => { t.body = (t.body as string).replace(/<p>[^<]*Petco[^<]*<\/p>/g, '') })
  return true
}

// The recheck job's runs of 8 to 10 Nov 2026 put 94 new texts back, 43 of them ones the video reviewer had passed, most
// for one check, and kept none of them: each guide had had its one go.
test('a text worse for a sentence the mender may fix is mended and read again, not put back: only the new faults are sent', async () => {
  const root = await repo()
  // The text readers have converts a tank from gallons, which a read of it finds; the new text also names a shop abroad.
  await edit(root, GUIDE, t => { t.body = `${t.body as string}<p>Bể 38 lít là đủ.</p>` })
  git(root, 'add', '.'); git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'units')
  await edit(root, GUIDE, t => { t.body = `${t.body as string}<p>Mua ở Petco.</p><p>Thay nước mỗi tuần.</p>` })
  const calls: string[] = [], sent: FitFinding[][] = []
  const r = await gate(root, { llm: reader(calls), now, mend: cutter(root, sent) })
  expect(r.report.revert).toEqual([])
  expect(r.report.mended).toEqual(['/vi/huong-dan/' + (await readJson(root, GUIDE)).slug + '/ (shop)'])
  expect(r.report.pass).toHaveLength(1)
  const body = (await readJson(root, GUIDE)).body as string
  expect(body).toContain('Thay nước mỗi tuần')
  expect(body).not.toContain('Petco')
  expect(sent.map(fs => fs.map(f => [f.check, f.quote]))).toEqual([[['shop', 'Petco']]]) // not the units the old text has too
  expect(calls).toHaveLength(3) // the new text, the old one, the mended one
  // The saved read is of the text on disk, and nothing was thrown away, so nothing is saved.
  const page = (await loadPages(join(root, 'content'), ['vi'])).find(p => p.id === 'youtube-r53ZQW0m8VM')!
  expect(r.state[fitKey(page)]!.hash).toBe(fitText(page).hash)
  expect(r.pages.find(p => p.id === 'youtube-r53ZQW0m8VM')!.fields[0]!.html).not.toContain('Petco')
  expect(existsSync(join(root, PUT_BACK))).toBe(false)
})

test('a text put back is kept, with its checks and their quotes: the text before a mend that failed, not the mend', async () => {
  const root = await repo()
  const before = await readFile(join(root, GUIDE), 'utf8')
  await edit(root, GUIDE, t => { t.body = `${t.body as string}<p>Mua ở Petco.</p>` })
  expect((await gate(root, { llm: reader(), now })).report.revert).toHaveLength(1)
  expect(await readFile(join(root, GUIDE), 'utf8')).toBe(before)
  const kept = await readJson(root, PUT_BACK)
  expect(kept).toMatchObject({ at: '2026-11-09T00:00:00Z', checks: ['shop'], findings: [{ check: 'shop', quote: 'Petco', why: 'a US shop' }] })
  expect(kept.text.body).toContain('<p>Mua ở Petco.</p>')
  expect(kept.text.slug).toBe(JSON.parse(before).slug)

  // A mend that leaves the fault: the text goes back, and what is kept is the text the mender was given.
  await edit(root, GUIDE, t => { t.body = `${t.body as string}<p>Mua lọc ở Petco.</p>` })
  const worse = async () => { await edit(root, GUIDE, t => { t.body = `${t.body as string}<p>Hoặc Petco gần nhà.</p>` }); return true }
  const r = await gate(root, { llm: reader(), now, mend: worse })
  expect(r.report.revert).toHaveLength(1)
  expect(r.report.mended).toEqual([])
  expect(await readFile(join(root, GUIDE), 'utf8')).toBe(before)
  const again = await readJson(root, PUT_BACK)
  expect(again.text.body).toContain('<p>Mua lọc ở Petco.</p>')
  expect(again.text.body).not.toContain('gần nhà')
  const page = (await loadPages(join(root, 'content'), ['vi'])).find(p => p.id === 'youtube-r53ZQW0m8VM')!
  expect(r.state[fitKey(page)]!.hash).toBe(fitText(page).hash) // the old text's read, as it stays

  // A mender with nothing to offer (not a video guide, no transcript, an edit its reviewer fails): put back as before.
  await edit(root, GUIDE, t => { t.body = `${t.body as string}<p>Đặt hàng ở Petco.</p>` })
  expect((await gate(root, { llm: reader(), now, mend: async () => false })).report.revert).toHaveLength(1)
  expect((await readJson(root, PUT_BACK)).text.body).toContain('Đặt hàng ở Petco')
})

test('advice that would hurt is never the mender\'s to reword, and it mends so many pages a run', async () => {
  const root = await repo()
  const sent: FitFinding[][] = []
  await edit(root, GUIDE, t => { t.body = `${t.body as string}<p>Nên tắt lọc cho dễ bắt cá, rồi mua vợt ở Petco.</p>` })
  const r = await gate(root, { llm: reader(), now, mend: cutter(root, sent) })
  expect(r.report.revert).toEqual([expect.stringContaining('(harm, shop)')])
  expect(sent).toEqual([])
  expect((await readJson(root, PUT_BACK)).checks).toEqual(['harm', 'shop'])

  // Two guides worse for a shop, and one mend a run: one is mended, the other goes back and is kept.
  const OTHER = 'content/guides/youtube-vl1Lx9iWDYU/vi.json'
  for (const f of [GUIDE, OTHER]) await edit(root, f, t => { t.body = `${t.body as string}<p>Mua ở Petco.</p>` })
  const both = async (p: Page, fs: FitFinding[]) => cutter(root, sent, `content/guides/${p.id}/vi.json`)(p, fs)
  const capped = await gate(root, { llm: reader(), now, mend: both, mends: 1, jobs: 1 })
  expect(capped.report.mended).toHaveLength(1)
  expect(capped.report.revert).toHaveLength(1)
  expect(sent).toHaveLength(1)
})

// The pages run put back 10 fish pages on 11 Nov 2026 for a sentence a mender may fix. The video guides' mender turns
// each away with no call, and each would take one of the run's 6 mends: a guide after six of them would go back unmended.
test('a page the mender turns away, with no editor called, is not one of the run\'s mends', async () => {
  const root = await repo()
  const OTHER = 'content/guides/youtube-vl1Lx9iWDYU/vi.json'
  for (const f of [GUIDE, OTHER]) await edit(root, f, t => { t.body = `${t.body as string}<p>Mua ở Petco.</p>` })
  // The first page offered is turned away, the second goes to the editor.
  const sent: FitFinding[][] = []
  let offered = 0
  const second = async (p: Page, fs: FitFinding[]) => (offered++ ? cutter(root, sent, `content/guides/${p.id}/vi.json`)(p, fs) : undefined)
  const r = await gate(root, { llm: reader(), now, mend: second, mends: 1, jobs: 1 })
  expect(offered).toBe(2)
  expect(r.report.mended).toHaveLength(1)
  expect(r.report.revert).toHaveLength(1)
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

test('a sentence taken out isn\'t put back for a fault in the sentences left, which a read of the old text can miss', async () => {
  const root = await repo()
  await edit(root, GUIDE, t => { t.body = `<p>Ngâm cá trong nước biển.</p>${t.body as string}` })
  commit(root, 'seawater')
  await edit(root, GUIDE, t => { t.body = (t.body as string).replace('<p>Ngâm cá trong nước biển.</p>', '') })
  // Its first read, the new text's, finds a fault in a sentence both texts have; a read of the old text misses it, as a
  // second read can.
  const calls: string[] = []
  const llm = (async (a: { prompt: string }) => { calls.push(a.prompt); return { findings: calls.length === 1 ? [{ ...ELSEWHERE, fix: '', product: '' }] : [], products: [], doses: [], cautions: [] } }) as Llm
  const r = await gate(root, { llm, now })
  expect(r.report.pass).toHaveLength(1)
  expect(calls).toHaveLength(1)
  expect(await readFile(join(root, GUIDE), 'utf8')).not.toContain('nước biển')
})

/** A reader that finds what `first` gives on its first read, the new text's, and nothing on later ones. */
const firstOnly = (first: { findings?: object[]; doses?: object[] }, calls: string[] = []) => (async (a: { prompt: string }) => {
  calls.push(a.prompt)
  return { findings: [], products: [], doses: [], cautions: [], ...(calls.length === 1 ? first : {}) }
}) as Llm

test('a fault the old text has doesn\'t excuse a new one of the same check', async () => {
  const root = await repo()
  await edit(root, GUIDE, t => { t.body = `<p>Ở Mỹ người ta hay dùng phân này.</p>${t.body as string}` })
  commit(root, 'abroad')
  await edit(root, GUIDE, t => { t.body = `${t.body as string}<p>Đặt hàng từ Anh cho nhanh.</p>` })
  const f = (quote: string) => ({ check: 'elsewhere', part: 'P1', quote, why: 'abroad', fix: '', product: '' })
  const r = await gate(root, { llm: firstOnly({ findings: [f('Ở Mỹ người ta hay dùng phân này'), f('Đặt hàng từ Anh cho nhanh')] }), now })
  expect(r.report.revert).toHaveLength(1)
  expect(await readFile(join(root, GUIDE), 'utf8')).not.toContain('Đặt hàng từ Anh')
})

test('a sentence that loses its "not" is a new fault, though its words are in the old text: the old text goes back, not held', async () => {
  const root = await repo()
  await edit(root, GUIDE, t => { t.body = `<p>Không tắt lọc khi bắt cá.</p>${t.body as string}` })
  commit(root, 'filter')
  await edit(root, GUIDE, t => { t.body = (t.body as string).replace('Không tắt lọc', 'Tắt lọc') })
  const r = await gate(root, { llm: firstOnly({ findings: [{ check: 'harm', part: 'P1', quote: 'Tắt lọc khi bắt cá', why: 'fish suffocate', fix: '', product: '' }] }), now })
  expect(r.report.revert).toHaveLength(1)
  expect(r.report.hold).toEqual([])
  const t = await readJson(root, GUIDE)
  expect(t.body).toContain('Không tắt lọc khi bắt cá.')
  expect(t.held).toBeUndefined()
})

test('a sentence taken out that gave a dose its purpose is put back: the fault quotes the dose, which stays', async () => {
  const root = await repo()
  await edit(root, GUIDE, t => { t.body = `<p>Dùng xanh methylen 1 ml cho 10 lít. Cách này trị nấm.</p>${t.body as string}` })
  commit(root, 'dose')
  await edit(root, GUIDE, t => { t.body = (t.body as string).replace(' Cách này trị nấm.', '') })
  const dose = { treatment: 'xanh methylen', strength: '', amount: 1, amountMax: 1, unit: 'ml', per: 10, perUnit: 'l', use: '', method: 'bath', quote: 'Dùng xanh methylen 1 ml cho 10 lít' }
  const r = await gate(root, { llm: firstOnly({ doses: [dose] }), now })
  expect(r.report.revert).toHaveLength(1)
  expect(await readFile(join(root, GUIDE), 'utf8')).toContain('Cách này trị nấm.')
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

// The chief of staff, 2026-11-11: a catfish page filed under a marine worm's name is taken out of readers' view at once,
// in every language, with no model call, and stays out whatever writes it until the engine files it under the fish.
test('a page held by hand is held in every language it has, with no read, whatever writes it, until its line goes', async () => {
  const root = await repo()
  const VI = 'content/breeds/flowerhorn-cichlid/vi.json', MS = 'content/breeds/flowerhorn-cichlid/ms.json'
  await writeFile(join(root, HELD_BY_HAND), JSON.stringify({ 'breeds/flowerhorn-cichlid': { checks: ['taxon'], why: 'another animal\'s name', at: '2026-11-11' } }))
  await edit(root, VI, t => { t.name = 'Cá khác' })
  const calls: string[] = []
  const { report } = await gate(root, { llm: reader(calls), now })
  expect(calls).toHaveLength(0)
  for (const f of [VI, MS]) expect((await readJson(root, f)).held, f).toEqual({ checks: ['taxon'], at: '2026-11-11' })
  expect(report.hold).toHaveLength(2)
  git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qam', 'held by hand')

  // A writer that rewrites the page and drops the hold: held again, still unread.
  await edit(root, VI, t => { delete t.held; t.name = 'Cá khác nữa' })
  await gate(root, { llm: reader(calls), now })
  expect(calls).toHaveLength(0)
  expect((await readJson(root, VI)).held).toEqual({ checks: ['taxon'], at: '2026-11-11' })

  // Its line taken out: the gate reads it like any held page and lets it out when it passes.
  await writeFile(join(root, HELD_BY_HAND), '{}')
  await gate(root, { llm: reader(calls), now })
  expect(calls.length).toBeGreaterThan(0)
  for (const f of [VI, MS]) expect((await readJson(root, f)).held, f).toBeUndefined()
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

test('a text put back for harm that only its older read found holds its other languages; a harmful text changed and still harmful stays, held in each', async () => {
  const commitAll = (root: string) => { git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '.'); git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'x') }
  const th = GUIDE.replace('/vi.json', '/th.json')
  const harm = { checks: ['harm'], at: '2026-11-09' }
  for (const jobs of [1, 3]) {
    const root = await repo()
    await writeFile(join(root, th), await readFile(join(root, GUIDE), 'utf8'))
    commitAll(root)
    // The committed text's saved read found harm; read again it finds none, and the new text brings a kit.
    const vi = (await loadPages(join(root, 'content'))).find(p => p.lang === 'vi' && p.id === 'youtube-r53ZQW0m8VM')!
    const state: FitState = { [fitKey(vi)]: { at: '2026-11-01', hash: fitText(vi).hash, model: 'm', findings: [{ check: 'harm', part: 'P1', quote: 'x', why: 'fish suffocate', by: 'model' }], products: [], checklist: 3 } as never }
    await writeFile(join(root, 'engine-state/_fit.json'), JSON.stringify(state))
    await edit(root, GUIDE, t => { t.body = `<p>Bể Aqueon.</p>${t.body as string}` })
    await gate(root, { llm: reader(), now, jobs })
    expect((await readJson(root, GUIDE)).held, `jobs ${jobs}`).toEqual(harm)
    expect((await readJson(root, th)).held, `jobs ${jobs}`).toEqual(harm)
  }
  const none = (async () => { throw new LlmError('usage limit reached') }) as Llm
  const had = await repo()
  await writeFile(join(had, th), await readFile(join(had, GUIDE), 'utf8'))
  await edit(had, GUIDE, t => { t.body = `${t.body as string}<p>Kanamycin ngâm: 2–5 g/L.</p>` })
  commitAll(had)
  await edit(had, GUIDE, t => { t.body = `${t.body as string}<p>Thay nước mỗi tuần.</p>` })
  const changed = await readFile(join(had, GUIDE), 'utf8')
  await gate(had, { llm: none, now })
  expect(await readJson(had, GUIDE)).toEqual({ ...JSON.parse(changed), held: harm })
  expect((await readJson(had, th)).held).toEqual(harm)
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

/** The accounts are out: the message the gate treats as a limit, so a changed page is not read. */
const limited = (async () => { throw new LlmError("claude failed (1): You've hit your weekly limit · resets Nov 14 at 8am (Asia/Saigon)") }) as Llm
const save = (root: string, message: string) => { git(root, 'add', '.'); git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', message) }

test('unread: a live page the gate cannot read is put back, and the text it wrote is kept', async () => {
  const root = await repo()
  const committed = await readFile(join(root, GUIDE), 'utf8')
  await edit(root, GUIDE, t => { t.body = `${t.body as string}<p>Đã viết lại.</p>` })
  const written = await readJson(root, GUIDE)
  const path = (await guidePage(root)).path
  const { report } = await gate(root, { llm: limited, now })
  expect(await readFile(join(root, GUIDE), 'utf8')).toBe(committed)
  expect(report.unread).toContain(path)
  const kept = await readJson(root, PUT_BACK)
  expect(kept).toMatchObject({ at: '2026-11-09T00:00:00Z', checks: [], findings: [], unread: true })
  expect(kept.text).toEqual(written)
})

test('unread: the translator takes the page up again after its new text is put back', async () => {
  const root = await repo()
  const idFile = 'content/species/danio-margaritatus/id.json'
  const stateFile = 'engine-state/localize-id.json'
  await cp(join(root, 'content/species/danio-margaritatus/vi.json'), join(root, idFile))
  await edit(root, 'content/sources.json', s => {
    const sf = s.seriouslyfish as { publish: boolean; permission?: { date: string; file: string; scope: string[] } }
    sf.publish = true
    sf.permission = { date: '2026-10-29', file: 'noted', scope: ['translation'] }
  })
  const entity = await readJson(root, 'content/species/danio-margaritatus/entity.json') as { updatedAt: string; sections: { key: string; source: string; html: string }[] }
  const old = { at: '2026-01-01', from: '2026-01-01', name: 'Cá galaxy', confidence: 'high', score: 0.9 }
  await writeFile(join(root, stateFile), `${JSON.stringify({ 'danio-margaritatus': old, 'left-alone': { at: '2026-01-01', from: '2026-01-01', name: 'Other', confidence: 'low', score: 0.5 } }, null, 2)}\n`)
  save(root, 'translated once')

  const parts = Object.fromEntries(entity.sections.filter(s => s.source === 'seriouslyfish' && s.html.trim()).map(s => [`${s.key}:${s.source}`, partHash(s.html)]))
  await edit(root, idFile, t => { t.name = 'Ikan galaxy' })
  const state = await readJson(root, stateFile) as Record<string, unknown>
  state['danio-margaritatus'] = { at: '2026-11-09', from: entity.updatedAt, name: 'Ikan galaxy', confidence: 'high', score: 0.95, notes: [], parts }
  state['left-alone'] = { at: '2026-01-01', from: '2026-01-01', name: 'Touched', confidence: 'low', score: 0.5 }
  await writeFile(join(root, stateFile), `${JSON.stringify(state, null, 2)}\n`)
  // As the cycle left it, the page was made from the English it has now: the translator leaves it.
  const before = await localizeSpecies(root, limited, 'id', ['danio-margaritatus'], { now })
  expect(before.skipped).toContain('danio-margaritatus')
  expect(before.stopped).toBe('')

  const { report } = await gate(root, { llm: limited, now })
  expect(report.unread.length).toBeGreaterThan(0)
  expect((await readJson(root, idFile)).name).toBe('Cá galaxy')
  const again = await localizeSpecies(root, limited, 'id', ['danio-margaritatus'], { now })
  expect(again.stopped).toContain('danio-margaritatus')
  expect(again.skipped.some(s => s.startsWith('danio-margaritatus'))).toBe(false)
  expect((await readJson(root, stateFile))['left-alone'].name).toBe('Touched')
})

test('unread: the Vietnamese rewrite takes the page up again after its new text is put back', async () => {
  const root = await repo()
  const file = 'content/guides/aquariumcoop-thay-nuoc/vi.json'
  const stateFile = join(root, 'engine-state/vi-rewrite.json')
  const opts = { llm: limited, opts: VI_WRITE, now }
  // Published at HEAD: otherwise the build there has no page, and the gate treats the file as new.
  await edit(root, 'content/sources.json', s => { const src = s.aquariumcoop as { publish: boolean; permission?: { date: string; file: string; scope: string[] } }; src.publish = true; src.permission = { date: '2026-10-29', file: 'noted', scope: ['text'] } })
  const dry = await rewriteExisting(join(root, 'content'), stateFile, opts, { limit: 1000, dry: true })
  const id = 'guides/aquariumcoop-thay-nuoc'
  const done = { at: '2026-10-01', rewritten: 1, of: 1, scores: [1], v: 2 }
  const state = Object.fromEntries(dry.done.map(line => [line.split(' ')[0]!, done]))
  state[id] = { at: '2026-10-01', rewritten: 0, of: 1, scores: [], v: 1 }
  await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`)
  save(root, 'rewrite so far')

  await edit(root, file, t => { t.body = `${t.body as string}<p>Đã viết lại.</p>` })
  state[id] = { at: '2026-11-09', rewritten: 1, of: 1, scores: [0.9], v: 2 }
  await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`)
  await gate(root, { llm: limited, now })
  const again = await rewriteExisting(join(root, 'content'), stateFile, opts, { limit: 5 })
  expect(again.stopped).toContain(id)
  expect(again.done).toEqual([])
})

test('unread: a source is due again after the gate puts its page back, and one that only failed keeps its count', async () => {
  const root = await repo()
  const species = 'content/species/danio-margaritatus/vi.json'
  const url = 'https://www.seriouslyfish.com/species/danio-margaritatus'
  const other = 'https://www.seriouslyfish.com/species/other'
  // A second source names the same fish and failed for the second time before this cycle.
  const failing = 'https://www.planetcatfish.com/danio-margaritatus'
  const video = 'r53ZQW0m8VM'
  const fresh = (entityIds: string[], updatedAt: string, extra: Partial<UrlState> = {}): UrlState => ({ status: 'processed', entityIds, attempts: 0, updatedAt, ...extra })
  await writeFile(join(root, 'engine-state/seriouslyfish.json'), `${JSON.stringify({
    [url]: fresh(['species/danio-margaritatus'], '2026-01-01T00:00:00.000Z', { lastmod: '2026-01-01' }),
    [other]: fresh(['species/other'], '2026-01-01T00:00:00.000Z', { hash: 'old' }),
  }, null, 2)}\n`)
  await writeFile(join(root, 'engine-state/planetcatfish.json'), `${JSON.stringify({ [failing]: fresh(['species/danio-margaritatus'], '2026-11-08T00:00:00.000Z', { status: 'error', attempts: 2, error: 'HTTP 500' }) }, null, 2)}\n`)
  await writeFile(join(root, 'engine-state/youtube.json'), `${JSON.stringify({ [video]: fresh([`youtube-${video}`], '2025-01-01T00:00:00.000Z') }, null, 2)}\n`)
  await edit(root, 'content/sources.json', s => { const src = s.seriouslyfish as { publish: boolean; permission?: { date: string; file: string; scope: string[] } }; src.publish = true; src.permission = { date: '2026-10-29', file: 'noted', scope: ['text'] } })
  save(root, 'fetched once')

  // This cycle: Seriously Fish wrote the fish's page again, the other source failed a third time and wrote nothing, and a
  // step that keeps no record of its own changed a video guide.
  await edit(root, species, t => { t.name = `${t.name as string} mới` })
  await edit(root, GUIDE, t => { t.body = `${t.body as string}<p>Đã viết lại.</p>` })
  const doneFish = fresh(['species/danio-margaritatus'], '2026-11-09T00:00:00.000Z', { lastmod: '2026-10-28', hash: 'new', processedHash: 'new' })
  const third = fresh(['species/danio-margaritatus'], '2026-11-09T00:00:00.000Z', { status: 'error', attempts: 3, error: 'HTTP 500' })
  const touchedVideo = fresh([`youtube-${video}`], '2026-11-09T00:00:00.000Z', { hash: 'new' })
  await writeFile(join(root, 'engine-state/seriouslyfish.json'), `${JSON.stringify({
    [url]: doneFish,
    [other]: fresh(['species/other'], '2026-11-09T00:00:00.000Z', { hash: 'touched' }),
  }, null, 2)}\n`)
  await writeFile(join(root, 'engine-state/planetcatfish.json'), `${JSON.stringify({ [failing]: third }, null, 2)}\n`)
  await writeFile(join(root, 'engine-state/youtube.json'), `${JSON.stringify({ [video]: touchedVideo }, null, 2)}\n`)
  expect(needsFetch(doneFish, '2026-10-28', now())).toBe(false)

  const { report } = await gate(root, { llm: limited, now })
  expect(report.unread).toHaveLength(2)
  const fish = await readJson(root, 'engine-state/seriouslyfish.json')
  expect(needsFetch(fish[url], '2026-10-28', now())).toBe(true)
  expect(fish[other].hash).toBe('touched')
  // The failure wrote nothing, so it isn't undone: put back, each cycle would take a failure off its three attempts.
  expect((await readJson(root, 'engine-state/planetcatfish.json'))[failing]).toEqual(third)
  // A video is taken once (youtube.ts), so its record isn't what would have the guide written again: left as it is.
  expect((await readJson(root, 'engine-state/youtube.json'))[video]).toEqual(touchedVideo)
})

// Planting writes the plant's entity.json and its Vietnamese page, and passes over a plant whose entity has its section.
// With the page put back and the entity left, the advice would never be on the page.
test('unread: planting advice the gate puts back is written again: its section leaves the entity, and its record goes', async () => {
  const root = await repo()
  const id = 'cryptocoryne-wendtii'
  const entityFile = `content/plants/${id}/entity.json`, pageFile = `content/plants/${id}/vi.json`
  const without = async () => (await plantsWithoutPlanting(join(root, 'content'))).map(p => p.id)
  await edit(root, 'content/sources.json', s => {
    for (const k of ['tropica', '2hraquarist', 'aquatome']) { const src = s[k] as { publish: boolean; permission?: { date: string; file: string; scope: string[] } }; src.publish = true; src.permission = { date: '2026-10-29', file: 'noted', scope: ['text'] } }
  })
  save(root, 'the plant page is live')
  expect(await without()).toContain(id)
  const advice = '<p>Vùi rễ xuống nền, để hở cổ rễ.</p>'
  await edit(root, entityFile, e => { (e.sections as unknown[]).push({ key: 'maintenance', source: 'aquatome', sourceUrl: 'https://aquatome.com/vi/gioi-thieu/', html: advice }); e.updatedAt = '2026-11-09' })
  await edit(root, pageFile, t => { t.sections = { ...(t.sections as object), 'maintenance:aquatome': advice } })
  await writeFile(join(root, 'engine-state/_planting.json'), `${JSON.stringify({ [id]: { at: '2026-11-09', score: 0.9, kept: true } }, null, 2)}\n`)
  expect(await without()).not.toContain(id)

  const { report } = await gate(root, { llm: limited, now })
  expect(report.unread).toHaveLength(1)
  expect((await readJson(root, pageFile)).sections['maintenance:aquatome']).toBeUndefined()
  expect((await readJson(root, putBackFile({ kind: 'plants', id, lang: 'vi' }))).text.sections['maintenance:aquatome']).toBe(advice)
  expect((await readJson(root, entityFile)).sections.some((x: { source: string }) => x.source === 'aquatome')).toBe(false)
  expect((await readJson(root, 'engine-state/_planting.json'))[id]).toBeUndefined()
  expect(await without()).toContain(id)
})

test('unread: a page put back for a check keeps the writer\'s record the cycle left', async () => {
  const root = await repo()
  const file = 'content/guides/aquariumcoop-thay-nuoc/vi.json'
  const stateFile = join(root, 'engine-state/vi-rewrite.json')
  const opts = { llm: limited, opts: VI_WRITE, now }
  await edit(root, 'content/sources.json', s => { const src = s.aquariumcoop as { publish: boolean; permission?: { date: string; file: string; scope: string[] } }; src.publish = true; src.permission = { date: '2026-10-29', file: 'noted', scope: ['text'] } })
  const dry = await rewriteExisting(join(root, 'content'), stateFile, opts, { limit: 1000, dry: true })
  const id = 'guides/aquariumcoop-thay-nuoc'
  const state = Object.fromEntries(dry.done.map(line => [line.split(' ')[0]!, { at: '2026-10-01', rewritten: 1, of: 1, scores: [1], v: 2 }]))
  state[id] = { at: '2026-10-01', rewritten: 0, of: 1, scores: [], v: 1 }
  await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`)
  save(root, 'rewrite so far')

  await edit(root, file, t => { t.body = `${t.body as string}<p>Mua ở Petco.</p>` })
  state[id] = { at: '2026-11-09', rewritten: 1, of: 1, scores: [0.9], v: 2 }
  await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`)
  const { report } = await gate(root, { llm: reader(), now })
  expect(report.revert).toHaveLength(1)
  expect(report.unread).toEqual([])
  const kept = await readJson(root, putBackFile({ kind: 'guides', id: 'aquariumcoop-thay-nuoc', lang: 'vi' }))
  expect(kept.checks).toEqual(['shop'])
  expect(kept.unread).toBeUndefined()
  expect((await readJson(root, 'engine-state/vi-rewrite.json'))[id].rewritten).toBe(1)
  const again = await rewriteExisting(join(root, 'content'), stateFile, opts, { limit: 5 })
  expect(again.stopped).toBe('')
  expect(again.done).toEqual([])
})

// A failure of the gate's own on one page isn't the accounts being out: the same failure next cycle would have the writer
// write the page again every cycle. The text is kept and the failure listed, for a person.
test('unread: a page the gate itself fails on keeps its text and the record the cycle left', async () => {
  const root = await repo()
  const file = 'content/guides/aquariumcoop-thay-nuoc/vi.json'
  const stateFile = join(root, 'engine-state/vi-rewrite.json')
  const opts = { llm: limited, opts: VI_WRITE, now }
  await edit(root, 'content/sources.json', s => { const src = s.aquariumcoop as { publish: boolean; permission?: { date: string; file: string; scope: string[] } }; src.publish = true; src.permission = { date: '2026-10-29', file: 'noted', scope: ['text'] } })
  const dry = await rewriteExisting(join(root, 'content'), stateFile, opts, { limit: 1000, dry: true })
  const id = 'guides/aquariumcoop-thay-nuoc'
  const state = Object.fromEntries(dry.done.map(line => [line.split(' ')[0]!, { at: '2026-10-01', rewritten: 1, of: 1, scores: [1], v: 2 }]))
  state[id] = { at: '2026-10-01', rewritten: 0, of: 1, scores: [], v: 1 }
  await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`)
  save(root, 'rewrite so far')
  const committed = await readFile(join(root, file), 'utf8')

  await edit(root, file, t => { t.body = `${t.body as string}<p>Mua ở Petco.</p>` })
  const written = await readJson(root, file)
  state[id] = { at: '2026-11-09', rewritten: 1, of: 1, scores: [0.9], v: 2 }
  await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`)
  // Both texts are read, the new one is worse, and the gate fails once as it goes to keep it.
  const calls: string[] = []
  let failed = false
  const failing = () => { if (calls.length === 2 && !failed) { failed = true; throw new Error('boom') } return now() }
  const { report } = await gate(root, { llm: reader(calls), now: failing })
  expect(report.failed).toEqual([`vi/${id}: boom`])
  expect(report.unread).toHaveLength(1)
  expect(await readFile(join(root, file), 'utf8')).toBe(committed)
  const kept = await readJson(root, putBackFile({ kind: 'guides', id: 'aquariumcoop-thay-nuoc', lang: 'vi' }))
  expect(kept.unread).toBe(true)
  expect(kept.text).toEqual(written)
  expect((await readJson(root, 'engine-state/vi-rewrite.json'))[id].rewritten).toBe(1)
  const again = await rewriteExisting(join(root, 'content'), stateFile, opts, { limit: 5 })
  expect(again.stopped).toBe('')
  expect(again.done).toEqual([])
})

test('unread: a new page the gate cannot read waits held, and its text and records stay', async () => {
  const root = await repo()
  const dir = 'content/guides/youtube-r53ZQW0m8VM'
  await cp(join(root, dir), join(root, 'content/guides/new-one'), { recursive: true })
  await edit(root, 'content/guides/new-one/entity.json', e => { e.id = 'new-one' })
  await edit(root, 'content/guides/new-one/vi.json', t => { t.slug = 'new-one'; t.body = '<p>Mới.</p>' })
  const url = 'https://example.invalid/new-one'
  await writeFile(join(root, 'engine-state/seriouslyfish.json'), `${JSON.stringify({ [url]: { status: 'processed', entityIds: ['guides/new-one'], attempts: 0, updatedAt: '2026-11-09T00:00:00.000Z' } }, null, 2)}\n`)
  const { report } = await gate(root, { llm: limited, now })
  const page = await readJson(root, 'content/guides/new-one/vi.json')
  expect(page.body).toBe('<p>Mới.</p>')
  expect(page.held).toEqual({ checks: [], at: '2026-11-09' })
  expect(report.unread).toHaveLength(1)
  expect(existsSync(join(root, 'engine-state/put-back/guides/new-one.vi.json'))).toBe(false)
  expect((await readJson(root, 'engine-state/seriouslyfish.json'))[url].status).toBe('processed')
})

test('a held card that passes now is let out: the gate sees held cards, which the build leaves out', async () => {
  const root = await repo()
  await card(root, 'card-held', { body: '<p>Cá betta lên mặt nước đớp khí.</p>', held: { checks: ['shop'], at: '2026-11-08' } })
  git(root, 'add', '.'); git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'a held card')
  const r = await gate(root, { llm: reader(), now })
  expect((await readJson(root, 'content/cards/card-held/vi.json')).held).toBeUndefined()
  expect(r.report.release).toEqual(['/vi/cards/card-held/'])
})

test('a page held for units alone is let out, with no read, once its saved read\'s only figures are its English\'s own', async () => {
  const held = async (en: string) => {
    const root = await repo()
    const dir = 'content/species/danio-margaritatus'
    await edit(root, 'content/sources.json', s => { const sf = s.seriouslyfish as { publish: boolean; permission?: { date: string; file: string; scope: string[] } }; sf.publish = true; sf.permission = { date: '2026-10-29', file: 'noted', scope: ['translation'] } })
    await edit(root, `${dir}/entity.json`, e => { (e.sections as { key: string; source: string; html: string }[]).find(s => s.key === 'habitat' && s.source === 'seriouslyfish')!.html = en })
    await edit(root, `${dir}/vi.json`, t => { (t.sections as Record<string, string>)['habitat:seriouslyfish'] = '<p>Nuôi được trong bể chỉ 38 lít.</p>'; t.held = { checks: ['units'], at: '2026-11-09' } })
    const p = (await loadPages(join(root, 'content'), ['vi'])).find(x => x.id === 'danio-margaritatus')!
    const state: FitState = { [fitKey(p)]: { at: '2026-11-09', hash: fitText(p).hash, model: 'm', products: [], findings: [], checklist: 3 } }
    await writeFile(join(root, 'engine-state/_fit.json'), `${JSON.stringify(state)}\n`)
    git(root, 'add', '.'); git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'held for units')
    const calls: string[] = []
    const { report } = await gate(root, { llm: reader(calls), now })
    return { report, calls, held: (await readJson(root, `${dir}/vi.json`)).held }
  }
  // The English gives 38 litres itself: the rules find nothing now, and the saved read is of this text.
  const own = await held('<p>Kept in tanks as small as 38 litres.</p>')
  expect(own.held).toBeUndefined()
  expect(own.report.release).toEqual(['/vi/ca/ca-galaxy/'])
  expect(own.calls).toEqual([])
  // The English gives gallons: "38 lít" is the writer's conversion, and the page stays held.
  const converted = await held('<p>Kept in tanks as small as 10 gallons.</p>')
  expect(converted.held).toEqual({ checks: ['units'], at: '2026-11-09' })
  expect(converted.report.release).toEqual([])
  expect(converted.calls).toEqual([])
})

// The chief of staff, 14 Nov 2026: 15 of 15 new video guides were held, for the video's own build told as if the reader
// had watched it. A new video guide goes through its editor at birth, and the held ones 12 a run, each read again after.
const editor = (root: string, sent: string[] = []) => async (p: Page, fs: FitFinding[]) => {
  sent.push(`${p.id}: ${fs.map(f => f.check).join(', ')}`)
  return cutter(root, [], `content/guides/${p.id}/vi.json`)(p, fs)
}
test('a new video guide held only for what its editor fixes goes to it first, and out once its text passes; one held for a kit waits', async () => {
  const root = await repo()
  const dir = 'content/guides/youtube-r53ZQW0m8VM'
  for (const id of ['youtube-new-shop', 'youtube-new-kit']) {
    await cp(join(root, dir), join(root, `content/guides/${id}`), { recursive: true })
    await edit(root, `content/guides/${id}/entity.json`, e => { e.id = id })
  }
  await edit(root, 'content/guides/youtube-new-shop/vi.json', t => { t.slug = 'new-shop'; t.body = '<p>Mua lọc ở Petco.</p><p>Lọc vi sinh hợp bể nhỏ.</p>' })
  await edit(root, 'content/guides/youtube-new-kit/vi.json', t => { t.slug = 'new-kit'; t.body = '<p>Cả bể dựng theo bộ Aqueon.</p>' })
  const sent: string[] = []
  const { report } = await gate(root, { llm: reader(), now, mend: editor(root, sent), jobs: 1 })
  expect(sent).toEqual(['youtube-new-shop: shop'])
  expect(report.mended).toEqual(['/vi/huong-dan/new-shop/ (shop)'])
  expect((await readJson(root, 'content/guides/youtube-new-shop/vi.json')).held).toBeUndefined()
  expect((await readJson(root, 'content/guides/youtube-new-shop/vi.json')).body).toBe('<p>Lọc vi sinh hợp bể nhỏ.</p>')
  expect((await readJson(root, 'content/guides/youtube-new-kit/vi.json')).held).toEqual({ checks: ['kit'], at: '2026-11-09' })
})

test('a video guide held already goes to its editor only within the run\'s held mends, and is let out once its text passes', async () => {
  const root = await repo()
  await edit(root, GUIDE, t => { t.body = `${t.body as string}<p>Mua ở Petco.</p>`; t.held = { checks: ['shop'], at: '2026-11-08' } })
  save(root, 'held')
  const sent: string[] = []
  const none = await gate(root, { llm: reader(), now, mend: editor(root, sent) })
  expect(sent).toEqual([])
  expect(none.report.mended).toEqual([])
  expect((await readJson(root, GUIDE)).held).toEqual({ checks: ['shop'], at: '2026-11-08' })
  const r = await gate(root, { llm: reader(), now, mend: editor(root, sent), heldMends: 1 })
  expect(sent).toEqual(['youtube-r53ZQW0m8VM: shop'])
  expect(r.report.release).toHaveLength(1)
  expect((await readJson(root, GUIDE)).held).toBeUndefined()
  expect((await readJson(root, GUIDE)).body).not.toContain('Petco')
})

// Astra's read of 14 Nov 2026: a guide held for harm, read now with a shop only, went to its editor and out.
test('a guide held for harm, a kit or a dose never goes to its editor, and stays held for it, though its read now finds only a shop', async () => {
  const root = await repo()
  await edit(root, GUIDE, t => { t.body = `${t.body as string}<p>Mua ở Petco.</p>`; t.held = { checks: ['harm'], at: '2026-11-08' } })
  save(root, 'held')
  const sent: string[] = []
  const r = await gate(root, { llm: reader(), now, mend: editor(root, sent), heldMends: 1 })
  expect(sent).toEqual([])
  expect(r.report.mended).toEqual([])
  expect(r.report.release).toEqual([])
  expect((await readJson(root, GUIDE)).held).toEqual({ checks: ['harm', 'shop'], at: '2026-11-09' })
  expect((await readJson(root, GUIDE)).body).toContain('Petco')
  // Its read clean, it goes out as before.
  await edit(root, GUIDE, t => { t.body = (t.body as string).replace('<p>Mua ở Petco.</p>', '') })
  expect((await gate(root, { llm: reader(), now, mend: editor(root, sent), heldMends: 1 })).report.release).toHaveLength(1)
  expect(sent).toEqual([])
})

// Astra's read of 14 Nov 2026: a mend whose text couldn't be read again stayed in the file, beside the old text's read.
test('a mended text that can\'t be read again is put back, so the file and the run\'s read are of one text', async () => {
  const root = await repo()
  await cp(join(root, 'content/guides/youtube-r53ZQW0m8VM'), join(root, 'content/guides/youtube-new-shop'), { recursive: true })
  await edit(root, 'content/guides/youtube-new-shop/entity.json', e => { e.id = 'youtube-new-shop' })
  const body = '<p>Mua lọc ở Petco.</p><p>Lọc vi sinh hợp bể nhỏ.</p>'
  await edit(root, 'content/guides/youtube-new-shop/vi.json', t => { t.slug = 'new-shop'; t.body = body })
  // The read after the mend fails.
  const llm = (async (a: { prompt: string }) => {
    if (a.prompt.includes('Lọc vi sinh hợp bể nhỏ') && !a.prompt.includes('Petco')) throw new Error('read failed')
    return reader()(a as Parameters<Llm>[0])
  }) as Llm
  const sent: string[] = []
  const r = await gate(root, { llm, now, mend: editor(root, sent), jobs: 1 })
  expect(sent).toEqual(['youtube-new-shop: shop'])
  expect(r.report.mended).toEqual([])
  const t = await readJson(root, 'content/guides/youtube-new-shop/vi.json')
  expect(t.body).toBe(body)
  expect(t.held).toEqual({ checks: ['shop'], at: '2026-11-09' })
})
