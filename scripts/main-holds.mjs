#!/usr/bin/env node
// The pages whose hold is main's after a pull that brought main's commits in (cycle-checks.sh main_holds). A page's hold
// follows the record that won, so a release on main during a run stands (Page Recovery and the chief of staff, 16 Nov
// 2026). Pages and their records merge by different rules: a guide's file by lines, and on a clash this run's lines win
// (`-X theirs`); a species' or a plant's by field (merge-entity.mjs); the gate's records (engine-state/_fit.json) by key,
// main's first when both sides read a page. So when main read a page during the run and the run read it too, the page
// could keep the run's hold under main's record: on 15 Nov the outdoor pond guide, let out on main by the video recheck,
// came back held by the photos part for a finding main's record didn't have, and its address answered 404 for an hour.
//
// A language file that differs from main's after the merge, whose record main changed since <base>, and whose record is
// main's after the merge, takes main's hold when its text is main's (the file differs from main's in `held` alone): the
// record read that text. One whose text isn't main's keeps the merge's: main's record read another text, and its release
// could let out what the run's own read held. Those are listed, for the chief of staff's question whether a page should go
// back to main's whole.
// None of those goes out open (the chief of staff, 20 Nov 2026): on 19 Nov the pages run wrote Corydoras geoffroy again,
// and its own read held it for a source finding, the hold it had at the start; main had read the old text meanwhile and let
// it out. The page merged by field, the run's text with main's release, and went out open under main's record of the old
// text. Such a page keeps the run's hold, or, where the run didn't hold it, waits held with the gate's mark for a page not
// yet read (gate.ts: no checks), and the next gate reads it ("keep <file>": its hold written into the merge here). One the
// merge holds already stays as merged ("text <file>").
// The files are those the tree differs from main in, not those the run changed since <base>: a
// later try of a lost push replays an earlier try's "main's holds" commit, which then takes out a hold main has put back
// meanwhile, and nets to no change against <base> (a reader of #1505).
// Nor does a file take main's release while another language of its page stays held for harm, which holds every language
// (gate.ts): it stays as merged, and the next gate decides it ("harm <file>"). A language main lets out here too doesn't
// stay held: when the run held every language for one's harm and main let them all out, they all go (a reader of #1505).
//
// A page both sides changed, whose merged text neither side's record read, waits held for its next read too ("unread
// <file>"). Where main's record read the merged text and only fields its read doesn't cover differ (a cover this run set),
// main's hold, or its release, is written onto the merge's file, so those fields stay ("own <file>"). Text here is what
// the gate reads of a file (`read`), and a test holds `read` to fitText (a reader of #1703).
// A page held for harm in one language as the push ends is held in every language, as gate.ts does ("beside <file>": the
// run's hold with harm, or harm), whichever language main held, let out or this run added (a reader of #1703).
//
//   node scripts/main-holds.mjs <base> <main> <run>
// prints "hold <file>" for each file to take from <main> whole, "text <file>" for each the merge holds already on a text
// main's record didn't read, "harm <file>" for each release that waits on another language's harm, and, each written here,
// "keep", "unread", "own" and "beside". HEAD is the merge, and <run> the run's commit before the pull. Any git read or file
// it can't parse fails it, with nothing written: its caller then publishes nothing (cycle-checks.sh main_holds). Without
// <run>, as a cycle that started on the older script calls it, it writes nothing and answers as that script did.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const FIT = 'engine-state/_fit.json'
// The gate's kinds (packages/engine/src/gate.ts GATED_KINDS; a test holds them to it) and its language files.
const GATED_KINDS = ['guides', 'species', 'plants', 'breeds', 'cards']
const FILE = new RegExp(`^content/(${GATED_KINDS.join('|')})/([^/]+)/([a-z]{2})\\.json$`)

