import { readFileSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pageFish, speaksPageLang, VideoTitlesSchema, type Lang } from '@aq/schema'
import { isVietnamese } from '@aq/schema/text'
import { LlmError, type Llm } from './claude'
import { TARGETS, type TargetLang } from './localize'
import { withTanks } from './round'
import { forgetVerdicts, recordVerdicts } from './video-title-check'

const PROMPT = withTanks(readFileSync(new URL('./prompts/video-titles.md', import.meta.url), 'utf8'))
const SCHEMA = { type: 'object', required: ['titles'], properties: { titles: { type: 'array', items: { type: 'object', required: ['n', 'title'], properties: { n: { type: 'number' }, title: { type: 'string' } } } } } }
const BATCH = 40
const THAI = /[฀-๿]/
/** A dot that ends an abbreviation, kept when a title's full stop comes off: Thai's cm and mm, a scientific name's spp. or cf. */
const ABBREVIATION = /(?:\b(?:spp?|ssp|var|cf|aff|dll|dsb|dst|dkk|v\.v|Jr|jr)|\d\s?(?:ซม|มม|กก|มล|ม|ล))\.$/
const VI = { lang: 'Vietnamese', country: 'Vietnam', style: 'Style: plain written Vietnamese, as aquarium hobbyists in Vietnam write it: "bể", "cá", "thay nước", "cây thủy sinh". No phrasing that reads as translated from English. Say it as a keeper would, not as a book or the news. Numbers: 1.136 lít, 1,5 cm, a space before a unit. A fish\'s young take one "cá": "Cá con hồng ngọc hai chấm", "Cá L354 con". Keepers\' words: "cá nuôi chung" (tank mates), "đẻ" (spawn), "mình" (my, I), "mình học được" (what I learned, never "rút ra").' }

/** Per language: the word for "about", the litres word, the thousands mark, the word for "part", and a page name's leading "fish" words. */
const TIDY: Record<Lang, { about: string; litres: string; thousands: string; part: string; fish: string[] }> = {
  vi: { about: 'khoảng', litres: 'lít', thousands: '.', part: 'phần', fish: ['Cá', 'Tép', 'Ốc', 'Tôm', 'Cua'] },
  id: { about: 'sekitar', litres: 'liter', thousands: '.', part: 'bagian', fish: ['Ikan', 'Udang', 'Keong', 'Siput', 'Kepiting'] },
  th: { about: 'ประมาณ', litres: 'ลิตร', thousands: ',', part: 'ตอนที่', fish: [] },
  ms: { about: 'kira-kira', litres: 'liter', thousands: ',', part: 'bahagian', fish: ['Ikan', 'Udang', 'Siput', 'Ketam'] },
}

/**
 * A title as kept, the same every run whatever the model wrote (the editors, 15 Nov): no full stop at the end (an
 * abbreviation keeps its dot); no bracket that only repeats words the title gave before it, which "the page's name, then the
 * scientific name in brackets" writes when the page is named by its scientific name; the page's scientific name in the
 * page's capitals. With the page's language: a gallon size's litres
 * say "about" where no word stands before the number ("more than" stays), and carry the language's thousands mark, a part number takes no comma before it, and a page name's "fish"
 * word ("Ikan", "Cá") is lower case after the title's first word.
 */
