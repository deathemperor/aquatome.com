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
// back to main's whole. The files are those the tree differs from main in, not those the run changed since <base>: a
// later try of a lost push replays an earlier try's "main's holds" commit, which then takes out a hold main has put back
// meanwhile, and nets to no change against <base> (a reader of #1505).
// Nor does a file take main's release while another language of its page stays held for harm, which holds every language
// (gate.ts): it stays as merged, and the next gate decides it ("harm <file>"). A language main lets out here too doesn't
// stay held: when the run held every language for one's harm and main let them all out, they all go (a reader of #1505).
//
//   node scripts/main-holds.mjs <base> <main> [--strict]
// prints "hold <file>" for each file to take from <main>, "text <file>" for each whose record is main's and text isn't,
// and "harm <file>" for each kept held for another language's harm. HEAD is the merge.
import { execFileSync } from 'node:child_process'

const FIT = 'engine-state/_fit.json'
// The gate's kinds (packages/engine/src/gate.ts GATED_KINDS; a test holds them to it) and its language files.
const GATED_KINDS = ['guides', 'species', 'plants', 'breeds', 'cards']
const FILE = new RegExp(`^content/(${GATED_KINDS.join('|')})/([^/]+)/([a-z]{2})\\.json$`)

const [base, main, mode] = process.argv.slice(2)
if (!base || !main) {
  console.error('usage: node scripts/main-holds.mjs <base> <main> [--strict]')
  process.exit(2)
}
const strict = mode === '--strict'
const git = (...args) => {
  try {
    return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'pipe'] })
  } catch {
    throw new Error(`git ${args[0]} failed during hold comparison`)
  }
}
const at = (rev, file) => {
  try {
    const value = JSON.parse(git('show', `${rev}:${file}`))
    if (!strict || (value && typeof value === 'object' && !Array.isArray(value))) return value
  } catch {
    // The tree lookup below distinguishes an absent path from an unreadable blob.
  }
  if (strict && git('ls-tree', '--full-tree', '-z', rev, '--', file))
    throw new Error(`could not read ${file} at ${rev} during hold comparison`)
  return undefined
}
// Key order aside: the entity driver can write a page's fields in another order than the side it took them from.
const canon = v =>
  Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v
const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b))
const text = page => {
  const { held: _held, ...rest } = page
  return rest
}

const changed = git('diff', '--name-only', '--no-renames', main, 'HEAD', '--', 'content').split('\n').filter(f => FILE.test(f))
// The page's other language files held for harm, in the merge.
const harmBeside = f => {
  const [, kind, id, lang] = FILE.exec(f)
  return git('ls-tree', '--name-only', 'HEAD', `content/${kind}/${id}/`)
    .split('\n')
    .filter(s => FILE.test(s) && FILE.exec(s)[3] !== lang && at('HEAD', s)?.held?.checks?.includes('harm'))
}
if (changed.length) {
  const out = []
  const fit = { base: at(base, FIT) ?? {}, main: at(main, FIT) ?? {}, head: at('HEAD', FIT) ?? {} }
  for (const f of changed) {
    const [, kind, id, lang] = FILE.exec(f)
    const key = `${lang}/${kind}/${id}`
    // Main read it during the run, and its read is the one that stands.
    if (same(fit.base[key], fit.main[key]) || !same(fit.head[key], fit.main[key])) continue
    const ours = at('HEAD', f)
    const theirs = at(main, f)
    if (!ours || !theirs || same(ours, theirs)) continue
    out.push([!same(text(ours), text(theirs)) ? 'text' : ours.held && !theirs.held ? 'release' : 'hold', f])
  }
  // A release waits while a language beside it stays held for harm: one not let out here too, until none is left.
  const releases = new Set(out.filter(([what]) => what === 'release').map(([, f]) => f))
  for (let again = true; again; ) {
    again = false
    for (const f of releases) if (harmBeside(f).some(s => !releases.has(s))) again = releases.delete(f)
  }
  for (const [what, f] of out) console.log(`${what === 'release' ? (releases.has(f) ? 'hold' : 'harm') : what} ${f}`)
}
