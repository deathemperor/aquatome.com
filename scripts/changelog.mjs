#!/usr/bin/env node
// The product change log's words (AGENTS.md, "Pull requests"): what a merged pull request changed for readers, app users
// and the engine's content, as the owner reads it. A PR says it in its body:
//
//   ## Changelog
//   - Site: Readers can attach one photo to a comment.
//   - none            (no product change: CI, tests, refactors, docs)
//
// A PR without the section (older ones, the autofixer's) falls back to its title, for a `feat` or `fix` only. The daily
// report's collector (scripts/daily-report.mjs) reads these; ci.yml's `changelog` job runs `check` on a PR's body, read
// live with `gh pr view --json author,title,body,files` on stdin, so a body fixed after the push passes when the job is
// run again.
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const AREAS = { site: 'Site', app: 'App', engine: 'Engine' }
/** One line as the report and the change log page show it; longer is cut, with an ellipsis. */
export const MAX_TEXT = 300
/** fix.yml's PRs, as `gh pr view` names their author and as the event does. */
const BOTS = new Set(['app/github-actions', 'github-actions[bot]', 'github-actions'])
/** What the engine writes: a PR of only these is a content push. */
const CONTENT = /^(?:content|engine-state|sources)\//
/** A fallback title in one of these scopes isn't a product change. */
const NOT_PRODUCT = new Set(['ci', 'test', 'tests', 'docs', 'chore'])

/** The body's lines, without fenced code or HTML comments: an example of the section in either isn't the section. */
function prose(body) {
  const out = []
  let fence = ''
  for (const line of String(body ?? '').replace(/<!--[\s\S]*?(?:-->|$)/g, '').split(/\r\n?|\n/)) {
    const f = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1]
    if (fence) {
      if (f && f[0] === fence[0] && f.length >= fence.length) fence = ''
    } else if (f) fence = f
    else out.push(line)
  }
  return out
}

const BULLET = /^\s*(?:[-+]|\*(?!\*)|\d+[.)])\s*/
const LABEL = /^(?:\*\*|__)?(site|app|engine)(?:\*\*|__)?\s*:\s*(?:\*\*|__)?\s*(.*)$/i

/**
 * A body's "## Changelog" section (any heading level, any case): its list, up to the next heading, a rule or the first
 * line of prose (the "Generated with" line under it, say). `entries`: its `Site:`, `App:` and `Engine:` lines, bullets
 * or not; `none`: it said there is no product change; `bad`: list items that are neither.
 */
