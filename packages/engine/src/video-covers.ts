import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TranslationSchema, type GuideEntity, type Translation } from '@aq/schema'

export type CoverDeps = { get: (url: string) => Promise<Uint8Array>; look: (file: string, prompt: string) => Promise<{ candidates?: string[]; cover: string }> }
export const COVER_SCHEMA = { type: 'object', properties: { candidates: { type: 'array', items: { type: 'string' } }, cover: { type: 'string' } }, required: ['candidates', 'cover'] }

// No translation pairs as examples: they anchored every label to a word-for-word gloss ("Lỗi này gây rêu hại").
export const coverPrompt = (title: string, viTitle: string, channel = '') => `Đây là thumbnail của video YouTube "${title}"${channel ? ` (kênh ${channel})` : ''}. Bài hướng dẫn tiếng Việt của chúng tôi về video này có tiêu đề "${viTitle}".
Chúng tôi đặt một dòng chữ tiếng Việt lớn đè lên thumbnail: chữ mà một YouTuber thủy sinh người Việt sẽ đặt lên video của chính họ cùng chủ đề.

- Đừng dịch chữ trên thumbnail. Hiểu video hứa gì với người xem, rồi nói lại theo cách người Việt nói, không theo cấu trúc câu tiếng Anh.
- Văn nói, gọn, gây tò mò hoặc hứa một kết quả cụ thể. Được dùng câu hỏi, "bạn", con số, so sánh, từ dân chơi (set bể, rêu bám, châm phân).
- Tránh giọng tiêu đề báo hay máy dịch: "Lỗi này gây…", "Cách để…", "Những điều cần biết", "Hướng dẫn…" khô khan, "Việc…", từ Hán Việt cứng khi có từ nói thường.
- Rêu gây hại gọi là "rêu hại", hoặc tên dân chơi dùng (rêu tóc, BBA, rêu chấm xanh).
- 2–7 chữ, tối đa 30 ký tự. Không dấu hai chấm, dấu phẩy, ngoặc kép hay dấu chấm câu ở cuối (dấu hỏi ở giữa thì được). Chỉ viết hoa chữ đầu câu và tên riêng.

candidates: 5 phương án thật khác nhau. cover: phương án tự nhiên và hút mắt nhất mà vẫn đúng nội dung video.`

const clean = (s: string) => s.replace(/^["“”']+|["“”'.!?]+$/g, '').trim()
const usableCover = (s: string) => !!s && s.length <= 36 && !/[:;,]/.test(s)

/** Gives each video guide without one a Vietnamese cover label, from a look at its thumbnail. */
export async function videoCovers(contentRoot: string, d: CoverDeps, opts: { limit?: number; redo?: boolean } = {}): Promise<{ done: string[]; failed: string[] }> {
  const done: string[] = []
  const failed: string[] = []
  const dir = await mkdtemp(join(tmpdir(), 'aq-cover-'))
  try {
    for (const id of (await readdir(join(contentRoot, 'guides')).catch(() => [] as string[])).filter(x => x.startsWith('youtube-')).sort()) {
      if (opts.limit !== undefined && done.length >= opts.limit) break
      const viFile = join(contentRoot, 'guides', id, 'vi.json')
      const vi = JSON.parse(await readFile(viFile, 'utf8')) as Translation
      const e = JSON.parse(await readFile(join(contentRoot, 'guides', id, 'entity.json'), 'utf8')) as GuideEntity
      if ((vi.cover && !opts.redo) || !e.video) continue
      try {
        const file = join(dir, `${e.video.youtubeId}.jpg`)
        await writeFile(file, await d.get(e.video.thumb?.url ?? `https://i.ytimg.com/vi/${e.video.youtubeId}/hqdefault.jpg`))
        const r = await d.look(file, coverPrompt(e.video.title, vi.name, e.video.channel))
        // The pick, or the first usable candidate when the pick breaks the length/punctuation rules.
        const cover = [r.cover, ...(r.candidates ?? [])].map(clean).find(usableCover)
        if (!cover) throw new Error(`unusable cover "${r.cover}"`)
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