export function tidyTitle(title: string, lang?: Lang, scientificName?: string): string {
  const escaped = (s: string) => s.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // A bracket whose words the title already gave, as whole words, anywhere before it ("… Amblyceps foratum bạch tạng (Amblyceps foratum)").
  let t = title.trim().replace(/\s*\(([^()]+)\)/g, (m, inner: string, at: number, all: string) => /\p{L}.*\p{L}.*\p{L}/u.test(inner) && new RegExp(`(^|\\s)${escaped(inner)}(?=[\\s,]|$)`, 'iu').test(all.slice(0, at).trim()) ? '' : m)
  // The page's scientific name as the page spells it: a video's "Vittina Waigiensis" is the page's "Vittina waigiensis" (the editors, round 8).
  if (scientificName) t = t.replace(new RegExp(`(?<!\\p{L})${escaped(scientificName)}(?!\\p{L})`, 'giu'), scientificName)
  const w = lang && TIDY[lang]
  if (w) {
    // Vietnamese keepers write "gallon"; the news spelling "galông" the model sometimes gives is set right first (the editors, round 9).
    if (lang === 'vi') t = t.replace(/(?<!\p{L})galông(?!\p{L})/gu, 'gallon')
    t = t.replace(new RegExp(`(gallons?|galon|gelen|แกลลอน) \\((\\S+ )?(\\d[\\d.,]*) ${w.litres}\\)`, 'g'), (m, unit: string, before: string | undefined, n: string) => {
      // Only a bare figure gets the thousands mark: one already written with a separator may be a decimal (Malay 3.785).
      const num = /^\d{4,}$/.test(n) ? n.replace(/\B(?=(\d{3})+$)/g, w.thousands) : n
      return `${unit} (${before ?? `${w.about} `}${num} ${w.litres})`
    })
    t = t.replace(new RegExp(`,\\s*(${w.part}) (\\d+)$`), ' $1 $2')
    // English-style capitals throughout: most words after the first, outside brackets and other than the fish word, capitalised.
    const words = t.replace(/\([^()]*\)/g, ' ').split(/\s+/).slice(1).filter(x => /^\p{L}/u.test(x) && !w.fish.includes(x))
    const titleCase = words.length >= 2 && words.filter(x => /^\p{Lu}/u.test(x)).length / words.length >= 0.5
    if (w.fish.length && !titleCase) t = t.replace(new RegExp(`(?<=[^\\s.!?|:] )(${w.fish.join('|')})(?= )`, 'g'), s => s.toLowerCase())
  }
  return (ABBREVIATION.test(t) ? t : t.replace(/(?<!\.)\.$/, '')).slice(0, 140)
}

type Video = { youtubeId: string; title: string; lang: string }
type Page = { t?: { name?: string }; name?: string }
type Todo = Video & { about: string; scientificName?: string }

/** Whether a translated title can be kept: written in the page's language, and not the foreign title handed back. */
export function titleFits(text: string, original: string, lang: Lang): boolean {
  if (!text) return false
  if (lang === 'th') return THAI.test(text)
  if (lang === 'vi') return text !== original || isVietnamese(text)
  return !isVietnamese(text)
}

/**
 * Video titles in a page's language (the owner's report, 2026-11-10: a Vietnamese page listing English titles). For every
 * language's pages that have videos, each video not spoken in that language, once: content/video-titles/<lang>.json,
 * YouTube id → title. The loader shows them (videosForPage). `limit`: model calls this run, 40 titles each. `only`: just
 * these videos, made again even where a title is already stored (a page's titles redone after the prompt changes). `redo`:
 * every title made again (a full re-translation after the prompt changes). No run, with either or neither, touches a
 * title in content/video-titles/kept.json, YouTube id → why: those the editors passed, kept as they are.
 */
/**
 * A run's options from the command line. `video-titles-redo` is --redo under its own name, so a full re-translation has
 * a spending line of its own, and writes on Opus, as the editors' rounds and its line were (#1455); the cycle's
 * `video-titles` keeps the default model.
 */
export const titlesRunOptions = (cmd: string, v: { limit?: string; parallel?: string; only?: string; redo?: boolean }) => ({
  limit: v.limit ? Number(v.limit) : undefined, parallel: v.parallel ? Number(v.parallel) : 1, only: v.only ? v.only.split(',') : undefined,
  redo: Boolean(v.redo) || cmd === 'video-titles-redo', model: cmd === 'video-titles-redo' ? 'opus' : undefined,
})

