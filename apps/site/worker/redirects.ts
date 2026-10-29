/** Renamed pages: old path → new path with ?tu=<old slug> (the page then says "Chuyển hướng từ …"). Built as /redirects.json. */
const tables = new WeakMap<Fetcher, Promise<Record<string, string>>>() // static per deploy: read once per isolate
export function redirectFor(assets: Fetcher, origin: string, path: string): Promise<string | undefined> {
  let t = tables.get(assets)
  if (!t) {
    t = assets.fetch(new Request(`${origin}/redirects.json`)).then(r => (r.ok ? r.json<Record<string, string>>() : {}), () => ({}))
    tables.set(assets, t)
  }
  return t.then(x => x[path.replace(/\/?$/, '/')])
}
