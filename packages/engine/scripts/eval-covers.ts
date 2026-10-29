/**
 * Which way of writing video cover labels reads most like a Vietnamese creator's thumbnail? Every video guide with a
 * cover: the current label (A) against the new prompt on Sonnet (B) and Opus (C), judged blind and pairwise (Opus, both
 * orders) on natural + catchy + true to the video. Output: /tmp/aqeval-covers/report.md (never touches content/).
 *
 *   pnpm --filter @aq/engine exec tsx scripts/eval-covers.ts
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { GuideEntity, Translation } from '@aq/schema'
import { claudeCli, claudeVision } from '../src/claude'
import { COVER_SCHEMA, coverPrompt } from '../src/video-covers'
import { cachedIn, mean, pairs, pool, retry, tally, verdictSchema, type Verdict } from './eval-lib'

const OUT = '/tmp/aqeval-covers'
const CONTENT = join(import.meta.dirname, '../../../content')
const MODELS: Record<string, string | null> = { A: null, B: 'sonnet', C: 'opus' } // A = the label on the site now
const JUDGE = `You are a Vietnamese YouTube editor for aquarium-hobby channels. Two Vietnamese headlines (X and Y) are candidates for the big text over the thumbnail of the video below.
Pick the one a Vietnamese hobbyist is more likely to click, judging: does it sound like something a Vietnamese creator would actually write (not a translation or machine text), is it catchy, and is it true to what the video teaches (no false promise)?
Return: better ("X", "Y" or "tie"), naturalX and naturalY (1–10, how natural and catchy), why (one sentence).`

await mkdir(OUT, { recursive: true })
const cached = cachedIn(OUT)
const guides = []
for (const id of (await readdir(join(CONTENT, 'guides'))).filter(x => x.startsWith('youtube-')).sort()) {
  const vi = JSON.parse(await readFile(join(CONTENT, 'guides', id, 'vi.json'), 'utf8')) as Translation
  const e = JSON.parse(await readFile(join(CONTENT, 'guides', id, 'entity.json'), 'utf8')) as GuideEntity
  if (vi.cover && e.video) guides.push({ id, vi, v: e.video })
}
const names = Object.keys(MODELS)
const covers = new Map<string, string>()
await pool(guides.flatMap(g => names.map(n => async () => {
  if (!MODELS[n]) return void covers.set(`${g.id}/${n}`, g.vi.cover!)
  const file = join(OUT, `${g.v.youtubeId}.jpg`)
  await readFile(file).catch(async () => writeFile(file, new Uint8Array(await (await fetch(g.v.thumb?.url ?? `https://i.ytimg.com/vi/${g.v.youtubeId}/hqdefault.jpg`)).arrayBuffer())))
  const r = await cached(`cover-${g.id}-${n}.json`, () => retry(() => claudeVision<{ candidates: string[]; cover: string }>({ system: 'You write short Vietnamese labels for video thumbnails. Reply only with JSON.', prompt: coverPrompt(g.v.title, g.vi.name, g.v.channel), schema: COVER_SCHEMA, file, model: MODELS[n]! })))
  covers.set(`${g.id}/${n}`, r.cover.replace(/^["“”']+|["“”'.!?]+$/g, '').trim())
  console.log(`${g.id} ${n}: ${covers.get(`${g.id}/${n}`)}`)
})))

const rows: { x: string; y: string; v: Verdict }[] = []
await pool(guides.flatMap(g => pairs(names).map(([x, y]) => async () => {
  const cx = covers.get(`${g.id}/${x}`)!, cy = covers.get(`${g.id}/${y}`)!
  const v: Verdict = cx === cy ? { better: 'tie', naturalX: 0, naturalY: 0, why: 'same text' } : await cached(`judge-${g.id}-${x}-${y}.json`, () => retry(() => claudeCli<Verdict>({
    system: 'You judge Vietnamese headlines. Reply only with JSON.', model: 'opus', schema: verdictSchema(false),
    prompt: `${JUDGE}\n\nVideo: "${g.v.title}" by ${g.v.channel}\nOur Vietnamese guide: "${g.vi.name}"\n\nX: ${cx}\nY: ${cy}`,
  })))
  if (cx !== cy) rows.push({ x, y, v })
})))
const stat = tally(names, rows)
const lines = [
  '# Cover label eval', '', `${guides.length} video guides. Judge: opus, pairwise, both orders.`, '',
  '| variant | model | wins | losses | ties | natural + catchy (1–10) |', '|---|---|---|---|---|---|',
  ...names.map(n => `| ${n} | ${MODELS[n] ?? 'current label'} | ${stat[n]!.wins} | ${stat[n]!.losses} | ${stat[n]!.ties} | ${mean(stat[n]!.natural)} |`),
  '', '| video | ' + names.join(' | ') + ' |', '|---|' + names.map(() => '---|').join(''),
  ...guides.map(g => `| ${g.v.title} | ${names.map(n => covers.get(`${g.id}/${n}`)).join(' | ')} |`),
]
await writeFile(join(OUT, 'report.md'), lines.join('\n'))
console.log(lines.join('\n'))
