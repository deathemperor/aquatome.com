import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import type { Llm } from '../src/claude'
import { fitKey, fitText, runFit, type FitState } from '../src/fit'
import fitPass from '../src/fit-pass.json'
import { passOrder, passTonight } from '../src/fit-pass'
import type { Page } from '../src/pages'

const page = (lang: Page['lang'], kind: string, id: string, html = '<p>Cá cần nước sạch.</p>'): Page => ({ lang, kind, id, title: id, path: `/${lang}/${kind}/${id}/`, fields: [{ field: 'body', html }], lines: [], captions: [], latinNames: [], card: [] }) as unknown as Page
const readOf = (p: Page, at = '2026-11-08', more: object = {}) => ({ at, hash: fitText(p).hash, model: 'opus', checklist: 3, findings: [], products: [], ...more })

// The chief of staff, 21 Nov 2026: Sunday's and Monday's nights. Ceilings run by the Vietnamese day, so a night is the hours
// from midnight to 07:00 of the day after: the photos part's 02:10 and 05:10 starts, never its 23:10.
test('the pass runs on its two nights alone, from midnight to before 07:00 Vietnam time', () => {
  expect(fitPass.nights).toEqual(['2026-11-23', '2026-11-24'])
  const at = (vn: string) => passTonight(fitPass, new Date(`${vn}+07:00`))
  expect(at('2026-11-23T02:10:00')).toBe(true)
  expect(at('2026-11-24T05:10:00')).toBe(true)
  expect(at('2026-11-23T00:00:00')).toBe(true)
  expect(at('2026-11-23T06:59:00')).toBe(true)
  expect(at('2026-11-23T07:00:00')).toBe(false)
  expect(at('2026-11-22T23:10:00')).toBe(false)
  expect(at('2026-11-23T23:10:00')).toBe(false)
  expect(at('2026-11-25T02:10:00')).toBe(false)
  expect(at('2026-11-21T02:10:00')).toBe(false)
})

test('the pass reads the listed pages first, then every open page no read is of, Vietnamese first, guides first', () => {
  const g = page('vi', 'guides', 'g1')
  const s = page('vi', 'species', 'betta')
  const idS = page('id', 'species', 'betta')
  const idG = page('id', 'guides', 'g1')
  const ms = page('ms', 'plants', 'anubias')
  const thHeld = page('th', 'species', 'betta')
  const read = page('vi', 'species', 'neon')
  const retired = page('vi', 'guides', 'glaser-en-07-carp-like-fishes-1-loaches-a-new-ornate-hillstream-loach-en')
  const listed = page('th', 'guides', 'g2')
  const listedSince = page('vi', 'guides', 'g3')
  const listedDone = page('id', 'guides', 'g3')
  const state: FitState = {
    // Records of older text: open and unread.
    [fitKey(g)]: { ...readOf(g), hash: 'older' },
    [fitKey(idS)]: { ...readOf(idS), hash: 'older' },
    // A read of its text: not the pass's.
    [fitKey(read)]: readOf(read),
    // On the list: read on 8 Nov against a source changed since, read again by the pass, by a read since that day, or not yet.
    [fitKey(listed)]: readOf(listed, '2026-11-08'),
    [fitKey(listedSince)]: readOf(listedSince, '2026-11-20T03:00:00.000Z'),
    [fitKey(listedDone)]: readOf(listedDone, '2026-11-23T02:20:00.000Z', { pass: true }),
  }
  const held = new Map([['content/species/betta/th.json', { checks: ['shop'], at: '2026-11-10' }]])
  const again = { [fitKey(listed)]: '2026-11-08', [fitKey(listedSince)]: '2026-11-08', [fitKey(listedDone)]: '2026-11-08', 'vi/guides/gone': '2026-11-08' }
  const order = passOrder([ms, idS, thHeld, s, read, idG, g, listed, listedSince, listedDone, retired], state, held, { again })
  expect(order.map(fitKey)).toEqual([
    'th/guides/g2', // on the list, ahead of everything
    'vi/guides/g1', 'vi/species/betta', // Vietnamese: guides, then fish
    'id/guides/g1', 'id/species/betta',
    'ms/plants/anubias',
  ])
  // Once each: what the pass has read is no longer due, the listed page by its mark.
  const after: FitState = { ...state, ...Object.fromEntries(order.map(p => [fitKey(p), readOf(p, '2026-11-23', { pass: true })])) }
  expect(passOrder([ms, idS, thHeld, s, read, idG, g, listed, listedSince, listedDone, retired], after, held, { again })).toEqual([])
})

// The pass's list: the 86 open pages a source has changed under since their read (counted on main on 20 Nov), each with the
// read's day.
test("the pass's list is the 86 pages read against a source that changed since, each with its read's day", () => {
  const again = Object.entries(fitPass.again)
  expect(again).toHaveLength(86)
  for (const [key, day] of again) {
    expect(key).toMatch(/^(vi|id|th|ms)\/(guides|species|plants|breeds)\/[\w-]+$/)
    expect(day).toMatch(/^2026-11-\d\d$/)
  }
})

test('a read the pass gives is of the page as given, due or not, and its record carries the mark', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aq-fit-pass-'))
  const statePath = join(dir, '_fit.json')
  const a = page('vi', 'guides', 'a', '<p>Thay nước mỗi tuần.</p>')
  const b = page('vi', 'guides', 'b', '<p>Cá cần nước sạch.</p>')
  // b's text has a read: the pass reads it again all the same (a listed page whose source changed).
  await writeFile(statePath, JSON.stringify({ [fitKey(b)]: readOf(b) }))
  const asked: string[] = []
  const llm = (async ({ prompt }: { prompt: string }) => { asked.push(prompt.includes('Thay nước') ? 'a' : 'b'); return { findings: [], products: [], doses: [] } }) as Llm
  const { report, state } = await runFit([b, a], statePath, { llm, jobs: 1, given: true, mark: { pass: true }, now: () => new Date('2026-11-23T19:20:00Z') })
  expect(report.read).toBe(2)
  expect(asked).toEqual(['b', 'a'])
  expect(state[fitKey(a)]).toMatchObject({ pass: true, hash: fitText(a).hash })
  expect(state[fitKey(b)]).toMatchObject({ pass: true, hash: fitText(b).hash, at: '2026-11-23' })
  expect(JSON.parse(await readFile(statePath, 'utf8'))[fitKey(a)].pass).toBe(true)
  // Without `given`, as the read has always been: only a page due, and no mark.
  await writeFile(statePath, JSON.stringify({ [fitKey(b)]: readOf(b) }))
  const plain = await runFit([b, a], statePath, { llm, jobs: 1 })
  expect(plain.report.read).toBe(1)
  expect(plain.state[fitKey(a)]?.pass).toBeUndefined()
})
