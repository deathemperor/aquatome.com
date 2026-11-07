import type Anthropic from '@anthropic-ai/sdk'
import type { PageDoc } from '@aq/schema/app-page'
import { figuresOf, isBreed, sectionsOf, type Facts, type Handbook, type Item, type Lang, type PlantFacts } from './handbook'

/**
 * Claude's answer and the blocks the Worker fills from it (protocols/chat.openapi.json). Claude writes the text and
 * picks what to show: a species by its id, a page's section by its path and heading id, a tool with its inputs. Every
 * figure, name, photo and page block in a block comes from the handbook (handbook.ts), never from Claude's words. A
 * pick the handbook doesn't have (an unknown id, path or heading, a tool with nothing to fill it) is dropped, with its
 * reason for the log; the text and the other blocks still go to the reader.
 */
export const TOOLS = ['tank-mates', 'tank-volume', 'tank-budget'] as const
export type ToolName = (typeof TOOLS)[number]
export const BLOCKS = ['species', 'compare', 'section', 'tool'] as const
/** The most blocks a turn shows, page blocks a section shows, fish a tank-mates link holds, and suggestions. */
export const MAX_BLOCKS = 5
export const MAX_FISH = 6
export const MAX_SUGGESTIONS = 3

const nullable = (s: Record<string, unknown>) => ({ anyOf: [s, { type: 'null' }] })
/** The answer's schema (output_config.format): what structured outputs take, every object closed and every field required. */
export const ANSWER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['text', 'covered', 'blocks', 'suggestions'],
  properties: {
    text: { type: 'string', description: 'Two or three sentences in the reader\'s language, plain text: the answer, pointing to the blocks below for the figures.' },
    covered: { type: 'boolean', description: 'false when the handbook doesn\'t answer the question: say so in the text, and show the nearest page.' },
    blocks: {
      type: 'array',
      description: 'What to show under the text, in order, at most 5. Each block fills only its own fields; the others are empty or null.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['t', 'ids', 'path', 'heading', 'tool', 'fish', 'tank'],
        properties: {
          t: { type: 'string', enum: [...BLOCKS], description: 'species: one fish\'s or plant\'s card (ids: its id). compare: two to four side by side (ids). section: one section of a page (path, heading). tool: a tool filled from the conversation (tool, fish, tank).' },
          ids: { type: 'array', items: { type: 'string' }, description: 'species, compare: fish or plant ids, as search_handbook and read_page give them.' },
          path: nullable({ type: 'string', description: 'section: the page\'s path.' }),
          heading: nullable({ type: 'string', description: 'section: the heading id from read_page\'s outline, or null for the page\'s opening.' }),
          tool: nullable({ type: 'string', enum: [...TOOLS] }),
          fish: {
            type: 'array',
            description: 'tool tank-mates: the fish to check together and how many of each.',
            items: { type: 'object', additionalProperties: false, required: ['id', 'count'], properties: { id: { type: 'string' }, count: { type: 'integer' } } },
          },
          tank: nullable({
            type: 'object',
            additionalProperties: false,
            required: ['l', 'w', 'h'],
            description: 'tool: the tank\'s length, width and height in cm, when the reader gave them or their saved tank has them.',
            properties: { l: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } },
          }),
        },
      },
    },
    suggestions: { type: 'array', items: { type: 'string' }, description: 'Up to three next questions the reader may ask, in their language, short.' },
  },
} as const

export type Choice = { t: (typeof BLOCKS)[number]; ids: string[]; path: string | null; heading: string | null; tool: ToolName | null; fish: { id: string; count: number }[]; tank: { l: number; w: number; h: number } | null }
export type Answer = { text: string; covered: boolean; blocks: Choice[]; suggestions: string[] }

/** Shorter than this, an answer's text is none: the eval saw "" and "x" from a last call a limit forced. */
export const MIN_TEXT = 10

/** The answer in Claude's message: its JSON (the schema's), or undefined for a refusal, one cut short, or one with no text. */
export function readAnswer(m: Anthropic.Message): Answer | undefined {
  if (m.stop_reason === 'refusal' || m.stop_reason === 'max_tokens') return undefined
  const text = m.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('')
  try {
    const a = JSON.parse(text) as Answer
    return typeof a.text === 'string' && a.text.trim().length >= MIN_TEXT && typeof a.covered === 'boolean' && Array.isArray(a.blocks) && Array.isArray(a.suggestions) ? a : undefined
  } catch {
    return undefined
  }
}

/** The contract's blocks (protocols/chat.openapi.json `Block`). */
export type Linked = { id: string; kind: 'species' | 'breed' | 'plant'; name: string; sci?: string; url?: string; img?: string }
export type Card = { page: Linked } & ({ facts: Facts } | { plant: PlantFacts })
export type ChatBlock =
  | ({ t: 'species' } & Card)
  | { t: 'compare'; items: Card[] }
  | { t: 'section'; page: { kind: PageDoc['kind']; title: string; url: string }; heading?: { text: string; id: string }; blocks: PageDoc['blocks'] }
  | { t: 'tool'; tool: ToolName; name: string; url: string }

