import type Anthropic from '@anthropic-ai/sdk'
import { expect, test } from 'vitest'
import { runAgent, type AgentInput } from '../agent/loop'
import type { Tool } from '../agent/tools'

type Body = Anthropic.MessageCreateParamsNonStreaming
type Use = { name: string; input: Record<string, unknown> }
const usage = (input = 1000, output = 100, cacheRead = 0, cacheWrite = 0) => ({ input_tokens: input, output_tokens: output, cache_read_input_tokens: cacheRead, cache_creation_input_tokens: cacheWrite }) as Anthropic.Usage
let n = 0
/** Claude asking for tools, with a thinking block before (which must come back untouched). */
const asks = (uses: Use[], u = usage()) => ({
  id: `msg_${++n}`, type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'tool_use', stop_sequence: null, usage: u,
  content: [{ type: 'thinking', thinking: '', signature: `sig-${n}` }, ...uses.map((x, i) => ({ type: 'tool_use', id: `toolu_${n}_${i}`, name: x.name, input: x.input }))],
}) as unknown as Anthropic.Message
const answers = (text = '{"verdict":"fish","guesses":[]}', stop = 'end_turn', u = usage()) => ({
  id: `msg_${++n}`, type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: stop, stop_sequence: null, usage: u,
  content: [{ type: 'text', text }],
}) as unknown as Anthropic.Message

/** A scripted Claude: each call gets the next reply (the last again past the end); every body and timeout it saw. */
function script(replies: ((body: Body) => Anthropic.Message)[], clock?: { now: number; per?: number[] }) {
  const calls: { body: Body; timeoutMs: number }[] = []
  const send: AgentInput<string>['send'] = async (body, { timeoutMs }) => {
    calls.push({ body: structuredClone(body), timeoutMs })
    if (clock?.per) clock.now += clock.per[calls.length - 1] ?? 0
    return replies[Math.min(calls.length, replies.length) - 1]!(body)
  }
  return { send, calls }
}
const ran: Record<string, unknown>[] = []
const echo: Tool<string> = {
  name: 'echo', description: 'Echo.', input_schema: { type: 'object', additionalProperties: false, required: ['q'], properties: { q: { type: 'string' } } },
  step: input => `echo ${input.q}`,
  run: async input => { ran.push(input); return `got ${input.q}` },
}
const pics: Tool<string> = {
  name: 'pics', description: 'Photos.', input_schema: { type: 'object', additionalProperties: false, required: [], properties: {} },
  // Asks for no limit: returns three photos whatever is left, so the loop's own cap is what holds.
  run: async (_, ctx) => [{ type: 'text', text: `left ${ctx.photosLeft}` }, ...[1, 2, 3].map(i => ({ type: 'image' as const, source: { type: 'url' as const, url: `https://media.aquatome.com/${i}.webp` } }))],
}
const broken: Tool<string> = { name: 'broken', description: 'Throws.', input_schema: { type: 'object', additionalProperties: false, required: [], properties: {} }, run: async () => { throw new Error('shard unreadable') } }
const first: Anthropic.MessageParam = { role: 'user', content: [{ type: 'text', text: 'Which fish is this?' }] }
const input = (send: AgentInput<string>['send'], extra: Partial<AgentInput<string>> = {}): AgentInput<string> => ({
  send, model: 'claude-opus-5-5', system: 'sys', tools: [echo, pics, broken], first, schema: { type: 'object' }, effort: 'low', maxTokens: 4096, ...extra,
})
const toolResults = (b: Body) => (b.messages.at(-1)!.content as Anthropic.ToolResultBlockParam[])

