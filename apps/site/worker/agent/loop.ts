import type Anthropic from '@anthropic-ai/sdk'
import { definition, type Tool } from './tools'

/**
 * The agent loop: Claude calls tools until it answers, within hard limits, and the answer is the only way out (a JSON
 * schema, `output_config.format`). A loop of our own over `messages.create`, not the SDK's tool runner (beta in SDK
 * 1.3.0, and this is a production path): the limits, the forced last turn and the steps all sit here.
 *
 * - The history is append-only: the first message, then each answer as it came (thinking blocks untouched) and the tool
 *   results for it, in one user message.
 * - The last call is forced with `tool_choice: none` (the tools still defined): Claude must answer. Forced choice (`any`,
 *   `tool`) is a 400 on Opus 5.5, so `none` is the only way to make it finish. A call is the last when it is the
 *   `calls`th, when the tool calls are used up, when less than `lastCallMs` is left, or when the next call would take
 *   the run's input past `inputTokens`. The next call's size is a guess: the last call's input, its output (the answer
 *   goes back into the history, thinking and all) and the new tool results (`tokensOf`). `inputTokens` is a trigger,
 *   not a hard cap: the forced call itself still runs.
 * - Past the tool calls, a `tool_use` gets a "limit reached" `is_error` result; a tool that throws, or one Claude names
 *   that doesn't exist, gets an `is_error` result with a short message. Both count as tool calls.
 * - No call runs past `ms` from the first: each call's timeout is what is left (at most `callMs`).
 * - `cache_control` on the newest tool result, so the next call reads the photo and the turns before from cache (the
 *   caller marks the first message's photo). The API takes 4 marks at most: a run of more calls stops marking once the
 *   history holds 4, so no limits can make a call the API refuses.
 *
 * It knows nothing of keys or fish: `send` makes the call (the caller picks the key), and the tools come from the caller.
 * Plain TypeScript, no Cloudflare types: the accuracy script runs the same loop in Node.
 */
export type Limits = { calls: number; tools: number; photos: number; inputTokens: number; ms: number; lastCallMs: number; callMs: number }
export const LIMITS: Limits = { calls: 4, tools: 6, photos: 6, inputTokens: 40_000, ms: 27_000, lastCallMs: 12_000, callMs: 20_000 }

/** Why the run ended: Claude answered when it chose to, or a limit forced the last call; `error`: a call failed. */
export type Stopped = 'answer' | 'calls' | 'tools' | 'time' | 'tokens' | 'error'
/** Tokens over every call: input not cached, read from cache, written to cache, and output. */
export type Spent = { input: number; cacheRead: number; cacheWrite: number; output: number }
export type AgentRun<Step> = {
  /** The last answer (the schema's JSON, a refusal, or text cut short), unless a call failed. */
  message?: Anthropic.Message
  /** A call that threw, as it threw. */
  error?: unknown
  stopped: Stopped
  /** Calls to Claude made (a failed one too), tool calls made, reference photos returned. */
  calls: number
  tools: number
  photos: number
  spent: Spent
  steps: Step[]
}
export type AgentInput<Step> = {
  send: (body: Anthropic.MessageCreateParamsNonStreaming, opts: { timeoutMs: number; call: number }) => Promise<Anthropic.Message>
  model: string
  system: string
  tools: Tool<Step>[]
  first: Anthropic.MessageParam
  schema: Record<string, unknown>
  effort: 'low' | 'medium' | 'high'
  maxTokens: number
  limits?: Partial<Limits>
  onStep?: (step: Step) => void
  clock?: () => number
}

/** The input a call read, cached or not; and a run's, over its calls (what `inputTokens` limits). */
export const promptOf = (u: Anthropic.Usage) => u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
export const inputOf = (s: Spent) => s.input + s.cacheRead + s.cacheWrite
/** The API's most cache marks in one request. */
export const MAX_MARKS = 4
/** About what a tool result adds to the next call's input: 4 characters a token, and a small reference photo's ~400. */
export const tokensOf = (results: Anthropic.ToolResultBlockParam[]) => results.reduce((n, r) => n + (typeof r.content === 'string' ? Math.ceil(r.content.length / 4)
  : (r.content ?? []).reduce((m, b) => m + (b.type === 'text' ? Math.ceil(b.text.length / 4) : b.type === 'image' ? 400 : 0), 0)), 0)
