import type { EmailBinding } from '../accounts/mailer'
import { queryAppDay } from '../admin/app'
import { isFailed, soft, unset } from '../admin/shell'
import { HOME_TZ } from '../admin/time'
import { readCapped } from '../comments/api'
import { ae, bearerOk, liveOwnerApps, loadOverview, loadQuality, loadScoreboard, type AdminEnv } from '../dashboard'
import { addChanges } from './changelog'
import { compose, type Composed } from './compose'
import { parseChanges, parseGitHubSide, type GitHubSide } from './github'
import { getReport, putReport, type Report } from './log'
import { pushReport, type PushOutcome } from './push'
import { getSettings } from './settings'

/**
 * POST /_ab/report, from daily-report.yml with the dashboard token (anyone else: 404, as the other admin routes): GitHub's
 * half of the owner's daily report. The Worker adds the site's and the app's numbers from the dashboard's loaders,
 * composes it, sends it as the owner set (daily/settings.ts): mailed to the secret REPORT_TO, and a notification to the
 * owner's phones (daily/push.ts). It keeps it in the log (daily/log.ts) either way, with what went out, and adds the
 * day's product changes to the change log (daily/changelog.ts) before anything goes out. The address is
 * never logged, stored or answered: a refused send is logged by its code, as accounts/mailer.ts does.
 *
 * The workflow's run id is the idempotency key. A mail or a push once sent is never sent again; one refused goes out on
 * the next try, as it was composed. The job fails (502) when nothing went out and something due was refused; a channel
 * turned off, no recipient, no phone or no APNs key is a report kept as asked.
 */
export type DailyEnv = AdminEnv & { EMAIL?: EmailBinding; REPORT_TO?: string }
export const REPORT_FROM = { email: 'bao-cao@aquatome.com', name: 'AquaTome' }

