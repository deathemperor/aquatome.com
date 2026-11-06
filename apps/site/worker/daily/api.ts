import type { EmailBinding } from '../accounts/mailer'
import { queryAppDay } from '../admin/app'
import { soft, unset } from '../admin/shell'
import { HOME_TZ } from '../admin/time'
import { readCapped } from '../comments/api'
import { ae, bearerOk, loadOverview, type AdminEnv } from '../dashboard'
import { compose, type Composed } from './compose'
import { parseGitHubSide, type GitHubSide } from './github'
import { getReport, putReport } from './log'

/**
 * POST /_ab/report, from daily-report.yml with the dashboard token (anyone else: 404, as the other admin routes): GitHub's
 * half of the owner's daily report. The Worker adds the site's and the app's numbers from the dashboard's loaders,
 * composes it, mails it to the secret REPORT_TO and keeps it in the log (daily/log.ts). The address is never logged,
 * stored or answered: a refused send is logged by its code, as accounts/mailer.ts does.
 *
 * The workflow's run id is the idempotency key. A report once sent is never sent again; one Cloudflare refused goes out
 * on the next try, as it was composed.
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
  const [overview, app] = await Promise.all([
    loadOverview(env, url, now, HOME_TZ),
    a ? soft('app', queryAppDay(a.account, a.token)) : unset('Analytics Engine'),
  ])
  return compose({ now, overview, app, gh })
}

export async function dailyReportRoute(req: Request, url: URL, env: DailyEnv, now = new Date()): Promise<Response> {
  if (req.method !== 'POST' || !bearerOk(req, env.AB_DASH_TOKEN)) return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' } })
  const body = await readCapped(req, MAX_BODY)
  if (body === null) return reply(413, { error: 'too_large' })
  const gh = parseGitHubSide(body)
  if (!gh) return reply(400, { error: 'bad_report' })
  const id = gh.runId

  let claimed = false
  let sent = false
  try {
    const kept = await getReport(env.AB, id)
    if (kept?.sent) return reply(200, { ok: true, id, sent: true, duplicate: true })
    claimed = await claim(env.DB, id, now)
    if (!claimed) return reply(409, { error: 'in_progress', id })
    const report = kept
      ? { when: kept.when, subject: kept.subject, text: kept.text, html: kept.html, care: kept.care }
      : { when: now.toISOString(), ...(await composeNow(env, url, now, gh)) }
    const outcome = await deliver(env, report)
    sent = outcome.sent
    await putReport(env.AB, id, { ...report, ...outcome })
    if (!sent) await release(env.DB, id)
    // Not sent for want of a recipient is a day's report kept, as asked; a refusal is a failure the job should show.
    const fine = sent || outcome.why === 'no_recipient'
    return reply(fine ? 200 : 502, { ok: fine, id, ...outcome })
  } catch (e) {
    console.error('daily report failed:', (e as Error)?.message ?? 'unknown')
    // A report that went out keeps its claim: the next try answers 409, and it is never sent twice.
    if (claimed && !sent) await release(env.DB, id).catch(() => {})
    return reply(503, { error: 'unavailable', id })
  }
}