export async function translateVideoTitles(root: string, llm: Llm, lang: Lang, o: { limit?: number; parallel?: number; model?: string; only?: string[]; redo?: boolean } = {}) {
  const file = join(root, 'content/video-titles', `${lang}.json`)
  const done = VideoTitlesSchema.parse(JSON.parse(await readFile(file, 'utf8').catch(() => '{}')))
  const save = async () => {
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, `${JSON.stringify(Object.fromEntries(Object.entries(done).sort(([a], [b]) => a.localeCompare(b))), null, 2)}\n`)
  }
  const read = async <T>(path: string) => JSON.parse(await readFile(path, 'utf8').catch(() => 'null')) as T | null
  // Titles the editors read and passed, kept as they are in every language: no run makes them again (the chief of staff, 15 Nov).
  const kept = (await read<Record<string, string>>(join(root, 'content/video-titles/kept.json'))) ?? {}
  const todo = new Map<string, Todo>()
  // What each foreign video's pages are about, by scientific name (a product by its page): a video on the pages of more than
  // one fish gets no title, as one title would name one page's fish on the other (the editors, round 10: a glass-catfish
  // video on both Kryptopterus pages was named for the one met first).
  const about = new Map<string, Set<string>>()
  for (const kind of ['species', 'products']) {
    for (const id of (await readdir(join(root, 'content', kind)).catch(() => [] as string[])).sort()) {
      const t = await read<Page>(join(root, 'content', kind, id, `${lang}.json`))
      if (!t) continue
      const e = await read<{ scientificName?: string; name?: string; videos?: Video[]; reviews?: { videos: Video[] } }>(join(root, 'content', kind, id, 'entity.json'))
      const name = t.t?.name ?? t.name ?? e?.name ?? id
      for (const v of e?.videos ?? e?.reviews?.videos ?? []) {
        if (speaksPageLang(v, lang) || v.youtubeId in kept) continue
        about.set(v.youtubeId, (about.get(v.youtubeId) ?? new Set()).add(pageFish(kind, id, e)))
        if (todo.has(v.youtubeId) || (o.only ? !o.only.includes(v.youtubeId) : !o.redo && v.youtubeId in done)) continue
        todo.set(v.youtubeId, { ...v, about: e?.scientificName ? `${name}, ${e.scientificName}` : name, scientificName: e?.scientificName })
      }
    }
  }
  // Such a video keeps its own title, recorded with the reason where the site reads refusals (video-title-check.ts).
  const shared = [...about].filter(([, fish]) => fish.size > 1)
  for (const [id] of shared) todo.delete(id)
  // A title stored for one before is taken out, so nothing stored names one page's fish for the other.
  if (shared.some(([id]) => id in done)) { for (const [id] of shared) delete done[id]; await save() }
  if (shared.length) await recordVerdicts(root, lang, Object.fromEntries(shared.map(([id, fish]) => [id, { ok: false, kind: 'wrong fish' as const, why: `on the pages of ${fish.size} fish (${[...fish].join(', ')}): one title would name one page's fish on the other` }])))
  const rows = [...todo.values()]
  const batches = Array.from({ length: Math.ceil(rows.length / BATCH) }, (_, i) => rows.slice(i * BATCH, (i + 1) * BATCH))
  const target = lang === 'vi' ? VI : TARGETS[lang as TargetLang]
  const report = { titles: 0, rejected: [] as string[], failed: [] as string[], stopped: '', left: rows.length }
  const calls = batches.slice(0, o.limit ?? batches.length)
  let next = 0
  // A title given new words loses the meaning check's verdicts on the old ones (video-title-check.ts): the site shows the
  // video's own title until the check reads the new. One batch at a time, as the batches may run side by side.
  let forgetting = Promise.resolve()
  const work = async () => {
    while (next < calls.length && !report.stopped) {
      const batch = calls[next++]!
      try {
        const prompt = `${PROMPT.replaceAll('{{LANG}}', target.lang).replaceAll('{{COUNTRY}}', target.country).replace('{{STYLE}}', target.style)}\n\n${batch.map((v, j) => `${j + 1}. [${v.about}] ${v.title}`).join('\n')}`
        const r = await llm<{ titles: { n: number; title: string }[] }>({ system: `You translate video titles into ${target.lang}. Reply only with JSON.`, prompt, schema: SCHEMA, model: o.model })
        const fresh: Record<string, string> = {}
        for (const x of r.titles ?? []) {
          const v = batch[x.n - 1]
          if (!v) continue
          const text = tidyTitle(x.title ?? '', lang, v.scientificName)
          if (titleFits(text, v.title, lang)) { fresh[v.youtubeId] = text; report.titles++; report.left-- } else report.rejected.push(`${v.youtubeId}: ${v.title} -> ${text}`)
        }
        // The old words' verdicts come off before the new words are stored: a run killed between the two leaves the old
        // words with none, unread, never a verdict on words it wasn't given (the reviewers of the check, 16 Nov).
        const changed = Object.keys(fresh).filter(id => done[id] !== fresh[id])
        await (forgetting = forgetting.then(() => forgetVerdicts(root, lang, changed)))
        Object.assign(done, fresh)
        await save() // after every batch: a stopped run keeps what it finished
      } catch (err) {
        if (err instanceof LlmError) report.stopped ||= err.message
        else report.failed.push((err as Error).message.slice(0, 200))
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, o.parallel ?? 1) }, work))
  return report
}
