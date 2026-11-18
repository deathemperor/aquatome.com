import type Anthropic from '@anthropic-ai/sdk'
import type { PageDoc } from '@aq/schema/app-page'
import { figuresOf, isBreed, sectionsOf, type Facts, type Handbook, type Item, type Lang, type PlantFacts } from './handbook'
import type { TankCheck } from '../../src/scripts/tank-check'
import { addedOf, drawnOf, summed, type MatesCheck, type Mine } from './mates'
import type { Clash } from './clashes'

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
const PLACE = { type: 'object', additionalProperties: false, required: ['path', 'passage'], properties: { path: { type: 'string' }, passage: { type: 'string' } } } as const
/**
 * The answer's schema (output_config.format): what structured outputs take, every object closed and every field required.
 * `offTopic`, then `text`, stay first: structured outputs write the keys in the schema's order, the reader sees the text
 * as it is written (`textReader`), and an off-topic answer's text never streams (the Worker sends its own line).
 */
export const ANSWER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['offTopic', 'text', 'covered', 'blocks', 'suggestions', 'clashes'],
  properties: {
    offTopic: { type: 'boolean', description: 'true when the question isn\'t about keeping fish, shrimp, snails or plants, their tanks, ponds, water or gear: then the text is one short line and nothing else.' },
    text: { type: 'string', description: 'In the reader\'s language, plain text, no markdown. A problem: the likely cause in a sentence or two, the steps in order one per line, each with its figure ("1. "), then what to watch, and last the readings that would decide the cause when the reader hasn\'t given them. A quick question: two or three sentences, with the figures and the method when it asks for them. Never refer to the blocks or to earlier answers. Figures from a page read first, common hobby figures from your own knowledge, never a dose no page gives.' },
    covered: { type: 'boolean', description: 'false when the handbook doesn\'t answer the question: say so in the text, and show the nearest page.' },
    blocks: {
      type: 'array',
      description: 'What to show under the text, in order, at most 5. Each block fills only its own fields; the others are empty or null.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['t', 'ids', 'path', 'heading', 'tool', 'fish', 'tank', 'tankId'],
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
          tankId: nullable({ type: 'string', description: 'tool tank-mates: the reader\'s saved tank checked (its id from read_tanks); fish are then only the ones added.' }),
        },
      },
    },
    suggestions: { type: 'array', items: { type: 'string' }, description: 'Up to three next questions the reader may ask, in their language, short.' },
    clashes: {
      type: 'array',
      description: 'Almost always empty. Only where what you read disagrees: the two places, each a page\'s path and its passage word for word as read_page gave it. The reader never sees this.',
      items: { type: 'object', additionalProperties: false, required: ['a', 'b'], properties: { a: PLACE, b: PLACE } },
    },
  },
} as const

/**
 * The answer as a tool's input (16 Nov). After a round of tools, Opus and Sonnet hold a text answer back until it's
 * whole: 7.5 s of nothing, then all of it within 10 ms, with the format or without it (probes 3, 5 and 6, 15 Nov). They
 * stream a tool's input as it's written, the format on (probe 8, 16 Nov: Opus's first words 5.4 s into the call,
 * Sonnet's 1.1 s). Its input is the schema's, read by the same readers as text, keys in the schema's order (offTopic,
 * then text, in every probe). Haiku answers in text, which it streams, and that stays an answer too.
 */
export const SEND_ANSWER = 'send_answer'
export const answerTool = {
  name: SEND_ANSWER,
  description: 'Send the reader your answer. Call it once, when you have read what you need: what you pass is your answer, in the answer\'s form, and the reader sees its text as you write it.',
  input_schema: ANSWER_SCHEMA as unknown as Anthropic.Tool.InputSchema,
  answers: true as const,
  run: async (): Promise<string> => { throw new Error('send_answer is the answer: nothing runs it') },
}

