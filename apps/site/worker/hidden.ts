/** Pages the owner has taken down from the /_ab/ dashboard: path → when and why. Stored in KV under one key. */
export type Hidden = Record<string, { at: string; note?: string }>
const KEY = 'hidden'

/** URL or path → the page path ("/vi/ca/x/"); null for anything that isn't a single page under /vi/. */
export function pagePath(input: string): string | null {
  let p: string
  try { p = new URL(input.trim(), 'https://x.invalid').pathname } catch { return null }
  p = p.replace(/index\.(html|md)$/, '').replace(/\/?$/, '/')
  return /^\/vi\/[a-z0-9-]+(\/[a-z0-9-]+)*\/$/.test(p) ? p : null
}

// Per-isolate copy for 60 s on top of KV's own edge cache: one KV read per isolate per minute, not per page view.
const memo = new WeakMap<KVNamespace, { at: number; value: Hidden }>()
export async function loadHidden(kv: KVNamespace, fresh = false): Promise<Hidden> {
  const m = memo.get(kv)
  if (!fresh && m && Date.now() - m.at < 60_000) return m.value
  const value = (await kv.get<Hidden>(KEY, fresh ? { type: 'json' } : { type: 'json', cacheTtl: 60 })) ?? {}
  memo.set(kv, { at: Date.now(), value })
  return value
}

/** Dashboard form: action=hide|unhide, url, optional note. Returns an error message or null. */
export async function updateHidden(kv: KVNamespace, form: FormData, now: Date): Promise<string | null> {
  const path = pagePath(String(form.get('url') ?? ''))
  if (!path || path === '/vi/') return 'Chỉ ẩn được một trang dưới /vi/ (không phải trang chủ).'
  const hidden = await loadHidden(kv, true)
  if (form.get('action') === 'unhide') delete hidden[path]
  else hidden[path] = { at: now.toISOString(), ...(String(form.get('note') ?? '').trim() ? { note: String(form.get('note')).trim().slice(0, 200) } : {}) }
  await kv.put(KEY, JSON.stringify(hidden))
  memo.set(kv, { at: Date.now(), value: hidden })
  return null
}

export const gonePage = () => new Response(
  '<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Trang đã gỡ — AquaTome</title></head><body style="font:16px/1.6 system-ui,sans-serif;max-width:36rem;margin:4rem auto;padding:0 1rem"><h1>Trang này đã được gỡ</h1><p><a href="/vi/">Về trang chủ AquaTome</a></p></body></html>',
  { status: 410, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } },
)
