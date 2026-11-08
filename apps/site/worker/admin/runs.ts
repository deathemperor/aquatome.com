import { esc, fmt } from './chart'
import { failedBox, isFailed, page, type Soft } from './shell'
import { HOME_TZ, timeTag } from './time'
import type { RunRecord, RunRow, Turn } from '../fishid/transcript'

/**
 * The fish-ID runs kept a year (fishid/transcript.ts), web only: a day's list, one run's turns, and the day as JSON for
 * the evals. Under the fish-ID section, outside the menu.
 */
export const RUNS_PATH = '/_ab/nhan-dien-ca/luot/'
export const runPath = (day: string, id: string) => `${RUNS_PATH}${day}/${id}/`
export const runsJsonPath = (day: string) => `${RUNS_PATH}${day}.json`
const SECTION = '/_ab/nhan-dien-ca/'

const OUTCOME: Record<string, string> = { ok: 'answered', refused: 'Claude refused', unreadable: 'answer unreadable', request: 'API refused the request', unavailable: 'API down for a moment', resting: 'every key resting', error: 'server error' }
const STOPPED: Record<string, string> = { answer: 'answered', calls: 'out of calls', tools: 'out of tool calls', time: 'out of time', tokens: 'out of tokens', fallback: 'fell back to one call', error: 'error' }
const LEDE = 'Every fish ID request that called Claude, kept 365 days: what Claude thought (a summary), what it looked up in the handbook, what the tools answered and what the reader got. No reader photos, IP addresses or accounts.'
const shift = (day: string, by: number) => new Date(Date.parse(`${day}T00:00:00Z`) + by * 86_400_000).toISOString().slice(0, 10)

/** A day's runs (UTC days, as they are kept), newest first. */
export function runsPage(day: string, rows: Soft<RunRow[]>, now = new Date(), tz = HOME_TZ): string {
  const today = now.toISOString().slice(0, 10)
  const days = `<p><a href="${SECTION}">← Fish ID</a> · <a href="${RUNS_PATH}?ngay=${shift(day, -1)}">← ${shift(day, -1)}</a>${day < today ? ` · <a href="${RUNS_PATH}?ngay=${shift(day, 1)}">${shift(day, 1)} →</a>` : ''} · <a href="${runsJsonPath(day)}">JSON</a></p>`
  let body = `<h1>Fish ID requests on ${esc(day)}</h1><p class="lede">${LEDE}</p>${days}`
  if (isFailed(rows)) body += failedBox('the requests', rows)
  else {
    const tr = rows.map(r => `<tr><th><a href="${runPath(r.day, r.id)}">${timeTag(r.at, tz, now)}</a></th><td class="l">${esc(OUTCOME[r.outcome] ?? r.outcome)}</td><td class="l">${r.top ? `<i class="sci">${esc(r.top)}</i>` : '—'}</td><td>${r.conf === null ? '—' : `${fmt(r.conf * 100)}%`}</td><td>${fmt(r.calls)}</td><td class="l">${esc(STOPPED[r.stopped] ?? (r.stopped || '—'))}${r.rechecked ? ' · checked again once' : ''}</td><td>${esc(r.lang)}</td></tr>`).join('')
    body += `<div class="scroll"><table class="wide"><thead><tr><th>When</th><th>Outcome</th><th>Top guess</th><th>Sure</th><th>Claude calls</th><th>Stopped</th><th>Language</th></tr></thead><tbody>${tr || '<tr><td colspan="7" class="none">No requests kept for this day.</td></tr>'}</tbody></table></div>`
  }
  return page(SECTION, `Fish ID requests ${day}`, body, now, tz)
}

const pre = (s: string) => `<pre style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(s)}</pre>`
function turnHtml(t: Turn, n: number): string {
  const parts = [`<h3>Call ${n}</h3>`]
  if (t.thinking) parts.push(`<details><summary>Claude’s thinking (summary)</summary>${pre(t.thinking)}</details>`)
  if (t.text) parts.push(`<p>Claude wrote:</p>${pre(t.text)}`)
  for (const c of t.tools ?? []) {
    const photos = (c.photos ?? []).map(src => `<a href="${esc(src)}"><img class="thumb" src="${esc(src)}" alt="" width="96" loading="lazy"></a>`).join(' ')
    parts.push(`<p><code>${esc(c.name)}</code> ${esc(JSON.stringify(c.input))}${c.error ? ' <span class="failed">error</span>' : ''}</p>${c.result === undefined ? '' : `<details><summary>The tool answered</summary>${pre(c.result)}</details>`}${photos ? `<p>${photos}</p>` : ''}`)
  }
  if (t.sent) parts.push(`<p>Sent back to Claude:</p>${pre(t.sent)}`)
  return `<section>${parts.join('')}</section>`
}

/** One run: what it cost and how it ended, the reader's answer, then each call to Claude in order. */
export function runPage(day: string, r: RunRecord, now = new Date(), tz = HOME_TZ): string {
  const a = r.agent
  const facts = [
    `${timeTag(r.at, tz, now)}`, esc(OUTCOME[r.outcome] ?? r.outcome), esc(r.model), esc(r.lang), `${fmt(r.ms)} ms`, `$${r.cost.toFixed(4)}`, `${fmt(r.tokens.input)} tokens in · ${fmt(r.tokens.output)} out`,
    a ? `agent: ${fmt(a.calls)} Claude calls · ${fmt(a.tools)} tool calls · ${fmt(a.photos)} reference photos · ${esc(STOPPED[a.stopped] ?? a.stopped)}${a.rechecked ? ' · checked again once' : ''}` : 'one call',
  ].join(' · ')
  const results = (r.results ?? []).map(g => `<li><i class="sci">${esc(g.scientificName)}</i>${g.commonName ? ` (${esc(g.commonName)})` : ''} ${fmt(g.confidence * 100)}%${g.page ? ` · <code>${esc(g.page)}</code>` : ''}<br><span class="muted">${esc(g.reason)}</span></li>`).join('')
  const body = `<p><a href="${RUNS_PATH}?ngay=${esc(day)}">← Requests on ${esc(day)}</a></p><h1>Fish ID request</h1><p>${facts}</p>`
    + `<h2>What the reader got</h2>${r.verdict ? `<p>${esc(r.verdict)}</p>` : ''}${results ? `<ol>${results}</ol>` : '<p class="muted">No answer.</p>'}`
    + `<h2>The calls to Claude</h2>${r.turns.map((t, i) => turnHtml(t, i + 1)).join('') || '<p class="muted">None.</p>'}`
  return page(SECTION, 'Fish ID request', body, now, tz)
}
