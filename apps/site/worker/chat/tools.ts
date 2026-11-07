import type { Block, Inline, PageDoc } from '@aq/schema/app-page'
import type { Tool } from '../agent/tools'
import { notFish } from './answer'
import { figuresOf, sectionsOf, type Handbook, type Item } from './handbook'
import { checkMates, type MatesCheck } from './mates'
import { search, searchTopics } from './search'

/**
 * The chat agent's tools (the loop: ../agent/loop.ts): search the handbook, read a page (its outline, or one section),
 * read the reader's saved tanks, check fish together as the tank-mates tool does. Each says what the reader may be shown while it runs (`Step`: search, read, tanks, mates;
 * protocols/chat.openapi.json). What they return is what Claude may answer from: the handbook's own words and figures.
 *
 * Plain TypeScript, no Cloudflare types: the eval script runs the same tools in Node.
 */
export type Page = { kind: PageDoc['kind']; title: string; url: string }
export type Step = { kind: 'search'; query: string } | { kind: 'read'; page: Page } | { kind: 'tanks' } | { kind: 'mates' }

/** A light on a tank as the chat reads it: the saved schedule last written to it (times of day, ramp in minutes, levels
 * in % in the light's channel order), or the levels last set by hand. */
export type TankLight = { name: string; schedule?: { on: string; off: string; ramp: number; levels: number[] }; manual?: number[] }
/**
 * A saved tank as the chat reads it (api.ts `tanksOf`): its size, its species by id and its entries without a page, and
 * the rest the reader saved: plants, substrate, notes, how many days since it was saved, its lights and what its plugs
 * power (each outlet's role or label).
 */
export type Tank = {
  id: string
  name: string
  litres?: number
  dims?: { l: number; w: number; h: number }
  species: { id: string; count?: number }[]
  unlisted: { name: string; kind: string; sci?: string; count?: number }[]
  plants?: string[]
  substrate?: string
  notes?: string
  days?: number
  lights?: TankLight[]
  power?: string[]
}

/** Notes are the reader's free text: a tank's are cut to this many characters (the run's input tokens are limited). */
export const NOTES_CHARS = 1500
const hm = (t: string) => { const [h, m] = t.split(':').map(Number); return h! * 60 + m! }
/** A light in a line: "WRGB II: 13:00–21:00, 8 h lit, ramp 30 min, levels 80/80/80/80%". */
const lit = (l: TankLight) => {
  if (l.schedule) {
    const mins = hm(l.schedule.off) - hm(l.schedule.on)
    return `${l.name}: ${l.schedule.on}–${l.schedule.off}, ${Math.round(mins / 6) / 10} h lit, ramp ${l.schedule.ramp} min, levels ${l.schedule.levels.join('/')}%`
  }
  return `${l.name}: no saved schedule${l.manual ? `, last set by hand to ${l.manual.join('/')}%` : ''}`
}
/**
 * A tank as Claude reads it: its id, size and fish named as the handbook names them (one without a page by the reader's),
 * then what else the reader saved. The notes are marked as the reader's own words.
 */
const told = (t: Tank, hb: Handbook) => {
  const plants = [...(t.plants ?? []).map(id => hb.byId(id)?.name ?? id), ...t.unlisted.filter(u => u.kind === 'plant').map(u => u.name)]
  return {
    id: t.id,
    name: t.name,
    ...(t.dims ? { dims: t.dims } : {}),
    ...(t.litres ? { litres: t.litres } : {}),
    fish: [
      ...t.species.map(s => ({ name: hb.byId(s.id)?.name ?? s.id, ...(hb.byId(s.id) ? { id: s.id } : {}), count: s.count ?? 1 })),
      ...t.unlisted.filter(u => u.kind !== 'plant').map(u => ({ name: u.name, count: u.count ?? 1 })),
    ],
    ...(plants.length ? { plants } : {}),
    ...(t.substrate ? { substrate: t.substrate } : {}),
    ...(t.days !== undefined ? { savedDaysAgo: t.days } : {}),
    ...(t.lights?.length ? { lights: t.lights.map(lit) } : {}),
    ...(t.power?.length ? { plugsPower: t.power } : {}),
    ...(t.notes ? { readerNotes: cut(t.notes, NOTES_CHARS) } : {}),
  }
}
export type ToolDeps = {
  handbook: Handbook
  /** The reader's synced tanks; null when they can't be read now. */
  tanks: () => Promise<Tank[] | null>
  /** Where check_tank_mates keeps what it answered in this run, for the blocks (answer.ts `fill`). */
  checks?: MatesCheck[]
}

/** About how much of a page Claude reads at once: an outline's line per section, a section's text. */
export const PREVIEW_CHARS = 160
export const SECTION_CHARS = 3000
const KINDS = ['fish', 'plant', 'guide', 'glossary', 'video', 'equipment', 'tool'] as const

