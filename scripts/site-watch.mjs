#!/usr/bin/env node
// Layer 2 of docs/governance.md: the browser checks against the live site become GitHub issues (label site-check), one
// per problem. A problem still failing updates its issue; a check that passes again closes it. Uses the gh CLI (GH_TOKEN).
//
//   site-watch.mjs prepare <site> <dir>      sitemap → <dir>/e2e-pages.json; pages of open issues → <dir>/e2e-recheck.json
//   site-watch.mjs report <results.json>[,<more.json>] <run-url>    (the page checks, then Lighthouse's own run)
//   site-watch.mjs deploy-failed <run-url> | deploy-ok <run-url> | deploy-late <run-url>
//   site-watch.mjs pr-comment <results.json> <pr-number> <run-url>    the AI review's findings as one comment on the PR, and
//                                                                     how many reviews did not run, and why
//
// The AI review (e2e/review.spec.ts, layer 3): a "high" finding fails its check and becomes a site-check issue like any
// other; "medium" ones are notes, kept in one issue per page (label page-review), refreshed each review, closed by hand.
// A review stopped by Claude's usage limit is skipped: no issue opened, updated or closed.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

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
    act('issue', 'edit', String(open.number), '--title', title, '--body', open.body.replace(/\*\*Last failed:\*\*.*$/m, seen))
    return console.log(`#${open.number} still failing: ${title}`)
  }
  const body = [marker(fp, path), `${seen}`, '', details, '', 'Closes by itself when the check passes again (docs/governance.md, layer 2). Fixing it: reproduce with the check, keep the check, fix the page.'].join('\n')
  const url = act('issue', 'create', '--title', title, '--label', LABEL, '--body', body).trim()
  console.log(`opened ${url}: ${title}`)
  // Layer 4: hand a new page problem to fix.yml (a few per run; an issue opened with this token starts no workflow).
  const n = url.match(/\/issues\/(\d+)$/)?.[1]
  if (n && autofix && dispatched < 3) { act('workflow', 'run', 'fix.yml', '-f', `issue=${n}`); dispatched++ }
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
/**
 * The page a check is about, from its name, its project's tag off: "page /x/", "page checks /x/" (invariants.spec.ts),
 * "review /x/", "lighthouse /x/". The page checks' names have two words before the page: on 14 Nov 2026 their issues
 * recorded the page as "checks", so the recheck never found it and three issues stayed open after the page was fixed.
 */
export const checkedPage = title => /^(?:page checks|page|review|lighthouse) (\/\S*)$/.exec(title.replace(/ @\w+$/, ''))?.[1]

