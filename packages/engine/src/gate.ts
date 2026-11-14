import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LANGS, type Lang } from '@aq/schema'
import { vnDay } from './ceiling'
import { LlmError, type Llm } from './claude'
import { doseGroups, FIT_KINDS, FIT_LABEL_VI, fitFindings, productOf, fitKey, fitOrder, fitSource, fitText, readFit, type FitCheck, type FitEntry, type FitFinding, type FitState } from './fit'
import { PRODUCTS } from './market'
import { loadCards, loadPages, pageUrl, type Page } from './pages'
import { norm } from './reader'
import { REVIEW_KINDS, reviewFile, unkeep, type Store } from './review-log'
import { restoreUnreadRecords } from './writer-records'

/**
 * Every page passes the checklist (fit.ts) before readers get it. Run last in each cycle, after everything that writes
 * pages: the pages whose text the cycle changed are read, and
 * - a new page that fails any check but words is held: kept in the repository with `held`, which the build leaves out;
 * - a live page whose new text fails a check its old text passed gets its committed text back, and the new text is kept
 *   with what was wrong (engine-state/put-back/), so the work that wrote it isn't lost; when all that is worse is a sentence
 *   a mender may fix (MENDABLE, `mend`), it is fixed and the page read again first, and goes back only if still worse;
 * - a page with a fault no rewording fixes or advice that would hurt (HOLD_ALWAYS) is held, changed or not, unless it's a
 *   live page whose new text brought it, which gets its old text back; harm found in one language holds every language,
 *   and harm the rules find (a medicine in grams per litre: fit.ts, harmfulDoses) holds a page before any model reads it;
 * - a held page whose text changed and passes is let out;
 * - a page it can't read (the accounts out, over its limit) stays as readers have it: a live page keeps its committed text,
 *   the text the cycle wrote is kept with the others (engine-state/put-back/), and the writers' records of it go back to
 *   what is committed, so they do the page again; a new one waits, held. The run still publishes; only a crash in the gate stops it.
 * "Passed before" counts the old text's saved read, a check whose every fault is quoted from a sentence the old text has
 * word for word, and, when the new text still looks worse, a fresh read of the old one: a model reading the same text twice
 * doesn't always find the same things, and a page isn't put back for that. So taking a sentence out isn't put back for a
 * fault in the sentences left, though it is for a dose's caution or purpose it took out.
 */
export const GATE_KINDS = ['guides', 'species', 'plants', 'breeds'] as const
/** What the gate reads: those, and the app's short cards (content/cards), which the owner's number and the report don't count. */
export const GATED_KINDS = [...GATE_KINDS, 'cards'] as const
/**
 * Faults a page is held back for, whether or not the cycle changed it: a kit, which no rewording fixes, and advice that
 * would hurt, which readers mustn't have while it waits for a fix. A live page whose new text brings one gets its old text.
 */
export const HOLD_ALWAYS: readonly FitCheck[] = ['kit', 'harm']
/**
 * The checks a mender may be sent: a sentence that names a shop, a price or a product from abroad, talks about the source,
 * or is written for a reader elsewhere, which can go or be reworded with nothing else of the text changed. A list of what
 * is allowed, so a new check stays out: harm, a dose and what a dose lacks are never reworded by a writer alone, a kit
 * isn't a sentence, and units are rounded where the text is written (round.ts).
 */
export const MENDABLE: readonly FitCheck[] = ['shop', 'price', 'source', 'elsewhere', 'product']
/**
 * Whether a page's checks are the video editor's to fix (the chief of staff, 14 Nov 2026): each one it mends, units beside
 * one of them (never alone, which is units-mend's), and a dose, which video-mend.ts takes only when it is the source's own
 * tank's and leaves a person otherwise. The editor writes, keeps or converts no figure: video-mend.ts holds them.
 */
export const editorMay = (checks: readonly FitCheck[]) =>
  checks.some(c => c !== 'units') && checks.every(c => MENDABLE.includes(c) || c === 'units' || c === 'dose')
