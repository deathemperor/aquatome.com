import type { Block, Inline, PageDoc } from '@aq/schema/app-page'
import type { Tool } from '../agent/tools'
import { figuresOf, sectionsOf, type Handbook, type Item } from './handbook'
import { search, searchTopics } from './search'

/**
 * The chat agent's tools (the loop: ../agent/loop.ts): search the handbook, read a page (its outline, or one section),
 * read the reader's saved tanks. Each says what the reader may be shown while it runs (`Step`,
 * protocols/chat.openapi.json). What they return is what Claude may answer from: the handbook's own words and figures.
 *
 * Plain TypeScript, no Cloudflare types: the eval script runs the same tools in Node.
 */
export type Page = { kind: PageDoc['kind']; title: string; url: string }
export type Step = { kind: 'search'; query: string } | { kind: 'read'; page: Page } | { kind: 'tanks' }

/** A saved tank, as the chat tells Claude about it: its name, size and fish (`id`: the fish's page, when it has one). */
export type Tank = { name: string; litres?: number; dims?: { l: number; w: number; h: number }; fish: { name: string; id?: string; count: number }[] }
export type ToolDeps = {
  handbook: Handbook
  /** The reader's synced tanks; null when they can't be read now. */
  tanks: () => Promise<Tank[] | null>
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
const listed = (i: Item) => ({ path: i.path, kind: i.kind, name: i.name, ...(i.id ? { id: i.id } : {}), ...(i.sub ? { sub: i.sub } : {}), ...(i.of ? { of: i.of } : {}) })
const strict = (properties: Record<string, unknown>) => ({ type: 'object' as const, properties, required: Object.keys(properties), additionalProperties: false })

export function chatTools(d: ToolDeps): Tool<Step>[] {
  const pageStep = (path: unknown): Step | undefined => {
    const item = d.handbook.byPath(String(path))
    return item && item.kind !== 'tool' ? { kind: 'read', page: { kind: item.kind, title: item.name, url: item.path } } : undefined
  }
  return [
    {
      name: 'search_handbook',
      description: 'Search the handbook\'s pages by name: fish, shrimp and snails (kind fish), plants, guides, glossary terms, videos, equipment kinds and tools. A fish or plant is found by its Vietnamese, other or scientific name; a guide by words of its title, or of one of its section headings or FAQ questions, when `section` says which (open the guide at that heading id with read_page; null: read its outline). Give kind to search one kind, or null for all. Returns up to 12 pages as JSON: path (open it with read_page), kind, name, id (a fish\'s or plant\'s, for a card), sub (scientific name), of (a breed: the species it is a form of), section.',
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
          path, kind: item.kind, title: doc.title,
          ...(item.id ? { id: item.id } : {}), ...(item.sub ? { sub: item.sub } : {}), ...(item.aka?.length ? { aka: item.aka } : {}),
          ...shown,
          sections: sections.map(s => ({ heading: s.heading?.text ?? null, id: s.heading?.id ?? null, text: cut(textOf(s.blocks), PREVIEW_CHARS) })),
        })
      },
    },
    {
      name: 'read_tanks',
      description: 'Read the reader\'s saved tanks ("Bể của tôi"): each one\'s name, size and fish with how many. Use it when the reader talks about their tank or fish they keep.',
      input_schema: strict({}),
      step: () => ({ kind: 'tanks' }),
      run: async () => {
        const tanks = await d.tanks()
        if (!tanks) throw new Error('The reader\'s tanks can\'t be read now.')
        return tanks.length ? JSON.stringify(tanks) : 'The reader has no saved tanks.'
      },
    },
  ]
}
