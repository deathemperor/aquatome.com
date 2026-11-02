import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { auditPictures } from '../src/audit'
import type { Taxon } from '../src/gbif'
import { abNamespace, addReaders, listReaderWants, PUBLIC_MIN_READERS, readersReport, type ReaderWant } from '../src/readers-wanted'
import { wantedFirst, withPopular, type Wanted } from '../src/wanted'

const want = (name: string, readers: number, over: Partial<ReaderWant> = {}): ReaderWant => ({ kind: 'fish', name, readers, sources: { tank: readers }, last: '2026-11-02', ...over })
const gbif = async (n: string): Promise<Taxon | null> => (({
  'Corydoras sterbai': { canonicalName: 'Corydoras sterbai', matchType: 'EXACT' },
  'Megalamphodus eques': { canonicalName: 'Hyphessobrycon eques', matchType: 'EXACT' }, // a synonym
  'Rhinogobius duospilus': { canonicalName: 'Rhinogobius duospilus', matchType: 'EXACT' },
  'Bucephalandra kedagang': { canonicalName: 'Bucephalandra kedagang', matchType: 'EXACT' },
  'Paracheirodon innesi': { canonicalName: 'Paracheirodon innesi', matchType: 'EXACT' },
  'Corydoras sterbay': { canonicalName: 'Corydoras sterbai', matchType: 'FUZZY' },
} as Record<string, Taxon>)[n] ?? null)

test('the KV namespace is the one the Worker binds as AB', async () => {
  expect(await abNamespace(fileURLToPath(new URL('../../..', import.meta.url)))).toMatch(/^[0-9a-f]{32}$/)
})

test('every counted name comes from the list of keys and their metadata, page after page; a bad answer throws', async () => {
  const asked: string[] = []
  const pages = [
    { success: true, result: [{ name: 'wanted:n:fish:s:corydoras sterbai', metadata: want('Cá chuột sterbai', 4, { sci: 'Corydoras sterbai', first: '2026-10-30' } as Partial<ReaderWant>) }, { name: 'wanted:r:abc', metadata: null }], result_info: { cursor: 'next' } },
    { success: true, result: [{ name: 'wanted:n:plant:n:reusuoi', metadata: want('Rêu suối', 1, { kind: 'plant' }) }, { name: 'wanted:n:fish:n:x', metadata: { kind: 'fish' } }], result_info: { cursor: '' } },
  ]
  const fetch = (async (url: string, init: RequestInit) => {
    asked.push(url)
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok')
    return Response.json(pages[asked.length - 1])
  }) as unknown as typeof globalThis.fetch
  const got = await listReaderWants({ accountId: 'acc', namespace: 'ns', token: 'tok', fetch })
  expect(asked).toEqual([
    'https://api.cloudflare.com/client/v4/accounts/acc/storage/kv/namespaces/ns/keys?prefix=wanted%3An%3A&limit=1000',
    'https://api.cloudflare.com/client/v4/accounts/acc/storage/kv/namespaces/ns/keys?prefix=wanted%3An%3A&limit=1000&cursor=next',
  ])
  expect(got).toEqual([want('Cá chuột sterbai', 4, { sci: 'Corydoras sterbai' }), want('Rêu suối', 1, { kind: 'plant' })])
  // A token without access to KV: the engine's step skips (run.ts `soft`); the error never carries the token.
  const refused = (async () => new Response('{"success":false}', { status: 403 })) as unknown as typeof globalThis.fetch
  await expect(listReaderWants({ accountId: 'acc', namespace: 'ns', token: 'secret-token', fetch: refused })).rejects.toThrow(/^Cloudflare KV list: HTTP 403$/)
})

