import { MAX_BYTES, MAX_PER_DAY, photosLive, removePhoto, sha256, sniff, token, type PhotosEnv } from '../photos'
import { admitComment, appAccount, dayKeys, siteverify, verifyCommenter } from './api'
import { parseComment } from './rules'

/**
 * A comment's photo (docs/contracts/comment-photo.md): one per comment, sent with it. It is a reader's photo keyed
 * `comment:<comment id>`, in the same buckets, under the same checks and day, and through the same moderation, which
 * skips the species check for it (packages/engine/src/reader-photos.ts). Only its comment's list shows it, once both are
 * public; the species-keyed lists (`/_p`) never match its key.
 */
export const commentRef = (commentId: string) => `comment:${commentId}`

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } })

/**
 * POST /_c as multipart (e, name, body, consent, token, file): a comment with its photo, each checked as it is alone, the
 * photo's day before anything counts. Both are stored or neither: the upload first, then the two rows in one batch (one
 * transaction in D1), and the upload deleted should the batch fail.
 */
export async function postCommentWithPhoto(req: Request, env: PhotosEnv, now: Date, verify = siteverify): Promise<Response> {
  if (!photosLive(env)) return json({ error: 'photos_off' }, 503)
  const account = await appAccount(req, env.DB, now)
  if (account === 'session') return json({ error: 'session' }, 401)
  if (!account && req.headers.get('origin') !== new URL(req.url).origin) return json({ error: 'cross-origin' }, 403)
  if ((await verifyCommenter(req, env, Boolean(account))) === 'verification_required') return json({ error: 'verification_required' }, 403)
  const length = Number(req.headers.get('content-length') ?? NaN)
  if (!Number.isFinite(length) || length > MAX_BYTES + 64 * 1024) return json({ error: 'too large' }, 413)
  const form = await req.formData().catch(() => null)
  if (!form) return json({ error: 'bad form' }, 400)
  const c = parseComment({ e: form.get('e'), name: form.get('name'), body: form.get('body') })
  if (typeof c === 'string') return json({ error: c }, 400)
  // The photo's checks, in reader photos' order (photos.ts postPhoto).
  const file = form.get('file')
  if (form.get('consent') !== '1') return json({ error: 'consent' }, 400)
  if (!(file instanceof File) || file.size === 0) return json({ error: 'no file' }, 400)
  if (file.size > MAX_BYTES) return json({ error: 'too large' }, 413)
  const bytes = new Uint8Array(await file.arrayBuffer())
  const type = sniff(bytes)
  if (!type) return json({ error: 'not an image' }, 415)
  const ip = req.headers.get('cf-connecting-ip')
  const t = String(form.get('token') ?? '')
  if (!account && (!t || !(await verify(env.TURNSTILE_SECRET, t, ip, new URL(req.url).hostname)))) return json({ error: 'turnstile' }, 403)

  // Reader photos' day, shared with them: past it, refused with nothing posted or counted.
  const rl = (await dayKeys(env.COMMENT_HMAC_KEY, ip, account, now)).map(k => `p${k}`)
  const today = await Promise.all(rl.map(async k => Number((await env.AB.get(k)) ?? 0) + 1))
  if (today.some(n => n > MAX_PER_DAY)) return json({ error: 'rate' }, 429)
  const a = await admitComment(env, c, ip, account, now)
  if ('reject' in a) return json({ error: a.reject }, 400)
  await Promise.all(rl.map((k, i) => env.AB.put(k, String(today[i]), { expirationTtl: 86_400 })))

  const id = crypto.randomUUID()
  const del = token()
  await env.UPLOADS.put(`pending/${id}`, bytes, { httpMetadata: { contentType: type } })
  try {
    await env.DB.batch([a.insert, env.DB.prepare(`INSERT INTO photos (id, entity_ref, name, status, delete_hash, created_at, account_id) VALUES (?, ?, ?, 'pending', ?, ?, ?)`)
      .bind(id, commentRef(a.id), c.name, await sha256(del), now.toISOString(), account ?? null)])
  } catch (e) {
    await env.UPLOADS.delete(`pending/${id}`)
    throw e
  }
  return json({ status: a.status, comment: a.comment, photo: { status: 'pending', id, deleteUrl: `/_p/xoa/?id=${id}&t=${del}` } }, 201)
}

/**
 * A comment removed takes its photo with it: every comment's photo whose comment is removed, or gone, is removed with
 * its files. Run after the moderation's decisions (index.ts). The two rows are written together, so a photo never waits
 * for its comment.
 */
export async function sweepCommentPhotos(env: PhotosEnv, now: Date): Promise<number> {
  if (!photosLive(env)) return 0
  const { results } = await env.DB.prepare(
    `SELECT p.id FROM photos p WHERE p.entity_ref LIKE 'comment:%' AND p.status != 'removed'
       AND NOT EXISTS (SELECT 1 FROM comments c WHERE p.entity_ref = 'comment:' || c.id AND c.status != 'removed')`,
  ).all<{ id: string }>()
  for (const p of results) await removePhoto(env, p.id, 'comment removed', now)
  return results.length
}

/** The comment each of these comments' photos goes with: its page's key (`species:x`, `id:guide:y`), by photo id. */
export async function commentPages(db: D1Database, photos: { id: string; entity_ref: string }[]): Promise<Map<string, string>> {
  const ids = photos.filter(p => p.entity_ref.startsWith('comment:'))
  if (!ids.length) return new Map()
  const { results } = await db.prepare(`SELECT id, entity_ref FROM comments WHERE id IN (${ids.map(() => '?').join(', ')})`)
    .bind(...ids.map(p => p.entity_ref.slice('comment:'.length))).all<{ id: string; entity_ref: string }>()
  const page = new Map(results.map(r => [commentRef(r.id), r.entity_ref]))
  return new Map(ids.flatMap(p => (page.has(p.entity_ref) ? [[p.id, page.get(p.entity_ref)!] as [string, string]] : [])))
}
