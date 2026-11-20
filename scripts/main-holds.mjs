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
import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const FIT = 'engine-state/_fit.json'
// The gate's kinds (packages/engine/src/gate.ts GATED_KINDS; a test holds them to it) and its language files.
const GATED_KINDS = ['guides', 'species', 'plants', 'breeds', 'cards']
const FILE = new RegExp(`^content/(${GATED_KINDS.join('|')})/([^/]+)/([a-z]{2})\\.json$`)

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 30 })
// git grep answers 1 when nothing matches; anything else that fails throws.
const grep = (...args) => {
  try {
    return git('grep', ...args)
  } catch (e) {
    if (e.status === 1 && !e.stderr) return ''
    throw e
  }
}
// A file that isn't at <rev> is undefined; anything else that fails throws, a bad revision or a file that doesn't parse.
const at = (rev, file) => (git('ls-tree', '--name-only', rev, '--', file).trim() ? JSON.parse(git('show', `${rev}:${file}`)) : undefined)
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
const READ = ['name', 'title', 'eyebrow', 'body', 'definition', 'summary', 'faq', 'localNote']
const SECTIONED = ['species', 'plants']
export const read = (page, kind) => ({
  ...Object.fromEntries(READ.map(k => [k, k === 'localNote' ? page.localNote?.html : page[k]])),
  ...(SECTIONED.includes(kind)
    ? { sections: Object.fromEntries(Object.entries(page.sections ?? {}).filter(([k]) => !k.startsWith('references'))) }
    : {}),
})
const withHeld = (page, held) => {
  const { held: _held, ...rest } = page
  return held ? { ...rest, held } : rest
}
// A hold with harm among its checks, as gate.ts writes one for another language's harm.
const withHarm = held => (held ? { ...held, checks: [...new Set([...held.checks, 'harm'])].sort() } : undefined)

function main() {
  const [base, main, run] = process.argv.slice(2)
  if (!base || !main) {
    console.error('usage: node scripts/main-holds.mjs <base> <main> [<run>]')
    process.exit(2)
  }
  const changed = git('diff', '--name-only', '--no-renames', main, 'HEAD', '--', 'content').split('\n').filter(f => FILE.test(f))
  if (!changed.length) return
  const out = []
  // Files written here: file → [what, page].
  const written = new Map()
  // Releases still to decide on another language's harm: file → the page to write, or undefined to take main's whole.
  const releases = new Map()
  // The gate's day (ceiling.ts vnDay).
  const day = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)
  const fit = { base: at(base, FIT) ?? {}, main: at(main, FIT) ?? {}, head: at('HEAD', FIT) ?? {} }
  // The files both main and this run changed since <base>: the only ones whose merge can be a text neither side has.
  const since = rev => git('diff', '--name-only', '--no-renames', base, rev, '--', 'content').split('\n')
  const mainChanged = new Set(since(main))
  const both = new Set(run ? since(run).filter(f => mainChanged.has(f)) : [])
  for (const f of changed) {
    const [, kind, id, lang] = FILE.exec(f)
    const key = `${lang}/${kind}/${id}`
    // Main read it during the run, and its read is the one that stands.
    if (same(fit.base[key], fit.main[key]) || !same(fit.head[key], fit.main[key])) {
      // Or nobody read it: both sides changed the page, and the merge's text is neither's (main's hand fix to one section,
      // this run's rewrite of another), while the record that stands read one side's. It waits held for its next read, as
      // the gate holds a page it couldn't read: the run's hold, or the gate's mark (a reader of #1703). A text that is one
      // side's stays as merged: a hand fix main made alone, the sweep's words (the chief of staff, 20 Nov).
      if (!both.has(f)) continue
      const [ours, theirs, mine] = [at('HEAD', f), at(main, f), at(run, f)]
      if (ours && theirs && mine && !ours.held && !same(read(ours, kind), read(theirs, kind)) && !same(read(ours, kind), read(mine, kind)))
        written.set(f, ['unread', withHeld(ours, mine.held ?? { checks: [], at: day })])
      continue
    }
    const ours = at('HEAD', f)
    const theirs = at(main, f)
    if (!ours || !theirs || same(ours, theirs)) continue
    if (same(text(ours), text(theirs))) {
      if (ours.held && !theirs.held) releases.set(f, undefined)
      else out.push(['hold', f])
    } else if (run && same(read(ours, kind), read(theirs, kind))) {
      // Main's record read this very text: its hold, or its release, onto the merge's file.
      if (ours.held && !theirs.held) releases.set(f, withHeld(ours, undefined))
      else if (!same(ours.held, theirs.held)) written.set(f, ['own', withHeld(ours, theirs.held)])
    } else if (ours.held || !run) out.push(['text', f])
    else written.set(f, ['keep', withHeld(ours, at(run, f)?.held ?? { checks: [], at: day })])
  }
  const taken = new Set(out.filter(([what]) => what === 'hold').map(([, f]) => f))
  // A file's hold as this ends, a release aside (decided below): written here, main's taken whole, or the merge's.
  const heldAtEnd = f => (written.has(f) ? written.get(f)[1] : at(taken.has(f) ? main : 'HEAD', f))?.held
  const harmAtEnd = f => !releases.has(f) && !!heldAtEnd(f)?.checks?.includes('harm')
  const files = dir => git('ls-tree', '--name-only', 'HEAD', `${dir}/`).split('\n').filter(s => FILE.test(s))
  const dirOf = f => f.replace(/\/[a-z]{2}\.json$/, '')
  // Harm in one language holds the page's every language, as gate.ts does. Of each page this compares, every language
  // file is looked at as the push ends, one the same as main's too: a hold for harm written here, main's taken, or the
  // merge's (main's, where the file is main's). A language left open beside it takes the run's hold with harm, or harm
  // (a reader of #1703). A release waits below. The older caller writes nothing, and gets the older answer.
  if (run) {
    const dirs = [...new Set(changed.map(dirOf))]
    const candidates = new Set([...written.keys(), ...taken].map(dirOf))
    for (let i = 0; i < dirs.length; i += 400)
      for (const l of grep('-l', '-F', '"harm"', 'HEAD', '--', ...dirs.slice(i, i + 400).map(d => `${d}/`)).split('\n'))
        if (l) candidates.add(dirOf(l.replace(/^HEAD:/, '')))
    for (const dir of candidates) {
      const langs = files(dir)
      if (!langs.some(harmAtEnd)) continue
      for (const s of langs) {
        if (releases.has(s) || heldAtEnd(s)) continue
        written.set(s, ['beside', withHeld(at('HEAD', s), withHarm(at(run, s)?.held) ?? { checks: ['harm'], at: day })])
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
  // Written once every read has passed, as gate.ts writes a hold.
  for (const [f, [, page]] of written) writeFileSync(f, `${JSON.stringify(page, null, 2)}\n`)
  for (const [what, f] of out) console.log(`${what} ${f}`)
  for (const [f, [what]] of written) console.log(`${what} ${f}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
