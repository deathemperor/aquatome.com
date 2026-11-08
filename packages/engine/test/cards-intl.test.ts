import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import type { Llm } from '../src/claude'
import { cardHash, localizeCard, localizeCards } from '../src/cards-intl'

const VI = { eyebrow: 'Chuyện ít ai biết', title: 'Cá medaka Nhật từng giao phối ngoài không gian', body: '<p>Năm 1994, bốn con cá medaka (<em>Oryzias latipes</em>) bay 15 ngày trên quỹ đạo.</p>' }
const ID = { eyebrow: 'Fakta unik', title: 'Ikan medaka pernah kawin di luar angkasa', body: '<p>Pada 1994, empat ekor medaka (<em>Oryzias latipes</em>) terbang 15 hari di orbit.</p>' }
async function root(vi: object = VI, entity: object = {}) {
  const r = await mkdtemp(join(tmpdir(), 'cards-intl-'))
  await mkdir(join(r, 'content/cards/medaka'), { recursive: true })
  await mkdir(join(r, 'engine-state'))
  await writeFile(join(r, 'content/cards/medaka/vi.json'), JSON.stringify(vi))
  await writeFile(join(r, 'content/cards/medaka/entity.json'), JSON.stringify({ id: 'medaka', type: 'trivia', ...entity }))
  return r
}
/** The translator gives `written` in turn; the reviewer, `scores` in turn (a score, or a score with notes). */
const fake = (written: object[], scores: (number | { score: number; notes: string[] })[]) => {
  const calls: { kind: string; prompt: string }[] = []
  const llm = (async ({ prompt, schema }: { prompt: string; schema: object }) => {
    if ((schema as { required: string[] }).required.includes('eyebrow')) { calls.push({ kind: 'write', prompt }); return written.shift() }
    calls.push({ kind: 'review', prompt })
    const r = scores.shift()!
    return typeof r === 'number' ? { score: r, notes: [] } : r
  }) as Llm
  return { llm, calls }
}
const read = async (r: string) => JSON.parse(await readFile(join(r, 'content/cards/medaka/id.json'), 'utf8'))

test('a card is translated from the Vietnamese one, held to it by its reviewer, and written once it passes', async () => {
  const r = await root()
  const { llm, calls } = fake([ID], [0.95])
  expect(await localizeCard(r, llm, 'medaka', 'id')).toMatchObject({ kept: true, score: 0.95 })
  expect(await read(r)).toEqual(ID)
  expect(calls[0]!.prompt).toContain('into Indonesian')
  expect(calls[0]!.prompt).toContain(VI.title)
  expect(calls[1]!.prompt).toContain(VI.body)
  expect(calls[1]!.prompt).toContain(ID.body)
  // Done: not translated again, unless asked.
  const again = fake([ID], [0.95])
  expect(await localizeCards(r, again.llm, 'id')).toEqual([{ id: 'medaka', skipped: 'done' }])
  expect(again.calls).toEqual([])
  expect((await localizeCards(r, again.llm, 'id', { redo: true }))[0]).toMatchObject({ kept: true })
})

test('one that doesn\'t fit the card or doesn\'t pass goes back once, and is written only if it then does', async () => {
  const long = { ...ID, title: 'Ikan medaka Jepang pernah kawin di luar angkasa, dan anaknya lahir di orbit bumi pada tahun 1994' }
  const r = await root()
  const once = fake([long, ID], [0.95, 0.92])
  expect(await localizeCard(r, once.llm, 'medaka', 'id')).toMatchObject({ kept: true, score: 0.92 })
  expect(once.calls.filter(c => c.kind === 'write')[1]!.prompt.split('sent back for these')[1]).toMatch(/\n- title: /)
  expect(await read(r)).toEqual(ID)

  const r2 = await root()
  const twice = fake([ID, ID], [0.5, 0.6])
  expect(await localizeCard(r2, twice.llm, 'medaka', 'id')).toMatchObject({ kept: false, score: 0.6 })
  await expect(read(r2)).rejects.toThrow()
  const tooLong = fake([long, long], [0.95, 0.95])
  expect(await localizeCard(r2, tooLong.llm, 'medaka', 'id')).toMatchObject({ kept: false })
  await expect(read(r2)).rejects.toThrow()
})

test('a card the gate holds back in Vietnamese isn\'t translated', async () => {
  const r = await root({ ...VI, held: { checks: ['card'], at: '2026-11-09' } })
  const { llm, calls } = fake([ID], [0.95])
  expect(await localizeCard(r, llm, 'medaka', 'id')).toEqual({ id: 'medaka', skipped: 'held back in Vietnamese' })
  expect(calls).toEqual([])
})