/**
 * Which block of a message is its answer: the first that answers, a text block of the answer's JSON or a send_answer call.
 * Words before a tool call ("Now I'll send the answer.") aren't one. The stream shows that block (`answerFeed`) and the
 * run reads it (`answered`), so the reader reads what is kept.
 */
const json = (text: string) => text.trimStart().startsWith('{')
const answers = (b: Anthropic.ContentBlock) => (b.type === 'text' && json(b.text)) || (b.type === 'tool_use' && b.name === SEND_ANSWER)

/** A text block that is a whole JSON object: an answer, not words that only begin like one ("{"blocks":…). */
const whole = (text: string) => {
  try {
    const v: unknown = JSON.parse(text)
    return !!v && typeof v === 'object' && !Array.isArray(v)
  } catch {
    return false
  }
}

/**
 * A message as one answer: one that answered through send_answer, as one that answered in text, its input as the JSON
 * text, and the words and reading tools beside it dropped; one that answered in text, with other words beside it
 * dropped, and its tools too once it is whole, whether or not any of it was shown (a call that doesn't stream, as the
 * next key's after a stream that failed, shows nothing: Codex, 17 Nov). One cut short keeps its stop reason, and
 * `readAnswer` then reads no answer from it. send_answer's input isn't held to the schema: an `offTopic` that isn't true
 * or false is no answer, never one on topic.
 */
export function answered(m: Anthropic.Message): Anthropic.Message {
  // Words that only begin like an answer don't hide send_answer's after them (Codex, 18 Nov): its answer is the answer.
  const sent = m.content.some(b => b.type === 'tool_use' && b.name === SEND_ANSWER)
  const first = m.content.find(b => answers(b) && !(sent && b.type === 'text' && !whole(b.text)))
  if (!first) return m
  const ended = m.stop_reason === 'tool_use' ? 'end_turn' : m.stop_reason
  if (first.type === 'text') {
    const answer = whole(first.text)
    const drop = (b: Anthropic.ContentBlock) => b !== first && (b.type === 'text' || (answer && b.type === 'tool_use'))
    return m.content.some(drop) ? { ...m, content: m.content.filter(b => !drop(b)), ...(answer ? { stop_reason: ended } : {}) } : m
  }
  if (first.type !== 'tool_use') return m
  const flag = (first.input as { offTopic?: unknown } | null)?.offTopic
  return { ...m, content: [{ type: 'text', text: typeof flag === 'boolean' ? JSON.stringify(first.input) : '', citations: null }], stop_reason: ended }
}

/**
 * What of a streamed call goes to the reader, event by event: the pieces of its answer as they're written, a text
 * block's or send_answer's input, from the first block that answers (as `answered` reads it); undefined for the rest.
 */
export function answerFeed(): (e: Anthropic.MessageStreamEvent) => string | undefined {
  const calls = new Set<number>()
  /** A text block's words so far, until its first character says whether it is the answer's JSON. */
  const held = new Map<number, string>()
  const words = new Set<number>()
  let fed: number | undefined
  return e => {
    if (e.type === 'content_block_start' && e.content_block.type === 'tool_use' && e.content_block.name === SEND_ANSWER) calls.add(e.index)
    if (e.type !== 'content_block_delta') return undefined
    if (fed !== undefined) return fed === e.index ? (e.delta.type === 'text_delta' ? e.delta.text : e.delta.type === 'input_json_delta' ? e.delta.partial_json : undefined) || undefined : undefined
    if (e.delta.type === 'input_json_delta' && calls.has(e.index) && e.delta.partial_json.trim() !== '') { fed = e.index; return e.delta.partial_json }
    if (e.delta.type !== 'text_delta' || words.has(e.index)) return undefined
    const text = (held.get(e.index) ?? '') + e.delta.text
    if (text.trim() === '') { held.set(e.index, text); return undefined }
    held.delete(e.index)
    if (!json(text)) { words.add(e.index); return undefined }
    fed = e.index
    return text
  }
}