const git = (...args) => {
  try {
    return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'pipe'] })
  } catch {
    throw new Error(`main-holds: git ${args[0]} failed during hold comparison`)
  }
}
// A file that isn't at <rev> is undefined; anything else that fails throws, a bad revision, a file that doesn't parse, or
// one that parses to anything but an object (a page or record written as `null` would read as a page that isn't there:
// a reader of #1703). Each file is read once per revision.
const parseObject = (raw, what) => {
  let value
  try { value = JSON.parse(raw) } catch { throw new Error(`main-holds: could not parse ${what}`) }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`main-holds: ${what} isn't a JSON object`)
  return value
}
const seen = new Map()
const at = (rev, file) => {
  const k = `${rev}:${file}`
  if (!seen.has(k)) seen.set(k, git('ls-tree', '--full-tree', '--name-only', rev, '--', file).trim() ? parseObject(git('show', k), k) : undefined)
  return seen.get(k)
}
// An already-running two-argument caller expects each unreadable record to be skipped.
const legacyAt = (rev, file) => {
  try { return JSON.parse(git('show', `${rev}:${file}`)) } catch { return undefined }
}
// Many files at once, for the harm look-up over every language of the pages compared: one `git cat-file --batch`.
const atAll = (rev, files) => {
  const want = files.filter(f => !seen.has(`${rev}:${f}`))
  if (want.length) {
    const out = execFileSync('git', ['cat-file', '--batch'], { input: want.map(f => `${rev}:${f}\n`).join(''), maxBuffer: 1 << 30 })
    let i = 0
    for (const f of want) {
      const nl = out.indexOf(10, i)
      const header = nl >= i && /^[0-9a-f]+ blob (\d+)$/.exec(out.subarray(i, nl).toString('utf8'))
      const size = header ? Number(header[1]) : NaN
      const end = nl + 1 + size
      // These paths were listed in the tree. A missing or truncated response is a failed read.
      if (!Number.isSafeInteger(size) || out[end] !== 10) throw new Error(`main-holds: could not read ${rev}:${f}`)
      seen.set(`${rev}:${f}`, parseObject(out.subarray(nl + 1, end).toString('utf8'), `${rev}:${f}`))
      i = end + 1
    }
  }
  return files.map(f => seen.get(`${rev}:${f}`))
}
// Key order aside: the entity driver can write a page's fields in another order than the side it took them from.
const canon = v =>
  Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v
export const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b))
const text = page => {
  const { held: _held, ...rest } = page
  return rest
}
// What of a language file the gate's read covers (packages/engine/src/fit.ts fitText): the title, the parts, the summary
// and the questions, a guide's note for its readers (its words, put first in its text; not its sources), a card's eyebrow,
// title and body, and the sections of the kinds whose sections are parts, the sources' references aside. A file whose
// other fields alone differ, a guide's cover set on one side, was read as it is. HTML is compared as written: a page whose
// markup alone changed waits for a read, where a renderer of our own could call two texts the same that the gate's
// reads apart (a reader of #1703). A test holds `read` to fitText.
// A summary or questions absent read as none, as fitText reads them (a reader of #1703). Of a species or a plant, which of
// its parts show also turns on its record's sources (entity.json) and, for a species, content/one-voice.json (schema
// load.ts oneVoice): `selection`, read at the same revision as the page, so a part one side turned on or off counts as
// a change to the text (a reader of #1703).
const READ = ['name', 'title', 'eyebrow', 'body', 'definition', 'summary', 'faq', 'localNote']
const LISTS = ['summary', 'faq']
const SECTIONED = ['species', 'plants']
export const read = (page, kind, selection) => ({
  ...Object.fromEntries(READ.map(k => [k, k === 'localNote' ? page.localNote?.html : LISTS.includes(k) ? (page[k] ?? []) : page[k]])),
  ...(SECTIONED.includes(kind)
    ? { sections: Object.fromEntries(Object.entries(page.sections ?? {}).filter(([k]) => !k.startsWith('references'))) }
    : {}),
  ...(selection ? { selection } : {}),
})
const withHeld = (page, held) => {
  const { held: _held, ...rest } = page
  return held ? { ...rest, held } : rest
}
// A hold with harm among its checks, as gate.ts writes one for another language's harm.
const withHarm = held => (held ? { ...held, checks: [...new Set([...held.checks, 'harm'])].sort() } : undefined)