/** Each tool's page in each language, as the app opens it (AppScreen) and the index lists it. */
export const TOOL_PATHS: Record<ToolName, Record<Lang, string>> = {
  'tank-mates': { vi: '/vi/cong-cu/nuoi-chung/', id: '/id/alat/kecocokan-ikan/', th: '/th/tools/tank-mates/' },
  'tank-volume': { vi: '/vi/cong-cu/the-tich-be/', id: '/id/alat/volume-akuarium/', th: '/th/tools/tank-volume/' },
  'tank-budget': { vi: '/vi/cong-cu/du-toan-be/', id: '/id/alat/anggaran-akuarium/', th: '/th/tools/tank-budget/' },
}

const slugOf = (path: string) => path.split('/').filter(Boolean).at(-1) ?? ''
const sized = (t: Choice['tank']) => (t && t.l > 0 && t.w > 0 && t.h > 0 ? t : undefined)
const r1 = (n: number) => String(Math.round(n * 10) / 10)

export async function fill(answer: Answer, hb: Handbook): Promise<{ blocks: ChatBlock[]; dropped: string[] }> {
  const dropped: string[] = []
  const card = (id: string): Card | undefined => {
    const i = hb.byId(id)
    if (!i || (i.kind !== 'fish' && i.kind !== 'plant')) return undefined
    return {
      page: { id, kind: i.kind === 'plant' ? 'plant' : isBreed(i) ? 'breed' : 'species', name: i.name, ...(i.sub ? { sci: i.sub } : {}), url: i.path, ...(i.img ? { img: i.img } : {}) },
      ...figuresOf(i, hb.byId),
    }
  }
  const one = async (p: Choice): Promise<ChatBlock | string> => {
    switch (p.t) {
      case 'species': {
        const c = p.ids[0] !== undefined ? card(p.ids[0]) : undefined
        return c ? { t: 'species', ...c } : `species: no fish or plant ${JSON.stringify(p.ids[0] ?? null)}`
      }
      case 'compare': {
        const cards = [...new Set(p.ids)].flatMap(id => card(id) ?? []).slice(0, 4)
        return cards.length >= 2 ? { t: 'compare', items: cards } : `compare: ${cards.length} of ${JSON.stringify(p.ids)} found`
      }
      case 'section': {
        const doc = p.path ? await hb.page(p.path) : undefined
        if (!doc || !p.path) return `section: no page ${JSON.stringify(p.path)}`
        const s = sectionsOf(doc).find(x => (p.heading ? x.heading?.id === p.heading : !x.heading))
        const blocks = s?.blocks ?? []
        if (!blocks.length) return `section: nothing under ${JSON.stringify(p.heading)} on ${p.path}`
        return { t: 'section', page: { kind: doc.kind, title: doc.title, url: p.path }, ...(s!.heading?.id ? { heading: { text: s!.heading.text, id: s!.heading.id } } : {}), blocks }
      }
      case 'tool': {
        const page = p.tool ? hb.byPath(TOOL_PATHS[p.tool][hb.lang]) : undefined
        if (!p.tool || !page) return `tool: no ${JSON.stringify(p.tool)} in ${hb.lang}`
        const tank = sized(p.tank)
        const q = new URLSearchParams()
        if (p.tool === 'tank-mates') {
          // The tool's own link (its page's ?ca=slug:n), each fish as the species it is a form of, once, at most six.
          const fish = new Map<string, number>()
          for (const f of p.fish) {
            const i = hb.byId(f.id)
            const s = i?.of ? hb.byId(i.of) : i
            if (s?.kind === 'fish' && fish.size < MAX_FISH && !fish.has(slugOf(s.path))) fish.set(slugOf(s.path), Math.min(200, Math.max(1, Math.round(f.count))))
          }
          if (!fish.size) return `tool: tank-mates with none of ${JSON.stringify(p.fish.map(f => f.id))}`
          const ca = [...fish].map(([slug, n]) => `${slug}:${n}`).join(',')
          if (tank) for (const k of ['l', 'w', 'h'] as const) q.set(k, r1(tank[k]))
          return { t: 'tool', tool: p.tool, name: page.short ?? page.name, url: `${page.path}?ca=${ca}${q.size ? `&${q}` : ''}` }
        }
        if (tank) {
          q.set(p.tool === 'tank-volume' ? 'hinh' : 'co', p.tool === 'tank-volume' ? 'chu-nhat' : 'khac')
          for (const k of ['l', 'w', 'h'] as const) q.set(k, r1(tank[k]))
        }
        return { t: 'tool', tool: p.tool, name: page.short ?? page.name, url: `${page.path}${q.size ? `?${q}` : ''}` }
      }
    }
  }
  const blocks: ChatBlock[] = []
  for (const p of answer.blocks.slice(0, MAX_BLOCKS)) {
    const b = await one(p)
    if (typeof b === 'string') dropped.push(b)
    else blocks.push(b)
  }
  if (answer.blocks.length > MAX_BLOCKS) dropped.push(`${answer.blocks.length - MAX_BLOCKS} blocks past ${MAX_BLOCKS}`)
  return { blocks, dropped }
}
