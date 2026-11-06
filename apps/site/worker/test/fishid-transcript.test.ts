import type Anthropic from '@anthropic-ai/sdk'
import { expect, test } from 'vitest'
import { listRuns, readRun, RESULT_MAX, RUN_DAYS, saveRun, sweepRuns, THINKING_MAX, turnsOf, type RunRecord } from '../fishid/transcript'
import { memoryR2 } from './r2'

const PHOTO = 'QUJDREVGR0g='
const first: Anthropic.MessageParam = { role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: PHOTO } }, { type: 'text', text: 'Which fish is this?' }] }
const answer = (text: string) => ({ id: 'msg_x', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'thinking', thinking: 'Sure now: red patch on the opercle.', signature: 'sig-3' }, { type: 'text', text }] }) as unknown as Anthropic.Message

test('a run\'s turns: what Claude thought, wrote and asked for, the tools\' answers cut short with the photos they showed, what was sent back, then the answer; never the reader\'s photo', () => {
  const long = 'x'.repeat(RESULT_MAX + 50)
  const history: Anthropic.MessageParam[] = [
    first,
    { role: 'assistant', content: [{ type: 'thinking', thinking: 'A red betta. '.repeat(400), signature: 'sig-1' }, { type: 'tool_use', id: 't1', name: 'search_handbook', input: { query: null, genus: 'Betta' } }, { type: 'tool_use', id: 't2', name: 'get_entry', input: { id: 'betta-rubra' } }] },
    { role: 'user', content: [
      { type: 'tool_result', tool_use_id: 't1', content: long },
      { type: 'tool_result', tool_use_id: 't2', content: [{ type: 'text', text: 'Betta rubra (species)' }, { type: 'image', source: { type: 'url', url: 'https://media.aquatome.com/rubra-480.webp' } }] },
    ] },
    { role: 'assistant', content: [{ type: 'thinking', thinking: '', signature: 'sig-2' }, { type: 'text', text: '{"verdict":"fish","guesses":[]}' }] },
    { role: 'user', content: [{ type: 'text', text: 'Your top guess is only 0.45 sure.' }] },
  ]
  const turns = turnsOf(history, answer('{"verdict":"fish"}'))
  expect(turns).toHaveLength(3)
  expect(turns[0]!.thinking!.startsWith('A red betta.')).toBe(true)
  expect(turns[0]!.thinking!.length).toBeLessThan(THINKING_MAX + 40)
  expect(turns[0]!.tools).toEqual([
    { name: 'search_handbook', input: { query: null, genus: 'Betta' }, result: `${'x'.repeat(RESULT_MAX)}… (50 more characters)` },
    { name: 'get_entry', input: { id: 'betta-rubra' }, result: 'Betta rubra (species)', photos: ['https://media.aquatome.com/rubra-480.webp'] },
  ])
  // An empty thinking block (omitted, or none) says nothing.
  expect(turns[1]).toEqual({ text: '{"verdict":"fish","guesses":[]}', sent: 'Your top guess is only 0.45 sure.' })
  expect(turns[2]).toEqual({ thinking: 'Sure now: red patch on the opercle.', text: '{"verdict":"fish"}' })
  expect(JSON.stringify(turns)).not.toContain(PHOTO)
  expect(JSON.stringify(turns)).not.toContain('base64')
  // A tool that failed says so; today's single call is its answer alone.
  const failed = turnsOf([first, { role: 'assistant', content: [{ type: 'tool_use', id: 'b', name: 'get_entry', input: { id: 'x' } }] }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'b', content: 'shard unreadable', is_error: true }] }])
  expect(failed).toEqual([{ tools: [{ name: 'get_entry', input: { id: 'x' }, result: 'shard unreadable', error: true }] }])
  expect(turnsOf([], answer('{}'))).toEqual([{ thinking: 'Sure now: red patch on the opercle.', text: '{}' }])
  // An answer sent back for a second look, then kept when what followed failed (the loop's held answer): one turn, not two.
  const held = answer('{"verdict":"fish","guesses":[]}')
  const kept = turnsOf([first, { role: 'assistant', content: held.content }, { role: 'user', content: [{ type: 'text', text: 'Your top guess is only 0.45 sure.' }] }], held)
  expect(kept).toEqual([{ thinking: 'Sure now: red patch on the opercle.', text: '{"verdict":"fish","guesses":[]}', sent: 'Your top guess is only 0.45 sure.' }])
})

