import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { contract, type Op } from './contract'

const { api, fixtures, streamMisfits } = contract('fishid.openapi.json')
const sse = (api.paths['/api/fish-id'].post as Op).responses['200']!.content['text/event-stream']!

test('the recorded answers in protocols/ the app replays follow the contract, and the contract names each of them', () => {
  const checked = fixtures()
  expect(checked.map(f => f.file).sort()).toEqual(['fishid-rate.json', 'fishid-stream-agent.sse', 'fishid-stream-failed.sse', 'fishid-stream-off.sse'])
  for (const f of checked) expect(f.problems, f.file).toEqual([])
  const onDisk = readdirSync(fileURLToPath(new URL('../../../../protocols/', import.meta.url).href)).filter(f => f.startsWith('fishid-'))
  expect(onDisk.sort()).toEqual(checked.map(f => f.file).sort())
  for (const f of checked) expect(api.info.description, f.file).toContain(`protocols/${f.file}`)
})

test('a stream the contract refuses: steps after the end, a ping after the result, an event or a step it doesn\'t know, a step\'s kind without its field, two lines of data', () => {
  const result = 'event: result\ndata: {"verdict":"unclear","results":[],"model":"m"}\n\n'
  expect(streamMisfits(result, sse)).toEqual([])
  expect(streamMisfits(`${result}event: step\ndata: {"kind":"search","query":"x"}\n\n`, sse).join()).toMatch(/ends with "step"/)
  expect(streamMisfits(`${result}: ping\n\n`, sse)).toEqual(['a comment after the last event'])
  expect(streamMisfits(`event: ask\ndata: {}\n\n${result}`, sse).join()).toMatch(/event "ask" is not in the contract/)
  expect(streamMisfits(`event: step\ndata: {"kind":"guess"}\n\n${result}`, sse).join()).toMatch(/fits 0 of oneOf/)
  // A step's kind says which field it has: a search its query, a look its page.
  expect(streamMisfits(`event: step\ndata: {"kind":"search","page":{"id":"x","kind":"species","name":"X"}}\n\n${result}`, sse).join()).toMatch(/fits 0 of oneOf/)
  expect(streamMisfits(`event: step\ndata: {"kind":"look","query":"x"}\n\n${result}`, sse).join()).toMatch(/fits 0 of oneOf/)
  expect(streamMisfits(`event: step\ndata: {"kind":"look"}\n\n${result}`, sse).join()).toMatch(/fits 0 of oneOf/)
  expect(streamMisfits('event: result\ndata: {"verdict":"unclear",\ndata: "results":[],"model":"m"}\n\n', sse).join()).toMatch(/not one line/)
  expect(streamMisfits('event: error\ndata: {"error":"rate"}\n\n', sse).join()).toMatch(/"rate" is not one of/)
})
