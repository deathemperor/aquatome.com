import type Anthropic from '@anthropic-ai/sdk'
import { runAgent, type Limits, LIMITS, type Spent, type Stopped } from '../agent/loop'
import { fishIdTools, genusMarks, type Step, type ToolDeps } from './agent-tools'
import type { Catalog } from './catalog'
import { AGENT_SCHEMA, AGENT_SYSTEM, askClaude, clientFor, MAX_TOKENS, question, readAnswer, type Lang, type Photo } from './claude'
import { sciKey } from './match'
import { failed, healthyKeys, isApiError, rotate, type Attempt, type HealthStore, type KeyEntry } from './keys'

/**
 * Fish ID as an agent (FISH_ID_AGENT): Claude names the fish, looks its candidates up in the handbook and compares
 * their reference photos with the reader's before it answers (agent-tools.ts), on the agent loop (../agent/loop.ts).
 *
 * Keys: the first call rotates over the healthy keys as today's single call does (there is no history yet). From the
 * second, the run keeps that key: its thinking blocks belong to it, and keys can be in different organisations. A
 * later call that fails marks its key as the rotation would, and the run falls back to today's single call
 * (askClaude) on the next healthy key when 10 s or more are left; else it is unavailable. A later call the API refuses
 * as our request (a 400: a reference photo it couldn't fetch, say) is `later400`, its message for the log; the key is
 * fine, so the fallback may use it too, and with no fallback the run failed (502), not unavailable.
 *
 * `onUsage` hears each call's usage as it lands, so the caller can record the spend before the run ends.
 *
 * No Cloudflare types: the accuracy script runs this in Node.
 */
export const FALLBACK_MIN_MS = 10_000
/**
 * An answer it chose whose top guess is less sure than this is sent back once, with the handbook's species of its
 * guesses' genera (two at most) and their marks: the look-alike it never thought of may be among them. The owner's
 * Betta macrostoma came back as a coccina-group betta or a licorice gourami at 0.3 to 0.45, the handbook's page for it
 * never opened; its marks ("red patch on opercle and dorsal-fin ocellus") are what tell it.
 */
export const RECHECK_BELOW = 0.6

/**
 * What `recheck` sends back, or undefined when the answer stands (sure enough, no fish or plant, no genus the handbook
 * has). A genus already listed in this run (`listed`, shared with the tools) is named, not sent again.
 */
export function recheckOf(catalog: Catalog, m: Anthropic.Message, listed = new Set<string>()): Anthropic.ContentBlockParam[] | undefined {
  let answer
  try { answer = readAnswer(m) } catch { return undefined }
  if (answer.refused || (answer.id.verdict !== 'fish' && answer.id.verdict !== 'plant')) return undefined
  const top = answer.id.guesses[0]
  if (!top || top.confidence >= RECHECK_BELOW) return undefined
  const genera = [...new Set(answer.id.guesses.map(g => sciKey(g.scientificName).genus).filter(Boolean))].slice(0, 2)
  const lists = genera.flatMap(g => {
    const name = `${g[0]!.toUpperCase()}${g.slice(1)}`
    if (listed.has(g)) return [`${name}: listed above, in this identification.`]
    const marks = genusMarks(catalog, g)
    if (!marks) return []
    listed.add(g)
    return [`${name}: ${marks}`]
  })
  if (!lists.length) return undefined
  return [{
    type: 'text',
    text: `Your top guess is only ${top.confidence.toFixed(2)} sure. Before you answer for good, read the marks of every species of these genera in the handbook against the photo (what each one's sources say tells it apart):\n\n${lists.join('\n\n')}\n\nIf one fits the photo better than your guesses, open its page with get_entry if you can, then answer again. If none does, give your answer again.`,
  }]
}
/** The first call's rotation over the keys, as today's call's (keys.ts). */
const FIRST_BUDGET_MS = 25_000

export type AgentOutcome = {
  calls: number
  tools: number
  photos: number
  steps: Step[]
  /** Its first answer, too unsure, was sent back with its genera's marks (`recheckOf`). */
  rechecked?: boolean
  spent: Spent
  attempts: Attempt[]
  stopped: Stopped | 'fallback'
  /** A later call the API refused as our request: its message, cut short. */
  later400?: string
} & ({ ok: true; message: Anthropic.Message; hash: string } | { ok: false; reason: 'resting' | 'unavailable' | 'request' })