const runs = (c: Inline[] = []) => c.map(r => (typeof r === 'string' ? r : r.text)).join('')
/** A page's blocks as plain text, a line each, a photo or other picture as "[photo: its words]". */
export function textOf(blocks: Block[]): string {
  const line = (b: Block): string[] => {
    switch (b.t) {
      case 'p': return [runs(b.c)]
      case 'h': return [`## ${b.text}`]
      case 'list': return b.items.map((it, i) => `${b.ordered ? `${i + 1}.` : '-'} ${it.flatMap(line).join(' ')}`)
      case 'table': return [...(b.head ? [b.head.map(runs).join(' | ')] : []), ...b.rows.map(r => r.map(runs).join(' | '))]
      case 'figure': return [`[photo: ${runs(b.caption) || b.img.alt || ''}]`]
      case 'summary': return [b.title, ...b.items.map(x => `- ${x}`), ...(b.mistakes ? [b.mistakes.title, ...b.mistakes.items.map(x => `- ${x}`)] : [])]
      case 'faq': return [b.title, ...b.items.flatMap(x => [`Q: ${x.q}`, `A: ${x.a}`])]
      case 'moments': return b.items.map(x => `[video at ${x.at}s: ${x.caption}]`)
      case 'climate': return [b.title, ...b.items.map(x => `- ${x.label}: ${x.text}`)]
      case 'mates': return [b.title, ...[b.good, b.avoid].flatMap(g => (g ? [`${g.title}: ${g.items.map(m => m.name).join(', ')}`] : [])), ...(b.note ? [b.note] : [])]
      case 'cards': return [`${b.title}: ${b.items.map(x => x.name).join(', ')}`]
      case 'videos': return [`${b.title}: ${b.items.map(x => x.title).join('; ')}`]
      case 'gallery': return [`[photos: ${b.title}]`]
      default: return []
    }
  }
  return blocks.flatMap(line).filter(Boolean).join('\n')
}

