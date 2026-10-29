import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TranslationSchema, type GuideEntity, type Translation } from '@aq/schema'

export type CoverDeps = { get: (url: string) => Promise<Uint8Array>; look: (file: string, prompt: string) => Promise<{ cover: string }> }
export const COVER_SCHEMA = { type: 'object', properties: { cover: { type: 'string' } }, required: ['cover'] }

const prompt = (title: string, viTitle: string) => `This is the thumbnail of a YouTube aquarium video titled "${title}". Our Vietnamese guide about it is titled "${viTitle}".
We show a short Vietnamese headline (cover) over the thumbnail, like the big words a Vietnamese creator would put on it.
- When the words on the thumbnail carry the message, say the same in Vietnamese ("ALL MY ALGAE SECRETS" → "Bí quyết trị rêu hại", "THIS GIVES YOU ALGAE" → "Lỗi này gây rêu hại").
- When the words are only labels (Before/After, Ep #3, a channel name) or there are none, write a headline for what the video teaches instead.
- Natural, punchy spoken Vietnamese. Algae is "rêu hại". 2–6 words, at most 30 characters. No colons, commas, quotes or ending punctuation (a question mark inside is fine: "Vẫn còn rêu hại? Đây là lý do"). Sentence case.`

/** Gives each video guide without one a Vietnamese cover label, from a look at its thumbnail. */
export async function videoCovers(contentRoot: string, d: CoverDeps, opts: { limit?: number } = {}): Promise<{ done: string[]; failed: string[] }> {
  const done: string[] = []
  const failed: string[] = []
  const dir = await mkdtemp(join(tmpdir(), 'aq-cover-'))
  try {
    for (const id of (await readdir(join(contentRoot, 'guides')).catch(() => [] as string[])).filter(x => x.startsWith('youtube-')).sort()) {
      if (opts.limit !== undefined && done.length >= opts.limit) break
      const viFile = join(contentRoot, 'guides', id, 'vi.json')
      const vi = JSON.parse(await readFile(viFile, 'utf8')) as Translation
      const e = JSON.parse(await readFile(join(contentRoot, 'guides', id, 'entity.json'), 'utf8')) as GuideEntity
      if (vi.cover || !e.video) continue
      try {
        const file = join(dir, `${e.video.youtubeId}.jpg`)
        await writeFile(file, await d.get(e.video.thumb?.url ?? `https://i.ytimg.com/vi/${e.video.youtubeId}/hqdefault.jpg`))
        const cover = (await d.look(file, prompt(e.video.title, vi.name))).cover.replace(/^["“”']+|["“”'.!?]+$/g, '').trim()
        if (!cover || cover.length > 36 || /[:;,]/.test(cover)) throw new Error(`unusable cover "${cover}"`)
        await writeFile(viFile, `${JSON.stringify(TranslationSchema.parse({ ...vi, cover }), null, 2)}\n`)
        done.push(`${id}: ${cover}`)
      } catch (err) {
        failed.push(`${id}: ${(err as Error).message}`)
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
  return { done, failed }
}