export type Choice = { t: (typeof BLOCKS)[number]; ids: string[]; path: string | null; heading: string | null; tool: ToolName | null; fish: { id: string; count: number }[]; tank: { l: number; w: number; h: number } | null; tankId: string | null }
export type Answer = { offTopic: boolean; text: string; covered: boolean; blocks: Choice[]; suggestions: string[]; clashes: Clash[] }

/**
 * What an off-topic question gets, in the reader's language, whatever Claude wrote: one friendly line back to what the
 * chat helps with, so no reply to a question about football (or a trick to get one) ever reaches the reader.
 */
export const OFF_TOPIC: Record<Lang, string> = {
  vi: 'Mình chỉ giúp được chuyện nuôi cá thôi: cá, tép, ốc, cây thủy sinh, bể, hồ, nước và thiết bị. Có gì về bể cá thì bạn cứ hỏi nhé!',
  id: 'Aku hanya bisa membantu soal memelihara ikan: ikan, udang, siput, tanaman air, akuarium, kolam, air, dan peralatannya. Tanyakan soal akuariummu, ya!',
  th: 'เราช่วยได้เฉพาะเรื่องการเลี้ยงปลา ทั้งปลา กุ้ง หอย ไม้น้ำ ตู้ บ่อ น้ำ และอุปกรณ์ ลองถามเรื่องตู้ของคุณได้เลยนะ',
  ms: 'Saya hanya boleh membantu tentang penjagaan ikan: ikan, udang, siput, tumbuhan akuatik, tangki, kolam, air dan peralatannya. Tanyalah tentang tangki anda, ya!',
}

/** Shorter than this, an answer's text is none: the eval saw "" and "x" from a last call a limit forced. */
export const MIN_TEXT = 10

/** The answer in Claude's message: its JSON (the schema's), or undefined for a refusal, one cut short, or one with no text. */
export function readAnswer(m: Anthropic.Message): Answer | undefined {
  if (m.stop_reason === 'refusal' || m.stop_reason === 'max_tokens') return undefined
  const text = m.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('')
  try {
    const a = JSON.parse(text) as Answer
    if (a.offTopic === true) return { offTopic: true, text: '', covered: true, blocks: [], suggestions: [], clashes: [] }
    // send_answer's input isn't held to the schema as a text answer is (not strict): a suggestion that isn't words, or a
    // clash that isn't two places, is left out, and a pick that isn't one is the filler's to drop (`choiceOf`).
    return typeof a.text === 'string' && a.text.trim().length >= MIN_TEXT && typeof a.covered === 'boolean' && Array.isArray(a.blocks) && Array.isArray(a.suggestions)
      ? { ...a, offTopic: false, suggestions: a.suggestions.filter(x => typeof x === 'string'), clashes: Array.isArray(a.clashes) ? a.clashes.filter(isClash) : [] }
      : undefined
  } catch {
    return undefined
  }
}

const str = (v: unknown): v is string => typeof v === 'string'
const strOrNull = (v: unknown) => v === null || typeof v === 'string'
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v)
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const isPlace = (v: unknown) => obj(v) && str(v.path) && str(v.passage)
const isClash = (v: unknown): v is Clash => obj(v) && isPlace(v.a) && isPlace(v.b)
/**
 * A pick as the filler reads it, or undefined for one it can't: send_answer's input, unlike a text answer's, isn't held to
 * the schema. A field left out is its empty value (no ids, no fish, null); one of the wrong kind drops the pick.
 */
export function choiceOf(v: unknown): Choice | undefined {
  if (!obj(v) || !(BLOCKS as readonly unknown[]).includes(v.t)) return undefined
  const c = { ids: [], path: null, heading: null, tool: null, fish: [], tank: null, tankId: null, ...v } as Record<string, unknown>
  const ok = Array.isArray(c.ids) && c.ids.every(str) && strOrNull(c.path) && strOrNull(c.heading) && (c.tool === null || (TOOLS as readonly unknown[]).includes(c.tool))
    && Array.isArray(c.fish) && c.fish.every(f => obj(f) && str(f.id) && num(f.count))
    && (c.tank === null || (obj(c.tank) && num(c.tank.l) && num(c.tank.w) && num(c.tank.h))) && strOrNull(c.tankId)
  return ok ? (c as Choice) : undefined
}