export function checks(report) {
  const out = new Map()
  const walk = suite => {
    for (const spec of suite.specs ?? []) {
      const key = `${spec.file}: ${spec.title}`
      const c = out.get(key) ?? { key, title: spec.title, file: spec.file, failed: [], passed: [], errors: [], notes: [], highs: [], skips: [] }
      for (const t of spec.tests) {
        // A skip is neither a pass nor a failure: report leaves its issue as it is. Its reason, for pr-comment.
        if (t.status === 'skipped') { c.skips.push(...(t.annotations ?? []).filter(a => a.type === 'skip' && a.description).map(a => a.description)); continue }
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

/**
 * The AI review's PR comment, from checks(). A page is reviewed when its review ran: it passed, or failed on what it
 * found. A skip (Claude's usage limit, e2e/claude-limit.ts) or any other failure is a review that did not run, counted
 * under its reason. ci.yml runs the phone project only, so a review's one skip is that reason.
 */
export function prComment(results, runUrl) {
  const reviews = results.filter(c => c.title.startsWith('review '))
  const reviewed = reviews.filter(c => c.passed.length || c.highs.length)
  const unrun = Map.groupBy(reviews.filter(c => !reviewed.includes(c)), c => c.skips[0] ?? c.errors[0]?.split('\n')[0] ?? 'no result')
  const lines = reviewed.flatMap(c => [...c.highs.map(h => `- **high**, ${c.title.replace(/ @\w+$/, '')}: ${h}`), ...c.notes.map(n => `- medium, ${c.title.replace(/ @\w+$/, '')}: ${n}`)])
  const head = reviewed.length ? `${reviewed.length} pages reviewed on the fixture build.` : reviews.length ? 'No page was reviewed.' : 'The review did not run.'
  const why = [...unrun].map(([reason, cs]) => `${cs.length} ${cs.length === 1 ? 'review' : 'reviews'} did not run: ${reason}`)
  // A page not reviewed (a usage limit, the review's daily ceiling, a failure) is never to be taken for a clean one.
  const missed = reviews.length - reviewed.length
  const notAPass = missed ? [`**This is not a pass: ${missed} of ${reviews.length} pages ${missed === 1 ? 'was' : 'were'} not reviewed.**`] : []
  const clean = missed ? `Nothing serious found on the ${reviewed.length} reviewed.` : 'Nothing serious found.'
  return [`### AI page review (advisory)`, '', head, ...why, ...notAPass, '', ...(reviewed.length ? [...(lines.length ? lines : [clean]), ''] : []), `[run](${runUrl}) · docs/governance.md, layer 3`].join('\n')
}

const locs = xml => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1])
/** The paths a site's sitemap lists: /sitemap.xml is an index of one sitemap per kind of page, or, on an older build, the list itself. */
export async function sitemapPages(site, get = fetch) {
  const read = async path => (await get(new URL(path, site))).text()
  const top = await read('/sitemap.xml')
  const sheets = top.includes('<sitemapindex') ? await Promise.all(locs(top).map(u => read(new URL(u).pathname))) : [top]
  return sheets.flatMap(locs).map(u => new URL(u).pathname)
}

export const LATE_HOURS = 3
/** Changes that have waited too long for a deploy, from their commits' dates; null while none has. */
export function lateDeploy(commitDates, now) {
  if (!commitDates.length) return null
  const hours = Math.floor((now - Math.min(...commitDates.map(d => Date.parse(d)))) / 3_600_000)
  return hours >= LATE_HOURS ? { hours, changes: commitDates.length } : null
}
/** deploy.yml's paths (its test holds them to it). */
export const DEPLOY_PATHS = ['apps/', 'packages/schema/', 'content/', 'pnpm-lock.yaml']
/** Whether changes taken together (main against the last deploy) touch what deploy.yml deploys. GitHub starts a deploy
 *  from a push's changes taken together: an engine push that changes a file and changes it back starts none, and
 *  leaves nothing waiting. A folder matches what is under it; a file matches that file only. */
export const goesLive = files => files.some(f => DEPLOY_PATHS.some(p => p.endsWith('/') ? f.startsWith(p) : f === p))
/** The commits on main a deploy would carry (deploy.yml's paths) that came after the last deploy to finish. */
export function waitingCommits(call = gh) {
  const repo = process.env.GITHUB_REPOSITORY ?? 'deathemperor/aquatome.com'
  const sha = call('run', 'list', '-R', repo, '--workflow', 'deploy.yml', '--status', 'success', '--limit', '1', '--json', 'headSha', '--jq', '.[0].headSha').trim()
  // At 300 files the list is cut off, and only an ancestor of main (ahead or identical) is the diff since the deploy.
  // A rename's old path is previous_filename. Otherwise the compare can't say none goes live.
  let compared = null
  try {
    compared = JSON.parse(call('api', `repos/${repo}/compare/${sha}...main`, '--jq', '{status,files:[.files[]?|{filename,previous_filename}]}'))
  } catch { /* a compare that cannot be read: count the commits */ }
  const files = Array.isArray(compared?.files) ? compared.files : null
  if (files && (compared?.status === 'ahead' || compared?.status === 'identical') && files.length < 300) {
    const names = files.flatMap(f => [f?.filename, f?.previous_filename].filter(n => typeof n === 'string'))
    if (!goesLive(names)) return []
  }
  const since = call('api', `repos/${repo}/commits/${sha}`, '--jq', '.commit.committer.date').trim()
  const seen = new Map()
  for (const path of DEPLOY_PATHS.map(p => p.replace(/\/$/, ''))) {
    const list = JSON.parse(call('api', '-X', 'GET', `repos/${repo}/commits`, '-f', 'sha=main', '-f', `since=${since}`, '-f', `path=${path}`, '-f', 'per_page=100'))
    for (const c of list) if (c.sha !== sha) seen.set(c.sha, c.commit.committer.date)
  }
  return [...seen.values()]
}

// Run as a script it acts; imported (its test, apps/site/test/site-watch.test.ts) it only defines.
const main = import.meta.url === pathToFileURL(process.argv[1] ?? '').href
const [cmd, ...args] = main ? process.argv.slice(2) : []
if (cmd === 'prepare') {
  const [site, dir] = args
  const pages = await sitemapPages(site)
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
    const path = checkedPage(c.title)
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
  failing(openIssues(), { fp: fingerprint('deploy'), title: 'Deploy failed', details: 'The last deploy did not finish: aquatome.com still shows the version before it. Open the run, fix the failing step, then run deploy.yml again.', runUrl: args[0] })
} else if (cmd === 'deploy-ok') {
  passing(openIssues(), fingerprint('deploy'), args[0], 'A deploy finished')
} else if (cmd === 'deploy-late') {
  const issues = openIssues()
  const fp = fingerprint('deploy-late')
  const late = lateDeploy(waitingCommits(), Date.now())
  if (late) {
    ensureLabel()
    const first = !issues.has(fp)
    failing(issues, { fp, title: `No deploy has finished for ${late.hours} hours: ${late.changes} changes waiting`, details: 'Changes are merged and aquatome.com still shows the version before them. Look at the Deploy aquatome.com runs: a run cut off by its time limit shows as cancelled.', runUrl: args[0] })
    if (first) process.exitCode = 1 // once, so a failed run reports it; the issue carries it from there
  } else passing(issues, fp, args[0], 'Deploys caught up')
} else if (cmd === 'pr-comment') {
  const [file, pr, runUrl] = args
  const body = prComment(existsSync(file) ? checks(JSON.parse(readFileSync(file, 'utf8'))) : [], runUrl)
  try { act('pr', 'comment', pr, '--edit-last', '--body', body) } catch { act('pr', 'comment', pr, '--body', body) }
} else if (main) {
  console.error('usage: site-watch.mjs prepare <site> <dir> | report <results.json>[,<more.json>] <run-url> | deploy-failed <run-url> | deploy-ok <run-url> | pr-comment <results.json> <pr> <run-url>')
  process.exit(2)
}