const cut = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1)}…`)
/** A guide written from one video is one keeper's method (the Writing Lead's ruling, 2026-11-07): Claude is told so. */
const oneVideo = (i: Item) => (i.kind === 'guide' && i.video ? { oneVideo: true } : {})
const listed = (i: Item) => ({ path: i.path, kind: i.kind, name: i.name, ...(i.id ? { id: i.id } : {}), ...(i.sub ? { sub: i.sub } : {}), ...(i.of ? { of: i.of } : {}), ...oneVideo(i) })
const strict = (properties: Record<string, unknown>) => ({ type: 'object' as const, properties, required: Object.keys(properties), additionalProperties: false })

export function chatTools(d: ToolDeps): Tool<Step>[] {
  // One read step a page a turn (the tools are made for each turn): its outline and each section opened are one page read.
  const read = new Set<string>()
  const pageStep = (path: unknown): Step | undefined => {
    const item = d.handbook.byPath(String(path))
    if (!item || item.kind === 'tool' || read.has(item.path)) return undefined
    read.add(item.path)
    return { kind: 'read', page: { kind: item.kind, title: item.name, url: item.path } }
  }
  return [
    {
      name: 'search_handbook',
      description: 'Search the handbook\'s pages by name: fish, shrimp and snails (kind fish), plants, guides, glossary terms, videos, equipment kinds and tools. A fish or plant is found by its Vietnamese, other or scientific name; a guide by words of its title, or of one of its section headings or FAQ questions, when `section` says which (open the guide at that heading id with read_page; null: read its outline). Give kind to search one kind, or null for all. Returns up to 12 pages as JSON: path (open it with read_page), kind, name, id (a fish\'s or plant\'s, for a card), sub (scientific name), of (a breed: the species it is a form of), section, oneVideo (a guide written from one keeper\'s video).',
      input_schema: strict({
        query: { type: 'string', description: 'A name, or a few words of a title, in the reader\'s language or the scientific name.' },
        kind: { anyOf: [{ type: 'string', enum: [...KINDS] }, { type: 'null' }], description: 'One kind of page, or null for all.' },
      }),
      step: input => ({ kind: 'search', query: String(input.query) }),
      run: async input => {
        const kind = (input.kind as Item['kind'] | null) ?? null
        const named = search(d.handbook.items, String(input.query), kind)
        // Guides found past their titles come after the best eight names, so a page's own name still comes first; names
        // past the eighth fill what's left. A guide is listed once: by its name among the eight, else by its heading.
        const topics = kind === null || kind === 'guide' ? await d.handbook.topics() : null
        const first = named.slice(0, 8)
        const seen = new Set(first.map(i => i.path))
        const more = (topics ? searchTopics(topics, d.handbook.byPath, String(input.query)).filter(h => !seen.has(h.item.path)) : []).slice(0, 12 - first.length)
        const byTopic = new Set(more.map(h => h.item.path))
        const hits = [...first.map(listed), ...more.map(h => ({ ...listed(h.item), section: { id: h.section, text: h.text } })), ...named.slice(8).filter(i => !byTopic.has(i.path)).map(listed)].slice(0, 12)
        return hits.length ? JSON.stringify(hits) : 'No page by that name. Try other words, the scientific name, or another kind.'
      },
    },
    {
      name: 'read_page',
      description: 'Read one handbook page by its path (from search_handbook or a link in a page). With heading null: its outline, the opening text and each section\'s heading id and first words, and for a fish or plant its figures. With a heading id: that section\'s full text. Answer only from what the pages say.',
      input_schema: strict({
        path: { type: 'string', description: 'The page\'s path, as search_handbook gives it ("/vi/ca/ca-neon-xanh/").' },
        heading: { type: ['string', 'null'], description: 'A section\'s heading id from the outline, or null for the outline.' },
      }),
      step: input => pageStep(input.path),
      run: async input => {
        const path = String(input.path)
        const item = d.handbook.byPath(path)
        if (!item) throw new Error(`No page at ${path}: search_handbook gives the paths.`)
        const doc = await d.handbook.page(path)
        if (!doc) throw new Error(`${path} can't be read now.`)
        const sections = sectionsOf(doc)
        if (input.heading) {
          const s = sections.find(x => x.heading?.id === input.heading)
          if (!s) throw new Error(`No heading ${String(input.heading)} on ${path}: read its outline for the ids.`)
          return cut(`${s.heading!.text}\n${textOf(s.blocks)}`, SECTION_CHARS)
        }
        const figures = item.kind === 'fish' || item.kind === 'plant' ? figuresOf(item, d.handbook.byId) : undefined
        const shown = figures && Object.keys('facts' in figures ? figures.facts : figures.plant).length ? figures : {}
        return JSON.stringify({
          path, kind: item.kind, title: doc.title, ...oneVideo(item),
          ...(item.id ? { id: item.id } : {}), ...(item.sub ? { sub: item.sub } : {}), ...(item.aka?.length ? { aka: item.aka } : {}),
          ...shown,
          sections: sections.map(s => ({ heading: s.heading?.text ?? null, id: s.heading?.id ?? null, text: cut(textOf(s.blocks), PREVIEW_CHARS) })),
        })
      },
    },
    {
      name: 'check_tank_mates',
      description: 'Check fish together as the handbook\'s tank-mates tool does: the same check a tank-mates block shows under your answer. It gives the verdict (answer: level no, care, unsure or yes, its head and reasons), the warnings (who may eat or nip whom, temperaments), and with the tank\'s inside size how full the fish would make it; without a size, the shortest tank they all need. In the reader\'s language. Call it whenever the reader asks whether fish can live together, and before you add a tank-mates block, with the same fish, counts and tank as the block: a block you didn\'t check so isn\'t shown. For the reader\'s own tank, give its tankId (read_tanks) and only the fish they would add (none to check the tank as it is): the tank\'s own fish and size are added for you. Fish only: an id that isn\'t a fish is refused. Open your text with the verdict\'s head word for word, then say why from its reasons; never the opposite. A breed is checked as its species; at most six kinds.',
      input_schema: strict({
        fish: {
          type: 'array',
          description: 'The fish (ids, as search_handbook, read_page and read_tanks give them) and how many of each.',
          items: { type: 'object', additionalProperties: false, required: ['id', 'count'], properties: { id: { type: 'string' }, count: { type: 'integer' } } },
        },
        tank: {
          anyOf: [strict({ l: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } }), { type: 'null' }],
          description: 'The tank\'s inside length, width and height in cm, as the block will have them, or null when it has none (and with a tankId).',
        },
        tankId: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'The reader\'s saved tank (its id from read_tanks) the fish would go in, or null.' },
      }),
      step: () => ({ kind: 'mates' }),
      run: async input => {
        const fish = input.fish as { id: string; count: number }[]
        const odd = notFish(fish, d.handbook)
        if (odd.length) throw new Error(`Not fish: ${odd.join(', ')}. Check fish only, by the ids search_handbook gives.`)
        let mine: Tank | undefined
        if (input.tankId) {
          const tanks = await d.tanks()
          if (!tanks) throw new Error('The reader\'s tanks can\'t be read now.')
          mine = tanks.find(t => t.id === input.tankId)
          if (!mine) throw new Error(`No tank ${String(input.tankId)}: read_tanks gives the reader\'s tanks and their ids.`)
        }
        const r = checkMates(fish, mine ? null : (input.tank as { l: number; w: number; h: number } | null), d.handbook, mine)
        if (r.mine && !r.mine.fish.length && !r.mine.added.length) throw new Error('That tank has no fish, and none were given to add.')
        if (!r.mine && !r.fish.length) throw new Error('None of these ids is a fish: search_handbook gives the ids.')
        d.checks?.push(r)
        return JSON.stringify(r)
      },
    },
    {
      name: 'read_tanks',
      description: 'Read the reader\'s saved tanks ("Bể của tôi"): each one\'s name, size, fish with how many, plants, substrate, how many days since it was saved, its lights\' schedules (hours lit, ramp, levels), what its smart plugs power (CO₂, filter, heater, air, fan, light), and the reader\'s own notes. Use it when the reader talks about their tank or fish they keep.',
      input_schema: strict({}),
      step: () => ({ kind: 'tanks' }),
      run: async () => {
        const tanks = await d.tanks()
        if (!tanks) throw new Error('The reader\'s tanks can\'t be read now.')
        return tanks.length ? JSON.stringify(tanks.map(t => told(t, d.handbook))) : 'The reader has no saved tanks.'
      },
    },
  ]
}