test('a run: the tools Claude asks for run with its inputs, the history only grows (thinking kept as it came), the newest tool result is cached, and the answer ends it', async () => {
  ran.length = 0
  const steps: string[] = []
  const c = script([() => asks([{ name: 'echo', input: { q: 'Paracheirodon' } }]), () => asks([{ name: 'echo', input: { q: 'a' } }, { name: 'echo', input: { q: 'b' } }]), () => answers()])
  const r = await runAgent(input(c.send, { onStep: s => steps.push(s) }))
  expect(r).toMatchObject({ stopped: 'answer', calls: 3, tools: 3, photos: 0, steps: ['echo Paracheirodon', 'echo a', 'echo b'], spent: { input: 3000, output: 300 } })
  expect(r.message?.content).toEqual([{ type: 'text', text: '{"verdict":"fish","guesses":[]}' }])
  expect(steps).toEqual(r.steps)
  expect(ran).toEqual([{ q: 'Paracheirodon' }, { q: 'a' }, { q: 'b' }])
  // Every call offers the tools, strict, with Claude free to use them, and asks for the schema.
  for (const { body } of c.calls) {
    expect(body.tool_choice).toEqual({ type: 'auto' })
    expect(body.tools!.map(t => [(t as Anthropic.Tool).name, (t as Anthropic.Tool).strict])).toEqual([['echo', true], ['pics', true], ['broken', true]])
    expect(body.output_config).toEqual({ effort: 'low', format: { type: 'json_schema', schema: { type: 'object' } } })
  }
  // Append-only: each call's messages start with the one before's, unchanged but for cache marks on tool results.
  const [m1, m2, m3] = c.calls.map(x => x.body.messages)
  expect(m1).toEqual([first])
  expect(m2!.slice(0, 1)).toEqual(m1)
  expect(m2![1]).toEqual({ role: 'assistant', content: [{ type: 'thinking', thinking: '', signature: 'sig-1' }, { type: 'tool_use', id: 'toolu_1_0', name: 'echo', input: { q: 'Paracheirodon' } }] })
  expect(m2![2]).toEqual({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1_0', content: 'got Paracheirodon', cache_control: { type: 'ephemeral' } }] })
  expect(m3!.slice(0, 3)).toEqual(m2)
  // Two tool calls in one turn: both results in one message, the newest one cached.
  expect(toolResults(c.calls[2]!.body).map(t => [t.tool_use_id, t.content, t.cache_control ?? null])).toEqual([['toolu_2_0', 'got a', null], ['toolu_2_1', 'got b', { type: 'ephemeral' }]])
})

test('the 4th call is the last: forced to answer with tool_choice none, the tools still there', async () => {
  const c = script([() => asks([{ name: 'echo', input: { q: 'x' } }]), () => asks([{ name: 'echo', input: { q: 'x' } }]), () => asks([{ name: 'echo', input: { q: 'x' } }]), () => answers()])
  const r = await runAgent(input(c.send))
  expect(r).toMatchObject({ stopped: 'calls', calls: 4, tools: 3 })
  expect(c.calls.map(x => x.body.tool_choice!.type)).toEqual(['auto', 'auto', 'auto', 'none'])
  expect(c.calls[3]!.body.tools).toHaveLength(3)
})

test('the forced call ends the run whatever it says: a tool request there is not run', async () => {
  ran.length = 0
  const c = script([() => asks([{ name: 'echo', input: { q: 'x' } }])])
  const r = await runAgent(input(c.send, { limits: { calls: 2 } }))
  expect(r).toMatchObject({ stopped: 'calls', calls: 2, tools: 1 })
  expect(ran).toHaveLength(1)
  expect(r.message?.stop_reason).toBe('tool_use') // the caller reads it as an answer that isn't the schema's
})

test('6 tool calls in all: the 7th gets "limit reached", and the next call is forced', async () => {
  ran.length = 0
  const seven = Array.from({ length: 7 }, (_, i) => ({ name: 'echo', input: { q: String(i) } }))
  const c = script([() => asks(seven), () => answers()])
  const r = await runAgent(input(c.send))
  expect(r).toMatchObject({ stopped: 'tools', calls: 2, tools: 6 })
  expect(ran).toHaveLength(6)
  const results = toolResults(c.calls[1]!.body)
  expect(results).toHaveLength(7)
  expect(results[6]).toMatchObject({ tool_use_id: 'toolu_' + (n - 1) + '_6', is_error: true, content: expect.stringMatching(/^Limit reached/) })
  expect(c.calls[1]!.body.tool_choice).toEqual({ type: 'none' })
})

test('6 reference photos in all: a tool is told how many are left, and any past them are dropped', async () => {
  const c = script([() => asks([{ name: 'pics', input: {} }, { name: 'pics', input: {} }]), () => asks([{ name: 'pics', input: {} }]), () => answers()])
  const r = await runAgent(input(c.send))
  expect(r).toMatchObject({ stopped: 'answer', photos: 6 })
  const shown = (b: Body) => toolResults(b).map(t => [(t.content as { type: string; text?: string }[])[0]!.text, (t.content as { type: string }[]).filter(x => x.type === 'image').length])
  expect(shown(c.calls[1]!.body)).toEqual([['left 6', 3], ['left 3', 3]])
  expect(shown(c.calls[2]!.body)).toEqual([['left 0', 0]])
})

test('40,000 input tokens: when another call the size of the last would pass them, that call is the last (cache reads and writes count)', async () => {
  const c = script([() => asks([{ name: 'echo', input: { q: 'x' } }], usage(2000, 100, 10_000, 9_000)), () => answers()])
  const r = await runAgent(input(c.send))
  expect(r).toMatchObject({ stopped: 'tokens', calls: 2, spent: { input: 3000, cacheRead: 10_000, cacheWrite: 9_000, output: 200 } })
  expect(c.calls.map(x => x.body.tool_choice!.type)).toEqual(['auto', 'none'])
})

test('27 s from the first call: no call gets past it, and with under 12 s left the next call is the last', async () => {
  const clock = { now: 0, per: [10_000, 5_000] }
  const c = script([() => asks([{ name: 'echo', input: { q: 'x' } }]), () => answers()], clock)
  const r = await runAgent(input(c.send, { clock: () => clock.now }))
  expect(c.calls.map(x => x.timeoutMs)).toEqual([20_000, 17_000])
  expect(c.calls.map(x => x.body.tool_choice!.type)).toEqual(['auto', 'auto'])
  expect(r.stopped).toBe('answer')

  const late = { now: 0, per: [16_000] }
  const d = script([() => asks([{ name: 'echo', input: { q: 'x' } }]), () => answers()], late)
  const s = await runAgent(input(d.send, { clock: () => late.now }))
  expect(d.calls.map(x => [x.timeoutMs, x.body.tool_choice!.type])).toEqual([[20_000, 'auto'], [11_000, 'none']])
  expect(s.stopped).toBe('time')

  const gone = { now: 0, per: [26_500] }
  const e = script([() => asks([{ name: 'echo', input: { q: 'x' } }])], gone)
  const t = await runAgent(input(e.send, { clock: () => gone.now }))
  expect(e.calls).toHaveLength(1)
  expect(t).toMatchObject({ stopped: 'error', calls: 1, error: new Error('out of time') })
})

test('a tool that throws, and one Claude names that doesn\'t exist: an is_error result each, counted as tool calls; the run goes on', async () => {
  const c = script([() => asks([{ name: 'broken', input: {} }, { name: 'delete_everything', input: {} }]), () => answers()])
  const r = await runAgent(input(c.send))
  expect(r).toMatchObject({ stopped: 'answer', tools: 2, calls: 2 })
  expect(toolResults(c.calls[1]!.body).map(t => [t.is_error, t.content])).toEqual([[true, 'shard unreadable'], [true, 'No tool named delete_everything.']])
})

test('a refusal, an answer cut short, a call that fails: each ends the run, with what was spent before', async () => {
  const refusal = await runAgent(input(script([() => asks([{ name: 'echo', input: { q: 'x' } }]), () => answers('', 'refusal')]).send))
  expect(refusal).toMatchObject({ stopped: 'answer', calls: 2, message: { stop_reason: 'refusal' } })
  const cut = await runAgent(input(script([() => answers('{"verdict":', 'max_tokens')]).send))
  expect(cut).toMatchObject({ stopped: 'answer', calls: 1, message: { stop_reason: 'max_tokens' } })
  const err = Object.assign(new Error('overloaded'), { status: 529 })
  let k = 0
  const failing = await runAgent(input(async () => { if (++k === 2) throw err; return asks([{ name: 'echo', input: { q: 'x' } }]) }))
  expect(failing).toMatchObject({ stopped: 'error', calls: 2, tools: 1, error: err, spent: { input: 1000 } })
  expect(failing.message).toBeUndefined()
})
