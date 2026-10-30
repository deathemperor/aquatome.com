import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import sharp from 'sharp'
import { GallerySchema, type Photo } from '@aq/schema'
import { LlmError } from '../claude'
import { SOURCE_PHOTO_LICENCE, type Media } from '../source-photos'
import { contactSheet } from '../video-images'
import { loadFbState } from './collect'
import { FB } from './config'
import { photoUrl } from './parse'

const FISH = readFileSync(new URL('../prompts/fb-fish.md', import.meta.url), 'utf8')
const SPECIES = readFileSync(new URL('../prompts/fb-species.md', import.meta.url), 'utf8')
export const FB_FISH_SCHEMA = { type: 'object', required: ['fish'], properties: { fish: { type: 'array', items: { type: 'number' } } } }
export const FB_SPECIES_SCHEMA = {
  type: 'object', required: ['species', 'confidence', 'ok', 'caption'],
  properties: { species: { type: ['string', 'null'] }, confidence: { type: 'string', enum: ['high', 'medium', 'low'] }, ok: { type: 'boolean' }, caption: { type: 'string' } },
}

export type FbVerdict = { species: string | null; confidence: 'high' | 'medium' | 'low'; ok: boolean; caption: string }
export type FbIdDeps = {
  get: (url: string) => Promise<Uint8Array>
  /** Human faces per image file (macOS Vision); -1 = unreadable. */
  faces: (files: string[]) => Promise<number[]>
  sheet: (file: string, prompt: string) => Promise<{ fish: number[] }>
  look: (file: string, prompt: string) => Promise<FbVerdict>
  media: Media
  now: () => Date
}
type Decision = { status: 'face' | 'unreadable' | 'no-fish' | 'unsure' | 'off-list' | 'added' | 'rejected'; species?: string; at: string }

const SHEET = 20
const galleryKey = (id: string) => `${FB.galleryPrefix}/${id}.webp`
const json = async <T>(file: string, fallback: T): Promise<T> => JSON.parse(await readFile(file, 'utf8').catch(() => JSON.stringify(fallback)))
const save = async (file: string, o: unknown) => { await mkdir(dirname(file), { recursive: true }); await writeFile(file, `${JSON.stringify(o, null, 2)}\n`) }
const sortedKeys = <T>(o: Record<string, T>) => Object.fromEntries(Object.keys(o).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).map(k => [k, o[k]!]))

/**
 * Jim's stored photos into species galleries: faces dropped (no model call), a contact sheet of 20 says which show a fish,
 * then each fish photo alone against the site's closed species list with what Jim wrote around it. Only a high-confidence,
 * good photo of a species on the site is added (content/gallery/<id>.json, credited to Jim, linking the photo).
 * Every photo is decided once (FB.decisionsFile). First, photos the owner rejected leave the galleries.
 * `limit`: model calls this run. Stops on a model failure (usage limit); undecided photos wait for the next run.
 */