/**
 * Whether the answer's raw JSON, as written, names a top-level key twice. JSON.parse keeps the last, where the stream
 * showed the first (`textReader`), so such an answer is none (Codex, 17 Nov). Keys are read as JSON reads them.
 */
export function repeatsKey(raw: string): boolean {
  const seen = new Set<string>()
  let depth = 0
  let quoted = false
  let escaped = false
  let wantKey = false
  let keyAt = -1
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]!
    if (quoted) {
      if (escaped) escaped = false
      else if (c === '\\') escaped = true
      else if (c === '"') {
        quoted = false
        if (keyAt >= 0) {
          let key: string
          try { key = JSON.parse(raw.slice(keyAt, i + 1)) as string } catch { key = raw.slice(keyAt, i + 1) }
          if (seen.has(key)) return true
          seen.add(key)
          keyAt = -1
          wantKey = false
        }
      }
    } else if (c === '"') {
      quoted = true
      if (depth === 1 && wantKey) keyAt = i
    } else if (c === '{' || c === '[') {
      depth++
      if (depth === 1) wantKey = true
    } else if (c === '}' || c === ']') depth--
    else if (c === ',' && depth === 1) wantKey = true
  }
  return false
}

const SPACE = new Set([' ', '\t', '\n', '\r'])
/**
 * What comes before the text's first character: each of these in turn, with JSON's whitespace before each. Only an answer
 * that has said it is on topic streams: an off-topic one never does, whatever the order of its keys.
 */
const HEAD = ['{', '"offTopic"', ':', 'false', ',', '"text"', ':', '"']
const ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', '"': '"', '\\': '\\', '/': '/' }

/**
 * The answer's text as Claude writes it, for one call: fed the call's raw text as it comes, it gives back what each part
 * adds to the top-level `text` string, decoded ('' for nothing yet). An escape or a surrogate pair cut between parts
 * waits for the rest, so no piece holds half of one; joined, the pieces are the string JSON.parse reads. A call whose
 * JSON doesn't open with `offTopic` false then `text` (an off-topic answer, or not JSON: words before a tool call) gives
 * nothing, and nothing after the string's closing quote is read.
 */
export function textReader(): (part: string) => string {
  let raw = ''
  let at = 0
  /** How far into HEAD: its item, and the characters of it matched. */
  let item = 0
  let got = 0
  let off = false
  let closed = false
  let text = ''
  let sent = 0
  return part => {
    if (off || closed) return ''
    raw += part
    while (item < HEAD.length) {
      const c = raw[at]
      if (c === undefined) return ''
      at++
      if (got === 0 && SPACE.has(c)) continue
      if (c !== HEAD[item]![got]) { off = true; return '' }
      if (++got === HEAD[item]!.length) { item++; got = 0 }
    }
    while (at < raw.length) {
      const c = raw[at]!
      if (c === '"') { closed = true; break }
      if (c !== '\\') { text += c; at++; continue }
      const e = raw[at + 1]
      if (e === undefined) break
      if (e !== 'u') { text += ESCAPES[e] ?? e; at += 2; continue }
      if (at + 6 > raw.length) break
      text += String.fromCharCode(parseInt(raw.slice(at + 2, at + 6), 16))
      at += 6
    }
    // A high surrogate waits for its low half, written or escaped, unless the string ends on it.
    const last = text.charCodeAt(text.length - 1)
    const end = !closed && last >= 0xd800 && last <= 0xdbff ? text.length - 1 : text.length
    const piece = text.slice(sent, end)
    sent = end
    return piece
  }
}

