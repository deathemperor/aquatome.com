import { appAccount, commentsLive, dayKeys, ipUnit, readCapped, signer, type CommentsEnv } from './comments/api'
import { hidePhoto, photosLive, type PhotosEnv } from './photos'

/**
 * POST /api/v1/report (protocols/talk.openapi.json): a reader reports a public comment or photo. A report from a
 * signed-in account takes the item off the page at once; any report puts it before the nightly moderation, with its
 * reason. Once the moderation has looked at an item after a report and kept it, later reports only bring it back to
 * the moderation: nobody keeps a fair post down by reporting it again and again.
 */
export type ReportEnv = CommentsEnv & PhotosEnv

const MAX_PER_DAY = 20
const HIDDEN = 'reported by a reader'
const json = (data: unknown, status: number) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } })

type Report = { kind: 'comment' | 'photo'; id: string; reason: string | null }
function parseReport(text: string): Report | null {
  const raw = (() => { try { return JSON.parse(text) as Record<string, unknown> } catch { return null } })()
  if (!raw || typeof raw !== 'object') return null
  const { kind, id, reason } = raw
  if ((kind !== 'comment' && kind !== 'photo') || typeof id !== 'string' || !id || id.length > 100) return null
  if (reason !== undefined && (typeof reason !== 'string' || reason.length > 500)) return null
  return { kind, id, reason: reason?.trim() || null }
}

/** Reported earlier and kept by the moderation since: decided after one of its reports. */
const KEPT = (table: 'comments' | 'photos', kind: Report['kind']) =>
  `EXISTS (SELECT 1 FROM reports WHERE kind = '${kind}' AND item_id = ${table}.id AND created_at < ${table}.decided_at)`

export async function reportRoute(req: Request, env: ReportEnv, now: Date): Promise<Response> {
  if (req.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } })
  const text = await readCapped(req, 4096)
  const r = text === null ? null : parseReport(text)
  if (!r) return json({ error: 'bad report' }, 400)
  if (r.kind === 'comment' ? !commentsLive(env) : !photosLive(env)) return json({ error: r.kind === 'comment' ? 'comments_off' : 'photos_off' }, 503)
  const db = env.DB!
  const secret = env.COMMENT_HMAC_KEY!
  const account = await appAccount(req, db, now)
  if (account === 'session') return json({ error: 'session' }, 401)
  // A browser sends Origin with every POST, so another site's page can't report for its visitor. The app sends the site's or none.
  const origin = req.headers.get('origin')
  if (!account && origin && origin !== new URL(req.url).origin) return json({ error: 'cross-origin' }, 403)

  const ip = req.headers.get('cf-connecting-ip')
  const rl = (await dayKeys(secret, ip, account, now)).map(k => `r${k}`)
  const today = await Promise.all(rl.map(async k => Number((await env.AB.get(k)) ?? 0) + 1))
  if (today.some(n => n > MAX_PER_DAY)) return json({ error: 'rate' }, 429)

  // Public, or already reported and not removed: a reader's report of an item a report took down still counts.
  const table = r.kind === 'comment' ? 'comments' : 'photos'
  const item = await db.prepare(`SELECT status FROM ${table} WHERE id = ? AND status != 'removed'`).bind(r.id).first<{ status: string }>()
  const reported = item && item.status !== 'approved'
    ? await db.prepare(`SELECT 1 FROM reports WHERE kind = ? AND item_id = ? LIMIT 1`).bind(r.kind, r.id).first()
    : null
  // The app counts exactly this body as received (the item is gone already); any other 404 means the report didn't arrive.
  if (!item || (item.status !== 'approved' && !reported)) return json({ error: 'not found' }, 404)
  await Promise.all(rl.map((k, i) => env.AB.put(k, String(today[i]), { expirationTtl: 86_400 })))

  const reporter = await (await signer(secret, 16))(account ? `reporter:account:${account}` : `reporter:ip:${ipUnit(ip ?? 'unknown')}`)
  const added = await db.prepare(`INSERT OR IGNORE INTO reports (kind, item_id, reporter, reason, created_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(r.kind, r.id, reporter, r.reason, now.toISOString()).run()
  if (!(added.meta.changes ?? 0)) return json({ status: 'received' }, 202) // this reader reported it already

  // Either way the item is in its moderation queue now: both take what was reported since its last decision.
  if (!account) return json({ status: 'received' }, 202)
  if (r.kind === 'comment') {
    await db.prepare(`UPDATE comments SET status = 'held', reason = ?, decided_at = NULL WHERE id = ? AND status = 'approved' AND NOT ${KEPT('comments', 'comment')}`).bind(HIDDEN, r.id).run()
  } else if (photosLive(env) && (await db.prepare(`SELECT 1 FROM photos WHERE id = ? AND status = 'approved' AND NOT ${KEPT('photos', 'photo')}`).bind(r.id).first())) {
    await hidePhoto(env, r.id, HIDDEN)
  }
  return json({ status: 'received' }, 202)
}
