import { appAccount, authors, dayKeys, siteverify, verifyCommenter } from './comments/api'
import { staticRules } from './comments/rules'

/**
 * Reader photos on species pages: name + Turnstile + a per-day limit; a private delete link instead of a login. The app
 * sends them with the reader's account instead of Turnstile (protocols/talk.openapi.json); deleting the account deletes them.
 * Uploads wait in the private UPLOADS bucket; the nightly moderation pass on the home machine screens them (faces, then
 * Claude: is it this fish?) and publishes a re-encoded WebP to the public media bucket under readers/.
 */
export type PhotosEnv = {
  DB?: D1Database
  AB: KVNamespace
  UPLOADS?: R2Bucket
  MEDIA?: R2Bucket
  TURNSTILE_SECRET?: string
  TURNSTILE_SITEKEY?: string
  COMMENT_HMAC_KEY?: string
  COMMENT_VERIFICATION?: string
}
type Live = PhotosEnv & { DB: D1Database; UPLOADS: R2Bucket; MEDIA: R2Bucket; TURNSTILE_SECRET: string; TURNSTILE_SITEKEY: string; COMMENT_HMAC_KEY: string }
type Siteverify = typeof siteverify
export type PublicPhoto = { id: string; name: string; url: string; thumb: string; width: number; height: number; createdAt: string; author: string }

export const MAX_BYTES = 8 * 1024 * 1024
const MAX_PER_DAY = 5
export const MEDIA_BASE = 'https://media.aquatome.com'
export const SPECIES_RE = /^(species|breed):[a-z0-9-]{1,140}$/
/** Why moderation turned a photo down (protocols/talk.openapi.json, Why); 'withdrawn' (the reader took it back) is never listed. */
export const WHY = ['face', 'species', 'quality', 'unsafe', 'advert', 'not_photo', 'other'] as const
/** Where moderation may move a photo of another fish: a species' page only. */
const MOVE_RE = /^species:[a-z0-9-]{1,140}$/
const fullKey = (id: string) => `readers/${id}.webp`
const thumbKey = (id: string) => `readers/${id}-480.webp`
/** The owner's "Duyệt" on a waiting photo (KV): the next moderation pass publishes it without its checks. */
const okKey = (id: string) => `photo-ok:${id}`
const ownerOk = async (kv: KVNamespace, id: string) => (await kv.get(okKey(id))) !== null

const json = (data: unknown, status = 200, extra: Record<string, string> = {}) => Response.json(data, { status, headers: { 'cache-control': 'no-store', ...extra } })
const live = (env: PhotosEnv): env is Live => Boolean(env.DB && env.UPLOADS && env.MEDIA && env.TURNSTILE_SECRET && env.TURNSTILE_SITEKEY && env.COMMENT_HMAC_KEY)
const off = () => json({ error: 'photos_off' }, 503)

/** JPEG, PNG or WebP by their first bytes; anything else (HEIC, SVG, HTML renamed .jpg) is refused. */
export function sniff(b: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') return 'image/webp'
  return null
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('')
export const sha256 = async (s: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))
const token = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** GET /_p?e=species:x → approved photos, newest first, plus the Turnstile site key for the form. */
export async function listPhotos(url: URL, env: PhotosEnv): Promise<Response> {
  if (!live(env)) return off()
  const e = url.searchParams.get('e') ?? ''
  if (!SPECIES_RE.test(e)) return json({ error: 'bad entity' }, 400)
  const { results } = await env.DB.prepare(
    `SELECT id, name, url, thumb, width, height, created_at, account_id FROM photos WHERE entity_ref = ? AND status = 'approved' ORDER BY created_at DESC LIMIT 60`,
  ).bind(e).all<{ id: string; name: string; url: string; thumb: string; width: number; height: number; created_at: string; account_id: string | null }>()
  const author = await authors(env.COMMENT_HMAC_KEY)
  const photos: PublicPhoto[] = await Promise.all(results.map(async r => ({ id: r.id, name: r.name, url: r.url, thumb: r.thumb, width: r.width, height: r.height, createdAt: r.created_at, author: await author(r) })))
  return json({ photos, sitekey: env.TURNSTILE_SITEKEY, verification: env.COMMENT_VERIFICATION === 'phone' ? 'phone' : 'none' }, 200, { 'cache-control': 'public, max-age=60' })
}

/**
 * POST /_p (multipart: e, name, consent, token, file): cheapest checks first; the photo waits for moderation. The app (a
 * bearer) skips Origin and Turnstile, and its photo counts against its account's day too.
 */
