import { listAll, REPORT_PREFIX } from '../chat/store'
import { failedNote, note, table, tableHtml, type Block, type Section } from './blocks'
import { failedBox, isFailed, page, type Soft } from './shell'
import { HOME_TZ, timeText } from './time'

/** A reader's report of one chat answer as wrong (chat/past.ts), as it's kept in R2. */
export type ChatReport = { at: string; conversation: string; turn: number; question: string; text: string; reason?: string }
export type ChatReports = { total: number; rows: ChatReport[] }

const TITLE = 'Chat reports'
const LEDE = 'Chat answers readers marked as wrong, with their question and reason. Shown only here. Each is kept until the reader deletes their account, and goes with it.'
const OFF = 'Off (R2 UPLOADS is missing).'
const NONE = 'No reports yet.'

/** The newest reports. One deleted with its account after the list was read is left out. */
export async function recentReports(bucket: R2Bucket, limit = 120): Promise<ChatReports> {
  const all = await listAll(bucket, REPORT_PREFIX)
  const newest = all.sort((a, b) => b.uploaded.getTime() - a.uploaded.getTime()).slice(0, limit)
  const rows = await Promise.all(newest.map(async o => (await bucket.get(o.key))?.json<ChatReport>()))
  return { total: all.length, rows: rows.filter(r => r !== undefined) }
}

const reportsTable = (d: ChatReports, now: Date, tz: string) =>
  table(['Reported', 'Question', 'Answer', 'Reason', 'In the bucket'], d.rows.map(r => [{ text: timeText(r.at, tz, now) }, { text: r.question }, { text: r.text }, { text: r.reason ?? '' }, { text: `${r.conversation} turn ${r.turn}` }]), { empty: NONE })
const newestOf = (d: ChatReports) => (d.total > d.rows.length ? `The newest ${d.rows.length} of ${d.total}.` : '')

export function chatReportsPage(d: Soft<ChatReports | undefined>, now = new Date(), tz = HOME_TZ): string {
  let body = `<h1>${TITLE}</h1><p class="lede">${LEDE}</p>`
  if (isFailed(d)) body += failedBox('the chat reports', d)
  else if (!d) body += `<p class="muted">${OFF}</p>`
  else body += `${newestOf(d) ? `<p class="muted">${newestOf(d)}</p>` : ''}<div class="reports">${tableHtml(reportsTable(d, now, tz))}</div>`
  return page('/_ab/bao-sai/', TITLE, body, now, tz)
}

export function chatReportsSection(d: Soft<ChatReports | undefined>, now = new Date(), tz = HOME_TZ): Section {
  const blocks: Block[] = [note(LEDE)]
  if (isFailed(d)) blocks.push(failedNote('the chat reports', d))
  else if (!d) blocks.push(note(OFF, 'muted'))
  else {
    if (newestOf(d)) blocks.push(note(newestOf(d), 'muted'))
    blocks.push(reportsTable(d, now, tz))
  }
  return { title: TITLE, blocks }
}
