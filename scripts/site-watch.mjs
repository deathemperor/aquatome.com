#!/usr/bin/env node
// Layer 2 of docs/governance.md: the browser checks against the live site become GitHub issues (label site-check), one
// per problem. A problem still failing updates its issue; a check that passes again closes it. Uses the gh CLI (GH_TOKEN).
//
//   site-watch.mjs prepare <site> <dir>      sitemap → <dir>/e2e-pages.json; pages of open issues → <dir>/e2e-recheck.json
//   site-watch.mjs report <results.json>[,<more.json>] <run-url>    (the page checks, then Lighthouse's own run)
//   site-watch.mjs deploy-failed <run-url> | deploy-ok <run-url>
//   site-watch.mjs pr-comment <results.json> <pr-number> <run-url>    the AI review's findings as one comment on the PR
//
// The AI review (e2e/review.spec.ts, layer 3): a "high" finding fails its check and becomes a site-check issue like any
// other; "medium" ones are notes, kept in one issue per page (label page-review), refreshed each review, closed by hand.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const LABEL = 'site-check'
const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
/** A change to the repository's issues; DRY_RUN=1 prints it instead (trying the script locally). */
const act = (...args) => (process.env.DRY_RUN ? (console.log('[dry run] gh', args.map(a => (a.length > 80 ? `${a.slice(0, 80)}…` : a)).join(' ')), 'https://github.com/dry-run') : gh(...args))
const today = () => new Date().toISOString().slice(0, 10)
const fingerprint = key => createHash('sha1').update(key).digest('hex').slice(0, 12)
const marker = (fp, path) => `<!-- ${LABEL} fp=${fp}${path ? ` path=${path}` : ''} -->`

/** Open site-check issues by fingerprint, with the page each one is about. */
function openIssues() {
  let list = []
  try { list = JSON.parse(gh('issue', 'list', '--label', LABEL, '--state', 'open', '--limit', '300', '--json', 'number,body')) } catch { /* no label yet */ }
  const out = new Map()
  for (const i of list) {
    const m = i.body.match(new RegExp(`<!-- ${LABEL} fp=(\\w+)(?: path=(\\S+))? -->`))
    if (m) out.set(m[1], { number: i.number, path: m[2], body: i.body })
  }
  return out
}
function ensureLabel() {
  try { act('label', 'create', LABEL, '--color', 'B60205', '--description', 'A browser check failed on aquatome.com (scripts/site-watch.mjs)') } catch { /* exists */ }
}
/** Create the issue, or record the new failure on the open one (an edit, not a comment: no mail every night). */
function failing(issues, { fp, path, title, details, runUrl, autofix = false }) {
  const seen = `**Last failed:** ${today()}, [run](${runUrl})`
  const open = issues.get(fp)
  if (open) {
    act('issue', 'edit', String(open.number), '--body', open.body.replace(/\*\*Last failed:\*\*.*$/m, seen))
    return console.log(`#${open.number} still failing: ${title}`)
  }
  const body = [marker(fp, path), `${seen}`, '', details, '', 'Closes by itself when the check passes again (docs/governance.md, layer 2). Fixing it: reproduce with the check, keep the check, fix the page.'].join('\n')
  const url = act('issue', 'create', '--title', title, '--label', LABEL, '--body', body).trim()
  console.log(`opened ${url}: ${title}`)
  // Layer 4: hand a new page problem to fix.yml (a few per run; an issue opened with this token starts no workflow).
  const n = url.match(/\/issues\/(\d+)$/)?.[1]
  if (n && autofix && dispatched < 3) { act('workflow', 'run', 'fix', '-f', `issue=${n}`); dispatched++ }
}
let dispatched = 0
function passing(issues, fp, runUrl, what) {
  const open = issues.get(fp)
  if (!open) return
  act('issue', 'close', String(open.number), '--comment', `${what} again on ${today()} ([run](${runUrl})).`)
  console.log(`closed #${open.number}`)
}

const NOTES = 'page-review'
/** The AI review's medium findings on a page: one issue per page, its list replaced by the latest review's. */
function notes(c, runUrl) {
  const path = c.title.replace(/^review /, '').replace(/ @\w+$/, '')
  const fp = fingerprint(`notes:${path}`)
  try { act('label', 'create', NOTES, '--color', 'FBCA04', '--description', 'Notes from the AI page review (e2e/review.spec.ts)') } catch { /* exists */ }
  let open = []
  try { open = JSON.parse(gh('issue', 'list', '--label', NOTES, '--state', 'open', '--limit', '300', '--json', 'number,body')) } catch { /* none */ }
  const hit = open.find(i => i.body.includes(`fp=${fp}`))
  const body = [marker(fp, path), `**Last reviewed:** ${today()}, [run](${runUrl}) · [open the page](https://aquatome.com${path})`, '', ...c.notes.map(n => `- ${n}`), '', 'Notes, not failures: fix what is real, then close this issue (the next review reopens a new one if it still sees a problem).'].join('\n')
  if (hit) return act('issue', 'edit', String(hit.number), '--body', body), console.log(`#${hit.number} notes refreshed: ${path}`)
  console.log(`opened ${act('issue', 'create', '--title', `Review notes: ${path}`, '--label', NOTES, '--body', body).trim()}`)
}