/**
 * The blocks Claude picks, for one call, as it writes them: fed the call's raw text as it comes (all of it, from the
 * first part), it gives back each pick of the top-level `blocks` array whose object has just closed, parsed, in order.
 * Nothing once the array closes. It doesn't check the answer is on topic: the caller reads picks only from a call
 * whose text it streamed (textReader).
 */
export function picksReader(): (part: string) => Choice[] {
  let raw = ''
  let at = 0
  let depth = 0
  let quoted = false
  let escaped = false
  /** At the top level: a key comes next; where the key's string began; the last key read. */
  let wantKey = false
  let keyAt = -1
  let key = ''
  /** Where the pick being written began. */
  let pickAt = -1
  let over = false
  return part => {
    const picks: Choice[] = []
    if (over) return picks
    raw += part
    for (; at < raw.length && !over; at++) {
      const c = raw[at]!
      if (quoted) {
        if (escaped) escaped = false
        else if (c === '\\') escaped = true
        else if (c === '"') {
          quoted = false
          // The key as written: the schema's keys have no escapes, and words before a tool call may not be JSON at all.
          if (keyAt >= 0) { key = raw.slice(keyAt + 1, at); keyAt = -1; wantKey = false }
        }
      } else if (c === '"') {
        quoted = true
        if (depth === 1 && wantKey) keyAt = at
      } else if (c === '{' || c === '[') {
        depth++
        if (depth === 1) wantKey = true
        else if (depth === 3 && c === '{' && key === 'blocks') pickAt = at
      } else if (c === '}' || c === ']') {
        if (depth === 3 && pickAt >= 0) {
          try { picks.push(JSON.parse(raw.slice(pickAt, at + 1)) as Choice) } catch { /* not a pick: the answer's own check drops it */ }
          pickAt = -1
        }
        if (depth === 2 && key === 'blocks') over = true
        depth--
      } else if (c === ',' && depth === 1) wantKey = true
    }
    return picks
  }
}

/** The contract's blocks (protocols/chat.openapi.json `Block`). */
export type Linked = { id: string; kind: 'species' | 'breed' | 'plant'; name: string; sci?: string; url?: string; img?: string }
export type Card = { page: Linked } & ({ facts: Facts } | { plant: PlantFacts })
export type ChatBlock =
  | ({ t: 'species' } & Card)
  | { t: 'compare'; items: Card[] }
  | { t: 'section'; page: { kind: PageDoc['kind']; title: string; url: string }; heading?: { text: string; id: string }; blocks: PageDoc['blocks'] }
  | { t: 'tool'; tool: ToolName; name: string; url?: string; check?: TankCheck; tank?: Mine }

/** Each tool's page in each language, as the app opens it (AppScreen) and the index lists it. */
export const TOOL_PATHS: Record<ToolName, Record<Lang, string>> = {
  'tank-mates': { vi: '/vi/cong-cu/nuoi-chung/', id: '/id/alat/kecocokan-ikan/', th: '/th/tools/tank-mates/', ms: '/ms/alat/rakan-setangki/' },
  'tank-volume': { vi: '/vi/cong-cu/the-tich-be/', id: '/id/alat/volume-akuarium/', th: '/th/tools/tank-volume/', ms: '/ms/alat/isi-padu-tangki/' },
  'tank-budget': { vi: '/vi/cong-cu/du-toan-be/', id: '/id/alat/anggaran-akuarium/', th: '/th/tools/tank-budget/', ms: '/ms/alat/bajet-tangki/' },
}

const slugOf = (path: string) => path.split('/').filter(Boolean).at(-1) ?? ''

/**
 * The fish of a tank-mates tool, as its link names them and its check (mates.ts) reads them: each fish as the species
 * it is a form of, once, at most six, how many of it from 1 to 200, its breeds' counts added up (16 Nov: 1 ranchu and
 * 1 pearlscale were checked as one goldfish).
 */
