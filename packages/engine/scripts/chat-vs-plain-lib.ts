/**
 * The chat against plain Claude (chat-vs-plain.ts): the questions' shape, what the reader sees of our answer, the blind
 * judge's brief and schema, and the tally of both orders. Pure: no calls, no files.
 */
import type { ChatBlock } from '../../../apps/site/worker/chat/answer'
import type { Tank } from '../../../apps/site/worker/chat/tools'
import { textOf } from '../../../apps/site/worker/chat/tools'

export const TOPICS = ['algae', 'setup', 'cycling', 'sick', 'stocking'] as const
export type Topic = (typeof TOPICS)[number]

/** A reader's tank as the forum post describes it; null where the post doesn't say. */
export type PostTank = {
  l: number | null
  w: number | null
  h: number | null
  litres: number | null
  /** `id`: the handbook's fish, pinned by hand (a name alone matches the wrong fish too often); none: no page. */
  fish: { name: string; count: number | null; id?: string }[]
  plants: string[]
  light: string | null
  co2: string | null
  ferts: string | null
  substrate: string | null
  ageWeeks: number | null
  notes: string | null
}
/**
 * One hard question from a public forum post, reworded with no names. `post`: the whole post, as a reader would type it
 * to a chatbot. `short`: the same question asked in an app that already holds their tank.
 */
export type HardQuestion = { id: string; topic: Topic; post: string; short: string; tank: PostTank | null; source: string; date?: string | null; holdout?: boolean }

/**
 * The two conditions, reported apart:
 * - post: both answer the whole post, word for word, and no saved tank.
 * - tank: both get the short question; ours reads the reader's saved tank (what the chat reads of it today), plain Claude
 *   has only the question. The judge is told what the tank holds.
 */
export const CONDITIONS = ['post', 'tank'] as const
export type Condition = (typeof CONDITIONS)[number]

/**
 * The saved tank the `tank` condition gives the chat, as api.ts `tanksOf` would read it: its size, fish (pinned to the
 * handbook or without a page), plants without a page, substrate and age; the light, CO₂ and fertiliser the post told go in
 * its notes, as a reader might type them (a real tank's light schedules and plugs come from the app, which a post can't
 * give). A chat that reads less of a tank leaves the rest out.
 */
export function savedTank(t: PostTank): Tank {
  const species: Tank['species'] = []
  const unlisted: Tank['unlisted'] = []
  for (const f of t.fish) {
    if (f.id) species.push({ id: f.id, ...(f.count ? { count: f.count } : {}) })
    else unlisted.push({ name: f.name, kind: 'fish', ...(f.count ? { count: f.count } : {}) })
  }
  const notes = [t.light ? `Đèn: ${t.light}` : null, t.co2 ? `CO2: ${t.co2}` : null, t.ferts ? `Phân: ${t.ferts}` : null, t.notes].filter(Boolean).join('. ')
  // Built apart, then returned: a chat whose Tank has no such fields still takes it (a run of an older brain).
  const tank = {
    id: 'eval-tank', name: 'Bể của tôi',
    ...(t.l && t.w && t.h ? { dims: { l: t.l, w: t.w, h: t.h } } : {}),
    ...(t.litres ? { litres: t.litres } : {}),
    species, unlisted: [...unlisted, ...t.plants.map(name => ({ name, kind: 'plant' }))],
    ...(t.substrate ? { substrate: t.substrate } : {}),
    ...(t.ageWeeks !== null ? { days: t.ageWeeks * 7 } : {}),
    ...(notes ? { notes } : {}),
  }
  return tank
}

/** The tank as the judge reads it in the `tank` condition: everything the post said, whether or not the chat reads it. */
export function tankFacts(t: PostTank): string {
  const size = t.l && t.w && t.h ? `${t.l}×${t.w}×${t.h} cm` : null
  return [
    size || t.litres ? `- Size: ${[size, t.litres ? `${t.litres} L` : null].filter(Boolean).join(', ')}` : null,
    t.fish.length ? `- Fish: ${t.fish.map(f => `${f.name}${f.count ? ` ×${f.count}` : ''}`).join(', ')}` : null,
    t.plants.length ? `- Plants: ${t.plants.join(', ')}` : null,
    t.light ? `- Light: ${t.light}` : null,
    t.co2 ? `- CO₂: ${t.co2}` : null,
    t.ferts ? `- Fertiliser: ${t.ferts}` : null,
    t.substrate ? `- Substrate: ${t.substrate}` : null,
    t.ageWeeks !== null ? `- Running for: ${t.ageWeeks} weeks` : null,
    t.notes ? `- Notes: ${t.notes}` : null,
  ].filter(Boolean).join('\n')
}

