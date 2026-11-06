import type Anthropic from '@anthropic-ai/sdk'

/**
 * What each identification said and did, kept a year for the owner's evals and checks (the owner's decision,
 * 2026-11-06): in the private UPLOADS bucket, fish-id-runs/<YYYY-MM-DD>/<id>.json, one object a run that reached Claude.
 *
 * Text only. Never the reader's photo (a kept photo names its run in its own metadata, fishid/kept.ts), the IP, a
 * cookie, an account id or a key. What Claude thought (its summarised thinking), wrote and asked of the tools, what the
 * tools answered (cut short), the reference photos it was shown (the handbook's addresses), what was sent back to it,
 * and the answer the reader got. Deleted 365 days on by the daily cron (`sweepRuns`): the bucket's lifecycle rule
 * covers fish-id/ only.
 */
export const RUN_DAYS = 365
const PREFIX = 'fish-id-runs/'
/** A tool's answer, Claude's thinking and its text, past these lengths, are cut (the run's size stays a few kB). */
export const RESULT_MAX = 1500
export const THINKING_MAX = 4000
const TEXT_MAX = 4000

export type ToolCall = { name: string; input: unknown; result?: string; photos?: string[]; error?: true }
/** One call to Claude: its thinking, its text and the tools it asked for, with their answers; `sent`: what was sent back. */
export type Turn = { thinking?: string; text?: string; tools?: ToolCall[]; sent?: string }
export type RunGuess = { scientificName: string; commonName: string; confidence: number; reason: string; page?: string }
export type RunRecord = {
  v: 1
  id: string
  at: string
  lang: string
  /** Where the photo came from: the tool's page, the tank editor, or '' unknown. */
  from: string
  model: string
  /** As the log's (fishid/log.ts): 'ok', 'refused', 'unreadable', 'request', 'unavailable', 'resting'. */
  outcome: string
  ms: number
  cost: number
  tokens: { input: number; output: number }
  /** The agent's run; none for today's single call. */
  agent?: { calls: number; tools: number; photos: number; stopped: string; rechecked?: true }
  verdict?: string
  results?: RunGuess[]
  turns: Turn[]
}