/** What a page held for waits for a person, and no editor gets: harm, a kit, a dose and what a dose lacks. */
export const WAITS: readonly FitCheck[] = ['harm', 'kit', 'lethal', 'dose', 'dose-caution', 'dose-purpose', 'dose-conflict']
/**
 * Fixes the sentences `findings` quote in a page's file, when it can: true once the file has the mended text, which the
 * gate then reads again. False for a mend that didn't hold (a broken edit, one its own reviewer didn't pass), and nothing
 * for a page it sends to no editor (not one it mends, no transcript): the file as it was. A run's `mends` count the pages
 * an editor was called for, so not the last.
 */
export type Mend = (p: Page, findings: FitFinding[]) => Promise<boolean | undefined>
/**
 * A text the gate put back, as the page's file had it, with the checks it was worse on and what they quote.
 * `unread`: the page was not read (the accounts out), so there are no checks.
 */
export type PutBack = {
  at: string
  checks: FitCheck[]
  findings: Pick<FitFinding, 'check' | 'quote' | 'why'>[]
  text: unknown
  /** Set when the text was put back because the page could not be read, not for a check. */
  unread?: true
}
/** Where a page's text put back is kept, one file a page: a later one replaces it. */
export const putBackFile = (p: Pick<Page, 'kind' | 'id' | 'lang'>) => `engine-state/put-back/${p.kind}/${p.id}.${p.lang}.json`
/** Pages wrong for the reader on 8 Nov 2026, when the checklist first read the site: the owner's number starts here. */
export const FIT_BASELINE = { day: '2026-11-08', pct: { vi: 50, id: 37, th: 31, ms: 51 } as Record<Lang, number> }

/** The Asia/Saigon day. Counted in ceiling.ts, with what a step has spent that day. */
export { vnDay }

/**
 * A failed call that says the accounts can't be had, not that the page is at fault: out of their usage limit, a step at
 * its day's ceiling (ceiling.ts), a credential rejected. The page isn't read, and the gate makes no more calls this run.
 */
export const accountsOut = (e: unknown): e is LlmError => e instanceof LlmError && /limit|rejected|no account/i.test(e.message)

export type Held = { checks: string[]; at: string }
export type GateCall = { action: 'pass' | 'hold' | 'release' | 'revert'; checks: FitCheck[] }

/** What a page's findings say is wrong for its reader: every check but words. */
export const wrongChecks = (p: Page, e?: FitEntry) => new Set(fitFindings(p, e).map(f => f.check).filter(c => c !== 'words'))
/** Whether the market table says what's sold in a language's country: Vietnam only, for now. */
const marketKnown = (lang: Lang) => PRODUCTS.some(x => x.market[lang])
/**
 * What holds a page back or puts it back: the same, except a product, or a dose of one, whose market here isn't known.
 * Indonesia, Thailand and Malaysia have no market table yet, so there every product is "market unknown": counted, never
 * held for.
 */
const gateFindings = (p: Page, e?: FitEntry) => fitFindings(p, e).filter(f => f.check !== 'words' && !((f.check === 'product' || f.check === 'dose') && (!marketKnown(p.lang) || productOf(f.product ?? f.quote, p.lang)?.status === 'no data')))
export const gateChecks = (p: Page, e?: FitEntry) => new Set(gateFindings(p, e).map(f => f.check))
/** A text's sentences, a table row or a heading each one too: what a fault's quote is matched to in the old text. */
const sentences = (text: string) => text.split(/(?<=[.!?])\s+|\n+/).map(norm).filter(Boolean)
/** Faults of something left out: their quote is the words that stay (the dose), not what went. */
const LEFT_OUT: readonly FitCheck[] = ['dose-caution', 'dose-purpose']
/**
 * The checks whose every fault in the new text the old text has too, each quoted in a sentence the old text has word for
 * word: the change didn't bring them, whether a read of the old text found them or not.
 */
const carried = (p: Page, e: FitEntry | undefined, old: Page) => {
  const was = new Set(sentences(fitText(old).text)), now = sentences(fitText(p).text)
  const all = new Map<FitCheck, boolean>()
  for (const f of gateFindings(p, e)) {
    const q = norm(f.quote), at = now.filter(x => x.includes(q))
    all.set(f.check, (all.get(f.check) ?? true) && !LEFT_OUT.includes(f.check) && at.length > 0 && at.every(x => was.has(x)))
  }
  return [...all].filter(([, had]) => had).map(([c]) => c)
}