const range = (r?: { min: number; max: number }) => (r ? (r.min === r.max ? `${r.min}` : `${r.min}–${r.max}`) : undefined)
function card(c: Extract<ChatBlock, { t: 'species' }> | Extract<ChatBlock, { t: 'compare' }>['items'][number]): string {
  const name = `${c.page.name}${c.page.sci ? ` (${c.page.sci})` : ''}`
  if ('plant' in c) {
    const p = c.plant
    return `${name}: ${[p.difficulty ? `độ khó ${p.difficulty}/3` : null, p.light ? `ánh sáng ${p.light}` : null, p.co2 ? `CO₂ ${p.co2}` : null, p.growth ? `tốc độ ${p.growth}` : null, p.placement?.length ? `vị trí ${p.placement.join(', ')}` : null].filter(Boolean).join('; ')}`
  }
  const f = c.facts
  return `${name}: ${[range(f.tempC) ? `nhiệt độ ${range(f.tempC)} °C` : null, range(f.ph) ? `pH ${range(f.ph)}` : null, range(f.gh) ? `GH ${range(f.gh)}` : null, f.sizeCm ? `dài ${f.sizeCm} cm` : null, f.tankCm ? `bể từ ${f.tankCm} cm` : null, f.schoolMin ? `đàn từ ${f.schoolMin} con` : null, f.temperament ? `tính ${f.temperament}` : null, f.difficulty ? `độ khó ${f.difficulty}/8` : null].filter(Boolean).join('; ')}`
}

/** How much of a section the app shows before the reader taps (apps/ios chat screen: five lines, the fifth fading). */
export const FOLDED = 220

/** What a block shows the reader, as text: a card's figures, a section's words, a tool's check or what it's filled with. */
export function blockText(b: ChatBlock): string {
  switch (b.t) {
    case 'species': return `[Thẻ loài] ${card(b)}`
    case 'compare': return `[So sánh]\n${b.items.map(c => `- ${card(c)}`).join('\n')}`
    case 'section': {
      // Folded, as the app draws it: about five lines of a phone's width, the rest a tap away.
      const all = textOf(b.blocks)
      const shown = all.length <= FOLDED ? all : `${all.slice(0, all.lastIndexOf(' ', FOLDED) > 0 ? all.lastIndexOf(' ', FOLDED) : FOLDED)}… [chạm để đọc tiếp]`
      return `[Trích: ${b.page.title}${b.heading ? ` › ${b.heading.text}` : ''}]\n${shown}`
    }
    case 'tool': {
      const c = b.check
      const lines = c
        ? [c.verdict?.text, ...c.warnings, c.stocking ? `Mức đầy bể: ${c.stocking.percent}% — ${c.stocking.text}${c.stocking.notes.length ? ` (${c.stocking.notes.join('; ')})` : ''}` : undefined, c.minTank, c.unsized, c.unchecked]
        : []
      const tank = b.tank ? ` cho ${b.tank.name}${b.tank.dims ? ` ${b.tank.dims.l}×${b.tank.dims.w}×${b.tank.dims.h} cm` : ''}` : ''
      const filled = b.url && !c ? ` (đã điền sẵn: ${decodeURIComponent(b.url.split('?')[1] ?? '').replace(/&/g, ', ') || 'trống'})` : ''
      return [`[Công cụ: ${b.name}${tank}${filled}]`, ...lines.filter((l): l is string => Boolean(l))].join('\n')
    }
  }
}

/** Our turn as the reader sees it: the text, each block under it, then the suggested next questions. */
export function seenOurs(text: string, blocks: ChatBlock[], suggestions: string[]): string {
  return [text, ...blocks.map(blockText), ...(suggestions.length ? [`[Gợi ý hỏi tiếp] ${suggestions.join(' · ')}`] : [])].join('\n\n')
}

/** The site's name and links out of both answers: the judge isn't told which answer is ours, and these would tell it. */
export const unbrand = (s: string) => s.replace(/\s*\bAquaTome\b/gi, '').replace(/https?:\/\/\S+/g, '[link]').replace(/(^|[\s(])\/(vi|id|th)\/[^\s)]*/g, '$1[link]')

