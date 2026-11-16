import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Video } from '@aq/schema'
import type { Llm } from './claude'

type Item = { id: string; snippet: { title: string; description: string; defaultAudioLanguage?: string }; contentDetails: { duration: string } }
export const seconds = (iso: string) => {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso)
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0
}
const KEEP = { type: 'object', properties: { keep: { type: 'array', items: { type: 'string' } } }, required: ['keep'] }

/**
 * Videos kept off every page, `youtubeId → why` (engine-state/_video-rejected.json, added to by hand or by a check): the
 * sweep takes them off each species and plant page, and findVideos never picks them again. Started by the owner
 * (2026-11-07): the speckled peacock bass page's video whose thumbnail shows the fish dead beside a tape measure.
 */
export const readVideoRejected = async (root: string) =>
  JSON.parse(await readFile(join(root, 'engine-state/_video-rejected.json'), 'utf8').catch(() => '{}')) as Record<string, string>

// Latin letters with their accents (an uploader's own name), written as one letter or a letter and its mark, digits, and
// inside a name one of ' & = ! # $ * ? ^ ` ~. Not every script's letters: Thai and Chinese titles run their words
// together, and a wider class would take the words beside an address with it. An address ends where no Latin letter
// follows its last part (a Thai or Chinese word or a digit may), and a video, picture, sound or subtitle file's extension
// is no address's end, so a file name ("4K@60fps.mp4", "1080p@60fps.mov") isn't one.
const NAME = '[\\p{Script=Latin}\\p{Nd}\\u0300-\\u036f._%+-]', PART = '[\\p{Script=Latin}\\p{Nd}\\u0300-\\u036f-]', JOIN = "['’&=!#$*?^`~]"
const FILE = '3g2|3gp|aac|asf|avi|bmp|dng|flac|flv|gif|hdr|heic|jpe?g|m2ts|m4a|m4v|mkv|mov|mp3|mp4|mpe?g|mts|mxf|ogg|ogv|opus|pdf|png|raw|rmvb|srt|svg|tiff?|ts|vob|wav|webm|webp|wmv'
const ADDRESS = `${NAME}+(?:${JOIN}${NAME}+)*@${PART}+(?:\\.${PART}+)*\\.(?!(?:${FILE})(?![\\p{Script=Latin}\\p{Nd}\\p{M}]))\\p{Script=Latin}{2,}(?![\\p{Script=Latin}\\p{M}])`
const EMAIL = new RegExp(ADDRESS, 'giu'), MAILTO = new RegExp(`mailto:${ADDRESS}(?:\\?\\S*)?`, 'giu')
// What an address leaves is cleaned only where it stood (A marks it): the rest of the title stays as written. A bracket,
// quote or stop counts only right against it.
const A = '\u0000', SEP = '[|/·•:;,–—>-]', OPEN = '[(\\[{<«‹「『〈【（［"“\'‘]', CLOSE = '[)\\]}>»›」』〉】）］"”\'’]'
const BRACKETED = new RegExp(`${OPEN}${A}${CLOSE}`, 'g'), IN_A_ROW = new RegExp(`${A}(?:\\s*${SEP}?\\s*${A})+`, 'g')
const LEFT: [RegExp, string][] = [
  [IN_A_ROW, A], // two addresses in a row are one
  [BRACKETED, A], // a bracket or quotes around it alone
  [IN_A_ROW, A], // and two bracketed ones in a row
  [new RegExp(`${SEP}?\\s*${A}(?=${CLOSE})`, 'g'), ''], // last in a bracket: "(contact: …)"
  [new RegExp(`(?<=${OPEN})${A}\\s*${SEP}?\\s*`, 'g'), ''], // first in a bracket
  [new RegExp(`(${SEP}+)\\s*${A}\\s*${SEP}+`, 'g'), '$1'], // between separators: the first stay
  [new RegExp(`^\\s*${A}\\s*${SEP}?\\s*|\\s*${SEP}?\\s*${A}\\s*$`, 'g'), ''], // at either end, with its separator
  [new RegExp(`\\s*${SEP}?\\s*${A}(?=[.,;:!?…])`, 'g'), ''], // right before a stop, with a separator before it
  [new RegExp(`\\s*${A}\\s*`, 'g'), ' '],
]

/**
 * A video's title as the engine stores it: an email address its uploader wrote into it is taken out, with what it
 * leaves where it stood (a bracket or quotes around it, a separator beside it, the space before a stop, a "mailto:" and
 * its query), so no run writes a personal address into the repository (the chief of staff, 16 Nov). Everything else in
 * the title stays as written, and a title with none, or no title, comes back byte for byte. Unsure means dropped: words
 * joined to an address by a dot, a dash or an underscore go with it.
 */
export function videoTitle(raw: string): string {
  if (!raw?.match(EMAIL)) return raw
  return LEFT.reduce((s, [re, to]) => s.replace(re, to), raw.replace(MAILTO, A).replace(EMAIL, A))
}

/** 2–4 relevant YouTube videos, none of `skip` (the rejected ones); [] when no YOUTUBE_API_KEY is configured. */
export async function findVideos(names: string[], llm: Llm, http: (url: string) => Promise<unknown>, o: { apiKey?: string; skip?: Record<string, string> } = {}): Promise<Video[]> {
  const apiKey = o.apiKey ?? process.env.YOUTUBE_API_KEY
  if (!apiKey || !names.length) return []
  const api = 'https://www.googleapis.com/youtube/v3'
  const search = (await http(`${api}/search?${new URLSearchParams({ part: 'id', type: 'video', videoEmbeddable: 'true', maxResults: '10', q: `${names[0]} aquarium`, key: apiKey })}`)) as { items?: { id: { videoId: string } }[] }
  const ids = (search.items ?? []).map(i => i.id.videoId)
  if (!ids.length) return []
  const details = (((await http(`${api}/videos?${new URLSearchParams({ part: 'snippet,contentDetails', id: ids.join(','), key: apiKey })}`)) as { items?: Item[] }).items ?? []).filter(v => !o.skip?.[v.id])
  if (!details.length) return []
  const list = details.map(v => `${v.id}: ${v.snippet.title} — ${v.snippet.description.slice(0, 200)}`).join('\n')
  const { keep } = await llm<{ keep: string[] }>({
    system: 'You vet aquarium videos. Reply only with JSON.',
    prompt: `Species: ${names.join(' / ')}\nKeep up to 4 video ids that clearly show this species in an aquarium or its habitat (care, breeding, behaviour). Drop unrelated, clickbait or shop-only videos.\n\n${list}`,
    schema: KEEP,
  })
  return details.filter(v => keep.includes(v.id)).slice(0, 4).map(v => ({ youtubeId: v.id, title: videoTitle(v.snippet.title), durationSec: seconds(v.contentDetails.duration), lang: v.snippet.defaultAudioLanguage ?? 'en' }))
}
