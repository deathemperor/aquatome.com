import type Anthropic from '@anthropic-ai/sdk'
import { runAgent, type Limits, LIMITS, type Spent, type Stopped } from '../agent/loop'
import { fishIdTools, type Step, type ToolDeps } from './agent-tools'
import { AGENT_SCHEMA, AGENT_SYSTEM, askClaude, clientFor, question, type Lang, type Photo } from './claude'
import { failed, healthyKeys, rotate, type Attempt, type HealthStore, type KeyEntry } from './keys'

/**
 * Fish ID as an agent (FISH_ID_AGENT): Claude names the fish, looks its candidates up in the handbook and compares
 * their reference photos with the reader's before it answers (agent-tools.ts), on the agent loop (../agent/loop.ts).
 *
 * Keys: the first call rotates over the healthy keys as today's single call does (there is no history yet). From the
 * second, the run keeps that key: its thinking blocks belong to it, and keys can be in different organisations. A
 * later call that fails marks its key as the rotation would, and the run falls back to today's single call
 * (askClaude) on the next healthy key when 10 s or more are left; else it is unavailable.
 *
 * No Cloudflare types: the accuracy script runs this in Node.
 */
export const FALLBACK_MIN_MS = 10_000
/** The first call's rotation over the keys, as today's call's (keys.ts). */
const FIRST_BUDGET_MS = 25_000

export type AgentOutcome = {
  calls: number
  tools: number
  photos: number
  steps: Step[]
  spent: Spent
  attempts: Attempt[]
  stopped: Stopped | 'fallback'
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
  onStep?: (step: Step) => void
}

class FirstCall extends Error {
  constructor(readonly reason: 'resting' | 'unavailable' | 'request') { super(`first call: ${reason}`) }
}
const isApiError = (e: unknown) => typeof e === 'object' && e !== null && 'status' in e

export async function identifyWithAgent(o: AgentOptions): Promise<AgentOutcome> {
  const clock = o.clock ?? Date.now
  const ms = o.limits?.ms ?? LIMITS.ms
  const deadline = clock() + ms
  const attempts: Attempt[] = []
  let key: KeyEntry | undefined
  let client: Anthropic | undefined
  const run = await runAgent<Step>({
    send: async (body, { timeoutMs, call }) => {
      if (call === 1) {
        const out = await rotate(o.healthy, o.store, async (k, left) => (await clientFor(k, o.fetch)).messages.create(body, { timeout: Math.min(left, timeoutMs) }), { random: o.random, clock, budgetMs: Math.min(FIRST_BUDGET_MS, deadline - clock()) })
        attempts.push(...out.attempts)
        if (!out.ok) throw new FirstCall(out.reason)
        key = o.healthy.find(k => k.hash === out.hash)!
        client = await clientFor(key, o.fetch)
        return out.value
      }
      const t = clock()
      try {
        const m = await client!.messages.create(body, { timeout: timeoutMs })
        attempts.push({ hash: key!.hash, ms: clock() - t })
        return m
      } catch (e) {
        attempts.push((await failed(key!, e, o.store, clock() - t, clock)).attempt)
        throw e
      }
    },
    model: o.model,
    system: AGENT_SYSTEM,
    tools: fishIdTools({ ...o.tools, lang: o.lang }),
    first: {
      role: 'user',
      content: [
        // The photo first, then the question, as today's call; the cache mark covers the tools, the instructions and the photo.
        { type: 'image', source: { type: 'base64', media_type: o.photo.type, data: o.photo.data }, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: question(o.lang) },
      ],
    },
    schema: AGENT_SCHEMA as unknown as Record<string, unknown>,
    effort: 'low',
    maxTokens: 4096,
    limits: o.limits,
    onStep: o.onStep,
    clock,
  })
  const base = { calls: run.calls, tools: run.tools, photos: run.photos, steps: run.steps, spent: run.spent, attempts }
  if (run.message) return { ...base, ok: true, message: run.message, hash: key!.hash, stopped: run.stopped }
  if (run.error instanceof FirstCall) return { ...base, ok: false, reason: run.error.reason, stopped: 'error' }
  // A bug of ours, not an answer from the API nor the clock.
  if (!isApiError(run.error) && !(run.error instanceof Error && run.error.message === 'out of time')) throw run.error
  const left = deadline - clock()
  const rest = key ? await healthyKeys(o.healthy.filter(k => k.hash !== key!.hash), o.store, clock()) : []
  if (left < FALLBACK_MIN_MS || !rest.length) return { ...base, ok: false, reason: 'unavailable', stopped: 'error' }
  const out = await rotate(rest, o.store, (k, timeoutMs) => askClaude(k, o.photo, { model: o.model, lang: o.lang, timeoutMs, fetch: o.fetch }), { random: o.random, clock, budgetMs: left })
  attempts.push(...out.attempts)
  if (!out.ok) return { ...base, ok: false, reason: out.reason, stopped: 'fallback' }
  const u = out.value.usage
  const spent = { ...run.spent, input: run.spent.input + u.input_tokens, output: run.spent.output + u.output_tokens }
  return { ...base, calls: run.calls + 1, spent, ok: true, message: out.value, hash: out.hash, stopped: 'fallback' }
}
