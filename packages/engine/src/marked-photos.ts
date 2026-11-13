import { access, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Photo } from '@aq/schema'
import { imageCache } from './codex-images'
import { sha256 } from './image-reference'

export type MarkCandidate = { page: { kind: 'species' | 'plants'; id: string }; photo: Photo }

/** Retain credit and page identity before a rejected source photo disappears from display content. No upload. */
export async function rememberMarkedPhotos(file: string, data: unknown, marked: (url: string) => boolean, cache = imageCache()): Promise<void> {
  const match = /\/content\/(species|plants)\/([^/]+)\/entity\.json$/.exec(file)
  const gallery = /^(.*)\/content\/gallery\/([^/]+)\.json$/.exec(file)
  if (!match && !gallery) return
  const kind = match?.[1] ?? await access(join(gallery![1]!, 'content/species', gallery![2]!, 'entity.json')).then(() => 'species', () => 'plants')
  const id = match?.[2] ?? gallery![2]!
  const e = data as { photos?: Photo[] }
  const candidates = (e.photos ?? []).filter(p => p.source && marked(p.url) && !p.generated && !p.altered?.length)
  if (!candidates.length) return
  const dir = join(cache, 'marked'); await mkdir(dir, { recursive: true })
  for (const photo of candidates) await writeFile(join(dir, `${sha256(`${kind}/${id}:${photo.url}`)}.json`), `${JSON.stringify({ page: { kind, id }, photo }, null, 2)}\n`, { mode: 0o600, flag: 'wx' }).catch(e => { if (e.code !== 'EEXIST') throw e })
}