const strip = s => s.replace(/\x1b\[[0-9;]*m/g, '')
/** Playwright's JSON report → one entry per check (a page or a journey), across the phone and computer runs. */
function checks(report) {
  const out = new Map()
  const walk = suite => {
    for (const spec of suite.specs ?? []) {
      const key = `${spec.file}: ${spec.title}`
      const c = out.get(key) ?? { key, title: spec.title, file: spec.file, failed: [], passed: [], errors: [], notes: [], highs: [] }
      for (const t of spec.tests) {
        if (t.status === 'skipped') continue
        for (const a of t.annotations ?? []) (a.type === 'review high' ? c.highs : a.type === 'review medium' ? c.notes : []).push(a.description)
        if (t.status === 'unexpected') {
          c.failed.push(t.projectName)
          const err = t.results.at(-1)?.error?.message
          if (err) c.errors.push(`${t.projectName}: ${strip(err).split('\n').slice(0, 12).join('\n')}`)
        } else c.passed.push(t.projectName)
      }
      out.set(key, c)
    }
    for (const s of suite.suites ?? []) walk(s)
  }
  for (const s of report.suites ?? []) walk(s)
  return [...out.values()]
}

const [cmd, ...args] = process.argv.slice(2)
if (cmd === 'prepare') {
  const [site, dir] = args
  const xml = await (await fetch(new URL('/sitemap.xml', site))).text()
  const pages = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => new URL(m[1]).pathname)
  writeFileSync(join(dir, 'e2e-pages.json'), JSON.stringify(pages))
  const recheck = [...openIssues().values()].map(i => i.path).filter(Boolean)
  writeFileSync(join(dir, 'e2e-recheck.json'), JSON.stringify(recheck))
  console.log(`${pages.length} pages in the sitemap, ${recheck.length} to recheck`)
} else if (cmd === 'report') {
  const [list, runUrl] = args
  const files = list.split(',')
  ensureLabel()
  const issues = openIssues()
  if (!files.every(existsSync)) {
    failing(issues, { fp: fingerprint('no-results'), title: 'Site checks did not run', details: 'The browser checks ended without results: see the run log.', runUrl })
    process.exit(0)
  }
  passing(issues, fingerprint('no-results'), runUrl, 'The checks ran')
  for (const c of files.flatMap(f => checks(JSON.parse(readFileSync(f, 'utf8'))))) {
    const fp = fingerprint(c.key)
    // The page a check is about (a page check, a review, Lighthouse): rechecked every run until it passes (prepare).
    const path = /^(page|review|lighthouse) /.test(c.title) ? c.title.replace(/^(page|review|lighthouse) /, '').replace(/ @\w+$/, '') : undefined
    if (c.failed.length) {
      // A review's failure is its serious findings; any other check's is its error.
      const what = c.highs.length ? [...new Set(c.highs)].map(h => `- ${h}`) : ['```', ...c.errors, '```']
      const details = [`**Check:** \`${c.key}\``, `**Fails on:** ${c.failed.join(', ')}${path ? ` · [open the page](https://aquatome.com${path})` : ''}`, '', ...what].join('\n')
      failing(issues, { fp, path, title: `Site check failed: ${c.title.replace(/ @\w+$/, '')}`, details, runUrl, autofix: true })
    } else if (c.passed.length) passing(issues, fp, runUrl, 'Passed on ' + c.passed.join(' and '))
    if (c.notes.length) notes(c, runUrl)
  }
} else if (cmd === 'deploy-failed') {
  ensureLabel()
  failing(openIssues(), { fp: fingerprint('deploy'), title: 'Deploy failed', details: 'The last deploy did not finish: aquatome.com still shows the version before it. Open the run, fix the failing step, then run deploy again.', runUrl: args[0] })
} else if (cmd === 'deploy-ok') {
  passing(openIssues(), fingerprint('deploy'), args[0], 'A deploy finished')
} else if (cmd === 'pr-comment') {
  const [file, pr, runUrl] = args
  const reviewed = existsSync(file) ? checks(JSON.parse(readFileSync(file, 'utf8'))).filter(c => c.title.startsWith('review ')) : []
  const lines = reviewed.flatMap(c => [...c.highs.map(h => `- **high**, ${c.title.replace(/ @\w+$/, '')}: ${h}`), ...c.notes.map(n => `- medium, ${c.title.replace(/ @\w+$/, '')}: ${n}`)])
  const body = [`### AI page review (advisory)`, '', reviewed.length ? `${reviewed.length} pages reviewed on the fixture build.` : 'The review did not run.', '', ...(lines.length ? lines : ['Nothing serious found.']), '', `[run](${runUrl}) · docs/governance.md, layer 3`].join('\n')
  try { act('pr', 'comment', pr, '--edit-last', '--body', body) } catch { act('pr', 'comment', pr, '--body', body) }
} else {
  console.error('usage: site-watch.mjs prepare <site> <dir> | report <results.json>[,<more.json>] <run-url> | deploy-failed <run-url> | deploy-ok <run-url> | pr-comment <results.json> <pr> <run-url>')
  process.exit(2)
}