/** What the gate does with one changed page, from its checks now and, for a live page, its old text's. */
export function gateCall(now: Set<FitCheck>, o: { isNew: boolean; wasHeld: boolean; before?: Set<FitCheck> }): GateCall {
  const checks = [...now].sort()
  const always = checks.filter(c => HOLD_ALWAYS.includes(c))
  if (always.length && (o.isNew || o.wasHeld || always.every(c => o.before?.has(c)))) return { action: 'hold', checks }
  if (o.isNew || o.wasHeld) return checks.length ? { action: 'hold', checks } : { action: o.wasHeld ? 'release' : 'pass', checks }
  const worse = checks.filter(c => !o.before?.has(c))
  return worse.length ? { action: 'revert', checks: worse } : { action: 'pass', checks }
}

const git = (root: string, args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 })
const FILE = new RegExp(`^content/(${GATED_KINDS.join('|')})/([^/]+)/([a-z]{2})\\.json$`)
const fileOf = (p: Pick<Page, 'kind' | 'id' | 'lang'>) => `content/${p.kind}/${p.id}/${p.lang}.json`
const json = async <T>(path: string): Promise<T | undefined> => JSON.parse(await readFile(path, 'utf8').catch(() => 'null')) ?? undefined
const heldOf = async (path: string) => (await json<{ held?: Held }>(path))?.held

/** The served pages' and cards' language files the working tree changed against HEAD, new ones included. */
export function changedFiles(root: string): string[] {
  const out = git(root, ['status', '--porcelain', '-z', '--untracked-files=all', '--', ...GATED_KINDS.map(k => `content/${k}`)]).split('\0')
  const files: string[] = []
  for (let i = 0; i < out.length; i++) {
    const e = out[i]!
    if (e.length < 4) continue
    if (e[0] === 'R' || e[0] === 'C') i++ // the old name follows
    const m = FILE.exec(e.slice(3))
    if (e[0] !== 'D' && e[1] !== 'D' && m && (LANGS as readonly string[]).includes(m[3]!)) files.push(e.slice(3))
  }
  return files
}

