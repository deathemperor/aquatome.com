import { readFileSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp, { type OutputInfo } from 'sharp'
import { THUMB_WIDTH } from '@aq/schema'

const TEMPLATE = readFileSync(new URL('./prompts/reader-photo.md', import.meta.url), 'utf8')
export const VERDICT_SCHEMA = { type: 'object', properties: { approve: { type: 'boolean' }, reason: { type: 'string' } }, required: ['approve', 'reason'], additionalProperties: false }

export type PhotoItem = { id: string; entity_ref: string; name: string; created_at: string }
export type PhotoDecision = { id: string; action: 'approve' | 'remove'; reason: string; width?: number; height?: number }
/** The Worker's /_p/admin routes (null queue = photos are off). */
export type PhotoAdmin = {
  queue: () => Promise<PhotoItem[] | null>
  raw: (id: string) => Promise<Uint8Array>
  put: (id: string, kind: 'full' | 'thumb', webp: Uint8Array) => Promise<void>
  decide: (d: PhotoDecision[]) => Promise<{ applied: number; ignored: number }>
}
export type Verdict = { approve: boolean; reason: string }
export type PhotoDeps = {
  /** Human faces per image file (macOS Vision); -1 = unreadable. */
  faces: (files: string[]) => Promise<number[]>
  /** Claude looks at the photo: is it this species, usable and safe? Throws when the model call fails. */
  judge: (file: string, prompt: string) => Promise<Verdict>
  species: (id: string) => { name: string; scientificName: string } | undefined
}

export const judgePrompt = (s: { name: string; scientificName: string }) => TEMPLATE.replaceAll('{{SPECIES}}', `${s.name} (${s.scientificName})`)

/**
 * Nightly pass over pending reader photos: re-encode (≤1200 px WebP + 480 px thumb, metadata stripped), drop any photo
 * with a face, ask Claude whether it shows this species, then publish (files first, then the decision) or remove.
 * A failed model call leaves the photo pending for the next run.
 */
export async function moderatePhotos(api: PhotoAdmin, d: PhotoDeps): Promise<{ off: true } | { off: false; queued: number; approved: number; removed: number; failed: number }> {
  const queue = await api.queue()
  if (!queue) return { off: true }
  let approved = 0, removed = 0, failed = 0
  const dir = await mkdtemp(join(tmpdir(), 'aq-photos-'))
  const remove = async (id: string, reason: string) => { await api.decide([{ id, action: 'remove', reason }]); removed++ }
  try {
    for (const item of queue) {
      try {
        const sp = d.species(item.entity_ref.replace(/^species:/, ''))
        if (!sp) { await remove(item.id, 'species page not found'); continue }
        const raw = await api.raw(item.id) // a download failure leaves the photo pending
        let full: { data: Buffer; info: OutputInfo }, thumb: Buffer
        try {
          full = await sharp(raw).rotate().resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true })
          thumb = await sharp(raw).rotate().resize({ width: THUMB_WIDTH, withoutEnlargement: true }).webp({ quality: 75 }).toBuffer()
        } catch {
          await remove(item.id, 'unreadable image'); continue
        }
        const file = join(dir, `${item.id}.webp`)
        await writeFile(file, full.data)
        const [faces] = await d.faces([file])
        if (faces === undefined || faces < 0) { await remove(item.id, 'unreadable image'); continue }
        if (faces > 0) { await remove(item.id, 'person in photo'); continue }
        const v = await d.judge(file, judgePrompt(sp))
        if (!v.approve) { await remove(item.id, v.reason || 'rejected'); continue }
        await api.put(item.id, 'full', full.data)
        await api.put(item.id, 'thumb', thumb)
        const r = await api.decide([{ id: item.id, action: 'approve', reason: v.reason, width: full.info.width, height: full.info.height }])
        if (r.applied) approved++
        else failed++
      } catch (e) {
        console.warn(`photo ${item.id} left pending: ${(e as Error).message}`)
        failed++
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
  return { off: false, queued: queue.length, approved, removed, failed }
}

export function httpPhotoAdmin(base: string, token: string): PhotoAdmin {
  const auth = { authorization: `Bearer ${token}` }
  return {
    async queue() {
      const r = await fetch(`${base}/_p/admin/queue`, { headers: auth })
      if (r.status === 503) return null
      if (!r.ok) throw new Error(`photo queue: HTTP ${r.status}`)
      return (await r.json()) as PhotoItem[]
    },
    async raw(id) {
      const r = await fetch(`${base}/_p/admin/raw/${id}`, { headers: auth })
      if (!r.ok) throw new Error(`raw: HTTP ${r.status}`)
      return new Uint8Array(await r.arrayBuffer())
    },
    async put(id, kind, webp) {
      const r = await fetch(`${base}/_p/admin/file/${id}?kind=${kind}`, { method: 'PUT', headers: { ...auth, 'content-type': 'image/webp' }, body: new Uint8Array(webp) })
      if (!r.ok) throw new Error(`put ${kind}: HTTP ${r.status}`)
    },
    async decide(d) {
      const r = await fetch(`${base}/_p/admin/decisions`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify(d) })
      if (!r.ok) throw new Error(`decisions: HTTP ${r.status}`)
      return (await r.json()) as { applied: number; ignored: number }
    },
  }
}
