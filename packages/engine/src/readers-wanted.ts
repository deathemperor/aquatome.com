import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { slugify } from '@aq/schema'
import { sciKey } from '@aq/schema/unlisted'
import type { Taxon } from './gbif'
import type { Wanted } from './wanted'

/**
 * Names readers keep on their tanks that have no page ("Bể của tôi": a tank's entries without a page), counted by the
 * site's Worker in KV (apps/site/worker/wanted.ts). They join the wanted species (wanted.ts) with how many readers asked,
 * so a source's page for the most wanted is fetched first.
 */
export type ReaderWant = { kind: string; name: string; sci?: string; readers: number; sources: Record<string, number>; last: string }
/** What became of a name: a page is queued for it (`slug`), we already have its page, or GBIF knows no species by it. */
export type ReaderRow = ReaderWant & { status: 'queued' | 'have' | 'unknown'; slug?: string }

/**
 * Free-text names in the public report (engine-state, docs/review, in a public repository) only when this many readers
 * gave them: one reader's text could be anything, a person's name too. A name GBIF knows as a species is listed at once.
 */
export const PUBLIC_MIN_READERS = 3
const PREFIX = 'wanted:n:'

/** The KV namespace bound as `AB`, as the site's Worker config names it (apps/site/wrangler.jsonc). */
export async function abNamespace(root: string): Promise<string | undefined> {
  const config = await readFile(join(root, 'apps/site/wrangler.jsonc'), 'utf8').catch(() => '')
  return /"binding":\s*"AB",\s*"id":\s*"([0-9a-f]{32})"/.exec(config)?.[1]
}

const asWant = (m: unknown): ReaderWant | undefined => {
  const w = m as Partial<ReaderWant> | null
  if (!w || typeof w.kind !== 'string' || typeof w.name !== 'string' || typeof w.readers !== 'number' || w.readers < 1) return undefined
  return { kind: w.kind, name: w.name, ...(typeof w.sci === 'string' ? { sci: w.sci } : {}), readers: w.readers, sources: w.sources && typeof w.sources === 'object' ? w.sources : {}, last: typeof w.last === 'string' ? w.last : '' }
}

/**
 * Every counted name, from Cloudflare's API: the keys under `wanted:n:`, each with its count as metadata (1000 a call).
 * Throws on any answer but a good one: a token without access to KV, the network.
 */
export async function listReaderWants(o: { accountId: string; namespace: string; token: string; fetch?: typeof fetch }): Promise<ReaderWant[]> {
  const get = o.fetch ?? fetch
  const out: ReaderWant[] = []
  let cursor = ''
  for (let page = 0; page < 50; page++) {
    const url = `https://api.cloudflare.com/client/v4/accounts/${o.accountId}/storage/kv/namespaces/${o.namespace}/keys?prefix=${encodeURIComponent(PREFIX)}&limit=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
    const res = await get(url, { headers: { authorization: `Bearer ${o.token}` }, signal: AbortSignal.timeout(30_000) })
    if (!res.ok) throw new Error(`Cloudflare KV list: HTTP ${res.status}`)
    const j = (await res.json()) as { success?: boolean; result?: { name: string; metadata?: unknown }[]; result_info?: { cursor?: string } }
    if (!j.success || !Array.isArray(j.result)) throw new Error('Cloudflare KV list: not a list')
    for (const k of j.result) { const w = k.name.startsWith(PREFIX) ? asWant(k.metadata) : undefined; if (w) out.push(w) }
    cursor = j.result_info?.cursor ?? ''
    if (!cursor) break
  }
  return out
}

/** "corydoras cf. sterbai" as GBIF is asked: no cf. or aff., the genus capitalised. */
const asked = (sci: string) => { const k = sciKey(sci); return k.charAt(0).toUpperCase() + k.slice(1) }

/**
 * Readers' names added to `wanted` (most readers first), each under the name GBIF accepts for its species, as wanted.ts
 * resolves names: an exact match, two words. A name for a page we have, or one GBIF doesn't know, is only reported.
 * `budget` caps lookups of names not asked before (`known`); a name past it waits for the next run.
 */
export async function addReaders(wanted: Wanted, wants: ReaderWant[], have: Set<string>, gbif: (name: string) => Promise<Taxon | null>, known: (name: string) => boolean, budget = 100): Promise<ReaderRow[]> {
  const rows: ReaderRow[] = []
  for (const w of [...wants].sort((a, b) => b.readers - a.readers || a.name.localeCompare(b.name))) {
    const name = w.sci ? asked(w.sci) : undefined
    if (!name || !name.includes(' ') || (!known(name) && budget-- <= 0)) { rows.push({ ...w, status: 'unknown' }); continue }
    const t = await gbif(name).catch(() => null)
    if (!t || t.matchType !== 'EXACT' || t.canonicalName.split(' ').length !== 2) { rows.push({ ...w, status: 'unknown' }); continue }
    const slug = slugify(t.canonicalName)
    if (have.has(slug) || have.has(slugify(name))) { rows.push({ ...w, status: 'have', slug }); continue }
    const was = wanted.get(slug)
    const names = [...new Set([...(was?.names ?? [slug]), slugify(name)])]
    wanted.set(slug, { name: t.canonicalName, names, mentionedIn: was?.mentionedIn ?? [], readers: (was?.readers ?? 0) + w.readers })
    rows.push({ ...w, status: 'queued', slug })
  }
  return rows
}

/**
 * The report the audit reads (engine-state/_readers-wanted.json): the names it may show (a species GBIF knows, or a
 * name PUBLIC_MIN_READERS readers gave), and how many names and readers it leaves out.
 */
export function readersReport(rows: ReaderRow[]): { names: ReaderRow[]; held: { names: number; readers: number } } {
  const shown = (r: ReaderRow) => r.status !== 'unknown' || r.readers >= PUBLIC_MIN_READERS
  const held = rows.filter(r => !shown(r))
  return { names: rows.filter(shown), held: { names: held.length, readers: held.reduce((n, r) => n + r.readers, 0) } }
}