/** What an answer most lacks, as the judge tags it: the gap list the next builds follow. */
export const LACKS = ['plan', 'diagnosis', 'tank-fit', 'figures', 'follow-up', 'local', 'too-thin', 'too-long', 'asks-only', 'wrong', 'unsafe', 'off-topic'] as const
export type Lack = (typeof LACKS)[number]
export const CRITERIA = ['correct', 'fits', 'actionable', 'grounded', 'local'] as const
export type Criterion = (typeof CRITERIA)[number]
export type Side = 'X' | 'Y' | 'tie'
export type Verdict = {
  criteria: Record<Criterion, Side>
  better: Side
  scoreX: number
  scoreY: number
  lacksX: Lack[]
  lacksY: Lack[]
  errorsX: string[]
  errorsY: string[]
  why: string
}

/** The rubric's version: a judge's verdict is cached under it, so a changed rubric judges again. */
export const RUBRIC_VERSION = 2
export const JUDGE_SYSTEM = 'You are an experienced Vietnamese aquarium and planted-tank hobbyist judging two answers to a fellow hobbyist. Reply only with JSON.'
/** How to judge, the same words for the judge (one pair) and the panel (many): between the question and the answers. */
const RUBRIC = `An answer may show content under its text: a guide's excerpt, a fish's card, a tool's result, suggested next questions, each marked in [brackets]. The reader sees it on screen under the text: judge it as part of the answer. An excerpt shows its first few lines; "[chạm để đọc tiếp]" means the reader can tap to read the rest of that guide's section.

Judge on each count, X, Y or tie:
- correct: the facts are right and the advice is safe for the fish and plants. A wrong cause, a harmful step or a wrong dose loses.
- fits: it uses this hobbyist's tank and situation (size, fish, plants, light, CO₂, how long it has run, what they tried), not advice that fits any tank.
- actionable: they know what to do now and in what order, and what to watch for. An answer that mostly asks questions back, with no first steps, loses.
- grounded: no made-up precision. Figures, doses, product names or claims that look invented or wrong lose; a figure stated with its reason or source is fine.
- local: Vietnamese a hobbyist would write, the hobby words used in Vietnam, and advice that fits Vietnam (its heat, its tap water, what is sold there).
Then better: which answer you would rather this hobbyist got, X, Y or tie. Don't prefer an answer for being longer: prefer the one that solves the problem. Padding the reader has to wade through counts against it, and so does an answer too thin to act on.

Also give:
- scoreX, scoreY: 1–10, how well each answer helps this hobbyist.
- lacksX, lacksY: up to three of what each answer most lacks, from: plan (no steps in order), diagnosis (doesn't say the likely cause), tank-fit (ignores their details), figures (lacks the numbers needed: hours, %, doses, temperatures, days), follow-up (no what to watch or when to check), local, too-thin, too-long, asks-only, wrong, unsafe, off-topic. Empty if it lacks nothing that matters.
- errorsX, errorsY: each factual error or unsafe advice, quoted briefly with why it's wrong. Empty if none.
- why: one or two sentences.`
export function judgePrompt(question: string, tank: string | null, x: string, y: string): string {
  return `A Vietnamese hobbyist asked an AI assistant for help. Two assistants answered (X and Y). Judge which answer would help this hobbyist more, as an experienced keeper who knows what actually fixes these problems in tanks in Vietnam.

The question, as the hobbyist typed it:
"""
${question}
"""
${tank ? `\nWhat is true about their tank (their app holds it; they didn't type it, and an assistant may or may not have been able to read it):\n${tank}\n` : ''}
${RUBRIC}

=== X ===
${x}

=== Y ===
${y}`
}
const side = { type: 'string', enum: ['X', 'Y', 'tie'] }
const strs = { type: 'array', items: { type: 'string' } }
export const JUDGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['criteria', 'better', 'scoreX', 'scoreY', 'lacksX', 'lacksY', 'errorsX', 'errorsY', 'why'],
  properties: {
    criteria: { type: 'object', additionalProperties: false, required: [...CRITERIA], properties: Object.fromEntries(CRITERIA.map(c => [c, side])) },
    better: side,
    scoreX: { type: 'number' },
    scoreY: { type: 'number' },
    lacksX: { type: 'array', items: { type: 'string', enum: [...LACKS] } },
    lacksY: { type: 'array', items: { type: 'string', enum: [...LACKS] } },
    errorsX: strs,
    errorsY: strs,
    why: { type: 'string' },
  },
}

/** One pair judged both ways, as ours and plain: X was ours in the first, plain in the second. */
export type Judged = { first: Verdict; second: Verdict }
export type Outcome = 'ours' | 'plain' | 'tie'
const asOurs = (s: Side, oursIs: 'X' | 'Y'): Outcome => (s === 'tie' ? 'tie' : s === oursIs ? 'ours' : 'plain')
/** A side wins only when both orders pick it; a split or a tie is a tie. */
export const agreed = (a: Outcome, b: Outcome): Outcome => (a === b ? a : 'tie')

/** A pair's result, both orders read back to ours and plain. */
export function outcome(j: Judged) {
  const f = j.first, s = j.second
  return {
    better: agreed(asOurs(f.better, 'X'), asOurs(s.better, 'Y')),
    criteria: Object.fromEntries(CRITERIA.map(c => [c, agreed(asOurs(f.criteria[c], 'X'), asOurs(s.criteria[c], 'Y'))])) as Record<Criterion, Outcome>,
    /** Whether the two orders picked the same side (a tie in both counts as the same). */
    consistent: asOurs(f.better, 'X') === asOurs(s.better, 'Y'),
    ours: (f.scoreX + s.scoreY) / 2,
    plain: (f.scoreY + s.scoreX) / 2,
    lacksOurs: [...new Set([...f.lacksX, ...s.lacksY])],
    lacksPlain: [...new Set([...f.lacksY, ...s.lacksX])],
    errorsOurs: [...f.errorsX, ...s.errorsY],
    errorsPlain: [...f.errorsY, ...s.errorsX],
    why: [f.why, s.why],
  }
}
export type PairOutcome = ReturnType<typeof outcome>

/**
 * The panel: other providers' models (through Infinitus, on the owner's Cursor plan) judging many pairs in one reply, so
 * one judge's taste doesn't decide the eval. Each pair once, ours on the side its hash picks (`panelSide`), with the
 * judge's rubric and a verdict per pair; the judge's both-orders rule stays the headline.
 */
export type PanelPair = { pair: number; question: string; tank: string | null; x: string; y: string }
export function panelPrompt(pairs: PanelPair[]): string {
  const one = (p: PanelPair) => `## Pair ${p.pair}

The question, as the hobbyist typed it:
"""
${p.question}
"""
${p.tank ? `\nWhat is true about their tank (their app holds it; they didn't type it, and an assistant may or may not have been able to read it):\n${p.tank}\n` : ''}
=== X ===
${p.x}

=== Y ===
${p.y}`
  return `You are an experienced Vietnamese aquarium and planted-tank hobbyist. Below are ${pairs.length} pairs. In each, a Vietnamese hobbyist asked an AI assistant for help and two assistants answered (X and Y). Judge each pair on its own: which answer would help this hobbyist more, as an experienced keeper who knows what actually fixes these problems in tanks in Vietnam.

${RUBRIC}

Reply with one JSON array and nothing else: one object per pair, in order, each {"pair": its number, "criteria": {"correct", "fits", "actionable", "grounded", "local": each "X", "Y" or "tie"}, "better": "X", "Y" or "tie", "scoreX", "scoreY", "lacksX", "lacksY", "errorsX", "errorsY", "why"}.

${pairs.map(one).join('\n\n---\n\n')}
`
}
/** Which side ours is on in the panel's packet, from the pair's own hash: the same every time it's written. */
export const panelSide = (hex: string): 'X' | 'Y' => (parseInt(hex.slice(0, 8), 16) % 2 ? 'X' : 'Y')
/** A panel reply's verdicts by pair: the JSON array, in a code fence or not. A pair without every field is left out. */
export function readPanel(text: string): Map<number, Verdict> {
  const json = text.slice(text.indexOf('['), text.lastIndexOf(']') + 1)
  const out = new Map<number, Verdict>()
  const sides = ['X', 'Y', 'tie']
  for (const v of JSON.parse(json) as (Verdict & { pair: number })[]) {
    const ok = Number.isInteger(v.pair) && sides.includes(v.better) && CRITERIA.every(c => sides.includes(v.criteria?.[c])) &&
      typeof v.scoreX === 'number' && typeof v.scoreY === 'number'
    if (ok) out.set(v.pair, { ...v, lacksX: v.lacksX ?? [], lacksY: v.lacksY ?? [], errorsX: v.errorsX ?? [], errorsY: v.errorsY ?? [], why: v.why ?? '' })
  }
  return out
}
/** One order's verdict, read back to ours and plain. */
export function single(v: Verdict, oursIs: 'X' | 'Y') {
  const plainIs = oursIs === 'X' ? 'Y' : 'X'
  return {
    better: asOurs(v.better, oursIs),
    criteria: Object.fromEntries(CRITERIA.map(c => [c, asOurs(v.criteria[c], oursIs)])) as Record<Criterion, Outcome>,
    ours: v[`score${oursIs}`],
    plain: v[`score${plainIs}`],
  }
}