const marksIn = (m: Anthropic.MessageParam) => (typeof m.content === 'string' ? 0 : m.content.filter(b => 'cache_control' in b && b.cache_control).length)
const LIMIT_REACHED = 'Limit reached: no more tool calls in this identification. Answer with what you have.'

export async function runAgent<Step>(a: AgentInput<Step>): Promise<AgentRun<Step>> {
  const lim = { ...LIMITS, ...a.limits }
  const clock = a.clock ?? Date.now
  const deadline = clock() + lim.ms
  const byName = new Map(a.tools.map(t => [t.name, t]))
  const tools = a.tools.map(definition)
  const history: Anthropic.MessageParam[] = [a.first]
  const run: AgentRun<Step> = { stopped: 'answer', calls: 0, tools: 0, photos: 0, spent: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 }, steps: [] }
  /** The next call's input, as guessed after the last one (0 before the first). */
  let next = 0
  let marks = marksIn(a.first)
  for (;;) {
    const left = deadline - clock()
    const forced: Stopped | undefined = run.calls + 1 >= lim.calls ? 'calls' : run.tools >= lim.tools ? 'tools' : left < lim.lastCallMs ? 'time'
      : inputOf(run.spent) + next > lim.inputTokens ? 'tokens' : undefined
    if (left < 1000) return { ...run, stopped: 'error', error: new Error('out of time') }
    run.calls++
    let r: Anthropic.Message
    try {
      r = await a.send({
        model: a.model,
        max_tokens: a.maxTokens,
        system: a.system,
        tools,
        tool_choice: forced ? { type: 'none' } : { type: 'auto' },
        output_config: { effort: a.effort, format: { type: 'json_schema', schema: a.schema } },
        messages: [...history],
      }, { timeoutMs: Math.min(left, lim.callMs), call: run.calls })
    } catch (e) {
      return { ...run, stopped: 'error', error: e }
    }
    run.spent.input += r.usage.input_tokens
    run.spent.cacheRead += r.usage.cache_read_input_tokens ?? 0
    run.spent.cacheWrite += r.usage.cache_creation_input_tokens ?? 0
    run.spent.output += r.usage.output_tokens
    // An answer, a refusal, or anything that isn't a request for tools ends the run; so does the forced call, whatever it says.
    if (r.stop_reason !== 'tool_use' || forced || !r.content.some(b => b.type === 'tool_use')) return { ...run, message: r, stopped: forced ?? 'answer' }

    const results: Anthropic.ToolResultBlockParam[] = []
    for (const use of r.content) {
      if (use.type !== 'tool_use') continue
      if (run.tools >= lim.tools) { results.push({ type: 'tool_result', tool_use_id: use.id, content: LIMIT_REACHED, is_error: true }); continue }
      run.tools++
      const tool = byName.get(use.name)
      const input = (use.input ?? {}) as Record<string, unknown>
      if (!tool) { results.push({ type: 'tool_result', tool_use_id: use.id, content: `No tool named ${use.name}.`, is_error: true }); continue }
      const step = tool.step?.(input)
      if (step !== undefined) { run.steps.push(step); a.onStep?.(step) }
      try {
        const out = await tool.run(input, { photosLeft: lim.photos - run.photos })
        // A tool that returns more photos than are left loses the extra ones: the limit holds whatever the tool does.
        let room = lim.photos - run.photos
        const content = typeof out === 'string' ? out : out.filter(b => b.type !== 'image' || room-- > 0)
        if (typeof content !== 'string') run.photos += content.filter(b => b.type === 'image').length
        results.push({ type: 'tool_result', tool_use_id: use.id, content })
      } catch (e) {
        results.push({ type: 'tool_result', tool_use_id: use.id, content: String((e as Error)?.message ?? e).slice(0, 200), is_error: true })
      }
    }
    next = promptOf(r.usage) + r.usage.output_tokens + tokensOf(results)
    if (marks < MAX_MARKS) { results[results.length - 1]!.cache_control = { type: 'ephemeral' }; marks++ }
    history.push({ role: 'assistant', content: r.content as Anthropic.ContentBlockParam[] }, { role: 'user', content: results })
  }
}
