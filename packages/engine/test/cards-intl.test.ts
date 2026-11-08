import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import type { Llm } from '../src/claude'
import { localizeCard, localizeCards } from '../src/cards-intl'

const VI = { eyebrow: 'Chuyện ít ai biết', title: 'Cá medaka Nhật từng giao phối ngoài không gian', body: '<p>Năm 1994, bốn con cá medaka (<em>Oryzias latipes</em>) bay 15 ngày trên quỹ đạo.</p>' }
const ID = { eyebrow: 'Fakta unik', title: 'Ikan medaka pernah kawin di luar angkasa', body: '<p>Pada 1994, empat ekor medaka (<em>Oryzias latipes</em>) terbang 15 hari di orbit.</p>' }
async function root(vi: object = VI) {
  const r = await mkdtemp(join(tmpdir(), 'cards-intl-'))
  await mkdir(join(r, 'content/cards/medaka'), { recursive: true })
  await writeFile(join(r, 'content/cards/medaka/vi.json'), JSON.stringify(vi))
  return r
}
/** The translator gives `written` in turn; the reviewer, `scores` in turn. */
const fake = (written: object[], scores: number[]) => {
  const calls: { kind: string; prompt: string }[] = []
  const llm = (async ({ prompt, schema }: { prompt: string; schema: object }) => {
    if ((schema as { required: string[] }).required.includes('eyebrow')) { calls.push({ kind: 'write', prompt }); return written.shift() }
    calls.push({ kind: 'review', prompt })
    return { score: scores.shift(), notes: [] }
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
  expect(once.calls.filter(c => c.kind === 'write')[1]!.prompt).toContain('title:')
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
