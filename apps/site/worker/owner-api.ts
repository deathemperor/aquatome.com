import { HOME_TZ, validZone } from './admin/time'
import { overviewJson } from './admin/pages'
import { appVisitor, loadOverview, sectionJson, SECTIONS, type AdminEnv } from './dashboard'
import { deleteKept } from './fishid/kept'
import { NOT_ONE_PAGE, setHidden } from './hidden'
import { approveByOwner, photosLive, removePhoto } from './photos'

/**
 * The owner's dashboard as JSON, for the iOS app to draw natively (protocols/owner-dashboard.openapi.json): the
 * overview's to-dos and areas, each /_ab/ page as blocks (from the same load as the page, dashboard.ts), and the pages'
 * three actions. Only the owner's app session, as a bearer, opens it. Without a live app session (none, one that ended,
 * a web session's token, the dashboard token, the cookie): 401 signed_out, as the accounts API says it. Another
 * account's app: 404, as for a path that isn't there. That check comes first, so nobody else learns the paths. A part
 * that throws (D1, KV, R2) is 503 unavailable. Never stored, never indexed.
 */

/** The viewer's IANA time zone, which the app sends; Vietnam's when it sends none or one this runtime doesn't know. */
const TZ_HEADER = 'time-zone'
const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' }
const reply = (body: unknown, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { ...HEADERS, ...extra } })
const fail = (status: number, error: string, message?: string, extra: Record<string, string> = {}) => reply(message ? { error, message } : { error }, status, extra)
const notFound = () => fail(404, 'not_found')
const method = (allow: string) => fail(405, 'method', undefined, { allow })
const json = async (req: Request): Promise<Record<string, unknown> | undefined> => {
  const b = await req.json().catch(() => undefined)
  return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : undefined
}

const SECTION = /^\/api\/owner\/sections\/([a-z0-9-]+)$/
const PHOTO = /^\/api\/owner\/photos\/([0-9a-f-]{36})$/
/** A kept fish-ID photo: its account (or anon, sent signed out) and its id, as the dashboard's image address has them. */
const SHOT = /^\/api\/owner\/fishid-shots\/([0-9a-z-]+)\/([0-9a-f-]{36})$/

export async function ownerApi(req: Request, url: URL, env: AdminEnv, now = new Date()): Promise<Response> {
  try {
    return await route(req, url, env, now)
  } catch (e) {
    console.error('owner api:', e)
    return fail(503, 'unavailable', 'Không làm được lúc này: máy chủ không đọc hay ghi được. Thử lại sau.')
  }
}

async function route(req: Request, url: URL, env: AdminEnv, now: Date): Promise<Response> {
  const who = await appVisitor(req, env, now)
  if (who === 'none') return fail(401, 'signed_out')
  if (who !== 'owner') return notFound()
  const path = url.pathname
  const tz = validZone(req.headers.get(TZ_HEADER)) ?? HOME_TZ

  if (path === '/api/owner/dashboard') {
    if (req.method !== 'GET') return method('GET')
    const o = overviewJson(await loadOverview(env, url, now, tz))
    return reply({ tz, ...o, sections: SECTIONS.map(({ key, name }) => ({ key, name })) })
  }
  const section = SECTION.exec(path)
  if (section) {
    if (req.method !== 'GET') return method('GET')
    const s = await sectionJson(section[1]!, env, url, now, tz)
    return s ? reply({ tz, ...s }) : notFound()
  }
  const photo = PHOTO.exec(path)
  if (photo) {
    if (req.method !== 'POST') return method('POST')
    const body = await json(req)
    if (body?.action !== 'approve' && body?.action !== 'remove') return fail(400, 'bad_request', 'action: "approve" hoặc "remove".')
    if (!photosLive(env)) return fail(503, 'unavailable', 'Ảnh bạn đọc chưa bật (thiếu D1, R2 hoặc Turnstile).')
    // Duyệt: the next moderation pass publishes it; Gỡ: removed now. `changed`: false when the photo no longer waits (or is gone).
    const changed = body.action === 'approve' ? await approveByOwner(env, photo[1]!, now) : await removePhoto(env, photo[1]!, 'removed by owner', now)
    return reply({ ok: true, changed })
  }
  if (path === '/api/owner/hidden') {
    if (req.method !== 'POST') return method('POST')
    const body = await json(req)
    if (typeof body?.path !== 'string' || typeof body.hide !== 'boolean' || (body.note !== undefined && typeof body.note !== 'string')) return fail(400, 'bad_request', 'path (chuỗi), hide (true/false), note (tuỳ chọn).')
    const page = await setHidden(env.AB, body.path, body.hide, (body.note as string | undefined) ?? '', now)
    return page ? reply({ ok: true, path: page, hidden: body.hide }) : fail(400, 'not_a_page', NOT_ONE_PAGE)
  }
  const shot = SHOT.exec(path)
  if (shot) {
    if (req.method !== 'DELETE') return method('DELETE')
    if (!env.UPLOADS) return fail(503, 'unavailable', 'Chưa bật (thiếu R2 UPLOADS).')
    const changed = await deleteKept(env.UPLOADS, shot[1] === 'anon' ? undefined : shot[1], shot[2]!)
    return reply({ ok: true, changed })
  }
  return notFound()
}
