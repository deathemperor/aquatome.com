import { OWNER_SCRIPT } from './owner'
import { isViPage, withoutVi } from './paths'
/**
 * Pages the owner has taken down from the /_ab/ dashboard: path → when and why. Stored in KV under one key. A page
 * hidden by its old /vi/ address reads as its root one (loadHidden), and the next change stores it so.
 */
export type Hidden = Record<string, { at: string; note?: string }>
const KEY = 'hidden'

/**
 * URL or path → the page path ("/ca/x/", "/id/ikan/x/"; an old "/vi/ca/x/" as "/ca/x/"); null for anything that isn't a
 * single page, Vietnamese (the home page and its sections) or under /id/ or /th/.
 */
export function pagePath(input: string): string | null {
  if (!input.trim()) return null
  let p: string
  try { p = decodeURIComponent(new URL(input.trim(), 'https://x.invalid').pathname) } catch { return null }
  p = withoutVi(p.replace(/\/{2,}/g, '/').replace(/index\.(html|md)$/, '').replace(/\/?$/, '/'))
  return /^\/([a-z0-9-]+\/)*$/.test(p) && (isViPage(p) || /^\/(id|th)\//.test(p)) ? p : null
}

/** The list with every key as pagePath has it: old /vi/… keys as root ones. */
const normalized = (h: Hidden): Hidden => Object.fromEntries(Object.entries(h).map(([k, v]) => [withoutVi(k), v]))

// Per-isolate copy for 60 s on top of KV's own edge cache: one KV read per isolate per minute, not per page view.
const memo = new WeakMap<KVNamespace, { at: number; value: Hidden }>()
export async function loadHidden(kv: KVNamespace, fresh = false): Promise<Hidden> {
  const m = memo.get(kv)
  if (!fresh && m && Date.now() - m.at < 60_000) return m.value
  const value = normalized((await kv.get<Hidden>(KEY, fresh ? { type: 'json' } : { type: 'json', cacheTtl: 60 })) ?? {})
  memo.set(kv, { at: Date.now(), value })
  return value
}

/**
 * Is this page taken down? Answers at once, never waiting on KV (a cold read is 0.2–0.4 s): from this isolate's copy,
 * re-read in the background once it is a minute old; before the first read is in, from the list baked in at deploy
 * (`baked`, space-separated paths). So a page hidden since the last deploy can still show on a fresh isolate's first
 * views; the engine redeploys within its 3-hour cycle when the list changed.
 */
const reading = new WeakMap<KVNamespace, Promise<unknown>>()
export function isHidden(kv: KVNamespace, path: string, baked: string | undefined, wait: (p: Promise<unknown>) => void): boolean {
  const m = memo.get(kv)
  if ((!m || Date.now() - m.at >= 60_000) && !reading.has(kv)) {
    const p = loadHidden(kv).catch(() => {}).finally(() => reading.delete(kv))
    reading.set(kv, p)
    wait(p)
  }
  return m ? path in m.value : (baked ?? '').split(' ').map(withoutVi).includes(path)
}

/** Dashboard form: action=hide|unhide, url, optional note. Returns an error message or null. */
export async function updateHidden(kv: KVNamespace, form: FormData, now: Date): Promise<string | null> {
  const path = pagePath(String(form.get('url') ?? ''))
  if (!path || /^\/((id|th)\/)?$/.test(path)) return 'Chỉ ẩn được một trang của trang web (không phải trang chủ).'
  const hidden = await loadHidden(kv, true)
  if (form.get('action') === 'unhide') delete hidden[path]
  else hidden[path] = { at: now.toISOString(), ...(String(form.get('note') ?? '').trim() ? { note: String(form.get('note')).trim().slice(0, 200) } : {}) }
  await kv.put(KEY, JSON.stringify(hidden))
  memo.set(kv, { at: Date.now(), value: hidden })
  return null
}

export const gonePage = () => new Response(
  `<!doctype html><html lang="vi" data-gone="1"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Trang đã gỡ — AquaTome</title></head><body style="font:16px/1.6 system-ui,sans-serif;max-width:36rem;margin:4rem auto;padding:0 1rem"><h1>Trang này đã được gỡ</h1><p><a href="/">Về trang chủ AquaTome</a></p><script>${OWNER_SCRIPT}</script></body></html>`,
  { status: 410, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } },
)
