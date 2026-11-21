import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { SOURCES } from '../src/sources'

// The chief of staff, 21 Nov 2026: the Internet Archive's rest is the Mac's (archive.ts keeps it in a file on the Mac), so
// the magazine's whole Archive work is one step in the Mac's pages part, right after the three sources read through it, and
// GitHub never asks the Archive. "Replace it with one that fails when a step outside the Mac's pages part asks the Archive."
// Read from the code itself: which of cli.ts's commands are given the Archive's reader, and where the cycle runs each.

const REPO = join(__dirname, '../../..')
const read = (p: string) => readFileSync(join(REPO, p), 'utf8')
const CLI = read('packages/engine/src/cli.ts')

/** Each top-level name in cli.ts that makes the Archive's reader, or calls one that does: `archiveReader` today. */
function readers(cli: string): string[] {
  // A definition runs to the next line that starts a statement of its own at the margin.
  const defs = [...cli.matchAll(/^(?:const|function|async function) (\w+)\b/gm)].map(m => {
    const end = /^[^\s})\]]/m.exec(cli.slice(m.index! + m[0].length))
    return { name: m[1]!, text: cli.slice(m.index!, end ? m.index! + m[0].length + end.index : cli.length) }
  })
  const found = new Set<string>()
  for (let grew = true; grew;) {
    grew = false
    for (const d of defs) if (!found.has(d.name) && (/new ArchiveFetcher\(/.test(d.text) || [...found].some(n => new RegExp(`\\b${n}\\(`).test(d.text)))) { found.add(d.name); grew = true }
  }
  return [...found]
}
/** cli.ts's commands, each with the text of the branch that runs it. */
function branches(cli: string): Map<string, string> {
  const heads = [...cli.matchAll(/^(?:\} else )?if \((cmd === [^\n]*)\) \{$/gm)]
  const out = new Map<string, string>()
  heads.forEach((h, i) => {
    const body = cli.slice(h.index! + h[0].length, heads[i + 1]?.index ?? cli.length)
    for (const [, c] of h[1]!.matchAll(/cmd === '([\w-]+)'/g)) out.set(c!, (out.get(c!) ?? '') + body)
  })
  return out
}
const READERS = readers(CLI)
const BRANCHES = branches(CLI)
/** Whether a command is given the Archive's reader. */
const asksArchive = (cmd: string) => {
  const body = BRANCHES.get(cmd)
  if (body === undefined) throw new Error(`no command ${cmd} in cli.ts`)
  return /new ArchiveFetcher\(/.test(body) || READERS.some(n => new RegExp(`\\b${n}\\(`).test(body))
}

type Step = { cmd: string; line: string; where: string }
/**
 * The engine's steps in a cycle script, each with the parts it runs in: an `if part …; then` block's, or every part's for a
 * step outside one (in a function, before the parts), which counts as GitHub's too.
 */
function cycleSteps(file: string): Step[] {
  const out: Step[] = []
  let where = 'every part', depth = 0
  for (const raw of read(file).split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const part = depth === 0 && /^if part ([\w ]+?)(?: &&[^;]*)?; then$/.exec(line)
    if (part) { where = part[1]!; depth = 1; continue }
    // An `if` whose `fi` is on its line changes nothing; one whose `else …; fi` ends a later line closes there.
    if (/^if\b/.test(line)) { if (!/\bfi$/.test(line)) depth++ }
    else if ((/^fi\b/.test(line) || /\bfi$/.test(line)) && --depth === 0) where = 'every part'
    for (const m of line.matchAll(/pnpm engine ([\w-]+)/g)) out.push({ cmd: m[1]!, line, where })
  }
  return out
}
const workflowSteps = (): Step[] => readdirSync(join(REPO, '.github/workflows')).filter(f => /\.ya?ml$/.test(f))
  .flatMap(f => [...read(`.github/workflows/${f}`).matchAll(/pnpm engine ([\w-]+)/g)].map(m => ({ cmd: m[1]!, line: m[0], where: `GitHub (${f})` })))
const STEPS = [...cycleSteps('scripts/engine-cycle.sh'), ...cycleSteps('scripts/cycle-checks.sh'), ...workflowSteps()]
const onGitHub = (s: Step) => s.where === 'every part' || s.where.split(' ').includes('rewrite') || s.where.startsWith('GitHub')
const ARCHIVED = new Set<string>(SOURCES.filter(s => s.via === 'archive').map(s => s.id))

test("the Archive's reader is made in cli.ts alone, and each command given it is found", () => {
  expect(READERS).toEqual(['archiveReader'])
  const code = ['packages/engine/src', 'packages/engine/scripts', 'scripts'].flatMap(dir => readdirSync(join(REPO, dir), { withFileTypes: true, recursive: true })
    .filter(e => e.isFile() && /\.(ts|mjs|js|sh)$/.test(e.name)).map(e => join(e.parentPath, e.name).slice(REPO.length + 1)))
  // archive.ts's own: a capped reader is a copy of the one it is made from, with its rest.
  expect(code.filter(f => /new ArchiveFetcher\(/.test(read(f)))).toEqual(['packages/engine/src/archive.ts', 'packages/engine/src/cli.ts'])
  // Nothing asks the Archive round its reader: its address is named only there, and where an Archive address is told
  // apart from its site's (refused-sources.ts).
  expect(code.filter(f => /web\.archive\.org/.test(read(f)))).toEqual(['packages/engine/src/archive.ts', 'packages/engine/src/refused-sources.ts'])
  expect([...BRANCHES.keys()].filter(asksArchive).sort()).toEqual(['card-fill', 'magazine', 'run'])
})

test("no step outside the Mac's pages part asks the Archive, and none of GitHub's at all", () => {
  // A source's run outside the pages part names its sources, none of them read through the Archive: the sf part's Seriously
  // Fish. It still holds the reader for run.ts's own rule (the owner, 10 Nov 2026): a source that meets a browser check on
  // two runs in a week reads the Archive's copies, on this Mac and under its rest.
  const named = (s: Step) => {
    const list = /--sources (\S+)/.exec(s.line)?.[1]
    return (s.cmd === 'run' || s.cmd === 'card-fill') && !!list && list.split(',').every(id => !ARCHIVED.has(id))
  }
  const outside = STEPS.filter(s => asksArchive(s.cmd) && s.where !== 'pages' && !(named(s) && !onGitHub(s)))
  expect(outside.map(s => `${s.where}: ${s.line}`)).toEqual([])
  // The cycle's steps were read: the pages part's run and magazine, the sf part's run and card-fill, GitHub's ideas.
  expect(STEPS.filter(s => asksArchive(s.cmd)).map(s => `${s.where}: ${s.cmd}`)).toEqual(['pages: run', 'pages: magazine', 'sf: card-fill', 'sf: run'])
  expect(STEPS.filter(s => s.cmd === 'ideas' || s.cmd === 'write-ideas').map(s => s.where)).toEqual(['rewrite', 'rewrite'])
})

test("the magazine's step is the pages part's, right after the sources' run, and stops anywhere but the Mac", () => {
  const pages = STEPS.filter(s => s.where === 'pages')
  const run = pages.findIndex(s => s.cmd === 'run' && s.line.includes('--max-minutes'))
  expect(run).toBeGreaterThanOrEqual(0)
  expect(pages[run + 1]?.cmd).toBe('magazine')
  expect(STEPS.filter(s => s.cmd === 'magazine')).toHaveLength(1)
  const body = BRANCHES.get('magazine')!
  // Codex's fresh read of 21 Nov 2026: GITHUB_ACTIONS alone could be unset on another machine.
  const stop = body.indexOf("if (machine() !== 'mac' || process.platform !== 'darwin') {")
  expect(stop).toBeGreaterThanOrEqual(0)
  expect(body.indexOf('process.exit(1)', stop)).toBeLessThan(body.indexOf('archiveReader('))
  // Its listing, and the shops' (GitHub's ideas step), follow redirects by hand, never to the Archive (ideas.ts fetchListing).
  for (const cmd of ['ideas', 'magazine']) expect(BRANCHES.get(cmd), cmd).toMatch(/\bconst get = fetchListing\(fetch, UA\)/)
  expect(CLI).not.toMatch(/listingText\(await fetch\(/)
})

test("the magazine's record is written by its step alone: no other command reaches its writers, nor any other code its file", () => {
  // The chief of staff, 21 Nov 2026: "The magazine's own state file, written only by the Mac".
  expect([...BRANCHES].filter(([, body]) => /\b(?:refreshMagazine|writeMagazine)\(/.test(body)).map(([cmd]) => cmd)).toEqual(['magazine'])
  const ideas = read('packages/engine/src/ideas.ts')
  const fns = [...ideas.matchAll(/^(?:export )?(?:async )?function (\w+)/gm)].map((m, i, all) => ({ name: m[1]!, text: ideas.slice(m.index!, all[i + 1]?.index ?? ideas.length) }))
  expect(fns.filter(f => /\bsaveMagazine\(/.test(f.text)).map(f => f.name)).toEqual(['refreshMagazine', 'writeMagazine'])
  const src = readdirSync(join(REPO, 'packages/engine/src')).filter(f => f.endsWith('.ts') && read(`packages/engine/src/${f}`).includes('_magazine.json'))
  expect(src).toEqual(['ideas.ts'])
})
