import { recentClashes } from '../chat/clash-store'
import type { FiledClash } from '../chat/clashes'
import { listAll, REPORT_PREFIX } from '../chat/store'
import { failedNote, note, table, tableHtml, type Block, type Section } from './blocks'
import { failedBox, isFailed, page, type Soft } from './shell'
import { HOME_TZ, timeText } from './time'

/** A reader's report of one chat answer as wrong (chat/past.ts), as it's kept in R2. */
export type ChatReport = { at: string; question: string; text: string; reason?: string }
export type ChatReports = { total: number; rows: ChatReport[]; clashes?: FiledClash[] }

const TITLE = 'Chat reports'
const LEDE = 'Chat answers readers marked as wrong, with their question and reason. Shown only here. Each is kept until the reader deletes their account, and goes with it.'
const OFF = 'Off (R2 UPLOADS is missing).'
const NONE = 'No reports yet.'
const CLASHES = 'Where the handbook disagrees with itself'
const CLASHES_LEDE = 'Two places in the handbook that say different things, filed by the chat when it read them, for the Writing Lead. Handbook text only: no reader\'s words and no account.'
const NO_CLASHES = 'None filed yet.'

/** The newest reports. One deleted with its account after the list was read is left out. */
export async function recentReports(bucket: R2Bucket, limit = 120): Promise<ChatReports> {
  const all = await listAll(bucket, REPORT_PREFIX)
  const newest = all.sort((a, b) => b.uploaded.getTime() - a.uploaded.getTime()).slice(0, limit)
  const rows = await Promise.all(newest.map(async o => (await bucket.get(o.key))?.json<ChatReport>()))
  return { total: all.length, rows: rows.filter(r => r !== undefined), clashes: await recentClashes(bucket) }
}

const reportsTable = (d: ChatReports, now: Date, tz: string) =>
  table(['Reported', 'Question', 'Answer', 'Reason'], d.rows.map(r => [{ text: timeText(r.at, tz, now) }, { text: r.question }, { text: r.text }, { text: r.reason ?? '' }]), { empty: NONE })
const placeText = (p: FiledClash['places'][number]) => `${p.path}\n${p.passage}`
const clashesTable = (list: FiledClash[], now: Date, tz: string) =>
  table(['Found', 'One place', 'The other'], list.map(c => [{ text: timeText(c.at, tz, now) }, { text: placeText(c.places[0]) }, { text: placeText(c.places[1]) }]), { empty: NO_CLASHES })
const newestOf = (d: ChatReports) => (d.total > d.rows.length ? `The newest ${d.rows.length} of ${d.total}.` : '')

export function chatReportsPage(d: Soft<ChatReports | undefined>, now = new Date(), tz = HOME_TZ): string {
  let body = `<h1>${TITLE}</h1><p class="lede">${LEDE}</p>`
  if (isFailed(d)) body += failedBox('the chat reports', d)
  else if (!d) body += `<p class="muted">${OFF}</p>`
  else body += `${newestOf(d) ? `<p class="muted">${newestOf(d)}</p>` : ''}<div class="reports">${tableHtml(reportsTable(d, now, tz))}</div>${d.clashes ? `<h2>${CLASHES}</h2><p class="lede">${CLASHES_LEDE}</p><div class="reports">${tableHtml(clashesTable(d.clashes, now, tz))}</div>` : ''}`
  return page('/_ab/bao-sai/', TITLE, body, now, tz)
}

export function chatReportsSection(d: Soft<ChatReports | undefined>, now = new Date(), tz = HOME_TZ): Section {
  const blocks: Block[] = [note(LEDE)]
  if (isFailed(d)) blocks.push(failedNote('the chat reports', d))
  else if (!d) blocks.push(note(OFF, 'muted'))
  else {
    if (newestOf(d)) blocks.push(note(newestOf(d), 'muted'))
    blocks.push(reportsTable(d, now, tz))
    if (d.clashes) blocks.push(note(`${CLASHES}. ${CLASHES_LEDE}`), clashesTable(d.clashes, now, tz))
  }
  return { title: TITLE, blocks }
}
