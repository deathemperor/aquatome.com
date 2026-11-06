import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { contract, parseSse, type Op } from './contract'

const { api, fixtures, misfits, streamMisfits } = contract('chat.openapi.json')
const sse = (api.paths['/api/chat'].post as Op).responses['200']!.content['text/event-stream']!
const recorded = ['chat-rate.json', 'chat-stream-failed.sse', 'chat-stream-species.sse', 'chat-stream-uncovered.sse']

test('the recorded answers in protocols/ a fake server replays follow the chat contract, and the contract names each of them', () => {
  const checked = fixtures()
  expect(checked.map(f => f.file).sort()).toEqual(recorded)
  for (const f of checked) expect(f.problems, f.file).toEqual([])
  const onDisk = readdirSync(fileURLToPath(new URL('../../../../protocols/', import.meta.url).href)).filter(f => f.startsWith('chat-'))
  expect(onDisk.sort()).toEqual(recorded)
  for (const f of recorded) expect(api.info.description, f).toContain(`protocols/${f}`)
})

/** What the contract says of a stream's order that its shapes don't: the text before the blocks, and `done` holding what came before it. */
function orderMisfits(text: string): string[] {
  const events = parseSse(text).filter(b => b.event)
  const out: string[] = []
  const firstBlock = events.findIndex(b => b.event === 'block')
  if (firstBlock >= 0 && events.slice(firstBlock).some(b => b.event === 'text')) out.push('a text piece after a block')
  const done = events.find(b => b.event === 'done')
  if (done) {
    const turn = JSON.parse(done.data!) as { text: string; blocks: unknown[]; steps?: unknown[] }
    const of = (name: string) => events.filter(b => b.event === name).map(b => JSON.parse(b.data!))
    if (of('text').map(p => p.text).join('') !== turn.text) out.push("the pieces don't join to the turn's text")
    if (JSON.stringify(of('block')) !== JSON.stringify(turn.blocks)) out.push("the blocks aren't the turn's")
    if (JSON.stringify(of('step')) !== JSON.stringify(turn.steps ?? [])) out.push("the steps aren't the turn's")
  }
  return out
}

test('each recorded stream sends its text before its blocks, and its done holds the same text, blocks and steps', () => {
  for (const f of ['chat-stream-species.sse', 'chat-stream-uncovered.sse', 'chat-stream-failed.sse']) {
    expect(orderMisfits(readFileSync(fileURLToPath(new URL(`../../../../protocols/${f}`, import.meta.url).href), 'utf8')), f).toEqual([])
  }
  const done = (o: object) => `event: done\ndata: ${JSON.stringify({ conversation: 'c', n: 1, text: 'ab', blocks: [], suggestions: [], covered: true, model: 'm', ...o })}\n\n`
  const tool = { t: 'tool', tool: 'tank-mates', name: 'Nuôi chung', url: '/vi/cong-cu/nuoi-chung/?ca=ca-neon-xanh:6' }
  expect(orderMisfits(`event: block\ndata: ${JSON.stringify(tool)}\n\nevent: text\ndata: {"text":"ab"}\n\n${done({ blocks: [tool] })}`)).toEqual(['a text piece after a block'])
  expect(orderMisfits(`event: text\ndata: {"text":"a"}\n\n${done({})}`)).toEqual(["the pieces don't join to the turn's text"])
  expect(orderMisfits(`event: text\ndata: {"text":"ab"}\n\n${done({ blocks: [tool] })}`)).toEqual(["the blocks aren't the turn's"])
})

test('a stream the contract refuses: an event after done, a second end, a block it doesn\'t know, a card with a figure the index doesn\'t have, a section with no blocks or a page block that isn\'t one', () => {
  const done = 'event: done\ndata: {"conversation":"c","n":1,"text":"","blocks":[],"suggestions":[],"covered":true,"model":"m"}\n\n'
  expect(streamMisfits(done, sse)).toEqual([])
  expect(streamMisfits(`${done}event: text\ndata: {"text":"x"}\n\n`, sse).join()).toMatch(/ends with "text", not done or error/)
  expect(streamMisfits(`${done}event: error\ndata: {"error":"failed"}\n\n`, sse).join()).toMatch(/only one of done, error, last/)
  expect(streamMisfits(`event: result\ndata: {}\n\n${done}`, sse).join()).toMatch(/event "result" is not in the contract/)
  const block = (b: object) => streamMisfits(`event: block\ndata: ${JSON.stringify(b)}\n\n${done}`, sse).join()
  const page = { id: 'paracheirodon-innesi', kind: 'species', name: 'Cá neon xanh' }
  expect(block({ t: 'species', page, facts: { tempC: { min: 21, max: 25 } } })).toBe('')
  expect(block({ t: 'map', page })).toMatch(/fits 0 of oneOf/)
  expect(block({ t: 'species', page, facts: { tempC: { min: 21, max: 25 }, price: 15000 } })).toMatch(/fits 0 of oneOf/)
  expect(misfits({ t: 'species', page, facts: { price: 15000 } }, { $ref: '#/components/schemas/Species' })).toEqual(['$.facts.price: not allowed'])
  expect(block({ t: 'compare', items: [{ page, facts: {} }] })).toMatch(/fits 0 of oneOf/)
  const guide = { kind: 'guide', title: 'G', url: '/vi/huong-dan/g/' }
  expect(block({ t: 'section', page: guide, blocks: [{ t: 'p', c: ['x'] }] })).toBe('')
  expect(block({ t: 'section', page: guide, blocks: [] })).toMatch(/fits 0 of oneOf/)
  // The page's own blocks, as protocols/page.schema.json has them.
  expect(misfits({ t: 'section', page: guide, blocks: [{ t: 'p', c: 7 }] }, { $ref: '#/components/schemas/Section' }).join()).toMatch(/\$\.blocks\[0\]: fits none of anyOf/)
  expect(misfits({ t: 'section', page: guide, blocks: [{ t: 'chart' }] }, { $ref: '#/components/schemas/Section' }).join()).toMatch(/\$\.blocks\[0\]: fits none of anyOf/)
  expect(block({ t: 'tool', tool: 'dosing', name: 'x', url: '/vi/cong-cu/x/' })).toMatch(/fits 0 of oneOf/)
  expect(streamMisfits(`event: error\ndata: {"error":"rate"}\n\n`, sse).join()).toMatch(/"rate" is not one of/)
})