export async function postPhoto(req: Request, env: PhotosEnv, now: Date, verify: Siteverify = siteverify): Promise<Response> {
  if (!live(env)) return off()
  const account = await appAccount(req, env.DB, now)
  if (account === 'session') return json({ error: 'session' }, 401)
  if (!account && req.headers.get('origin') !== new URL(req.url).origin) return json({ error: 'cross-origin' }, 403)
  if ((await verifyCommenter(req, env, Boolean(account))) === 'verification_required') return json({ error: 'verification_required' }, 403)
  const length = Number(req.headers.get('content-length') ?? NaN)
  if (!Number.isFinite(length) || length > MAX_BYTES + 64 * 1024) return json({ error: 'too large' }, 413)
  const form = await req.formData().catch(() => null)
  if (!form) return json({ error: 'bad form' }, 400)
  const entityRef = String(form.get('e') ?? '')
  const name = String(form.get('name') ?? '').trim()
  const file = form.get('file')
  if (!SPECIES_RE.test(entityRef)) return json({ error: 'bad entity' }, 400)
  if (name.length < 1 || name.length > 40 || !('ok' in staticRules({ entityRef, name, body: '' }))) return json({ error: 'bad name' }, 400)
  if (form.get('consent') !== '1') return json({ error: 'consent' }, 400)
  if (!(file instanceof File) || file.size === 0) return json({ error: 'no file' }, 400)
  if (file.size > MAX_BYTES) return json({ error: 'too large' }, 413)
  const bytes = new Uint8Array(await file.arrayBuffer())
  const type = sniff(bytes)
  if (!type) return json({ error: 'not an image' }, 415)
  const ip = req.headers.get('cf-connecting-ip')
  const t = String(form.get('token') ?? '')
  if (!account && (!t || !(await verify(env.TURNSTILE_SECRET, t, ip, new URL(req.url).hostname)))) return json({ error: 'turnstile' }, 403)

  // Past either day's limit, refused; counted only once under both.
  const rl = (await dayKeys(env.COMMENT_HMAC_KEY, ip, account, now)).map(k => `p${k}`)
  const today = await Promise.all(rl.map(async k => Number((await env.AB.get(k)) ?? 0) + 1))
  if (today.some(n => n > MAX_PER_DAY)) return json({ error: 'rate' }, 429)
  await Promise.all(rl.map((k, i) => env.AB.put(k, String(today[i]), { expirationTtl: 86_400 })))

  const id = crypto.randomUUID()
  const del = token()
  await env.UPLOADS.put(`pending/${id}`, bytes, { httpMetadata: { contentType: type } })
  await env.DB.prepare(`INSERT INTO photos (id, entity_ref, name, status, delete_hash, created_at, account_id) VALUES (?, ?, ?, 'pending', ?, ?, ?)`)
    .bind(id, entityRef, name, await sha256(del), now.toISOString(), account ?? null).run()
  return json({ status: 'pending', id, deleteUrl: `/_p/xoa/?id=${id}&t=${del}` }, 201)
}

/** Every stored copy of a photo: the raw upload and the published files. */
export async function deletePhotoFiles(buckets: { UPLOADS: R2Bucket; MEDIA: R2Bucket }, id: string): Promise<void> {
  await Promise.all([buckets.UPLOADS.delete(`pending/${id}`), buckets.MEDIA.delete([fullKey(id), thumbKey(id)])])
}

/**
 * Off the page until the nightly pass looks again: the published copy goes back to the private bucket as the pass's raw
 * file, the public files are deleted, and the photo is pending once more.
 */
export async function hidePhoto(env: Live, id: string, reason: string): Promise<void> {
  const full = await env.MEDIA.get(fullKey(id))
  if (full) await env.UPLOADS.put(`pending/${id}`, await full.arrayBuffer(), { httpMetadata: { contentType: 'image/webp' } })
  const r = await env.DB.prepare(`UPDATE photos SET status = 'pending', url = NULL, thumb = NULL, reason = ?, decided_at = NULL WHERE id = ? AND status = 'approved'`)
    .bind(reason, id).run()
  if (r.meta.changes ?? 0) await env.MEDIA.delete([fullKey(id), thumbKey(id)])
}

/** Take a photo down: row → removed, every stored copy deleted. `why`: the code its sender sees (WHY), none for "other". */
export async function removePhoto(env: Live, id: string, reason: string, now: Date, why?: string): Promise<boolean> {
  const code = why && (WHY as readonly string[]).includes(why) ? why : null
  const r = await env.DB.prepare(`UPDATE photos SET status = 'removed', url = NULL, thumb = NULL, reason = ?, why = ?, decided_at = ? WHERE id = ? AND status != 'removed'`)
    .bind(reason.slice(0, 300), code, now.toISOString(), id).run()
  await deletePhotoFiles(env, id)
  return (r.meta.changes ?? 0) > 0
}

