import { ipDayKey, siteverify, verifyCommenter } from './comments/api'
import { staticRules } from './comments/rules'

/**
 * Reader photos on species pages, no accounts: name + Turnstile + a per-day limit; a private delete link instead of a login.
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
export type PublicPhoto = { id: string; name: string; url: string; thumb: string; width: number; height: number; createdAt: string }

export const MAX_BYTES = 8 * 1024 * 1024
const MAX_PER_DAY = 5
export const MEDIA_BASE = 'https://media.aquatome.com'
export const SPECIES_RE = /^species:[a-z0-9-]{1,140}$/
const fullKey = (id: string) => `readers/${id}.webp`
const thumbKey = (id: string) => `readers/${id}-480.webp`

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
    `SELECT id, name, url, thumb, width, height, created_at FROM photos WHERE entity_ref = ? AND status = 'approved' ORDER BY created_at DESC LIMIT 60`,
  ).bind(e).all<{ id: string; name: string; url: string; thumb: string; width: number; height: number; created_at: string }>()
  const photos: PublicPhoto[] = results.map(r => ({ id: r.id, name: r.name, url: r.url, thumb: r.thumb, width: r.width, height: r.height, createdAt: r.created_at }))
  return json({ photos, sitekey: env.TURNSTILE_SITEKEY, verification: env.COMMENT_VERIFICATION === 'phone' ? 'phone' : 'none' }, 200, { 'cache-control': 'public, max-age=60' })
}

/** POST /_p (multipart: e, name, consent, token, file): cheapest checks first; the photo waits for moderation. */
export async function postPhoto(req: Request, env: PhotosEnv, now: Date, verify: Siteverify = siteverify): Promise<Response> {
  if (!live(env)) return off()
  if (req.headers.get('origin') !== new URL(req.url).origin) return json({ error: 'cross-origin' }, 403)
  if ((await verifyCommenter(req, env)) === 'verification_required') return json({ error: 'verification_required' }, 403)
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
  if (!t || !(await verify(env.TURNSTILE_SECRET, t, ip, new URL(req.url).hostname))) return json({ error: 'turnstile' }, 403)

  const rl = `p${await ipDayKey(env.COMMENT_HMAC_KEY, ip ?? 'unknown', now)}`
  const today = Number((await env.AB.get(rl)) ?? 0) + 1
  if (today > MAX_PER_DAY) return json({ error: 'rate' }, 429)
  await env.AB.put(rl, String(today), { expirationTtl: 86_400 })

  const id = crypto.randomUUID()
  const del = token()
  await env.UPLOADS.put(`pending/${id}`, bytes, { httpMetadata: { contentType: type } })
  await env.DB.prepare(`INSERT INTO photos (id, entity_ref, name, status, delete_hash, created_at) VALUES (?, ?, ?, 'pending', ?, ?)`)
    .bind(id, entityRef, name, await sha256(del), now.toISOString()).run()
  return json({ status: 'pending', id, deleteUrl: `/_p/xoa/?id=${id}&t=${del}` }, 201)
}

/** Take a photo down: row → removed, every stored copy deleted. */
export async function removePhoto(env: Live, id: string, reason: string, now: Date): Promise<boolean> {
  const r = await env.DB.prepare(`UPDATE photos SET status = 'removed', url = NULL, thumb = NULL, reason = ?, decided_at = ? WHERE id = ? AND status != 'removed'`)
    .bind(reason.slice(0, 300), now.toISOString(), id).run()
  await Promise.all([env.UPLOADS.delete(`pending/${id}`), env.MEDIA.delete([fullKey(id), thumbKey(id)])])
  return (r.meta.changes ?? 0) > 0
}

const page = (body: string) => new Response(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Gỡ ảnh — AquaTome</title></head><body style="font:16px/1.6 system-ui,sans-serif;max-width:36rem;margin:4rem auto;padding:0 1rem">${body}<p><a href="/vi/">Về trang chủ AquaTome</a></p></body></html>`,
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
  if (!row || !t || row.delete_hash !== (await sha256(t))) return new Response(page('<h1>Link gỡ ảnh không đúng</h1><p>Kiểm tra lại link bạn đã lưu khi gửi ảnh.</p>').body, { status: 403, headers: { 'content-type': 'text/html; charset=utf-8' } })
  await removePhoto(env, id, 'deleted by uploader', now)
  return page('<h1>Đã gỡ ảnh</h1><p>Ảnh của bạn đã bị xóa.</p>')
}

export type PhotoQueueItem = { id: string; entity_ref: string; name: string; created_at: string }
export type PhotoDecision = { id: string; action: 'approve' | 'remove'; reason: string; width?: number; height?: number }

/** /_p/admin/{queue, raw/:id, file/:id?kind=full|thumb, decisions} for the nightly pass (Bearer dashboard token, checked by the caller). */
export async function photosAdmin(req: Request, url: URL, env: PhotosEnv, now: Date): Promise<Response> {
  if (!live(env)) return off()
  const p = url.pathname
  if (p === '/_p/admin/queue' && req.method === 'GET') {
    const { results } = await env.DB.prepare(`SELECT id, entity_ref, name, created_at FROM photos WHERE status = 'pending' ORDER BY created_at LIMIT 200`).all<PhotoQueueItem>()
    return json(results)
  }
  const raw = p.match(/^\/_p\/admin\/raw\/([0-9a-f-]{36})$/)
  if (raw && req.method === 'GET') {
    const o = await env.UPLOADS.get(`pending/${raw[1]}`)
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
      if (d.action === 'remove') { if (await removePhoto(env, d.id, d.reason, now)) applied++; continue }
      if (d.action !== 'approve' || !Number.isInteger(d.width) || !Number.isInteger(d.height)) continue
      if (!(await env.MEDIA.head(fullKey(d.id))) || !(await env.MEDIA.head(thumbKey(d.id)))) continue // files first, then publish
      const r = await env.DB.prepare(`UPDATE photos SET status = 'approved', url = ?, thumb = ?, width = ?, height = ?, reason = ?, decided_at = ? WHERE id = ? AND status = 'pending'`)
        .bind(`${MEDIA_BASE}/${fullKey(d.id)}`, `${MEDIA_BASE}/${thumbKey(d.id)}`, d.width, d.height, d.reason.slice(0, 300), now.toISOString(), d.id).run()
      if ((r.meta.changes ?? 0) > 0) { applied++; await env.UPLOADS.delete(`pending/${d.id}`) }
    }
    return json({ applied, ignored: items.length - applied })
  }
  return json({ error: 'not found' }, 404)
}

/** Latest approved photos for the dashboard, with a remove button each. */
export async function recentPhotos(env: PhotosEnv): Promise<{ id: string; entity_ref: string; name: string; thumb: string; created_at: string }[] | undefined> {
  if (!live(env)) return undefined
  const { results } = await env.DB.prepare(`SELECT id, entity_ref, name, thumb, created_at FROM photos WHERE status = 'approved' ORDER BY created_at DESC LIMIT 30`).all<{ id: string; entity_ref: string; name: string; thumb: string; created_at: string }>()
  return results
}
export { live as photosLive }
