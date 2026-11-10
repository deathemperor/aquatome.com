/**
 * What the chat's section search is made of, for chat-search-recall.ts and chat-search-index.ts: every handbook section
 * a read_page call can open, and its vector (Workers AI, bge-m3, as the Worker embeds the reader's words). Vectors are
 * kept under the text embedded, so a section that hasn't changed isn't embedded again.
 */
import { createHash } from 'node:crypto'
import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Block } from '@aq/schema/app-page'
import { handbookOf, sectionsOf, type Handbook, type Lang, type Source } from '../../../apps/site/worker/chat/handbook'
import { textOf } from '../../../apps/site/worker/chat/tools'
import { pool } from './eval-lib'

export type Doc = { path: string; heading: string | null; title: string; text: string }
export type Embedder = { token: string; account: string; model: string; cache: string }
export const hash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16)

/** The handbook build read last (chat-speed.ts keeps one folder a build). */
export async function latestBuild(): Promise<string> {
  const speed = join(homedir(), '.cache/aquatome/chat-speed')
  const builds = await Promise.all((await readdir(speed)).filter(d => d.startsWith('site-')).map(async d => ({ d, at: (await stat(join(speed, d))).birthtimeMs })))
  return join(speed, builds.sort((a, b) => a.at - b.at).at(-1)!.d)
}

export function siteSource(dir: string): Source {
  const file = (p: string) => join(dir, p.replace(/^\//, '').replace(/\//g, '_'))
  const json = async <T>(p: string): Promise<T | null> => { try { return JSON.parse(await readFile(file(p), 'utf8')) as T } catch { return null } }
  return { index: l => json(`/app/${l}.json`), shard: (l, k, n) => json(`/app/pages/${l}/${k}-${n}.json`), topics: l => json(`/app/chat/${l}.json`) }
}

/** fetch, tried again when a connection drops or the server answers 5xx: a run makes over a thousand calls, and every one of them is safe to repeat. */
export const steady = (get: typeof fetch = fetch, ms = 2000): typeof fetch => async (input, init) => {
  for (let tries = 1; ; tries++) {
    try {
      const r = await get(input, init)
      if (r.status < 500 || tries === 3) return r
    } catch (e) {
      if (tries === 3) throw e
    }
    await new Promise(res => setTimeout(res, ms * tries))
  }
}

/** The handbook as the site serves it now, each file read once. A read that fails stops the run: a page left out would be taken for one removed. */
export function liveSource(site: string, get: typeof fetch = steady()): Required<Source> {
  const read = new Map<string, Promise<unknown>>()
  const json = <T>(path: string): Promise<T> => {
    if (!read.has(path)) read.set(path, get(new URL(path, site)).then(r => { if (!r.ok) throw new Error(`${path}: ${r.status}`); return r.json() }))
    return read.get(path) as Promise<T>
  }
  return { index: l => json(`/app/${l}.json`), shard: (l, k, n) => json(`/app/pages/${l}/${k}-${n}.json`), topics: l => json(`/app/chat/${l}.json`) }
}

/** What a run has to do, from each section's id and text hash: what it wrote last time, against the handbook now. */
export function changesOf(written: Record<string, string>, wanted: Record<string, string>): { write: string[]; gone: string[] } {
  return { write: Object.keys(wanted).filter(id => written[id] !== wanted[id]), gone: Object.keys(written).filter(id => !(id in wanted)) }
}

export const batchesOf = <T>(all: T[], size: number): T[][] => Array.from({ length: Math.ceil(all.length / size) }, (_, i) => all.slice(i * size, (i + 1) * size))

/** The delete calls for these ids: Vectorize refuses more than 100 in one. */
export const deleteBodies = (ids: string[]): string[] => batchesOf(ids, 100).map(b => JSON.stringify({ ids: b }))

/** Every section a read_page call can open: a page's opening (heading null) and each heading with an id. */
export async function docsOf(source: Source, lang: Lang, chars: number): Promise<{ docs: Doc[]; hb: Handbook }> {
  const hb = (await handbookOf(source, lang))!
  // With no topics to read, the handbook holds back every video guide: their sections would look removed.
  if (!await hb.topics()) throw new Error(`No topics file for ${lang}`)
  const out: Doc[] = []
  for (const i of hb.items) {
    const doc = await hb.page(i.path)
    if (!doc) continue
    for (const s of sectionsOf(doc)) {
      if (s.heading && !s.heading.id) continue
      const body = textOf(s.blocks as Block[])
      out.push({ path: i.path, heading: s.heading?.id ?? null, title: doc.title, text: `${doc.title}\n${s.heading?.text ?? ''}\n${body}`.slice(0, chars) })
    }
  }
  return { docs: out, hb }
}

async function embed(e: Embedder, texts: string[]): Promise<number[][]> {
  for (let tries = 0; ; tries++) {
    const r = await steady()(`https://api.cloudflare.com/client/v4/accounts/${e.account}/ai/run/${e.model}`, {
      method: 'POST', headers: { authorization: `Bearer ${e.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ text: texts }),
    })
    const j = await r.json().catch(() => null) as { success?: boolean; result?: { data?: number[][] }; errors?: unknown } | null
    if (j?.success && j.result?.data?.length === texts.length) return j.result.data
    if (tries >= 4) throw new Error(`embed: ${r.status} ${JSON.stringify(j?.errors ?? null)}`)
    await new Promise(res => setTimeout(res, 2000 * (tries + 1)))
  }
}

/** Unit vectors for texts, kept by each text's hash: the hashes in a .json, the vectors one after another in a .f32. */
export async function vectors(e: Embedder, name: string, texts: string[]): Promise<Float32Array[]> {
  const base = join(e.cache, `${name}-${hash(e.model)}`)
  const hashes = JSON.parse(await readFile(`${base}.json`, 'utf8').catch(() => '[]')) as string[]
  const raw = await readFile(`${base}.f32`).catch(() => Buffer.alloc(0))
  const all = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4)
  const dim = hashes.length ? all.length / hashes.length : 0
  const kept = new Map<string, Float32Array>(hashes.map((h, i) => [h, all.slice(i * dim, (i + 1) * dim)]))
  const byHash = new Map(texts.map(t => [hash(t), t]))
  const missing = [...byHash.keys()].filter(h => !kept.has(h))
  const batches: string[][] = []
  for (let i = 0; i < missing.length; i += 50) batches.push(missing.slice(i, i + 50))
  let done = 0
  await pool(batches.map(b => async () => {
    const v = await embed(e, b.map(h => byHash.get(h)!))
    b.forEach((h, i) => {
      const x = Float32Array.from(v[i]!)
      const n = Math.hypot(...x)
      kept.set(h, x.map(y => y / n))
    })
    if (++done % 50 === 0) console.error(`${name}: ${done} of ${batches.length} batches`)
  }), 4)
  if (missing.length) {
    const keys = [...kept.keys()]
    await writeFile(`${base}.f32`, Buffer.concat(keys.map(h => Buffer.from(kept.get(h)!.buffer))))
    await writeFile(`${base}.json`, JSON.stringify(keys))
  }
  return texts.map(t => kept.get(hash(t))!)
}