const cut = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n)}… (${s.length - n} more characters)`)
const textOf = (content: Anthropic.ToolResultBlockParam['content']) => typeof content === 'string' ? content
  : (content ?? []).flatMap(b => (b.type === 'text' ? [b.text] : [])).join('\n')
const photosOf = (content: Anthropic.ToolResultBlockParam['content']) => typeof content === 'string' ? []
  : (content ?? []).flatMap(b => (b.type === 'image' && b.source.type === 'url' ? [b.source.url] : []))

/** A message from Claude as a turn: its thinking, its text, and the tools it asked for (their answers come after). */
function turnOf(content: readonly (Anthropic.ContentBlock | Anthropic.ContentBlockParam)[]): Turn {
  const t: Turn = {}
  const thinking = content.flatMap(b => (b.type === 'thinking' && b.thinking ? [b.thinking] : [])).join('\n\n')
  const text = content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('')
  const tools = content.flatMap(b => (b.type === 'tool_use' ? [{ id: b.id, name: b.name, input: b.input }] : []))
  if (thinking) t.thinking = cut(thinking, THINKING_MAX)
  if (text) t.text = cut(text, TEXT_MAX)
  if (tools.length) t.tools = tools as (ToolCall & { id: string })[]
  return t
}

/**
 * The run's turns from the agent's history (the first message, with the reader's photo, left out) and the last answer
 * (the agent's, or today's single call's), in order.
 */
export function turnsOf(history: readonly Anthropic.MessageParam[], last?: Anthropic.Message): Turn[] {
  const turns: Turn[] = []
  for (let i = 1; i < history.length; i++) {
    const m = history[i]!
    if (m.role === 'assistant') {
      turns.push(turnOf(typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content))
      continue
    }
    const t = turns.at(-1)
    if (!t || typeof m.content === 'string') continue
    const byId = new Map((t.tools as (ToolCall & { id: string })[] | undefined)?.map(c => [c.id, c]))
    const sent: string[] = []
    for (const b of m.content) {
      if (b.type === 'tool_result') {
        const call = byId.get(b.tool_use_id)
        if (!call) continue
        call.result = cut(textOf(b.content), RESULT_MAX)
        const photos = photosOf(b.content)
        if (photos.length) call.photos = photos
        if (b.is_error) call.error = true
      } else if (b.type === 'text') sent.push(b.text)
    }
    if (sent.length) t.sent = cut(sent.join('\n\n'), TEXT_MAX)
  }
  // An answer sent back for a second look and then kept (the loop's held answer) is in the history already: once.
  if (last && !history.some(m => m.role === 'assistant' && m.content === last.content)) turns.push(turnOf(last.content))
  // The tool_use ids were only for matching.
  for (const t of turns) for (const c of t.tools ?? []) delete (c as Partial<ToolCall & { id: string }>).id
  return turns
}

const key = (r: Pick<RunRecord, 'at' | 'id'>) => `${PREFIX}${r.at.slice(0, 10)}/${r.id}.json`

/** Keeps a run, with what the dashboard lists without reading it (its metadata). */
export async function saveRun(bucket: R2Bucket, r: RunRecord): Promise<void> {
  const top = r.results?.[0]
  await bucket.put(key(r), JSON.stringify(r), {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: { at: r.at, outcome: r.outcome, lang: r.lang, top: (top?.scientificName ?? '').slice(0, 100), conf: String(top?.confidence ?? ''), calls: String(r.agent?.calls ?? 1), stopped: r.agent?.stopped ?? '', ...(r.agent?.rechecked ? { rechecked: '1' } : {}) },
  })
}

export type RunRow = { day: string; id: string; at: string; outcome: string; lang: string; top: string; conf: number | null; calls: number; stopped: string; rechecked: boolean }
const DAY = /^\d{4}-\d{2}-\d{2}$/
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** A day's runs (UTC), newest first. */
export async function listRuns(bucket: R2Bucket, day: string): Promise<RunRow[]> {
  if (!DAY.test(day)) return []
  const rows: RunRow[] = []
  let cursor: string | undefined
  do {
    const page = await bucket.list({ prefix: `${PREFIX}${day}/`, cursor, include: ['customMetadata'] })
    for (const o of page.objects) {
      const m = o.customMetadata ?? {}
      const id = o.key.slice(PREFIX.length + day.length + 1).replace(/\.json$/, '')
      rows.push({ day, id, at: m.at ?? o.uploaded.toISOString(), outcome: m.outcome ?? '', lang: m.lang ?? '', top: m.top ?? '', conf: m.conf ? Number(m.conf) : null, calls: Number(m.calls ?? 0), stopped: m.stopped ?? '', rechecked: m.rechecked === '1' })
    }
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)
  return rows.sort((a, b) => b.at.localeCompare(a.at))
}

/** One run, or null (none, or a day or id that isn't one). */
export async function readRun(bucket: R2Bucket, day: string, id: string): Promise<RunRecord | null> {
  if (!DAY.test(day) || !ID.test(id)) return null
  const o = await bucket.get(`${PREFIX}${day}/${id}.json`)
  return o ? (await o.json<RunRecord>()) : null
}

/** The daily cron: every day's runs RUN_DAYS old or more (a missed cron's too), so none outlives its year. How many deleted. */
export async function sweepRuns(bucket: R2Bucket, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - RUN_DAYS * 86_400_000).toISOString().slice(0, 10)
  const days: string[] = []
  let cursor: string | undefined
  do {
    const page = await bucket.list({ prefix: PREFIX, delimiter: '/', cursor })
    for (const p of page.delimitedPrefixes) {
      const day = p.slice(PREFIX.length, -1)
      if (DAY.test(day) && day <= cutoff) days.push(day)
    }
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)
  let n = 0
  // Each list starts afresh: the keys before it are gone.
  for (const day of days) {
    for (;;) {
      const keys = (await bucket.list({ prefix: `${PREFIX}${day}/` })).objects.map(o => o.key)
      if (!keys.length) break
      await bucket.delete(keys)
      n += keys.length
    }
  }
  return n
}