export async function identifyPhotos(root: string, d: FbIdDeps, o: { limit: number }) {
  const report = { added: [] as string[], dropped: 0, stopped: '' }
  const content = join(root, 'content')
  const decFile = join(root, FB.decisionsFile)
  const decisions = await json<Record<string, Decision>>(decFile, {})
  const rejected = await json<Record<string, string>>(join(root, 'engine-state/_photo-rejected.json'), {})
  const today = d.now().toISOString().slice(0, 10)
  const decide = async (id: string, dec: Omit<Decision, 'at'>) => { decisions[id] = { ...dec, at: d.now().toISOString() }; await save(decFile, sortedKeys(decisions)) }
  const galleryFile = (species: string) => join(content, 'gallery', `${species}.json`)

  // The owner's removals, before anything that needs the model
  for (const f of (await readdir(join(content, 'gallery')).catch(() => [] as string[])).filter(f => f.endsWith('.json'))) {
    const g = GallerySchema.parse(JSON.parse(await readFile(join(content, 'gallery', f), 'utf8')))
    const out = g.photos.filter(p => p.source === FB.id && rejected[p.url])
    if (!out.length) continue
    await save(join(content, 'gallery', f), { ...g, photos: g.photos.filter(p => !out.includes(p)), updatedAt: today })
    for (const p of out) await decide(p.url.split('/').pop()!.replace(/\.webp$/, ''), { status: 'rejected', species: g.id })
  }

  const species = new Map<string, { sci: string; vi: string }>()
  for (const id of (await readdir(join(content, 'species')).catch(() => [] as string[])).sort()) {
    const e = await json<{ scientificName?: string }>(join(content, 'species', id, 'entity.json'), {})
    const vi = await json<{ name?: string }>(join(content, 'species', id, 'vi.json'), {})
    if (e.scientificName) species.set(id, { sci: e.scientificName, vi: vi.name ?? e.scientificName })
  }
  const list = [...species].map(([id, s]) => `${id} — ${s.sci} — ${s.vi}`).join('\n')
  const s = await loadFbState(root)
  const clues = (id: string) => [
    ...Object.values(s.albums).filter(a => a.photoIds.includes(id)).map(a => `Album: ${a.title}`),
    ...(s.photos[id]?.caption ? [`Photo caption: ${s.photos[id]!.caption}`] : []),
    ...Object.values(s.posts).filter(p => p.photoIds.includes(id) && p.text).map(p => `Post: ${p.text.slice(0, 600)}`),
  ].join('\n') || '(nothing)'

  const todo = Object.keys(s.photos).filter(id => s.photos[id]!.status === 'stored' && !decisions[id]).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
  let calls = 0
  const dir = await mkdtemp(join(tmpdir(), 'aq-fbid-'))
  try {
    for (let i = 0; i < todo.length && calls < o.limit; i += SHEET) {
      const got: { id: string; bytes: Uint8Array; file: string }[] = []
      for (const id of todo.slice(i, i + SHEET)) {
        try {
          const bytes = await d.get(s.photos[id]!.raw!)
          const file = join(dir, `${id}.jpg`)
          await writeFile(file, await sharp(bytes).rotate().resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer())
          got.push({ id, bytes, file })
        } catch { /* unreachable or corrupt: tried again next run */ }
      }
      const faces = got.length ? await d.faces(got.map(g => g.file)) : []
      const clean: typeof got = []
      for (const [k, g] of got.entries()) {
        if (faces[k] === 0) clean.push(g)
        else { await decide(g.id, { status: faces[k]! > 0 ? 'face' : 'unreadable' }); report.dropped++ }
      }
      if (!clean.length) continue
      try {
        const sheet = join(dir, `sheet-${i}.jpg`)
        await writeFile(sheet, await contactSheet(await Promise.all(clean.map(g => readFile(g.file))), 240, 180, 5))
        calls++
        const fish = new Set((await d.sheet(sheet, FISH)).fish ?? [])
        const keep: typeof clean = []
        for (const [k, g] of clean.entries()) {
          if (fish.has(k + 1)) keep.push(g)
          else { await decide(g.id, { status: 'no-fish' }); report.dropped++ }
        }
        for (const g of keep) {
          if (calls >= o.limit) break
          calls++
          const v = await d.look(g.file, SPECIES.replace('{{SPECIES}}', list).replace('{{CLUES}}', clues(g.id)))
          if (!v.species || !species.has(v.species)) { await decide(g.id, { status: v.species ? 'off-list' : 'unsure' }); continue }
          if (v.confidence !== 'high' || !v.ok) { await decide(g.id, { status: 'unsure', species: v.species }); continue }
          if (rejected[d.media.urlFor(galleryKey(g.id))]) { await decide(g.id, { status: 'rejected', species: v.species }); continue }
          const stored = await d.media.put(galleryKey(g.id), g.bytes)
          const photo: Photo = { ...stored, licence: SOURCE_PHOTO_LICENCE, author: FB.name, sourceUrl: photoUrl(g.id), caption: v.caption.trim().slice(0, 120), source: FB.id }
          const file = galleryFile(v.species)
          const prev = await json<unknown>(file, null)
          const gal = prev ? GallerySchema.parse(prev) : { id: v.species, photos: [], seen: 0, updatedAt: today }
          if (!gal.photos.some(p => p.url === photo.url)) gal.photos.push(photo)
          await save(file, GallerySchema.parse({ ...gal, updatedAt: today }))
          await decide(g.id, { status: 'added', species: v.species })
          report.added.push(`${v.species}: ${g.id}`)
        }
      } catch (err) {
        if (err instanceof LlmError) { report.stopped = err.message; break }
        throw err
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
  return report
}
