import type Anthropic from '@anthropic-ai/sdk'
import { describe, expect, test } from 'vitest'
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
  const calls: { body: Body; timeoutMs: number; writingMs: number }[] = []
  const send: AgentInput<string>['send'] = async (body, { timeoutMs, writingMs }) => {
    calls.push({ body: structuredClone(body), timeoutMs, writingMs })
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

test('a last word, when given, follows the last message on the forced call only; the history is left as it was', async () => {
  const c = script([() => asks([{ name: 'echo', input: { q: 'x' } }]), () => asks([{ name: 'echo', input: { q: 'x' } }]), () => asks([{ name: 'echo', input: { q: 'x' } }]), () => answers()])
  await runAgent(input(c.send, { lastWord: 'No more reading: answer now.' }))
  const said = (i: number) => (c.calls[i]!.body.messages.at(-1)!.content as Anthropic.ContentBlockParam[]).filter(b => b.type === 'text').map(b => (b as Anthropic.TextBlockParam).text)
  expect([0, 1, 2].map(said)).toEqual([['Which fish is this?'], [], []])
  expect(said(3)).toEqual(['No more reading: answer now.'])
  expect(toolResults(c.calls[3]!.body)[0]).toMatchObject({ type: 'tool_result' })
  expect(c.calls[3]!.body.messages).toHaveLength(c.calls[2]!.body.messages.length + 2)
  // Without one, the forced call is the history as it is (fish ID's).
  const plain = script([() => asks([{ name: 'echo', input: { q: 'x' } }]), () => asks([{ name: 'echo', input: { q: 'x' } }]), () => asks([{ name: 'echo', input: { q: 'x' } }]), () => answers()])
  await runAgent(input(plain.send))
  expect((plain.calls[3]!.body.messages.at(-1)!.content as Anthropic.ContentBlockParam[]).every(b => b.type === 'tool_result')).toBe(true)
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

test('the next call\'s size is guessed with the last answer (thinking and all goes back into the history) and the new tool results, a photo ~400 tokens', async () => {
  // 20,000 read and 9,000 written: the old guess (the last call's input again) made 40,000, not past the limit.
  const out = script([() => asks([{ name: 'echo', input: { q: 'x' } }], usage(1000, 9_000, 10_000, 9_000)), () => answers()])
  expect(await runAgent(input(out.send))).toMatchObject({ stopped: 'tokens', calls: 2 })
  // 15,000 in, then three photos back: 15,000 + 15,000 + 100 out + 3 × 400 passes 31,000; the last call's input alone wouldn't.
  const photos = script([() => asks([{ name: 'pics', input: {} }], usage(1000, 100, 7000, 7000)), () => answers()])
  expect(await runAgent(input(photos.send, { limits: { inputTokens: 31_000 } }))).toMatchObject({ stopped: 'tokens', calls: 2 })
  const fewer = script([() => asks([{ name: 'echo', input: { q: 'x' } }], usage(1000, 100, 7000, 7000)), () => answers()])
  expect(await runAgent(input(fewer.send, { limits: { inputTokens: 31_000 } }))).toMatchObject({ stopped: 'answer', calls: 2 })
})

test('cache marks: never more than the API\'s 4 in a call, whatever the limits (6 calls here, the first message marked as the agent marks its photo)', async () => {
  const marked: Anthropic.MessageParam = { role: 'user', content: [{ type: 'text', text: 'Which fish is this?', cache_control: { type: 'ephemeral' } }] }
  const c = script([() => asks([{ name: 'echo', input: { q: 'x' } }])])
  const r = await runAgent(input(c.send, { first: marked, limits: { calls: 6, tools: 10, inputTokens: 1e9 } }))
  expect(r).toMatchObject({ stopped: 'calls', calls: 6 })
  const marks = (b: Body) => b.messages.flatMap(m => (typeof m.content === 'string' ? [] : m.content)).filter(x => 'cache_control' in x && x.cache_control).length
  expect(c.calls.map(x => marks(x.body))).toEqual([1, 2, 3, 4, 4, 4])
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

test('pace: a slow run keeps the answer\'s time from its own calls, so it answers sooner, at the quick effort, with all the time left', async () => {
  // Calls of 3.4 s: after two, a third reading call would leave 27 - 6.8 - 3.4 = 16.8 s, under 6.5 × 3.4 = 22.1 s, so the
  // third call is the answer; 20.2 s is left, under 7 × 3.4 = 23.8 s, so it is a quick one. Without pace it would read on.
  const pace = { answer: 7, quick: 6.5, first: 4 }
  const reads = () => [() => asks([{ name: 'echo', input: { q: 'x' } }]), () => asks([{ name: 'echo', input: { q: 'y' } }]), () => answers()]
  const clock = { now: 0, per: [3_400, 3_400, 15_000] }
  const c = script(reads(), clock)
  const r = await runAgent(input(c.send, { clock: () => clock.now, effort: 'medium', lastEffort: 'low', pace }))
  expect(c.calls.map(x => [x.body.tool_choice!.type, x.body.output_config!.effort, x.timeoutMs])).toEqual([['auto', 'medium', 20_000], ['auto', 'medium', 20_000], ['none', 'low', 20_200]])
  expect(r.stopped).toBe('time')

  const before = { now: 0, per: [3_400, 3_400, 15_000] }
  const d = script(reads(), before)
  await runAgent(input(d.send, { clock: () => before.now, effort: 'medium', lastEffort: 'low' }))
  expect(d.calls[2]!.body.tool_choice!.type).toBe('auto')

  // One slow first call isn't a slow hour: after 4 s, another call leaves 27 - 4 - 4 = 19 s, over 4 × 4 = 16 s, so the
  // second call still reads. A very slow one is: after 6 s, 15 s, under 4 × 6 = 24 s, and the second call answers.
  for (const [ms, types] of [[4_000, ['auto', 'auto', 'none']], [6_000, ['auto', 'none']]] as const) {
    const first = { now: 0, per: [ms, 2_000, 8_000] }
    const e = script(reads(), first)
    await runAgent(input(e.send, { clock: () => first.now, effort: 'medium', lastEffort: 'low', pace }))
    expect(e.calls.map(x => x.body.tool_choice!.type), `${ms} ms`).toEqual(types)
  }
})

test('pace: a run at normal speed reads on to its limits, and its forced answer keeps its effort and may take all the time left', async () => {
  const clock = { now: 0, per: [1_000, 1_000, 5_000] }
  const c = script([() => asks([{ name: 'echo', input: { q: 'x' } }]), () => asks([{ name: 'echo', input: { q: 'y' } }]), () => answers()], clock)
  const r = await runAgent(input(c.send, { clock: () => clock.now, effort: 'medium', lastEffort: 'low', pace: { answer: 7, quick: 6.5, first: 4 }, limits: { calls: 3 } }))
  expect(c.calls.map(x => [x.body.tool_choice!.type, x.body.output_config!.effort, x.timeoutMs])).toEqual([['auto', 'medium', 20_000], ['auto', 'medium', 20_000], ['none', 'medium', 25_000]])
  expect(r.stopped).toBe('calls')

  // Without pace (fish ID), the forced call still gets at most callMs, at lastEffort when one is given.
  const plain = { now: 0, per: [1_000, 1_000, 5_000] }
  const d = script([() => asks([{ name: 'echo', input: { q: 'x' } }]), () => asks([{ name: 'echo', input: { q: 'y' } }]), () => answers()], plain)
  await runAgent(input(d.send, { clock: () => plain.now, effort: 'medium', limits: { calls: 3 } }))
  expect(d.calls.map(x => [x.body.tool_choice!.type, x.body.output_config!.effort, x.timeoutMs])).toEqual([['auto', 'medium', 20_000], ['auto', 'medium', 20_000], ['none', 'medium', 20_000]])
})

test('a call is bounded at callMs until it begins writing, and may then take all the time left', async () => {
  const clock = { now: 0, per: [1_000, 3_000] }
  const c = script([() => asks([{ name: 'echo', input: { q: 'x' } }]), () => answers()], clock)
  await runAgent(input(c.send, { clock: () => clock.now, limits: { ms: 27_000, callMs: 20_000 } }))
  expect(c.calls.map(x => [x.timeoutMs, x.writingMs])).toEqual([[20_000, 27_000], [20_000, 26_000]])
})

test('a call that has begun writing may run past the run\'s limit by its grace, a forced one too; before it writes it may not', async () => {
  const clock = { now: 0, per: [1_000, 3_000] }
  const c = script([() => asks([{ name: 'echo', input: { q: 'x' } }]), () => answers()], clock)
  await runAgent(input(c.send, { clock: () => clock.now, limits: { ms: 27_000, callMs: 20_000, writingGraceMs: 3_000 } }))
  expect(c.calls.map(x => [x.timeoutMs, x.writingMs])).toEqual([[20_000, 30_000], [20_000, 29_000]])
  const paced = { now: 0, per: [2_000, 2_000] }
  const f = script([() => asks([{ name: 'echo', input: { q: 'x' } }]), () => answers()], paced)
  await runAgent(input(f.send, { clock: () => paced.now, effort: 'medium', pace: { answer: 7, quick: 6.5, first: 4 }, limits: { calls: 2, ms: 27_000, callMs: 20_000, writingGraceMs: 3_000 } }))
  expect(f.calls[1]!.body.tool_choice!.type).toBe('none')
  expect([f.calls[1]!.timeoutMs, f.calls[1]!.writingMs]).toEqual([25_000, 28_000])
})

describe('the last try', () => {
  const lastTry = (begun = false) => ({ ms: 3_500, maxTokens: 2_048, word: 'Quick.', begun: () => begun })
  /** Claude: the first call goes silent to its limit, then each `then` in turn. */
  const silent = (then: (() => Anthropic.Message)[]) => {
    const clock = { now: 0 }
    const calls: { body: Body; timeoutMs: number; writingMs: number }[] = []
    const send: AgentInput<string>['send'] = async (body, { timeoutMs, writingMs }) => {
      calls.push({ body: structuredClone(body), timeoutMs, writingMs })
      const reply = then[calls.length - 2]
      if (!reply) { clock.now += timeoutMs; throw new Error('Request timed out.') }
      clock.now += 2_000
      return reply()
    }
    return { send, calls, clock: () => clock.now }
  }
  const limits = { ms: 27_000, callMs: 25_000, writingGraceMs: 3_000 }

  test('a call still not writing with its time gone is given up for one that can only answer, with no thinking, short, and that answer stands', async () => {
    const c = silent([() => answers()])
    const r = await runAgent(input(c.send, { clock: c.clock, effort: 'medium', lastEffort: 'low', limits, thinking: { type: 'adaptive' }, lastTry: lastTry() }))
    expect(c.calls.map(x => [x.timeoutMs, x.writingMs])).toEqual([[23_500, 30_000], [6_500, 6_500]])
    expect(c.calls[0]!.body.thinking).toEqual({ type: 'adaptive' })
    const last = c.calls[1]!.body
    expect([last.tool_choice, last.thinking, last.max_tokens, last.output_config!.effort]).toEqual([{ type: 'none' }, { type: 'disabled' }, 2_048, 'low'])
    expect((last.messages.at(-1)!.content as { text: string }[]).at(-1)!.text).toBe('Quick.')
    expect(r).toMatchObject({ stopped: 'time', calls: 2 })
    expect(r.error).toBeUndefined()
    expect(r.message?.content).toEqual([{ type: 'text', text: '{"verdict":"fish","guesses":[]}' }])
  })

  test('none once the reader has some of the answer: a second answer can\'t follow it', async () => {
    const c = silent([() => answers()])
    const r = await runAgent(input(c.send, { clock: c.clock, limits, lastTry: lastTry(true) }))
    expect(c.calls).toHaveLength(1)
    expect(r.stopped).toBe('error')
  })

  test('none for a call that failed before its time, and only one', async () => {
    const quick = script([() => { throw new Error('refused') }])
    const r = await runAgent(input(quick.send, { limits, lastTry: lastTry() }))
    expect(quick.calls).toHaveLength(1)
    expect(r.stopped).toBe('error')
    const c = silent([])
    const twice = await runAgent(input(c.send, { clock: c.clock, limits, lastTry: lastTry() }))
    expect(c.calls).toHaveLength(2)
    expect(twice.stopped).toBe('error')
  })
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

test('recheck: an answer Claude chose may be sent back once with more to read, and the run goes on to its next answer', async () => {
  const seen: Anthropic.Message[] = []
  const more = [{ type: 'text' as const, text: 'Read these marks.' }]
  const c = script([() => answers('{"guess":1}'), () => asks([{ name: 'echo', input: { q: 'y' } }]), () => answers('{"guess":2}')])
  const r = await runAgent(input(c.send, { recheck: m => { seen.push(m); return more } }))
  expect(r).toMatchObject({ stopped: 'answer', calls: 3, tools: 1, rechecked: true })
  expect(r.message?.content).toEqual([{ type: 'text', text: '{"guess":2}' }])
  // Asked once: the second answer stands whatever recheck would say.
  expect(seen.map(m => m.content)).toEqual([[{ type: 'text', text: '{"guess":1}' }]])
  // The first answer and the recheck's text join the history, append-only; the tools stay free to use.
  expect(c.calls[1]!.body.messages.slice(1)).toEqual([{ role: 'assistant', content: [{ type: 'text', text: '{"guess":1}' }] }, { role: 'user', content: more }])
  expect(c.calls.map(x => x.body.tool_choice!.type)).toEqual(['auto', 'auto', 'auto'])
})

test('recheck: not asked of a forced answer, a refusal or an answer cut short, nor with under 12 s left; nothing to add ends the run', async () => {
  let asked = 0
  const recheck = () => { asked++; return [{ type: 'text' as const, text: 'more' }] }
  const forced = await runAgent(input(script([() => asks([{ name: 'echo', input: { q: 'x' } }]), () => answers()]).send, { recheck, limits: { calls: 2 } }))
  expect(forced).toMatchObject({ stopped: 'calls', calls: 2 })
  const refusal = await runAgent(input(script([() => answers('', 'refusal')]).send, { recheck }))
  const cut = await runAgent(input(script([() => answers('{"verdict":', 'max_tokens')]).send, { recheck }))
  expect([refusal.calls, cut.calls]).toEqual([1, 1])
  const late = { now: 0, per: [15_500] }
  const slow = await runAgent(input(script([() => answers()], late).send, { recheck, clock: () => late.now }))
  expect(slow).toMatchObject({ stopped: 'answer', calls: 1 })
  expect(asked).toBe(0)
  for (const none of [() => undefined, () => []]) {
    const r = await runAgent(input(script([() => answers()]).send, { recheck: none }))
    expect(r).toMatchObject({ stopped: 'answer', calls: 1 })
    expect(r.rechecked).toBeUndefined()
  }
})

test('recheck: the call after it still counts toward the limits (the 4th call is forced)', async () => {
  const c = script([() => asks([{ name: 'echo', input: { q: 'x' } }]), () => asks([{ name: 'echo', input: { q: 'x' } }]), () => answers(), () => answers()])
  const r = await runAgent(input(c.send, { recheck: () => [{ type: 'text', text: 'more' }] }))
  expect(r).toMatchObject({ stopped: 'calls', calls: 4, rechecked: true })
  expect(c.calls.map(x => x.body.tool_choice!.type)).toEqual(['auto', 'auto', 'auto', 'none'])
})

test('recheck: the answer sent back stands when what follows fails, runs out of time, is cut short or refused, or asks for tools on the forced call', async () => {
  const more = () => [{ type: 'text' as const, text: 'more' }]
  const first = '{"guess":1}'
  const err = Object.assign(new Error('overloaded'), { status: 529 })
  let k = 0
  const thrown = await runAgent(input(async () => { if (++k === 2) throw err; return answers(first) }, { recheck: more }))
  expect(thrown).toMatchObject({ stopped: 'answer', calls: 2, rechecked: true })
  expect(thrown.message?.content).toEqual([{ type: 'text', text: first }])
  for (const [then, stopped] of [[() => answers('{"gue', 'max_tokens'), 'answer'], [() => answers('', 'refusal'), 'answer']] as const) {
    const r = await runAgent(input(script([() => answers(first), then]).send, { recheck: more }))
    expect(r).toMatchObject({ stopped, calls: 2, rechecked: true })
    expect(r.message?.content).toEqual([{ type: 'text', text: first }])
  }
  // Rechecked on the 3rd call: the 4th is forced, and a tool request there leaves the held answer, the limit named.
  const forced = await runAgent(input(script([() => asks([{ name: 'echo', input: { q: 'x' } }]), () => asks([{ name: 'echo', input: { q: 'x' } }]), () => answers(first), () => asks([{ name: 'echo', input: { q: 'y' } }])]).send, { recheck: more }))
  expect(forced).toMatchObject({ stopped: 'calls', calls: 4, rechecked: true })
  expect(forced.message?.content).toEqual([{ type: 'text', text: first }])
  // Out of time after the recheck's tool call: the held answer, not an error.
  const clock = { now: 0, per: [10_000, 16_200] }
  const late = await runAgent(input(script([() => answers(first), () => asks([{ name: 'echo', input: { q: 'x' } }])], clock).send, { recheck: more, clock: () => clock.now }))
  expect(late).toMatchObject({ stopped: 'answer', calls: 2, rechecked: true })
  expect(late.message?.content).toEqual([{ type: 'text', text: first }])
  expect(late.error).toBeUndefined()
})
