import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Llm } from './claude'

/**
 * Guides keep to the subject their title promises. Some videos drift into another subject near the end, and the guide
 * written from one followed it (a lighting-hours guide with sections on pre-filters). Each guide whose text is new or
 * changed, in each language it has (Vietnamese, Indonesian, Thai: AquaTome's own guides are written separately in each),
 * is read by the model (title, then each section's heading and opening); sections about another subject are dropped,
 * with the FAQ questions and summary points only about them. Never more than half of a guide's sections: that guide is
 * only reported.
 */
const TEMPLATE = readFileSync(new URL('./prompts/topic-check.md', import.meta.url), 'utf8')
const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['offTopic'],
  properties: {
    offTopic: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['section', 'reason'], properties: { section: { type: 'integer' }, reason: { type: 'string' } } } },
    faq: { type: 'array', items: { type: 'integer' } },
    summary: { type: 'array', items: { type: 'integer' } },
  },
}
type Verdict = { offTopic: { section: number; reason: string }[]; faq?: number[]; summary?: number[] }
type Guide = { name: string; body: string; summary?: string[]; faq?: { q: string; a: string }[] } & Record<string, unknown>

const LANGS = ['vi', 'id', 'th'] as const
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
const hash = (g: Guide) => createHash('sha1').update(g.body).digest('hex').slice(0, 16)

/** A guide body → the part before the first <h3>, then one part per <h3> section. */
export function splitSections(body: string): { intro: string; sections: { heading: string; html: string }[] } {
  const parts = body.split(/(?=<h3[\s>])/)
  const intro = parts[0]!.startsWith('<h3') ? '' : parts.shift()!
  return { intro, sections: parts.map(html => ({ heading: text(html.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1] ?? ''), html })) }
}

/** The guide without the given sections (1-based), FAQ questions and summary points. */
export function dropParts(g: Guide, v: Verdict): Guide {
  const { intro, sections } = splitSections(g.body)
  const drop = new Set(v.offTopic.map(o => o.section))
  const keepIdx = (list: unknown[] | undefined, gone: number[] = []) => list?.filter((_, i) => !gone.includes(i + 1))
  return {
    ...g,
    body: intro + sections.filter((_, i) => !drop.has(i + 1)).map(s => s.html).join(''),
    ...(g.faq ? { faq: keepIdx(g.faq, v.faq) as Guide['faq'] } : {}),
    ...(g.summary ? { summary: keepIdx(g.summary, v.summary) as string[] } : {}),
  }
}

export async function topicCheck(root: string, llm: Llm, opts: { limit: number; only?: string[] }) {
  const stateFile = join(root, 'engine-state', '_topic-check.json')
  const state: Record<string, string> = JSON.parse(await readFile(stateFile, 'utf8').catch(() => '{}'))
  const ids = (await readdir(join(root, 'content', 'guides')).catch(() => [] as string[])).filter(id => !opts.only || opts.only.includes(id)).sort()
  const report = { checked: [] as string[], trimmed: [] as { id: string; dropped: string[] }[], held: [] as string[], failed: [] as string[] }
  // One state entry per guide and language: the Vietnamese under the guide's id, the others as `<id>:<lang>`.
  const files = ids.flatMap(id => LANGS.map(lang => ({ id, key: lang === 'vi' ? id : `${id}:${lang}`, file: join(root, 'content', 'guides', id, `${lang}.json`) })))
  for (const { key: id, file } of files) {
    if (report.checked.length + report.failed.length >= opts.limit) break
    const g = JSON.parse(await readFile(file, 'utf8').catch(() => 'null')) as Guide | null
    if (!g?.body || state[id]?.endsWith(hash(g))) continue
    const { sections } = splitSections(g.body)
    if (sections.length < 2) { state[id] = hash(g); continue }
    const input = [
      `TITLE: ${g.name}`, '',
      ...sections.map((s, i) => `${i + 1}. ${s.heading}\n${text(s.html.replace(/<h3[^>]*>[\s\S]*?<\/h3>/, '')).slice(0, 400)}`), '',
      'FAQ:', ...(g.faq ?? []).map((f, i) => `${i + 1}. ${f.q}`), '',
      'SUMMARY:', ...(g.summary ?? []).map((s, i) => `${i + 1}. ${s}`),
    ].join('\n')
    let v: Verdict
    try { v = await llm<Verdict>({ system: 'Reply only with JSON.', prompt: `${TEMPLATE}\n\n---\n\n${input}`, schema: SCHEMA }) } catch { report.failed.push(id); continue }
    const off = (v.offTopic ?? []).filter(o => Number.isInteger(o.section) && o.section >= 1 && o.section <= sections.length && !/^bắt đầu từ đâu$/i.test(sections[o.section - 1]!.heading))
    report.checked.push(id)
    if (off.length && off.length * 2 > sections.length) { // too much to drop by itself: reported for a person, not asked again
      report.held.push(`${id}: ${off.length} of ${sections.length} sections flagged`)
      state[id] = `held:${hash(g)}`
      continue
    }
    if (off.length) {
      const next = dropParts(g, { ...v, offTopic: off })
      await writeFile(file, `${JSON.stringify(next, null, 2)}\n`)
      report.trimmed.push({ id, dropped: off.map(o => `${sections[o.section - 1]!.heading} (${o.reason})`) })
      state[id] = hash(next)
    } else state[id] = hash(g)
    await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`)
  }
  await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`)
  return report
}