/**
 * The reader takes their photo back (its delete link, or the app with its account: `account`): every stored copy deleted,
 * and it leaves their list, one moderation turned down too (its reason kept for the dashboard). False when there was none
 * to take back.
 */
async function withdrawPhoto(env: Live, id: string, now: Date, account?: string): Promise<boolean> {
  const r = await env.DB.prepare(`UPDATE photos SET status = 'removed', url = NULL, thumb = NULL, why = 'withdrawn',
      reason = CASE WHEN status = 'removed' THEN reason ELSE 'deleted by uploader' END, decided_at = CASE WHEN status = 'removed' THEN decided_at ELSE ? END
    WHERE id = ? AND why IS NOT 'withdrawn'${account ? ' AND account_id = ?' : ''}`)
    .bind(now.toISOString(), id, ...(account ? [account] : [])).run()
  if (!(r.meta.changes ?? 0)) return false
  await deletePhotoFiles(env, id)
  return true
}

type MineRow = { id: string; entity_ref: string; name: string; status: 'pending' | 'approved' | 'removed'; url: string | null; thumb: string | null; width: number | null; height: number | null; why: string | null; moved_from: string | null; created_at: string; decided_at: string | null }
/** A row as its sender sees it (MyPhoto): the published copy once shown, the code once turned down. */
const minePhoto = (r: MineRow) => ({
  id: r.id, e: r.entity_ref, name: r.name, status: r.status,
  ...(r.status === 'approved' && r.url && r.thumb && r.width && r.height ? { url: r.url, thumb: r.thumb, width: r.width, height: r.height } : {}),
  ...(r.status === 'removed' ? { why: r.why && (WHY as readonly string[]).includes(r.why) ? r.why : 'other' } : {}),
  ...(r.moved_from ? { movedFrom: r.moved_from } : {}),
  createdAt: r.created_at,
  ...(r.status !== 'pending' && r.decided_at ? { decidedAt: r.decided_at } : {}),
})

/** /api/v1/talk/photos/mine (GET) and /api/v1/talk/photos/mine/:id (DELETE): the app's reader's own photos, by its bearer. */
export async function minePhotos(req: Request, url: URL, env: PhotosEnv, now: Date): Promise<Response> {
  if (!live(env)) return off()
  const m = url.pathname.match(/^\/api\/v1\/talk\/photos\/mine(?:\/([^/]+))?\/?$/)
  if (!m) return json({ error: 'not found' }, 404)
  if (req.method !== (m[1] ? 'DELETE' : 'GET')) return new Response(null, { status: 405 })
  const account = await appAccount(req, env.DB, now)
  if (!account || account === 'session') return json({ error: 'session' }, 401)
  if (!m[1]) {
    const { results } = await env.DB.prepare(
      `SELECT id, entity_ref, name, status, url, thumb, width, height, why, moved_from, created_at, decided_at FROM photos
       WHERE account_id = ? AND why IS NOT 'withdrawn' ORDER BY created_at DESC, rowid DESC LIMIT 200`,
    ).bind(account).all<MineRow>()
    return json({ photos: results.map(minePhoto) })
  }
  if (!/^[0-9a-f-]{36}$/.test(m[1]) || !(await withdrawPhoto(env, m[1], now, account))) return json({ error: 'not_found' }, 404)
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } })
}