const MAX_BODY = 128 * 1024
const reply = (status: number, body: unknown) => Response.json(body, { status, headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' } })

/**
 * One try at a time for a run, in every Cloudflare location. KV can't say (a write can take a minute to show elsewhere),
 * so the claim is a row in D1's rate_limits, which needs no migration and whose purge (the daily cron) takes it a week on.
 */
const CLAIM_MS = 7 * 86_400_000
const claimKey = (id: string) => `daily-report:${id}`
async function claim(db: D1Database | undefined, id: string, now: Date): Promise<boolean> {
  if (!db) return true
  const r = await db.prepare('INSERT OR IGNORE INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)').bind(claimKey(id), new Date(now.getTime() + CLAIM_MS).toISOString()).run()
  return (r.meta.changes ?? 0) === 1
}
const release = async (db: D1Database | undefined, id: string) => { await db?.prepare('DELETE FROM rate_limits WHERE key = ?').bind(claimKey(id)).run() }

/** Cloudflare's code for a refused send (`E_RATE_LIMIT_EXCEEDED`…); nothing else of the error reaches a log or the report. */
const codeOf = (e: unknown) => {
  const code = (e as { code?: unknown })?.code
  return typeof code === 'string' && /^[A-Za-z0-9_.-]{1,40}$/.test(code) ? code : 'unknown'
}

async function deliver(env: DailyEnv, r: Composed): Promise<{ sent: boolean; why?: string }> {
  const to = env.REPORT_TO?.trim()
  if (!to) return { sent: false, why: 'no_recipient' }
  if (!env.EMAIL) return { sent: false, why: 'no_binding' }
  try {
    await env.EMAIL.send({ to, from: REPORT_FROM, subject: r.subject, text: r.text, html: r.html })
    return { sent: true }
  } catch (e) {
    const why = codeOf(e)
    console.error('daily report not sent:', why)
    return { sent: false, why }
  }
}

async function composeNow(env: DailyEnv, url: URL, now: Date, gh: GitHubSide): Promise<Composed> {
  const a = ae(env)
  const [overview, app, scoreboard] = await Promise.all([
    loadOverview(env, url, now, HOME_TZ),
    a ? soft('app', queryAppDay(a.account, a.token)) : unset('Analytics Engine'),
    // Its parts fail on their own, as on its page; a Scoreboard has a `failed` of its own, so a load that throws is undefined, not soft()'s.
    loadScoreboard(env, url, now).catch((e: unknown) => { console.error('admin scoreboard:', e); return undefined }),
  ])
  const quality = a && !isFailed(overview.content) ? await soft('quality', loadQuality(env, url.origin, a, overview.content)) : undefined
  return compose({ now, overview, app, gh, scoreboard, quality })
}

/** Not sent, as asked or for want of somewhere to send it: a day's report kept, not a failure. */
const MAIL_SKIPPED = new Set(['email_off', 'no_recipient'])
const PUSH_SKIPPED = new Set(['push_off', 'no_device', 'no_apns_key'])
/** What a report's answer and the job's log say of it: no address, no token. */
const outcomeOf = (r: Pick<Report, 'sent' | 'why' | 'push'>) => ({ sent: r.sent, ...(r.why ? { why: r.why } : {}), ...(r.push ? { push: r.push } : {}) })

const notFound = () => new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' } })

/**
 * POST /_ab/changelog, from changelog.yml on each push to main with the dashboard token (anyone else: 404): what merged
 * lately, into the change log the dashboard's "Shipped in 24 hours" reads, so that never waits for the report. The report
 * adds the same lines, and addChanges keeps each once.
 */
export async function changesRoute(req: Request, env: DailyEnv, now = new Date()): Promise<Response> {
  if (req.method !== 'POST' || !bearerOk(req, env.AB_DASH_TOKEN)) return notFound()
  const body = await readCapped(req, MAX_BODY)
  if (body === null) return reply(413, { error: 'too_large' })
  const changes = parseChanges(body)
  if (!changes) return reply(400, { error: 'bad_report' })
  try {
    return reply(200, { ok: true, added: await addChanges(env.AB, changes, now) })
  } catch (e) {
    console.error('change log not written:', (e as Error)?.message ?? 'unknown')
    return reply(503, { error: 'unavailable' })
  }
}

export async function dailyReportRoute(req: Request, url: URL, env: DailyEnv, now = new Date()): Promise<Response> {
  if (req.method !== 'POST' || !bearerOk(req, env.AB_DASH_TOKEN)) return notFound()
  const body = await readCapped(req, MAX_BODY)
  if (body === null) return reply(413, { error: 'too_large' })
  const gh = parseGitHubSide(body)
  if (!gh) return reply(400, { error: 'bad_report' })
  const id = gh.runId

  let claimed = false
  // What went out on this try: a report that did keeps its claim.
  let mailed = false
  let pushed = false
  try {
    const [kept, settings] = await Promise.all([getReport(env.AB, id), getSettings(env.AB)])
    const pushedBefore = (kept?.push?.sent ?? 0) > 0
    const mailDue = settings.email && !kept?.sent
    const pushDue = settings.push && !pushedBefore
    if (kept && !mailDue && !pushDue) return reply(200, { ok: true, id, ...outcomeOf(kept), duplicate: true })
    claimed = await claim(env.DB, id, now)
    if (!claimed) return reply(409, { error: 'in_progress', id })
    const report = kept
      ? { when: kept.when, subject: kept.subject, text: kept.text, html: kept.html, care: kept.care, ...(kept.first ? { first: kept.first } : {}) }
      : { when: now.toISOString(), ...(await composeNow(env, url, now, gh)) }
    // Before the send: should it fail, the claim is released and the job's next try writes it, then sends.
    await addChanges(env.AB, gh.changes, now)
    const mail = kept?.sent ? { sent: true } : mailDue ? await deliver(env, report) : { sent: false, why: 'email_off' }
    mailed = mailDue && mail.sent
    const push: PushOutcome = pushedBefore ? kept!.push! : pushDue ? await pushReport(env, env.AB, report, id, now, ids => liveOwnerApps(env, ids, now)) : { sent: 0, why: 'push_off' }
    pushed = pushDue && push.sent > 0
    const done = { ...report, ...mail, push }
    await putReport(env.AB, id, done)
    if (!mailed && !pushed) await release(env.DB, id)
    const refused = (!mail.sent && !MAIL_SKIPPED.has(mail.why!)) || (!push.sent && !PUSH_SKIPPED.has(push.why!))
    const fine = mail.sent || push.sent > 0 || !refused
    return reply(fine ? 200 : 502, { ok: fine, id, ...outcomeOf(done) })
  } catch (e) {
    console.error('daily report failed:', (e as Error)?.message ?? 'unknown')
    // A report that went out keeps its claim: the next try answers 409, and it is never sent twice.
    if (claimed && !mailed && !pushed) await release(env.DB, id).catch(() => {})
    return reply(503, { error: 'unavailable', id })
  }
}