test('readers\' names join the wanted species under the name GBIF accepts; pages we have and names GBIF doesn\'t know are only reported', async () => {
  const wanted: Wanted = new Map([['corydoras-sterbai', { name: 'Corydoras sterbai', names: ['corydoras-sterbai'], mentionedIn: ['guides/a'] }]])
  const rows = await addReaders(wanted, [
    want('Cá chuột sterbai', 2, { sci: 'corydoras cf. sterbai' }),
    want('Cá huyết long', 5, { sci: 'Megalamphodus eques' }),
    want('Bucep kedagang', 1, { kind: 'plant', sci: 'Bucephalandra kedagang' }),
    want('Cá neon', 3, { sci: 'Paracheirodon innesi' }),
    want('Cá bống lạ', 4),
    want('Cá chuột sai tên', 1, { sci: 'Corydoras sterbay' }),
  ], new Set(['paracheirodon-innesi']), gbif, () => true)
  expect(rows.map(r => [r.name, r.status, r.slug])).toEqual([
    ['Cá huyết long', 'queued', 'hyphessobrycon-eques'],
    ['Cá bống lạ', 'unknown', undefined],
    ['Cá neon', 'have', 'paracheirodon-innesi'],
    ['Cá chuột sterbai', 'queued', 'corydoras-sterbai'],
    ['Bucep kedagang', 'queued', 'bucephalandra-kedagang'],
    ['Cá chuột sai tên', 'unknown', undefined], // a fuzzy match is a guess: not queued
  ])
  // Mentioned and kept by readers: both kept; a synonym's slug is one of its names, so a source page under it counts.
  expect(wanted.get('corydoras-sterbai')).toEqual({ name: 'Corydoras sterbai', names: ['corydoras-sterbai'], mentionedIn: ['guides/a'], readers: 2 })
  expect(wanted.get('hyphessobrycon-eques')).toEqual({ name: 'Hyphessobrycon eques', names: ['hyphessobrycon-eques', 'megalamphodus-eques'], mentionedIn: [], readers: 5 })
  expect(wanted.has('paracheirodon-innesi')).toBe(false)
})

test('lookups of names not asked before are capped: the rest wait for the next run', async () => {
  const asked: string[] = []
  const rows = await addReaders(new Map(), [want('A', 3, { sci: 'Corydoras sterbai' }), want('B', 2, { sci: 'Rhinogobius duospilus' })], new Set(), async n => { asked.push(n); return gbif(n) }, () => false, 1)
  expect(asked).toEqual(['Corydoras sterbai'])
  expect(rows.map(r => r.status)).toEqual(['queued', 'unknown'])
})

test('wanted pages go most readers first, then popular, then most-mentioned', () => {
  const w = withPopular(new Map([
    ['a-b', { name: 'A b', names: ['a-b'], mentionedIn: ['guides/x', 'guides/y'] }],
    ['c-d', { name: 'C d', names: ['c-d'], mentionedIn: [], readers: 1 }],
    ['e-f', { name: 'E f', names: ['e-f'], mentionedIn: ['guides/x'], readers: 6 }],
  ]), new Set(), ['Danio rerio'])
  const found = ['x-y', 'a-b', 'danio-rerio', 'c-d', 'e-f'].map(s => ({ url: `https://x/species/${s}/` }))
  expect(wantedFirst(found, w, ['Danio rerio']).map(f => f.url.split('/')[4])).toEqual(['e-f', 'c-d', 'danio-rerio', 'a-b', 'x-y'])
})

test(`the public report lists species GBIF knows and names ${PUBLIC_MIN_READERS} readers gave; the rest only as counts`, async () => {
  const rows = await addReaders(new Map(), [
    want('Cá chuột sterbai', 1, { sci: 'Corydoras sterbai' }), want('Cá bống lạ', PUBLIC_MIN_READERS), want('Cá của Lan', 1), want('Tên riêng', 2, { sci: 'John Smith' }), want('Cá nhà Lan', 1, { sci: 'Paracheirodon innesi' }),
  ], new Set(), gbif, () => true)
  const report = readersReport(rows)
  expect(report.names.map(r => r.name)).toEqual(['Cá bống lạ', 'Corydoras sterbai', 'Paracheirodon innesi'])
  expect(report.held).toEqual({ names: 2, readers: 3 })
  expect(JSON.stringify(report)).not.toMatch(/Lan|John/)

  const root = await mkdtemp(join(tmpdir(), 'rw-'))
  await writeFile(join(root, 'readers.json'), JSON.stringify(report))
  await writeFile(join(root, 'wanted.json'), JSON.stringify({ 'corydoras-sterbai': { name: 'Corydoras sterbai', mentions: 0, mentionedIn: [], readers: 1, onSource: 'https://x/species/corydoras-sterbai/' } }))
  const { markdown } = await auditPictures(root, join(root, 'wanted.json'), join(root, 'readers.json'))
  expect(markdown).toContain('## Readers keep these on their tanks, no page yet (3)')
  expect(markdown).toContain('- Cá bống lạ, fish — 3 readers — no species GBIF knows by this name: a person decides')
  expect(markdown).toContain('- Corydoras sterbai, fish — 1 reader — queued first (corydoras-sterbai)')
  expect(markdown).toContain('- and 2 more names (3 readers) that GBIF doesn\'t know and fewer than 3 readers gave: kept out of this public file')
  expect(markdown).toContain('- Corydoras sterbai — kept by 1 reader — queued first: https://x/species/corydoras-sterbai/')
})
