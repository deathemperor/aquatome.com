#!/usr/bin/env node
// The pages whose hold is main's after a pull that brought main's commits in (cycle-checks.sh main_holds). A page's hold
// follows the record that won, so a release on main during a run stands (Page Recovery and the chief of staff, 16 Nov
// 2026). Pages and their records merge by different rules: a guide's file by lines, and on a clash this run's lines win
// (`-X theirs`); a species' or a plant's by field (merge-entity.mjs); the gate's records (engine-state/_fit.json) by key,
// main's first when both sides read a page. So when main read a page during the run and the run read it too, the page
// could keep the run's hold under main's record: on 15 Nov the outdoor pond guide, let out on main by the video recheck,
// came back held by the photos part for a finding main's record didn't have, and its address answered 404 for an hour.
//
// A language file the run changed whose record main changed since <base>, and whose record is main's after the merge,
// takes main's hold when its text is main's (the file differs from main's in `held` alone): the record read that text.
// One whose text isn't main's keeps the merge's: main's record read another text, and its release could let out what the
// run's own read held. Those are listed, for the chief of staff's question whether a page should go back to main's whole.
//
//   node scripts/main-holds.mjs <base> <this run's commit> <main>
// prints "hold <file>" for each file to take from <main>, and "text <file>" for each whose record is main's and text isn't.
import { execFileSync } from 'node:child_process'

const FIT = 'engine-state/_fit.json'
// The gate's kinds (packages/engine/src/gate.ts GATED_KINDS; a test holds them to it) and its language files.
const GATED_KINDS = ['guides', 'species', 'plants', 'breeds', 'cards']
const FILE = new RegExp(`^content/(${GATED_KINDS.join('|')})/([^/]+)/([a-z]{2})\\.json$`)

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 30 })
const at = (rev, file) => {
  try {
    return JSON.parse(git('show', `${rev}:${file}`))
  } catch {
    return undefined
  }
}
// Key order aside: the entity driver can write a page's fields in another order than the side it took them from.
const canon = v =>
  Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v
const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b))
const text = page => {
  const { held: _held, ...rest } = page
  return rest
}

const [base, run, main] = process.argv.slice(2)
if (!base || !run || !main) {
  console.error('usage: node scripts/main-holds.mjs <base> <this run\'s commit> <main>')
  process.exit(2)
}
const changed = git('diff', '--name-only', '--no-renames', base, run, '--', 'content').split('\n').filter(f => FILE.test(f))
if (changed.length) {
  const fit = { base: at(base, FIT) ?? {}, main: at(main, FIT) ?? {}, head: at('HEAD', FIT) ?? {} }
  for (const f of changed) {
    const [, kind, id, lang] = FILE.exec(f)
    const key = `${lang}/${kind}/${id}`
    // Main read it during the run, and its read is the one that stands.
    if (same(fit.base[key], fit.main[key]) || !same(fit.head[key], fit.main[key])) continue
    const ours = at('HEAD', f)
    const theirs = at(main, f)
    if (!ours || !theirs || same(ours, theirs)) continue
    console.log(`${same(text(ours), text(theirs)) ? 'hold' : 'text'} ${f}`)
  }
}