test('one that passes with notes isn\'t written again: the notes are a passing reviewer\'s', async () => {
  const r = await root()
  const { llm, calls } = fake([ID], [{ score: 0.95, notes: ['"Fakta unik" could be "Fakta menarik".'] }])
  expect(await localizeCard(r, llm, 'medaka', 'id')).toMatchObject({ kept: true })
  expect(calls.map(c => c.kind)).toEqual(['write', 'review'])
})

test('a translation of an older Vietnamese card is made again, and taken down if the new one isn\'t kept; held in Vietnamese, it\'s taken down', async () => {
  const r = await root()
  await localizeCard(r, fake([ID], [0.95]).llm, 'medaka', 'id')
  expect(JSON.parse(await readFile(join(r, 'engine-state/_cards-intl.json'), 'utf8'))).toEqual({ 'id/medaka': cardHash(VI) })
  // The Vietnamese corrected: translated again.
  const fixed = { ...VI, body: '<p>Năm 1994, bốn con cá medaka (<em>Oryzias latipes</em>) bay 15 ngày trên tàu con thoi.</p>' }
  await writeFile(join(r, 'content/cards/medaka/vi.json'), JSON.stringify(fixed))
  const again = fake([{ ...ID, body: '<p>Pada 1994, empat ekor medaka (<em>Oryzias latipes</em>) terbang 15 hari dengan pesawat ulang-alik.</p>' }], [0.95])
  expect(await localizeCard(r, again.llm, 'medaka', 'id')).toMatchObject({ kept: true })
  expect((await read(r)).body).toContain('pesawat ulang-alik')
  // Corrected again, and the new translation fails: the old one goes, being of a text that's no longer there.
  await writeFile(join(r, 'content/cards/medaka/vi.json'), JSON.stringify(VI))
  expect(await localizeCard(r, fake([ID, ID], [0.5, 0.5]).llm, 'medaka', 'id')).toMatchObject({ kept: false })
  await expect(read(r)).rejects.toThrow()
  // Translated, then held back in Vietnamese: taken down.
  await localizeCard(r, fake([ID], [0.95]).llm, 'medaka', 'id')
  await writeFile(join(r, 'content/cards/medaka/vi.json'), JSON.stringify({ ...VI, held: { checks: ['harm'], at: '2026-11-09' } }))
  expect((await localizeCard(r, fake([], []).llm, 'medaka', 'id')).skipped).toContain('taken down')
  await expect(read(r)).rejects.toThrow()
  expect(JSON.parse(await readFile(join(r, 'engine-state/_cards-intl.json'), 'utf8'))).toEqual({})
})

test('a card that fails is reported and the others go on; a folder with no Vietnamese card is passed over', async () => {
  const r = await root()
  await mkdir(join(r, 'content/cards/aaa-broken'))
  await writeFile(join(r, 'content/cards/aaa-broken/vi.json'), JSON.stringify({ title: 'Không có dòng nhỏ' }))
  await writeFile(join(r, 'content/cards/aaa-broken/entity.json'), '{}')
  await mkdir(join(r, 'content/cards/empty'))
  const out = await localizeCards(r, fake([ID], [0.95]).llm, 'id')
  expect(out.map(x => [x.id, x.skipped?.slice(0, 7) ?? x.kept])).toEqual([['aaa-broken', 'failed:'], ['medaka', true]])
})

test('an event in a reader\'s country is translated only into its language; one anywhere else, into all', async () => {
  const event = (country: string) => ({ type: 'event', event: { start: '2026-12-01', end: '2026-12-02', place: 'x', country, organiser: 'y' } })
  const hanoi = await root(VI, event('VN'))
  const none = fake([], [])
  expect((await localizeCard(hanoi, none.llm, 'medaka', 'id')).skipped).toContain('an event in VN')
  expect(none.calls).toEqual([])
  const bangkok = await root(VI, event('TH'))
  expect((await localizeCard(bangkok, fake([], []).llm, 'medaka', 'id')).skipped).toContain('an event in TH')
  expect(await localizeCard(bangkok, fake([ID], [0.95]).llm, 'medaka', 'th')).toMatchObject({ kept: true })
  expect(await localizeCard(await root(VI, event('JP')), fake([ID], [0.95]).llm, 'medaka', 'id')).toMatchObject({ kept: true })
})