// Check the hashes with the gate’s loader. The small content tree contains only the candidate pages, their entities,
// and the inputs that select their text. Read it from HEAD before any holds are written to the worktree.
function publishedHashes(files) {
  if (!files.length) return {}
  const root = mkdtempSync(join(tmpdir(), 'aq-publish-fit-'))
  const engine = fileURLToPath(new URL('../packages/engine/', import.meta.url))
  try {
    const dirs = files.map(f => dirname(f))
    for (const file of new Set(['content/sources.json', 'content/one-voice.json', ...dirs.map(d => `${d}/entity.json`), ...files])) {
      const value = at('HEAD', file)
      if (value === undefined) continue
      mkdirSync(join(root, dirname(file)), { recursive: true })
      writeFileSync(join(root, file), JSON.stringify(value))
    }
    const langs = [...new Set(files.map(f => FILE.exec(f)[3]))]
    const stdout = execFileSync(process.execPath, ['--import', 'tsx', 'scripts/publish-fit-hashes.ts', join(root, 'content'), ...langs], { cwd: engine, encoding: 'utf8' })
    return JSON.parse(stdout)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

function main() {
  const [base, main, run, mode] = process.argv.slice(2)
  if (!base || !main) {
    console.error('usage: node scripts/main-holds.mjs <base> <main> [<run> [recovery]]')
    process.exit(2)
  }
  const dirOf = f => f.replace(/\/[a-z]{2}\.json$/, '')
  const files = (dir, rev = 'HEAD') => git('ls-tree', '--name-only', rev, `${dir}/`).split('\n').filter(s => FILE.test(s))
  // Which parts of a species or a plant show at <rev> (read's `selection`): its record's sources and its line in
  // one-voice.json. The pages whose selection differs between two revisions: their language files count as changed.
  const ONE_VOICE = 'content/one-voice.json'
  const selection = (rev, f) => {
    const [, kind, id] = FILE.exec(f)
    if (!SECTIONED.includes(kind)) return undefined
    const sources = (at(rev, `${dirOf(f)}/entity.json`)?.sections ?? []).map(x => `${x.key}:${x.source}`).sort()
    return { sources, voice: kind === 'species' ? ((at(rev, ONE_VOICE) ?? {})[id] ?? null) : null }
  }
  const readAt = (rev, f, page) => read(page, FILE.exec(f)[1], selection(rev, f))
  const selectionChanged = (a, b) => {
    const dirs = new Set()
    const [va, vb] = [at(a, ONE_VOICE) ?? {}, at(b, ONE_VOICE) ?? {}]
    for (const id of new Set([...Object.keys(va), ...Object.keys(vb)])) if (!same(va[id], vb[id])) dirs.add(`content/species/${id}`)
    for (const e of git('diff', '--name-only', '--no-renames', a, b, '--', 'content').split('\n')) {
      const m = /^(content\/(?:species|plants)\/[^/]+)\/entity\.json$/.exec(e)
      if (m && !same(selection(a, `${m[1]}/vi.json`), selection(b, `${m[1]}/vi.json`))) dirs.add(m[1])
    }
    return dirs
  }
  const different = (a, b) => git('diff', '--name-only', '--no-renames', a, b, '--', 'content').split('\n').filter(f => FILE.test(f))
  const withSelection = (list, a, b) => [...new Set([...list, ...[...selectionChanged(a, b)].flatMap(d => files(d))])]
  const changed = new Set(different(main, 'HEAD'))
  if (run) {
    for (const f of withSelection([...changed], main, 'HEAD')) changed.add(f)
    // A merge can take all of main’s page, losing a hold from the run with no diff against main.
    for (const f of different(run, 'HEAD')) {
      if (at(run, f)?.held && !at('HEAD', f)?.held) changed.add(f)
    }
  }
  if (!changed.size) return
  const out = []
  // Files written here: file → [what, page].
  const written = new Map()
  // Releases still to decide on another language's harm: file → the page to write, or undefined to take main's whole.
  const releases = new Map()
  const unread = { checks: [], at: new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10) }
  const lookup = run ? at : legacyAt
  const fit = { base: lookup(base, FIT) ?? {}, main: lookup(main, FIT) ?? {}, head: lookup('HEAD', FIT) ?? {} }
  // Include languages added by the run when main changed which text their page shows.
  const since = rev => withSelection(different(base, rev), base, rev)
  const mainChanged = new Set(run ? since(main) : [])
  const both = new Set(run ? since(run).filter(f => mainChanged.has(f)) : [])
  const comparisons = []
  for (const f of changed) {
    const [, kind, id, lang] = FILE.exec(f)
    const key = `${lang}/${kind}/${id}`
    const mainRecord = fit.main[key]
    const recordWon = same(fit.head[key], mainRecord)
    const mainRead = (!run || mainRecord !== undefined) && !same(fit.base[key], mainRecord) && recordWon
    if (!run && !mainRead) continue
    const ours = lookup('HEAD', f)
    if (!ours) continue
    const theirs = lookup(main, f)
    const mine = run ? at(run, f) : undefined
    const mainText = run && theirs && same(readAt('HEAD', f, ours), readAt(main, f, theirs))
    const runText = run && mine && same(readAt('HEAD', f, ours), readAt(run, f, mine))
    const release = mainRead && mainText && !theirs.held && (ours.held || mine?.held)
    // Older queued work can carry a stale or absent review after its original merge base is no longer visible.
    // Require a review whenever recovery would put text live that main does not already have open.
    const alreadyOpen = mainText && !theirs.held
    const savedReview = !ours.held && (mode === 'recovery'
      ? !alreadyOpen
      : theirs && !mainText && mainRecord && recordWon)
    comparisons.push({ f, key, ours, theirs, mine, mainRead, mainText, runText, proof: run && (release || savedReview) })
  }
  const hashes = publishedHashes(comparisons.filter(c => c.proof && typeof fit.head[c.key]?.hash === 'string').map(c => c.f))
  for (const { f, key, ours, theirs, mine, mainRead, mainText, runText, proof } of comparisons) {
    if (proof && (typeof hashes[key] !== 'string' || hashes[key] !== fit.head[key]?.hash)) {
      if (!ours.held) written.set(f, ['keep', withHeld(ours, mine?.held ?? (mainText ? theirs.held : undefined) ?? unread)])
      continue
    }
    if (runText && mine.held && !ours.held && (!mainText || !mainRead)) {
      written.set(f, ['keep', withHeld(ours, mine.held)])
      continue
    }
    if (!mainRead) {
      // Or nobody read it: both sides changed the page, and the merge's text is neither's (main's hand fix to one section,
      // this run's rewrite of another), while the record that stands read one side's. It waits held for its next read, as
      // the gate holds a page it couldn't read: the run's hold, or the gate's mark (a reader of #1703). A text that is one
      // side's stays as merged: a hand fix main made alone, the sweep's words (the chief of staff, 20 Nov).
      if (!both.has(f)) continue
      if (mine && !ours.held && !mainText && !runText)
        written.set(f, ['unread', withHeld(ours, mine.held ?? unread)])
      continue
    }
    if (!theirs) continue
    const shown = !run || same(selection('HEAD', f), selection(main, f))
    if (same(ours, theirs) && shown) continue
    if (same(text(ours), text(theirs)) && shown) {
      if (ours.held && !theirs.held) releases.set(f, undefined)
      else out.push(['hold', f])
    } else if (mainText) {
      // Main's record read this very text: its hold, or its release, onto the merge's file.
      if (ours.held && !theirs.held) releases.set(f, withHeld(ours, undefined))
      else if (!same(ours.held, theirs.held)) written.set(f, ['own', withHeld(ours, theirs.held)])
    } else if (!run) out.push(['text', f])
    else {
      if (ours.held) {
        // Where the text going out is the run's, what the run's read found on it stays, though the merge took another
        // hold: a harm the run found isn't lost to a source hold main wrote on the old text (a reader of #1703).
        const found = mine?.held && runText ? mine.held.checks.filter(c => !ours.held.checks.includes(c)) : []
        if (found.length) written.set(f, ['keep', withHeld(ours, { ...ours.held, checks: [...ours.held.checks, ...found].sort() })])
        else out.push(['text', f])
      } else written.set(f, ['keep', withHeld(ours, mine?.held ?? unread)])
    }
  }
  const taken = new Set(out.filter(([what]) => what === 'hold').map(([, f]) => f))
  // A file's hold as this ends, a release aside (decided below): written here, main's taken whole, or the merge's. The
  // older caller decides releases on the merge's holds, as the older script did (a reader of #1703).
  const heldAtEnd = f => (!run ? legacyAt('HEAD', f) : written.has(f) ? written.get(f)[1] : at(taken.has(f) ? main : 'HEAD', f))?.held
  const harmAtEnd = f => !releases.has(f) && !!heldAtEnd(f)?.checks?.includes('harm')
  // Harm in one language holds the page's every language, as gate.ts does. Of each page this compares, every language
  // file is looked at as the push ends, one the same as main's too: a hold for harm written here, main's taken, or the
  // merge's (main's, where the file is main's). Each is parsed, not searched for the word (a reader of #1703). A language
  // left open beside it takes the run's hold with harm, or harm. A release waits below. The older caller writes nothing,
  // and gets the older answer.
  if (run) {
    const dirs = [...new Set([...changed].map(dirOf))]
    const langs = new Map(dirs.map(d => [d, files(d)]))
    const all = [...langs.values()].flat()
    atAll('HEAD', all)
    atAll(main, all.filter(f => taken.has(f)))
    for (const [dir, ls] of langs) {
      if (!ls.some(harmAtEnd)) continue
      for (const s of ls) {
        if (releases.has(s) || heldAtEnd(s)) continue
        written.set(s, ['beside', withHeld(at('HEAD', s), withHarm(at(run, s)?.held) ?? { checks: ['harm'], at: unread.at })])
      }
    }
  }
  // A release waits while a language beside it stays held for harm: one not let out here too, until none is left.
  const harmBeside = f => files(dirOf(f)).filter(s => s !== f && !!heldAtEnd(s)?.checks?.includes('harm'))
  const free = new Set(releases.keys())
  for (let again = true; again; ) {
    again = false
    for (const f of free) if (harmBeside(f).some(s => !free.has(s))) again = free.delete(f)
  }
  for (const [f, page] of releases) {
    if (!free.has(f)) out.push(['harm', f])
    else if (page) written.set(f, ['own', page])
    else out.push(['hold', f])
  }
  // Written once every read has passed, as gate.ts writes a hold. The older caller writes nothing.
  if (run) for (const [f, [, page]] of written) writeFileSync(f, `${JSON.stringify(page, null, 2)}\n`)
  for (const [what, f] of out) console.log(`${what} ${f}`)
  if (run) for (const [f, [what]] of written) console.log(`${what} ${f}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
