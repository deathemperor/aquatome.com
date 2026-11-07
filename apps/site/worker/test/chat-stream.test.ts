import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { contract, type Op } from './contract'

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

test('a stream\'s order, as the contract has it (x-order, x-whole): steps, then the text, then the blocks; done holds the same text, blocks and steps', () => {
  for (const f of ['chat-stream-species.sse', 'chat-stream-uncovered.sse', 'chat-stream-failed.sse']) {
    expect(streamMisfits(readFileSync(fileURLToPath(new URL(`../../../../protocols/${f}`, import.meta.url).href), 'utf8'), sse), f).toEqual([])
  }
  const ev = (name: string, v: object) => `event: ${name}\ndata: ${JSON.stringify(v)}\n\n`
  const done = (o: object) => ev('done', { conversation: 'c', n: 1, text: 'ab', blocks: [], suggestions: [], covered: true, model: 'm', ...o })
  const tool = { t: 'tool', tool: 'tank-mates', name: 'Nuôi chung', url: '/vi/cong-cu/nuoi-chung/?ca=ca-neon-xanh:6' }
  const step = { kind: 'search', query: 'neon' }
  expect(streamMisfits(`${ev('step', step)}${ev('text', { text: 'ab' })}${ev('block', tool)}${done({ blocks: [tool], steps: [step] })}`, sse)).toEqual([])
  expect(streamMisfits(`${ev('block', tool)}${ev('text', { text: 'ab' })}${done({ blocks: [tool] })}`, sse).join()).toMatch(/\[1\] text: after a later kind of event/)
  expect(streamMisfits(`${ev('text', { text: 'ab' })}${ev('block', tool)}${ev('step', step)}${done({ blocks: [tool], steps: [step] })}`, sse).join()).toMatch(/\[2\] step: after a later kind of event/)
  expect(streamMisfits(`${ev('text', { text: 'a' })}${done({})}`, sse)).toEqual(["done: its text isn't the pieces joined"])
  // A retry's replay: the kept turn as one done, nothing streamed before it.
  expect(streamMisfits(done({ blocks: [tool], steps: [step] }), sse)).toEqual([])
  expect(streamMisfits(`${ev('text', { text: 'ab' })}${done({ blocks: [tool] })}`, sse)).toEqual(["done: its blocks aren't the blocks streamed"])
  expect(streamMisfits(`${ev('step', step)}${ev('text', { text: 'ab' })}${done({})}`, sse)).toEqual(["done: its steps aren't the steps streamed"])
})

test('a card has its figures as the app index has them: a plant\'s on the plants\' scale, apart from a fish\'s', () => {
  const card = { $ref: '#/components/schemas/Species' }
  const plant = { id: 'anubias-barteri-nana', kind: 'plant', name: 'Ráy nana' }
  expect(misfits({ t: 'species', page: plant, plant: { difficulty: 1, light: 'low', co2: 'none', growth: 'slow', placement: ['epiphyte'] } }, card)).toEqual([])
  expect(misfits({ t: 'species', page: plant, plant: { difficulty: 5 } }, card).join()).toMatch(/plant\.difficulty: 5 is out of 1–3/)
  expect(misfits({ t: 'species', page: plant, plant: { light: 'bright' } }, card).join()).toMatch(/plant\.light: "bright" is not one of/)
  const breed = { id: 'betta-halfmoon', kind: 'breed', name: 'Betta halfmoon' }
  expect(misfits({ t: 'species', page: breed, facts: { tempC: { min: 24, max: 28 }, lifeYears: { min: 2, max: 3 }, temperament: 'semi-aggressive' } }, card)).toEqual([])
})