/** The changed pages as HEAD has them, from a copy of just those pages and what the loader needs beside them. */
async function headPages(root: string, files: string[]): Promise<{ pages: Map<string, Page>; held: Map<string, Held> }> {
  if (!files.length) return { pages: new Map(), held: new Map() }
  const dirs = [...new Set(files.map(f => f.replace(/\/[^/]+$/, '')))]
  const want = ['content/sources.json', 'content/changelog.json', 'content/picture-hashes.json', 'content/one-voice.json', 'content/captions', ...dirs]
  const there = git(root, ['ls-tree', '--name-only', 'HEAD', '--', ...want]).split('\n').filter(Boolean)
  const dir = await mkdtemp(join(tmpdir(), 'gate-'))
  try {
    execFileSync('sh', ['-c', 'git archive HEAD -- "$@" | tar -x -C "$0"', dir, ...there], { cwd: root })
    const keys = new Set(files)
    const pages = new Map([...await loadPages(join(dir, 'content')), ...await loadCards(join(dir, 'content'))].filter(p => keys.has(fileOf(p))).map(p => [fitKey(p), p]))
    const held = new Map<string, Held>()
    for (const f of files) { const h = await heldOf(join(dir, f)); if (h) held.set(f, h) }
    return { pages, held }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/**
 * Pages a person holds back, by `kind/id`: a fault no read of the checklist finds, such as a catfish page filed under a
 * marine worm's name (2026-11-11). Every language file the page has, now or later, is held with the listed checks, and the
 * gate neither reads it nor lets it out until its line leaves the file. No model call.
 */
export const HELD_BY_HAND = 'engine-state/held-by-hand.json'
export type HandHold = { checks: string[]; why: string; at: string }

/** Every held page in the working tree, by its language file. */
async function heldNow(root: string, pages: Page[]): Promise<Map<string, Held>> {
  const out = new Map<string, Held>()
  for (const p of pages) if ((GATED_KINDS as readonly string[]).includes(p.kind)) { const h = await heldOf(join(root, fileOf(p))); if (h) out.set(fileOf(p), h) }
  return out
}

async function setHeld(root: string, file: string, held: Held | undefined) {
  const path = join(root, file)
  const { held: _old, ...t } = JSON.parse(await readFile(path, 'utf8'))
  await writeFile(path, `${JSON.stringify(held ? { ...t, held } : t, null, 2)}\n`)
}

export type GateReport = { pass: string[]; hold: string[]; release: string[]; revert: string[]; /** Mended, then decided on like any other page (among `pass`, usually), with the checks it was mended for. */ mended: string[]; unread: string[]; failed: string[]; reads: number; stopped?: string }

/**
 * `mend`: what fixes a sentence instead of the whole text going back (cli.ts: the video guides', video-mend.ts); `mends`:
 * how many pages a run it is given, each an edit and a review of its own and one more read here. A new page it would hold
 * for faults only its editor fixes goes to it first, and so do `heldMends` of the pages it holds already (the chief of
 * staff, 14 Nov 2026: a new video guide goes through its editor at birth, and the held ones, 12 a run).
 */
export async function gate(root: string, d: { llm: Llm; model?: string; jobs?: number; limit?: number; now?: () => Date; mend?: Mend; mends?: number; heldMends?: number }): Promise<{ report: GateReport; state: FitState; pages: Page[]; held: Map<string, Held> }> {
  const now = d.now ?? (() => new Date())
  const day = vnDay(now())
  const statePath = join(root, 'engine-state/_fit.json')
  const state: FitState = (await json<FitState>(statePath)) ?? {}
  const pages = (await loadPages(join(root, 'content'))).filter(p => FIT_KINDS.includes(p.kind))
  // The cards are read and held like pages; what it returns, for the report and the owner's number, is the pages.
  const all = [...pages, ...await loadCards(join(root, 'content'))]
  const byFile = new Map(all.map(p => [fileOf(p), p]))
  const held = await heldNow(root, all)
  // A page held by hand is held in every language it has, whatever wrote it since, and is no more of the gate's business.
  const byHand = (await json<Record<string, HandHold>>(join(root, HELD_BY_HAND))) ?? {}
  const handHeld: string[] = []
  for (const p of all) {
    const h = byHand[`${p.kind}/${p.id}`], f = fileOf(p)
    if (!h) continue
    const want = { checks: h.checks, at: h.at }
    if (JSON.stringify(held.get(f)) !== JSON.stringify(want)) { await setHeld(root, f, want); handHeld.push(`${p.path} (${h.checks.join(', ')}, by hand)`) }
    held.set(f, want)
  }
  const changed = new Set(changedFiles(root))
  // Every held page is looked at again: one left unread (the accounts out) is read now, and one a batch read has since
  // passed is let out. A saved read costs no call.
  for (const f of held.keys()) changed.add(f)
  const files = [...changed].filter(f => byFile.has(f) && !byHand[`${byFile.get(f)!.kind}/${byFile.get(f)!.id}`])
  const head = await headPages(root, files)
  const report: GateReport = { pass: [], hold: [...handHeld], release: [], revert: [], mended: [], unread: [], failed: [], reads: 0 }
  let budget = d.limit ?? 150
  let mends = d.mend ? d.mends ?? 6 : 0
  let heldMends = d.mend ? d.heldMends ?? 0 : 0
  const read = async (p: Page): Promise<FitEntry | undefined> => {
    if (report.stopped || budget <= 0) return undefined
    budget--; report.reads++
    try {
      return await readFit(d.llm, p, d.model, now(), await fitSource(root, p))
    } catch (e) {
      if (accountsOut(e)) report.stopped = e.message.slice(0, 200)
      else report.failed.push(`${fitKey(p)}: ${(e as Error).message.slice(0, 200)}`)
      return undefined
    }
  }
  const saved = (p: Page) => { const e = state[fitKey(p)]; return e?.hash === fitText(p).hash ? e : undefined }
  // Advice that would hurt, found in one language, holds the page in every language: they're written from the same facts,
  // and a read in one language can miss what a read in another found. The rules find it with no read (a medicine in grams
  // per litre). Each language file is first decided on its own text; then harm is counted from the text each one ends the
  // run with (a text put back, not the one it replaced), and every language of a page with harm is held.
  const reverts: string[] = [], holdAfter: [string, FitCheck[]][] = [], calls: [string, GateCall][] = []
  const finalOf = (p: Page) => (reverts.includes(fileOf(p)) ? head.pages.get(fitKey(p)) : p)
  const harmFiles = () => {
    const out = new Map<string, Set<string>>()
    // A text put back keeps the harm any of its reads found, the older one too (holdAfter).
    const backHarm = new Set(holdAfter.filter(([, c]) => c.includes('harm')).map(([f]) => f))
    for (const p of all) { const q = finalOf(p); if (q && (backHarm.has(fileOf(p)) || gateChecks(q, saved(q)).has('harm'))) out.set(`${p.kind}/${p.id}`, (out.get(`${p.kind}/${p.id}`) ?? new Set()).add(fileOf(p))) }
    return out
  }
  let harmed = new Map<string, Set<string>>()
  /** Harm in another of the page's language files, which holds this one too. */
  const harmedBeside = (p: Pick<Page, 'kind' | 'id' | 'lang'>) => [...(harmed.get(`${p.kind}/${p.id}`) ?? [])].some(f => f !== fileOf(p))
  const checksOf = (p: Page, e?: FitEntry) => { const c = gateChecks(p, e); if (harmedBeside(p)) c.add('harm'); return c }
  const apply = async (f: string, call: GateCall) => {
    if (call.action === 'hold' && held.get(f)?.checks.join() === call.checks.join()) return // held already, for the same checks
    const path = byFile.get(f)!.path
    report[call.action].push(`${path}${call.checks.length ? ` (${call.checks.join(', ')})` : ''}`)
    if (call.action === 'hold') { const h = { checks: call.checks, at: day }; await setHeld(root, f, h); held.set(f, h) }
    if (call.action === 'release') { await setHeld(root, f, undefined); held.delete(f) }
    if (call.action === 'revert') reverts.push(f)
  }
  // The texts put back for a check, as they were before any mend, to keep once they do go back.
  const thrown = new Map<string, PutBack>()
  /**
   * What a held page was held for that waits for a person (`WAITS`), harm in another language's text too: no editor gets
   * it, whatever its read finds now, and it stays held for it (the chief of staff, 14 Nov 2026; Astra's read: a guide held
   * for harm, read now with a shop only, was mended and let out).
   */
  const waitsFor = (f: string) => [...new Set([held.get(f), head.held.get(f)].flatMap(h => (h?.checks ?? []) as FitCheck[]).filter(c => WAITS.includes(c)))].sort()
  /**
   * A page worse only on sentences a mender may fix: they are sent to it (the faults of the checks it is worse on, not
   * the ones the old text has too), and the mended text is read and decided on again, against what the old text's reads
   * found. The call it gets then, or nothing: not mendable, the cap spent, no mend, or still worse.
   */
  const mended = async (f: string, p: Page, entry: FitEntry, worse: FitCheck[], old: Page | undefined, o: { isNew: boolean; wasHeld: boolean; oldChecks: FitCheck[] }): Promise<GateCall | undefined> => {
    // A page held already takes one of the run's `heldMends`; a new one, or a live one going back, one of its `mends`.
    const fromHeld = o.wasHeld && !o.isNew
    if (!d.mend || (fromHeld ? heldMends : mends) <= 0 || !editorMay(worse)) return undefined
    // Held for what waits for a person: never to the editor. A dose is the editor's when it is the source's own tank's
    // (video-mend.ts decides), so only while the read still finds it, to be sent.
    if (o.wasHeld && waitsFor(f).some(c => c !== 'dose' || !worse.includes('dose'))) return undefined
    if (fromHeld) heldMends--
    else mends--
    // The text as it was, put back if the mended one can't be read and decided on: the file and the run's record of the
    // page stay one text (Astra's read: a mend whose reread failed left its text, unread, beside the old read).
    const was = await readFile(join(root, f), 'utf8')
    const undo = async () => { await writeFile(join(root, f), was); return undefined }
    try {
      const done = await d.mend(p, gateFindings(p, entry).filter(x => worse.includes(x.check)))
      // A page turned away with no editor called isn't one of the run's mends: to the video guides' mender, every fish page.
      if (done === undefined) { if (fromHeld) heldMends++; else mends++ }
      if (!done) return await undo()
    } catch (e) {
      if (accountsOut(e)) report.stopped = e.message.slice(0, 200)
      else report.failed.push(`${fitKey(p)}: mend: ${(e as Error).message.slice(0, 200)}`)
      return await undo()
    }
    // As a build reads it now.
    const next = (p.kind === 'cards' ? await loadCards(join(root, 'content'), [p.lang]) : await loadPages(join(root, 'content'), [p.lang])).find(x => fileOf(x) === f)
    const read2 = next && await read(next)
    if (!next || !read2) return await undo()
    const call = gateCall(gateChecks(next, read2), { isNew: o.isNew, wasHeld: o.wasHeld, ...(old ? { before: new Set([...o.oldChecks, ...carried(next, read2, old)]) } : {}) })
    if (call.action === 'revert') return await undo()
    // The mended text is the page's from here on: its read, and what the steps below and the report count.
    state[fitKey(p)] = read2
    byFile.set(f, next)
    for (const list of [all, pages]) { const i = list.indexOf(p); if (i >= 0) list[i] = next }
    report.mended.push(`${next.path} (${worse.join(', ')})`)
    return call
  }

  // A page the gate can't read (the accounts out, over the limit) stays as readers have it: a live page keeps its committed
  // text, and a new or held one waits, held. The run still publishes the rest; only a crash in the gate stops it.
  // `unreadKept`: live pages put back here, whose text is saved below. `redo`: those of them no read was had of (the
  // accounts out, the run's reads spent, a read that failed), whose writers' records go back to HEAD so the page is done
  // again. A page the gate itself failed on (`redo` false) keeps its record: the same failure every cycle would have its
  // writer write it again every cycle, so it is listed in `failed` for a person, with its text kept.
  const unreadKept: string[] = [], redo: string[] = []
  const unread = (f: string, p: Page, held: boolean, again = true) => {
    report.unread.push(p.path)
    if (held) { pending.push(f); return }
    reverts.push(f)
    unreadKept.push(f)
    if (again) redo.push(f)
    // The text put back is held if its own saved read, or the rules, find a fault that holds a page.
    const old = head.pages.get(fitKey(p)), e = state[fitKey(p)]
    const back = old ? [...gateChecks(old, e?.hash === fitText(old).hash ? e : undefined)].sort() : []
    if (back.some(c => HOLD_ALWAYS.includes(c))) holdAfter.push([f, back])
  }
  const pending: string[] = []
  let next = 0
  const order = fitOrder(files.map(f => byFile.get(f)!), 'gate').map(fileOf)
  await Promise.all(Array.from({ length: d.jobs ?? 3 }, async () => {
    while (next < order.length) {
      const f = order[next++]!
      const p = byFile.get(f)!, old = head.pages.get(fitKey(p))
      const isNew = !old, wasHeld = head.held.has(f) || held.has(f)
      // The old text's saved read, before this page's slot takes the new text's.
      const oldSaved = old && saved(old)
      try {
        // Harm the rules find needs no read to be decided on.
        const ruled = !saved(p) && gateChecks(p).has('harm')
        const entry = saved(p) ?? (ruled ? undefined : await read(p))
        if (!entry && !ruled) {
          unread(f, p, isNew || wasHeld)
          continue
        }
        if (entry) state[fitKey(p)] = entry
        const nowChecks = gateChecks(p, entry)
        let call = gateCall(nowChecks, { isNew, wasHeld, ...(old ? { before: new Set([...gateChecks(old, oldSaved), ...carried(p, entry, old)]) } : {}) })
        if (call.action === 'revert' && old) {
          // Worse than its old text's saved read, or the old text was never read: read the old text now, and compare with both.
          const fresh = await read(old)
          if (!fresh) {
            // Looks worse and can't be told: the old text stays, its saved read with it.
            if (oldSaved) state[fitKey(p)] = oldSaved
            else delete state[fitKey(p)]
            unread(f, p, false)
            continue
          }
          const oldChecks = [...(oldSaved ? gateChecks(old, oldSaved) : []), ...gateChecks(old, fresh)]
          const before = new Set([...oldChecks, ...carried(p, entry, old)])
          call = gateCall(nowChecks, { isNew, wasHeld, before })
          if (call.action === 'revert') {
            // What goes back if it does: the text as the cycle wrote it, before any mend.
            const worse = call.checks
            thrown.set(f, { at: now().toISOString().slice(0, 19) + 'Z', checks: worse, findings: gateFindings(p, entry).filter(x => worse.includes(x.check)).map(({ check, quote, why }) => ({ check, quote, why })), text: JSON.parse(await readFile(join(root, f), 'utf8')) })
            const fixed = entry && await mended(f, p, entry, worse, old, { isNew, wasHeld, oldChecks })
            if (fixed) { call = fixed; thrown.delete(f) }
            else {
              state[fitKey(p)] = fresh
              // The text put back is held if it has a fault of that kind itself.
              const back = [...before].sort()
              if (back.some(c => HOLD_ALWAYS.includes(c))) holdAfter.push([f, back])
            }
          }
        }
        // New, or held already, and held only for what its editor fixes: to the editor, and decided on again. Held already
        // for what waits for a person: held for that still, and not sent.
        const waits = wasHeld ? waitsFor(f) : []
        const keep = (c: GateCall): GateCall => (c.action === 'hold' && waits.length ? { action: 'hold', checks: [...new Set([...c.checks, ...waits])].sort() } : c)
        // A held dose goes to the editor only with the read finding it now (`mended`), and stays a reason until it's gone.
        if (call.action === 'hold' && waits.some(c => c !== 'dose' || !call.checks.includes('dose'))) call = keep(call)
        else if (call.action === 'hold' && entry && (isNew || wasHeld)) {
          const fixed = await mended(f, p, entry, call.checks, old, { isNew, wasHeld, oldChecks: old && oldSaved ? [...gateChecks(old, oldSaved)] : [] })
          call = fixed ?? keep(call)
        }
        // Put back now, so the texts the run ends with are known; the rest once harm beside them is.
        if (call.action === 'revert') await apply(f, call)
        else calls.push([f, call])
      } catch (e) {
        // One page's failure costs the others nothing: it stays as readers have it.
        report.failed.push(`${fitKey(p)}: ${(e as Error).message.slice(0, 200)}`)
        unread(f, p, isNew || wasHeld, false)
      }
    }
  }))
  // One checkout for all of them, after the reads. First, each text put back is kept. A page that could not be read has no
  // checks: the file as the cycle wrote it. One already kept for a check (a later read failed) stays as that entry has it.
  for (const f of unreadKept) {
    if (thrown.has(f)) continue
    thrown.set(f, { at: now().toISOString().slice(0, 19) + 'Z', checks: [], findings: [], unread: true, text: JSON.parse(await readFile(join(root, f), 'utf8')) })
  }
  for (const f of reverts) {
    const t = thrown.get(f)
    if (!t) continue
    const file = join(root, putBackFile(byFile.get(f)!))
    await mkdir(join(file, '..'), { recursive: true })
    await writeFile(file, `${JSON.stringify(t, null, 1)}\n`)
  }
  if (reverts.length) {
    git(root, ['checkout', 'HEAD', '--', ...reverts])
    // The reviews of the texts they replaced are no longer the pages'.
    const back = reverts.map(f => FILE.exec(f)!).map(m => ({ lang: m[3]!, id: `${m[1]}/${m[2]}` }))
    const committed = new Set(git(root, ['ls-tree', '--name-only', 'HEAD', '--', 'engine-state/reviews/']).split('\n'))
    for (const kind of REVIEW_KINDS) {
      const f = `engine-state/reviews/${kind}.json`
      if (!existsSync(reviewFile(root, kind))) continue
      await unkeep(root, kind, back, committed.has(f) ? JSON.parse(git(root, ['show', `HEAD:${f}`])) as Store : {})
    }
    // A page put back for a check keeps the record the cycle left: it has had its go. One put back unread has not.
    const unreadPages = [...new Set(redo)].flatMap(f => {
      const m = FILE.exec(f)
      return m ? [{ kind: m[1]!, id: m[2]!, lang: m[3]! }] : []
    })
    if (unreadPages.length) await restoreUnreadRecords(root, unreadPages)
  }
  for (const f of pending) if (!held.has(f)) { const h = { checks: [], at: day }; await setHeld(root, f, h); held.set(f, h) }
  for (const [f, checks] of holdAfter) { const h = { checks, at: day }; await setHeld(root, f, h); held.set(f, h); report.hold.push(`${byFile.get(f)!.path} (${checks.join(', ')})`) }
  // Harm in any language, from the texts the run ends with, holds the page in each: one that passed, or that would have
  // been let out, as it was held.
  harmed = harmFiles()
  for (const [f, call] of calls) await apply(f, harmedBeside(byFile.get(f)!) && call.action !== 'hold' ? { action: 'hold', checks: [...new Set<FitCheck>([...call.checks, 'harm'])].sort() } : call)
  // A fault no rewording fixes holds a page whether or not this cycle changed it, and so does harm beside it.
  for (const p of all) {
    const f = fileOf(p), q = finalOf(p)
    if (!q) continue
    const e = saved(q)
    if ((GATED_KINDS as readonly string[]).includes(p.kind) && !held.has(f) && ((!changed.has(f) && e) || harmedBeside(p) || harmed.get(`${p.kind}/${p.id}`)?.has(f))) {
      const checks = [...checksOf(q, e)].sort()
      if (checks.some(c => HOLD_ALWAYS.includes(c))) await apply(f, { action: 'hold', checks })
    }
  }
  await writeFile(statePath, `${JSON.stringify(Object.fromEntries(Object.entries(state).sort(([a], [b]) => a.localeCompare(b))), null, 1)}\n`)
  return { report, state, pages, held }
}

/**
 * Of a language's guides, species, plants and breeds (the kinds the 8 Nov baseline counted), how many are wrong for the
 * reader: kind by kind from the pages read, as the baseline was.
 */
export function fitPct(pages: Page[], state: FitState, lang: Lang) {
  let all = 0, wrong = 0, read = 0, wrongRead = 0
  const current = (p: Page) => state[fitKey(p)]?.hash === fitText(p).hash
  const conflicted = new Set(doseGroups(pages.filter(p => p.lang === lang && current(p)), state).flatMap(g => g.conflicts.flat()))
  for (const kind of GATE_KINDS) {
    const of = pages.filter(p => p.lang === lang && p.kind === kind)
    const done = of.filter(current)
    const w = done.filter(p => wrongChecks(p, state[fitKey(p)]).size || conflicted.has(fitKey(p))).length
    read += done.length; wrongRead += w
    if (done.length) { all += of.length; wrong += (of.length * w) / done.length }
  }
  return { pages: pages.filter(p => p.lang === lang && (GATE_KINDS as readonly string[]).includes(p.kind)).length, read, wrong: wrongRead, pct: all ? Math.round((100 * wrong) / all) : 0 }
}

/** engine-state/fit-summary.json: what the owner's daily report shows. Three random pages a day, passing or failing. */
export function fitSummary(pages: Page[], state: FitState, held: Map<string, Held>, day: string) {
  const heldIn = (lang: Lang) => pages.filter(p => p.lang === lang && held.has(fileOf(p))).length
  const read = pages.filter(p => state[fitKey(p)]?.hash === fitText(p).hash)
  const sample = fitOrder(read, `sample:${day}`).slice(0, 3).map(p => ({
    lang: p.lang, path: p.path, url: pageUrl(p), title: p.title,
    wrong: fitFindings(p, state[fitKey(p)]).sort((a, b) => Number(a.check === 'words') - Number(b.check === 'words')).slice(0, 3).map(f => ({ check: f.check, quote: f.quote })),
  }))
  return {
    day, baseline: FIT_BASELINE,
    langs: Object.fromEntries(LANGS.map(lang => [lang, { ...fitPct(pages, state, lang), held: heldIn(lang) }])),
    labels: FIT_LABEL_VI, sample,
  }
}

/** Writes engine-state/fit-summary.json, for the daily report. */
export async function writeFitSummary(root: string, pages: Page[], state: FitState, o: { held?: Map<string, Held>; now?: Date } = {}) {
  const s = fitSummary(pages, state, o.held ?? await heldNow(root, pages), vnDay(o.now ?? new Date()))
  await writeFile(join(root, 'engine-state/fit-summary.json'), `${JSON.stringify(s, null, 1)}\n`)
}