export function parseChangelog(body) {
  const lines = prose(body)
  const at = lines.findIndex(l => /^ {0,3}#{1,6}[ \t]*changelog[ \t]*#*[ \t]*$/i.test(l))
  if (at < 0) return { found: false, none: false, entries: [], bad: [] }
  const entries = []
  const bad = []
  let none = false
  for (const raw of lines.slice(at + 1)) {
    if (/^ {0,3}#{1,6}(?:[ \t]|$)/.test(raw) || /^\s*([-*_])(?:\s*\1){2,}\s*$/.test(raw)) break
    if (!raw.trim()) continue
    const bullet = BULLET.exec(raw)?.[0]
    const line = raw.slice(bullet?.length ?? 0).trim()
    if (/^none\.?$/i.test(line)) { none = true; continue }
    const m = LABEL.exec(line)
    const text = m?.[2]?.replace(/\s+/g, ' ').trim()
    if (text) entries.push({ area: AREAS[m[1].toLowerCase()], text })
    else if (bullet || m) bad.push(raw.trim())
    else break
  }
  return { found: true, none, entries, bad }
}

/** What the section says, `[]` for `none`; undefined when the PR has no section it can be read from. */
export function sectionLines(body) {
  const c = parseChangelog(body)
  return c.found && (c.none || c.entries.length) ? c.entries : undefined
}

/** A conventional title's parts: "feat(ios, app): text" → feat, [ios, app], text. */
function conventional(title) {
  const m = /^\s*([a-z]+)(?:\(([^)]*)\))?!?:\s*(.*)$/i.exec(String(title ?? ''))
  return m ? { type: m[1].toLowerCase(), scope: (m[2] ?? '').toLowerCase().split(/[\s,/]+/).filter(Boolean), text: m[3].trim() } : undefined
}

/** The engine's content: a title of type `content`, or a PR whose files are all content, sources or engine state. */
export function isContentPush(title, files = []) {
  return conventional(title)?.type === 'content' || (files.length > 0 && files.every(f => CONTENT.test(f)))
}

/** A title the fallback may use, before its files are known: a `feat` or `fix` outside the ci, test, docs and chore scopes. */
export function titleQualifies(title) {
  const c = conventional(title)
  return Boolean(c && (c.type === 'feat' || c.type === 'fix') && c.text && !c.scope.some(w => NOT_PRODUCT.has(w)))
}

/** The area by the files a PR touched: any in the iOS app is App, else any in the engine is Engine, else Site. */
export const areaOf = (files = []) => (files.some(f => f.startsWith('apps/ios/')) ? 'App' : files.some(f => f.startsWith('packages/engine/')) ? 'Engine' : 'Site')

const sentence = s => {
  const t = s.charAt(0).toUpperCase() + s.slice(1)
  return /[.!?…]$/.test(t) ? t : `${t}.`
}

/** A PR without the section: its title's text after `type(scope): `, as a sentence, for a feat or fix that isn't content. */
export function fallbackChange(title, files = []) {
  if (!titleQualifies(title) || isContentPush(title, files)) return undefined
  return { area: areaOf(files), text: sentence(conventional(title).text) }
}

const clip = s => (s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT - 1)}…` : s)

/**
 * The product changes of merged pull requests (GitHub's objects, `merged_at` set), newest first, each line once (the
 * newest). `files`: each PR's changed paths by number, needed only for those that fall back to their title.
 */
export function productChanges(prs, files = {}) {
  const seen = new Set()
  const out = []
  for (const p of [...prs].sort((a, b) => Date.parse(b.merged_at) - Date.parse(a.merged_at))) {
    const lines = sectionLines(p.body) ?? [fallbackChange(p.title, files[p.number])].filter(Boolean)
    for (const l of lines) {
      const text = clip(l.text)
      const key = `${l.area}\n${text.toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ area: l.area, text, at: p.merged_at })
    }
  }
  return out
}

const HOW = [
  'Add a "## Changelog" section to the PR body: a line for each product change, starting Site:, App: or Engine: (the',
  'content engine), in one plain sentence for the owner, not a developer: no file names, codes or PR numbers. When nothing',
  'changes for readers, app users or the content (CI, tests, refactors, docs), the one line is "- none". For example:',
  '',
  '## Changelog',
  '- Site: Readers can attach one photo to a comment.',
  '',
  'Then run this job again: it reads the body as it is now.',
].join('\n')

/** Why a PR's body doesn't pass, or undefined when it does. fix.yml's PRs and the engine's content pass as they are. */
export function checkPr({ author, title, body, files = [] }) {
  if (BOTS.has(author)) return undefined
  if (isContentPush(title, files)) return undefined
  const c = parseChangelog(body)
  if (!c.found) return `This pull request's body has no "## Changelog" section.\n\n${HOW}`
  if (c.bad.length) return `These lines of the Changelog section start with none of Site:, App: or Engine:\n${c.bad.map(l => `  ${l}`).join('\n')}\n\n${HOW}`
  if (c.none && c.entries.length) return `The Changelog section says "none" and lists changes too: keep one.\n\n${HOW}`
  if (!c.none && !c.entries.length) return `The Changelog section is empty.\n\n${HOW}`
  return undefined
}

// Run as `node scripts/changelog.mjs check` it checks; imported (apps/site/test/changelog.test.ts) it only defines.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href && process.argv[2] === 'check') {
  const pr = JSON.parse(readFileSync(0, 'utf8'))
  const problem = checkPr({ author: pr.author?.login, title: pr.title, body: pr.body, files: (pr.files ?? []).map(f => f.path) })
  if (problem) {
    console.log(problem)
    console.log(`::error title=No product changelog::${problem.split('\n')[0]} See the job's log for what to add.`)
    process.exit(1)
  }
  console.log('The Changelog check passes.')
}