test('a section is the page\'s own blocks, never a heading, a figure of the page schema\'s; a tool\'s link is its page\'s, with its own inputs', () => {
  const section = { $ref: '#/components/schemas/Section' }
  const guide = { kind: 'guide', title: 'G', url: '/vi/huong-dan/g/' }
  const img = { src: 'https://media.aquatome.com/x-480.webp', alt: 'x', w: 480, h: 320 }
  expect(misfits({ t: 'section', page: guide, blocks: [{ t: 'p', c: ['x'] }, { t: 'figure', img, caption: ['x'] }] }, section)).toEqual([])
  expect(misfits({ t: 'section', page: guide, blocks: [{ t: 'h', text: 'Next', id: 'next' }] }, section).join()).toMatch(/blocks\[0\]: is what `not` refuses/)
  expect(misfits({ t: 'section', page: guide, blocks: [{ t: 'figure', img: { ...img, w: -5 }, caption: ['x'] }] }, section).join()).toMatch(/blocks\[0\]/)
  const tool = { $ref: '#/components/schemas/Tool' }
  const link = (t: string, url: string) => misfits({ t: 'tool', tool: t, name: 'x', url }, tool)
  expect(link('tank-mates', '/vi/cong-cu/nuoi-chung/?ca=ca-neon-xanh:6,ca-bay-mau:3&l=60&w=30&h=36')).toEqual([])
  expect(link('tank-mates', '/vi/cong-cu/nuoi-chung/?l=60&w=30&h=36')).not.toEqual([])
  expect(link('tank-mates', '/vi/cong-cu/nuoi-chung/')).not.toEqual([])
  expect(link('tank-volume', '/vi/cong-cu/the-tich-be/?hinh=chu-nhat&l=60&w=30&h=36')).toEqual([])
  expect(link('tank-volume', '/vi/cong-cu/the-tich-be/')).toEqual([])
  expect(link('tank-volume', '/vi/cong-cu/the-tich-be/?l=60&w=30&h=36')).not.toEqual([])
  expect(link('tank-budget', '/th/tools/tank-budget/?co=khac&l=90&w=45&h=45')).toEqual([])
  expect(link('tank-budget', '/th/tools/tank-budget/?l=90&w=45&h=45')).not.toEqual([])
})

test('the helper holds the protocols\' other rules: an id only within its length, a key of the schema\'s, a field that must be missing', () => {
  const guess = { $ref: '#/components/schemas/Question' }
  const q = (scientificName: string) => ({ conversation: '6f1c2a52-8d3e-4b7a-9c41-2e5d7f80b913', question: 'x', identified: { verdict: 'fish', results: [{ scientificName, confidence: 0.9 }] } })
  expect(misfits(q('Betta splendens'), guess)).toEqual([])
  expect(misfits(q('B'.repeat(101)), guess).join()).toMatch(/scientificName: length 101/)
  const keyed = { type: 'object', propertyNames: { type: 'string', pattern: '^/' }, additionalProperties: { type: 'number' } }
  expect(misfits({ '/a': 1 }, keyed)).toEqual([])
  expect(misfits({ a: 1, '/b': 'x' }, keyed)).toEqual(['$ key "a": "a" doesn\'t match ^/', '$./b: not a number'])
  expect(misfits({ id: 'x', deletedAt: 1 }, { type: 'object', properties: { deletedAt: { not: {} } } })).toEqual(['$.deletedAt: is what `not` refuses'])
})

test('a stream the contract refuses: an event after done, a second end, a block it doesn\'t know, a card with a figure the index doesn\'t have, a section with no blocks or a page block that isn\'t one', () => {
  const done = 'event: done\ndata: {"conversation":"c","n":1,"text":"","blocks":[],"suggestions":[],"covered":true,"model":"m"}\n\n'
  expect(streamMisfits(done, sse)).toEqual([])
  expect(streamMisfits(`${done}event: text\ndata: {"text":"x"}\n\n`, sse).join()).toMatch(/ends with "text", not done or error/)
  expect(streamMisfits(`${done}event: error\ndata: {"error":"failed"}\n\n`, sse).join()).toMatch(/only one of done, error, last/)
  expect(streamMisfits(`event: result\ndata: {}\n\n${done}`, sse).join()).toMatch(/event "result" is not in the contract/)
  const block = (b: object) => streamMisfits(`event: block\ndata: ${JSON.stringify(b)}\n\n${done.replace('"blocks":[]', `"blocks":[${JSON.stringify(b)}]`)}`, sse).join()
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