export function matesOf(fish: readonly { id: string; count: number }[], hb: Handbook): { item: Item; count: number }[] {
  const out = new Map<string, { item: Item; count: number }>()
  for (const f of fish) {
    const s = speciesOf(f.id, hb)
    if (!s) continue
    const n = Math.max(1, Math.round(f.count))
    const was = out.get(slugOf(s.path))
    if (was) was.count = Math.min(200, was.count + n)
    else if (out.size < MAX_FISH) out.set(slugOf(s.path), { item: s, count: Math.min(200, n) })
  }
  return [...out.values()]
}

/** The fish an id is (a breed: its species), or undefined for an id that isn't a fish. */
function speciesOf(id: string, hb: Handbook): Item | undefined {
  const i = hb.byId(id)
  const s = i?.of ? hb.byId(i.of) : i
  return s?.kind === 'fish' ? s : undefined
}

/** What a block shows that the reader needn't see twice in a conversation: a species card, a page's section (a comparison
 * and a tool, which change with what they hold, may come again). */
const repeatKey = (b: ChatBlock): string[] =>
  b.t === 'species' ? [`species: ${b.page.id}`] : b.t === 'section' ? [`section: ${b.page.url}${b.heading ? `#${b.heading.id}` : ''}`] : []

/** The ids among these that aren't fish (a plant, a typo): a tank-mates check or block that names one checks the rest only. */
export const notFish = (fish: readonly { id: string }[], hb: Handbook) => fish.map(f => f.id).filter(id => !speciesOf(id, hb))

/** Fish as a tank-mates link names them, in one key: "ca-betta:1,ca-neon-xanh:10", sorted (a check's, a block's). */
export const matesKey = (fish: readonly { path: string; count: number }[]) => fish.map(f => `${slugOf(f.path)}:${f.count}`).sort().join(',')
const sized = (t: Choice['tank']) => (t && t.l > 0 && t.w > 0 && t.h > 0 ? t : undefined)
const r1 = (n: number) => String(Math.round(n * 10) / 10)

/**
 * `checks`: the run's check_tank_mates answers (mates.ts). A tank-mates block of two fish or more goes out only with the
 * check Claude read for the same fish, counts and tank, and carries it as the app's tank check draws it: what the
 * answer said is what the block shows.
 * `shownBefore`: the blocks of the conversation's earlier turns. A species card or a page's section shown already (or
 * twice in this answer) isn't shown again: the reader has it above, and a chat from a fish's page would carry its card
 * under nearly every answer.
 * `startedOn`: the fish or plant whose page the chat was opened from (`from: 'species'`). The reader has just left its
 * card, so it counts as shown (from fish ID or search they haven't seen the page, and there is none).
 *
 * One pick at a time, so each block can go out as soon as Claude has picked it: `add` each pick in order, one after the
 * other (awaited), and it gives the pick's block, or nothing when the pick is dropped; `done` gives every block and what
 * was dropped. A pick's block depends only on the picks before it, so the blocks given one by one are the start of
 * `done`'s.
 */
/** A fish's, breed's or plant's page, as fish ID links one (the contract's `Linked`). */
export const linkedOf = (id: string, i: Item) => ({ id, kind: i.kind === 'plant' ? 'plant' as const : isBreed(i) ? 'breed' as const : 'species' as const, name: i.name, ...(i.sub ? { sci: i.sub } : {}), url: i.path, ...(i.img ? { img: i.img } : {}) })

export function filler(hb: Handbook, checks: readonly MatesCheck[] = [], shownBefore: readonly ChatBlock[] = [], startedOn?: string) {
  const dropped: string[] = []
  const card = (id: string): Card | undefined => {
    const i = hb.byId(id)
    if (!i || (i.kind !== 'fish' && i.kind !== 'plant')) return undefined
    return {
      page: linkedOf(id, i),
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
          const fish = matesOf(p.fish, hb)
          if (!fish.length && !p.tankId) return `tool: tank-mates with none of ${JSON.stringify(p.fish.map(f => f.id))}`
          // An id that isn't a fish would leave the rest, perhaps one fish, which goes out unchecked: not shown.
          const odd = notFish(p.fish, hb)
          if (odd.length) return `tool: tank-mates with ${JSON.stringify(odd)}, not fish`
          const key = matesKey(fish.map(f => ({ path: f.item.path, count: f.count })))
          if (p.tankId) {
            // The reader's tank, as Claude checked it with these fish added: the link names every kind (the tool's
            // page reads six; past that, none: a link would open a check of other fish), and the tank's id opens its page.
            const added = matesKey(summed(addedOf(p.fish), hb))
            const mine = checks.find(c => c.tankId === p.tankId && matesKey(c.fish) === added)
            if (!mine?.mine) return `tool: tank-mates in tank ${p.tankId} adding ${added || 'nothing'} not checked`
            const sides = mine.mine.dims ? `&${new URLSearchParams((['l', 'w', 'h'] as const).map(k => [k, r1(mine.mine!.dims![k])]))}` : ''
            const link = mine.kinds?.length && mine.kinds.length <= MAX_FISH ? `${page.path}?ca=${mine.kinds.map(k => `${slugOf(k.path)}:${k.count}`).join(',')}${sides}` : undefined
            return { t: 'tool', tool: p.tool, name: page.short ?? page.name, ...(link ? { url: link } : {}), check: drawnOf(mine), tank: mine.mine }
          }
          const size = (t: { l: number; w: number; h: number } | null | undefined) => (t ? [t.l, t.w, t.h].map(r1).join('×') : '')
          const check = fish.length >= 2 ? checks.find(c => !c.tankId && matesKey(c.fish) === key && size(c.tank) === size(tank)) : undefined
          if (fish.length >= 2 && !check?.verdict) return `tool: tank-mates ${key}${tank ? ` in ${size(tank)}` : ''} not checked`
          const ca = fish.map(f => `${slugOf(f.item.path)}:${f.count}`).join(',')
          if (tank) for (const k of ['l', 'w', 'h'] as const) q.set(k, r1(tank[k]))
          // A fish the tool's page doesn't list (a breed with no species) it would leave out: no link to a check of fewer.
          const listed = fish.every(f => !isBreed(f.item))
          return { t: 'tool', tool: p.tool, name: page.short ?? page.name, ...(listed ? { url: `${page.path}?ca=${ca}${q.size ? `&${q}` : ''}` } : {}), ...(check ? { check: drawnOf(check) } : {}) }
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
  const seen = new Set([...shownBefore.flatMap(repeatKey), ...(startedOn ? [`species: ${startedOn}`] : [])])
  let picks = 0
  return {
    add: async (pick: Choice): Promise<ChatBlock | undefined> => {
      if (picks++ >= MAX_BLOCKS) return undefined
      const p = choiceOf(pick)
      if (!p) { dropped.push(`not a pick: ${JSON.stringify(pick).slice(0, 120)}`); return undefined }
      const b = await one(p)
      const again = typeof b === 'string' ? [] : repeatKey(b).filter(k => seen.has(k))
      if (typeof b === 'string') dropped.push(b)
      else if (again.length) dropped.push(`${again[0]} shown before`)
      else {
        blocks.push(b)
        repeatKey(b).forEach(k => seen.add(k))
        return b
      }
      return undefined
    },
    done: (): { blocks: ChatBlock[]; dropped: string[] } => ({ blocks, dropped: picks > MAX_BLOCKS ? [...dropped, `${picks - MAX_BLOCKS} blocks past ${MAX_BLOCKS}`] : dropped }),
  }
}

/** The answer's blocks, filled from the handbook (`filler`, every pick at once). */
export async function fill(answer: Answer, hb: Handbook, checks: readonly MatesCheck[] = [], shownBefore: readonly ChatBlock[] = [], startedOn?: string): Promise<{ blocks: ChatBlock[]; dropped: string[] }> {
  const f = filler(hb, checks, shownBefore, startedOn)
  for (const p of answer.blocks) await f.add(p)
  return f.done()
}