const record = (at: string, id: string, extra: Partial<RunRecord> = {}): RunRecord => ({
  v: 1, id, at, lang: 'vi', from: 'page', model: 'claude-opus-5-5', outcome: 'ok', ms: 9000, cost: 0.03, tokens: { input: 9000, output: 400 },
  agent: { calls: 2, tools: 1, photos: 2, stopped: 'answer', rechecked: true }, verdict: 'fish',
  results: [{ scientificName: 'Betta macrostoma', commonName: 'Brunei beauty', confidence: 0.8, reason: 'Red patch.', page: 'betta-macrostoma' }], turns: [], ...extra,
})
const ID = (n: number) => `0000000${n}-0000-4000-8000-000000000000`

test('runs are kept by day: listed newest first from their metadata alone, each read whole; a day or id that isn\'t one reads nothing', async () => {
  const r2 = memoryR2()
  await saveRun(r2.bucket, record('2026-11-06T08:00:00.000Z', ID(1)))
  await saveRun(r2.bucket, record('2026-11-06T09:30:00.000Z', ID(2), { outcome: 'unreadable', agent: undefined, verdict: undefined, results: undefined }))
  await saveRun(r2.bucket, record('2026-11-05T23:59:00.000Z', ID(3)))
  expect([...r2.m.keys()].sort()).toEqual([`fish-id-runs/2026-11-05/${ID(3)}.json`, `fish-id-runs/2026-11-06/${ID(1)}.json`, `fish-id-runs/2026-11-06/${ID(2)}.json`])
  expect(await listRuns(r2.bucket, '2026-11-06')).toEqual([
    { day: '2026-11-06', id: ID(2), at: '2026-11-06T09:30:00.000Z', outcome: 'unreadable', lang: 'vi', top: '', conf: null, calls: 1, stopped: '', rechecked: false },
    { day: '2026-11-06', id: ID(1), at: '2026-11-06T08:00:00.000Z', outcome: 'ok', lang: 'vi', top: 'Betta macrostoma', conf: 0.8, calls: 2, stopped: 'answer', rechecked: true },
  ])
  expect(await readRun(r2.bucket, '2026-11-06', ID(1))).toEqual(record('2026-11-06T08:00:00.000Z', ID(1)))
  expect(await readRun(r2.bucket, '2026-11-06', ID(3))).toBeNull()
  expect(await readRun(r2.bucket, '../fish-id', ID(1))).toBeNull()
  expect(await readRun(r2.bucket, '2026-11-06', '../../fish-id/anon/x')).toBeNull()
  expect(await listRuns(r2.bucket, '2026-11')).toEqual([])
})

test('the daily cron deletes every day of runs a year old or more, a missed day\'s too, across R2\'s pages; kept photos aren\'t its', async () => {
  const r2 = memoryR2(2)
  const now = new Date('2026-11-06T03:00:00Z')
  const day = (back: number) => new Date(now.getTime() - back * 86_400_000).toISOString().slice(0, 10)
  for (const back of [RUN_DAYS + 3, RUN_DAYS + 1, RUN_DAYS + 1, RUN_DAYS + 1, RUN_DAYS, RUN_DAYS - 1, 0]) await saveRun(r2.bucket, record(`${day(back)}T01:00:00.000Z`, crypto.randomUUID()))
  await r2.bucket.put('fish-id/anon/00000000-0000-4000-8000-000000000000', new Uint8Array([1]))
  // A year to the day is gone, so no run outlives its 365 days; the day after it stays.
  expect(await sweepRuns(r2.bucket, now)).toBe(5)
  expect([...r2.m.keys()].map(k => k.split('/').slice(0, 2).join('/')).sort()).toEqual([`fish-id-runs/${day(0)}`, `fish-id-runs/${day(RUN_DAYS - 1)}`, 'fish-id/anon'].sort())
  expect(await sweepRuns(r2.bucket, now)).toBe(0)
})
