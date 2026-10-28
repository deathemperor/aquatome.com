import { readFileSync } from 'node:fs'
import { SECTION_ORDER, type SourceId } from '@aq/schema'
import { z } from 'zod'
import type { Llm } from './claude'
import { sanitizeHtml } from './sanitize'

const Range = z.object({ min: z.number(), max: z.number() })
const PLACEMENT = ['foreground', 'midground', 'background', 'epiphyte', 'floating'] as const
const GUIDE_KINDS = ['setup', 'care', 'breeding', 'disease', 'aquascaping', 'plantCare', 'discovery'] as const

const base = {
  kind: z.enum(['species', 'plant', 'guide', 'skip']),
  scientificName: z.string().min(3).optional(),
  enCommonNames: z.array(z.string()).default([]),
  viName: z.string().default(''),
  viAltNames: z.array(z.string()).default([]),
  group: z.string().optional(),
  lNumber: z.string().optional(),
  places: z.array(z.object({ continent: z.string(), country: z.string().optional(), region: z.string().optional() })).default([]),
  dataCard: z.object({ tempC: Range, ph: Range, gh: Range, sizeCm: z.number(), tankCm: z.number(), difficulty: z.number().int().min(1).max(8) }).partial().default({}),
  plant: z.object({ difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]), light: z.enum(['low', 'medium', 'high']), co2: z.enum(['none', 'optional', 'required']), growth: z.enum(['slow', 'medium', 'fast']), placement: z.array(z.enum(PLACEMENT)) }).optional(),
  guide: z.object({ kind: z.enum(GUIDE_KINDS), viTitle: z.string(), viBody: z.string() }).optional(),
  productSlots: z.array(z.object({ category: z.string(), keywords: z.array(z.string()) })).default([]),
}
/** Lenient parser (section keys filtered afterwards). */
export const ProcessedPageSchema = z.object({ ...base, sections: z.array(z.object({ key: z.string(), en: z.string(), vi: z.string() })).default([]) })
export type ProcessedPage = Omit<z.infer<typeof ProcessedPageSchema>, 'sections'> & { sections: { key: (typeof SECTION_ORDER)[number]; en: string; vi: string }[] }

/** Strict schema sent to Claude so its structured output is constrained. */
const { $schema: _draft, ...llmSchema } = z.toJSONSchema(z.object({ ...base, sections: z.array(z.object({ key: z.enum(SECTION_ORDER), en: z.string(), vi: z.string() })) }), { io: 'input', target: 'draft-07' })
export const LLM_SCHEMA = llmSchema

/** Plausible bounds per field; anything outside (e.g. °F given as °C) is dropped rather than published. */
const BOUNDS = { tempC: [4, 40], ph: [2, 10.5], gh: [0, 50], sizeCm: [0.3, 300], tankCm: [10, 1000], difficulty: [1, 8] } as const
function saneCard(card: z.infer<typeof ProcessedPageSchema>['dataCard']) {
  const out: typeof card = {}
  for (const [k, v] of Object.entries(card) as [keyof typeof BOUNDS, number | { min: number; max: number }][]) {
    const [lo, hi] = BOUNDS[k]
    const value = typeof v === 'number' ? v : { min: Math.min(v.min, v.max), max: Math.max(v.min, v.max) }
    const ok = typeof value === 'number' ? value >= lo && value <= hi : value.min >= lo && value.max <= hi
    if (ok) (out as Record<string, unknown>)[k] = value
  }
  return out
}

const SYSTEM = 'You are a meticulous aquarium-science editor and English→Vietnamese translator. Reply only with the requested JSON.'
const TEMPLATE = readFileSync(new URL('./prompts/process.md', import.meta.url), 'utf8')
const KEYS = new Set<string>(SECTION_ORDER)

export async function processPage(llm: Llm, input: { source: SourceId; url: string; title: string; outline: string; glossary: string[]; notes?: string[] }): Promise<ProcessedPage> {
  const notes = input.notes?.length ? `\n\nA reviewer found problems in your previous translation of this page. Fix them:\n${input.notes.map(n => `- ${n}`).join('\n')}` : ''
  const prompt = `${TEMPLATE.replace('{{GLOSSARY}}', input.glossary.join(', ') || '(none yet)')}${notes}\n\nSource: ${input.source}\nURL: ${input.url}\nTitle: ${input.title}\n\n--- PAGE ---\n${input.outline.slice(0, 60_000)}`
  let parsed: z.infer<typeof ProcessedPageSchema> | undefined
  let lastError: unknown
  for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
    const r = ProcessedPageSchema.safeParse(await llm({ system: SYSTEM, prompt, schema: LLM_SCHEMA }))
    if (r.success) parsed = r.data
    else lastError = r.error
  }
  if (!parsed) throw new Error(`invalid processed page for ${input.url}: ${String(lastError).slice(0, 300)}`)
  if (parsed.kind === 'species' && !parsed.scientificName) return { ...parsed, kind: 'skip', sections: [] }
  return {
    ...parsed,
    dataCard: saneCard(parsed.dataCard),
    sections: parsed.sections.filter((s): s is ProcessedPage['sections'][number] => KEYS.has(s.key)).map(s => ({ ...s, en: sanitizeHtml(s.en), vi: sanitizeHtml(s.vi) })),
    guide: parsed.guide && { ...parsed.guide, viBody: sanitizeHtml(parsed.guide.viBody) },
  }
}