export type AgentOptions = {
  healthy: KeyEntry[]
  store: HealthStore
  photo: Photo
  model: string
  lang: Lang
  tools: Omit<ToolDeps, 'lang'>
  fetch?: typeof fetch
  random?: () => number
  clock?: () => number
  limits?: Partial<Limits>
  /** How hard Claude thinks each turn: the Worker's is low. */
  effort?: 'low' | 'medium' | 'high'
  onStep?: (step: Step) => void
  onUsage?: (u: Anthropic.Usage) => void
}

class FirstCall extends Error {
  constructor(readonly reason: 'resting' | 'unavailable' | 'request') { super(`first call: ${reason}`) }
}

export async function identifyWithAgent(o: AgentOptions): Promise<AgentOutcome> {
  const clock = o.clock ?? Date.now
  const ms = o.limits?.ms ?? LIMITS.ms
  const deadline = clock() + ms
  const attempts: Attempt[] = []
  let key: KeyEntry | undefined
  let client: Anthropic | undefined
  let later400: string | undefined
  /** The genera this run has listed, by its tools or its second look: each sent once. */
  const listed = new Set<string>()
  const run = await runAgent<Step>({
    send: async (body, { timeoutMs, call }) => {
      if (call === 1) {
        const out = await rotate(o.healthy, o.store, async (k, left) => (await clientFor(k, o.fetch)).messages.create(body, { timeout: Math.min(left, timeoutMs) }), { random: o.random, clock, budgetMs: Math.min(FIRST_BUDGET_MS, deadline - clock()) })
        attempts.push(...out.attempts)
        if (!out.ok) throw new FirstCall(out.reason)
        key = o.healthy.find(k => k.hash === out.hash)!
        client = await clientFor(key, o.fetch)
        o.onUsage?.(out.value.usage)
        return out.value
      }
      const t = clock()
      try {
        const m = await client!.messages.create(body, { timeout: timeoutMs })
        attempts.push({ hash: key!.hash, ms: clock() - t })
        o.onUsage?.(m.usage)
        return m
      } catch (e) {
        const f = await failed(key!, e, o.store, clock() - t, clock)
        attempts.push(f.attempt)
        if (isApiError(e) && !f.verdict.next) later400 = String((e as Error).message ?? '').slice(0, 160)
        throw e
      }
    },
    model: o.model,
    system: AGENT_SYSTEM,
    tools: fishIdTools({ ...o.tools, lang: o.lang, listed }),
    first: {
      role: 'user',
      content: [
        // The photo first, then the question, as today's call; the cache mark covers the tools, the instructions and the photo.
        { type: 'image', source: { type: 'base64', media_type: o.photo.type, data: o.photo.data }, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: question(o.lang) },
      ],
    },
    schema: AGENT_SCHEMA as unknown as Record<string, unknown>,
    effort: o.effort ?? 'low',
    maxTokens: MAX_TOKENS,
    limits: o.limits,
    onStep: o.onStep,
    recheck: m => recheckOf(o.tools.catalog, m, listed),
    clock,
  })
  const base = { calls: run.calls, tools: run.tools, photos: run.photos, steps: run.steps, spent: run.spent, attempts, ...(run.rechecked ? { rechecked: true } : {}), ...(later400 !== undefined ? { later400 } : {}) }
  if (run.message) return { ...base, ok: true, message: run.message, hash: key!.hash, stopped: run.stopped }
  if (run.error instanceof FirstCall) return { ...base, ok: false, reason: run.error.reason, stopped: 'error' }
  // A bug of ours, not an answer from the API nor the clock.
  if (!isApiError(run.error) && !(run.error instanceof Error && run.error.message === 'out of time')) throw run.error
  const left = deadline - clock()
  // A request error leaves its key unmarked and usable; any other failure moves on to the other keys.
  const rest = key ? await healthyKeys(later400 !== undefined ? o.healthy : o.healthy.filter(k => k.hash !== key!.hash), o.store, clock()) : []
  const none = later400 !== undefined ? 'request' : 'unavailable'
  if (left < FALLBACK_MIN_MS || !rest.length) return { ...base, ok: false, reason: none, stopped: 'error' }
  const out = await rotate(rest, o.store, (k, timeoutMs) => askClaude(k, o.photo, { model: o.model, lang: o.lang, timeoutMs, fetch: o.fetch }), { random: o.random, clock, budgetMs: left })
  attempts.push(...out.attempts)
  if (!out.ok) return { ...base, ok: false, reason: out.reason, stopped: 'fallback' }
  o.onUsage?.(out.value.usage)
  const u = out.value.usage
  const spent = { ...run.spent, input: run.spent.input + u.input_tokens, output: run.spent.output + u.output_tokens }
  return { ...base, calls: run.calls + 1, spent, ok: true, message: out.value, hash: out.hash, stopped: 'fallback' }
}
