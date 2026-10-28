import type { Video } from '@aq/schema'
import type { Llm } from './claude'

type Item = { id: string; snippet: { title: string; description: string; defaultAudioLanguage?: string }; contentDetails: { duration: string } }
const seconds = (iso: string) => {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso)
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0
}
const KEEP = { type: 'object', properties: { keep: { type: 'array', items: { type: 'string' } } }, required: ['keep'] }

/** 2–4 relevant YouTube videos; [] when no YOUTUBE_API_KEY is configured. */
export async function findVideos(names: string[], llm: Llm, http: (url: string) => Promise<unknown>, apiKey = process.env.YOUTUBE_API_KEY): Promise<Video[]> {
  if (!apiKey || !names.length) return []
  const api = 'https://www.googleapis.com/youtube/v3'
  const search = (await http(`${api}/search?${new URLSearchParams({ part: 'id', type: 'video', videoEmbeddable: 'true', maxResults: '10', q: `${names[0]} aquarium`, key: apiKey })}`)) as { items?: { id: { videoId: string } }[] }
  const ids = (search.items ?? []).map(i => i.id.videoId)
  if (!ids.length) return []
  const details = ((await http(`${api}/videos?${new URLSearchParams({ part: 'snippet,contentDetails', id: ids.join(','), key: apiKey })}`)) as { items?: Item[] }).items ?? []
  const list = details.map(v => `${v.id}: ${v.snippet.title} — ${v.snippet.description.slice(0, 200)}`).join('\n')
  const { keep } = await llm<{ keep: string[] }>({
    system: 'You vet aquarium videos. Reply only with JSON.',
    prompt: `Species: ${names.join(' / ')}\nKeep up to 4 video ids that clearly show this species in an aquarium or its habitat (care, breeding, behaviour). Drop unrelated, clickbait or shop-only videos.\n\n${list}`,
    schema: KEEP,
  })
  return details.filter(v => keep.includes(v.id)).slice(0, 4).map(v => ({ youtubeId: v.id, title: v.snippet.title, durationSec: seconds(v.contentDetails.duration), lang: v.snippet.defaultAudioLanguage ?? 'en' }))
}