const page = (body: string) => new Response(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Gỡ ảnh — AquaTome</title></head><body style="font:16px/1.6 system-ui,sans-serif;max-width:36rem;margin:4rem auto;padding:0 1rem">${body}<p><a href="/">Về trang chủ AquaTome</a></p></body></html>`,
  { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-robots-tag': 'noindex' } })
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** /_p/xoa/: GET shows a button (link previews and prefetchers must not delete), POST with the private token deletes. */
export async function deleteRoute(req: Request, url: URL, env: PhotosEnv, now: Date): Promise<Response> {
  if (!live(env)) return off()
  if (req.method === 'GET') {
    const id = url.searchParams.get('id') ?? ''
    const t = url.searchParams.get('t') ?? ''
    return page(`<h1>Gỡ ảnh của bạn?</h1><p>Ảnh sẽ bị xóa khỏi AquaTome và khỏi máy chủ lưu trữ.</p><form method="post"><input type="hidden" name="id" value="${esc(id)}"><input type="hidden" name="t" value="${esc(t)}"><button style="font:inherit;padding:.5rem 1rem">Gỡ ảnh</button></form>`)
  }
  if (req.method !== 'POST') return new Response(null, { status: 405 })
  const f = await req.formData().catch(() => null)
  const id = String(f?.get('id') ?? '')
  const t = String(f?.get('t') ?? '')
  const row = await env.DB.prepare(`SELECT delete_hash, status FROM photos WHERE id = ?`).bind(id).first<{ delete_hash: string; status: string }>()
  if (!row || !t || row.delete_hash !== (await sha256(t))) { const r = page('<h1>Link gỡ ảnh không đúng</h1><p>Kiểm tra lại link bạn đã lưu khi gửi ảnh.</p>'); return new Response(r.body, { status: 403, headers: r.headers }) }
  await withdrawPhoto(env, id, now)
  return page('<h1>Đã gỡ ảnh</h1><p>Ảnh của bạn đã bị xóa.</p>')
}

/**
 * `reports`: each reader's reason for reporting it ('' when they gave none). `moved_from`: the page it was sent for when
 * moderation already moved it (null when it didn't): a photo moves once. `ownerOk`: the owner approved it on the dashboard.
 */
export type PhotoQueueItem = { id: string; entity_ref: string; name: string; created_at: string; moved_from: string | null; reports: string[]; ownerOk: boolean }
/** `why`: a removal's code (WHY). `entity`: an approval's page when moderation moved it there, a species' page (its sender sees `movedFrom`). */
export type PhotoDecision = { id: string; action: 'approve' | 'remove'; reason: string; why?: string; entity?: string; width?: number; height?: number }

/** /_p/admin/{queue, raw/:id, file/:id?kind=full|thumb, decisions} for the nightly pass (Bearer dashboard token, checked by the caller). */
export async function photosAdmin(req: Request, url: URL, env: PhotosEnv, now: Date): Promise<Response> {
  if (!live(env)) return off()
  const p = url.pathname
  if (p === '/_p/admin/queue' && req.method === 'GET') {
    // Pending photos, and published ones reported since the pass last looked (reported before that, they're shown again).
    // Only a pending photo carries the owner's approval: a published one reported again is judged.
    const { results } = await env.DB.prepare(
      `SELECT id, entity_ref, name, created_at, moved_from, status,
         (SELECT json_group_array(COALESCE(reason, '')) FROM reports WHERE kind = 'photo' AND item_id = photos.id) AS reports
       FROM photos
       WHERE status = 'pending' OR (status = 'approved' AND EXISTS (SELECT 1 FROM reports WHERE kind = 'photo' AND item_id = photos.id AND created_at > photos.decided_at))
       ORDER BY created_at LIMIT 200`,
    ).all<Omit<PhotoQueueItem, 'reports' | 'ownerOk'> & { reports: string; status: string }>()
    return json(await Promise.all(results.map(async ({ status, ...r }): Promise<PhotoQueueItem> =>
      ({ ...r, reports: JSON.parse(r.reports) as string[], ownerOk: status === 'pending' && (await ownerOk(env.AB, r.id)) }))))
  }
  const raw = p.match(/^\/_p\/admin\/raw\/([0-9a-f-]{36})$/)
  if (raw && req.method === 'GET') {
    // A published photo reported again has no upload left: the published copy is its raw file.
    const o = (await env.UPLOADS.get(`pending/${raw[1]}`)) ?? (await env.MEDIA.get(fullKey(raw[1]!)))
    return o ? new Response(o.body, { headers: { 'content-type': o.httpMetadata?.contentType ?? 'application/octet-stream', 'cache-control': 'no-store' } }) : json({ error: 'not found' }, 404)
  }
  const file = p.match(/^\/_p\/admin\/file\/([0-9a-f-]{36})$/)
  if (file && req.method === 'PUT') {
    const kind = url.searchParams.get('kind')
    if (kind !== 'full' && kind !== 'thumb') return json({ error: 'kind' }, 400)
    const bytes = new Uint8Array(await req.arrayBuffer())
    if (bytes.byteLength > 5 * 1024 * 1024 || sniff(bytes) !== 'image/webp') return json({ error: 'webp ≤5 MB only' }, 400)
    await env.MEDIA.put(kind === 'full' ? fullKey(file[1]!) : thumbKey(file[1]!), bytes, { httpMetadata: { contentType: 'image/webp', cacheControl: 'public, max-age=31536000, immutable' } })
    return json({ ok: true })
  }
  if (p === '/_p/admin/decisions' && req.method === 'POST') {
    const items = (await req.json().catch(() => null)) as PhotoDecision[] | null
    if (!Array.isArray(items) || items.length > 200) return json({ error: 'expected a JSON array (≤200)' }, 400)
    let applied = 0
    for (const d of items) {
      if (typeof d?.id !== 'string' || typeof d.reason !== 'string') continue
      if (d.action === 'remove') { if (await removePhoto(env, d.id, d.reason, now, d.why)) applied++; continue }
      if (d.action !== 'approve' || !Number.isInteger(d.width) || !Number.isInteger(d.height)) continue
      if (!(await env.MEDIA.head(fullKey(d.id))) || !(await env.MEDIA.head(thumbKey(d.id)))) continue // files first, then publish
      if (d.entity !== undefined && (typeof d.entity !== 'string' || !MOVE_RE.test(d.entity))) continue
      // Moved: the page it was sent for is kept, however often it moves (SET reads the row as it was), and forgotten if it
      // goes back there; the photo shows on the right one.
      const to = d.entity ?? null
      const r = await env.DB.prepare(`UPDATE photos SET status = 'approved', url = ?1, thumb = ?2, width = ?3, height = ?4, reason = ?5, why = NULL, decided_at = ?6,
          moved_from = CASE WHEN ?7 IS NOT NULL AND ?7 != entity_ref THEN NULLIF(COALESCE(moved_from, entity_ref), ?7) ELSE moved_from END, entity_ref = COALESCE(?7, entity_ref)
        WHERE id = ?8 AND status IN ('pending', 'approved')`)
        .bind(`${MEDIA_BASE}/${fullKey(d.id)}`, `${MEDIA_BASE}/${thumbKey(d.id)}`, d.width, d.height, d.reason.slice(0, 300), now.toISOString(), to, d.id).run()
      // Published: the owner's approval is spent, so a later report is judged.
      if ((r.meta.changes ?? 0) > 0) { applied++; await Promise.all([env.UPLOADS.delete(`pending/${d.id}`), env.AB.delete(okKey(d.id))]) }
      // Taken back while the pass was looking at it: the files it just published go too.
      else await env.MEDIA.delete([fullKey(d.id), thumbKey(d.id)])
    }
    return json({ applied, ignored: items.length - applied })
  }
  return json({ error: 'not found' }, 404)
}

/** Latest approved photos for the dashboard, with a remove button each; `moved_from`: the page it was sent for, when moderation moved it. */
export async function recentPhotos(env: PhotosEnv): Promise<{ id: string; entity_ref: string; moved_from: string | null; name: string; thumb: string; created_at: string }[] | undefined> {
  if (!live(env)) return undefined
  const { results } = await env.DB.prepare(`SELECT id, entity_ref, moved_from, name, thumb, created_at FROM photos WHERE status = 'approved' ORDER BY created_at DESC LIMIT 30`).all<{ id: string; entity_ref: string; moved_from: string | null; name: string; thumb: string; created_at: string }>()
  return results
}
/**
 * Photos waiting for the moderation pass (hourly, moderate.yml), newest first: the dashboard lists them, so a photo just
 * sent shows there, and says which ones the owner approved (and, for a moved one reported again, where it was sent).
 */
export async function waitingPhotos(env: PhotosEnv): Promise<{ id: string; entity_ref: string; moved_from: string | null; name: string; created_at: string; ownerOk: boolean }[] | undefined> {
  if (!live(env)) return undefined
  const { results } = await env.DB.prepare(`SELECT id, entity_ref, moved_from, name, created_at FROM photos WHERE status = 'pending' ORDER BY created_at DESC LIMIT 30`).all<{ id: string; entity_ref: string; moved_from: string | null; name: string; created_at: string }>()
  return Promise.all(results.map(async r => ({ ...r, ownerOk: await ownerOk(env.AB, r.id) })))
}
const isWaiting = async (db: D1Database, id: string) => Boolean(await db.prepare(`SELECT 1 FROM photos WHERE id = ? AND status = 'pending'`).bind(id).first())
/** A waiting photo's upload, for the owner's dashboard; null once it's published or removed. */
export async function waitingUpload(env: Live, id: string): Promise<R2ObjectBody | null> {
  return (await isWaiting(env.DB, id)) ? env.UPLOADS.get(`pending/${id}`) : null
}
/**
 * The owner's "Duyệt": kept 30 days, the queue's `ownerOk` while the photo waits. False, and nothing written, for a
 * photo that no longer waits or is already approved: a second tap doesn't restart its 30 days.
 */
export async function approveByOwner(env: Live, id: string, now: Date): Promise<boolean> {
  if (!(await isWaiting(env.DB, id)) || (await ownerOk(env.AB, id))) return false
  await env.AB.put(okKey(id), now.toISOString(), { expirationTtl: 30 * 86_400 })
  return true
}
export { live as photosLive }
