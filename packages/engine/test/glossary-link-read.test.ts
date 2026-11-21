import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import type { Llm } from '../src/claude'
import { checkLinks, type Page, type Term as LinkTerm } from '../src/glossary-link-check'
import { linkReadText, readPhrase, readPrompt, SAMPLE, sample, type Term, writeLinkRead } from '../src/glossary-link-read'

// The link check's cheap read (the chief of staff, 22 Nov 2026): about 30 linked places a phrase, the flagged ones first,
// a share per phrase read as another meaning with three examples, and the model holds nothing.
const oxy: LinkTerm = { id: 'oxy-hoa-tan', name: 'Oxy hòa tan', altNames: [], linkNames: ['oxy'], text: '<p>Giữ oxy hòa tan cao.</p>' }
const term: Term = { id: 'oxy-hoa-tan', name: 'Oxy hòa tan', definition: 'Lượng oxy tan trong nước, cá thở bằng nó.' }
const page = (id: string, html: string): Page => ({ kind: 'guides', id, html })
// 12 places "oxy già" (flagged: a longer phrase the site writes often), 25 "tăng oxy" (not flagged).
const pages = [
  ...Array.from({ length: 12 }, (_, i) => page(`rua-be-${i}`, '<p>Rửa bể bằng oxy già rồi xả sạch.</p>')),
  ...Array.from({ length: 25 }, (_, i) => page(`suc-khi-${i}`, `<p>Tăng oxy cho bể số ${i} khi cá ngáp.</p>`)),
]
const report = () => checkLinks([oxy], pages)[0]!

// A model that says "other" for "oxy già" and "term" for the rest, by the numbered places in its prompt.
type Read = { n: number; says: string; means?: string }
const fake = (calls: string[], edit: (r: Read[]) => Read[] = r => r): Llm => async <T>({ prompt }: { prompt: string }) => {
  calls.push(prompt)
  const places = prompt.split('\n').filter(l => /^\d+\. /.test(l))
  return { reads: edit(places.map((l, i): Read => (l.includes('oxy] già') ? { n: i + 1, says: 'other', means: 'hydrogen peroxide' } : { n: i + 1, says: 'term', means: '' }))) } as T
}

test('a phrase\'s sample is its flagged places first, at most 30, the same whatever order the pages come in', () => {
  const r = report()
  expect(r.places).toHaveLength(37)
  const s = sample(r)
  expect(s).toHaveLength(SAMPLE)
  expect(s.slice(0, 12).every(p => p.flagged)).toBe(true)
  expect(s.slice(12).some(p => p.flagged)).toBe(false)
  const again = sample(checkLinks([oxy], [...pages].reverse())[0]!)
  expect(again.map(p => p.page)).toEqual(s.map(p => p.page))
  // A phrase with fewer places is read whole.
  expect(sample(r, 50)).toHaveLength(37)
})

test('one call a phrase, its prompt carrying the term\'s meaning, the phrase and each sampled place numbered', async () => {
  const calls: string[] = []
  const r = await readPhrase(fake(calls), term, report())
  expect(calls).toHaveLength(1)
  expect(calls[0]).toContain('Lượng oxy tan trong nước')
  expect(calls[0]).toContain('THE PHRASE: "oxy"')
  expect(calls[0]!.split('\n').filter(l => /^\d+\. /.test(l))).toHaveLength(30)
  expect(readPrompt(term, 'oxy', sample(report()))).toBe(calls[0])
  expect(r).toMatchObject({ term: 'oxy-hoa-tan', phrase: 'oxy', links: 37, flagged: 12, sampled: 30, sampledFlagged: 12, read: 30, other: 12, unsure: 0 })
  expect(r.examples).toHaveLength(3)
  expect(new Set(r.examples.map(x => x.page)).size).toBe(3)
  expect(r.examples.every(x => x.around.includes('[oxy] già') && x.means === 'hydrogen peroxide')).toBe(true)
  // A modifier or a name beside the phrase isn't "other" by itself: the prompt says so.
  expect(calls[0]).toContain('A word or a name next to the phrase doesn\'t by itself make it "other"')
})

test('a place the answer leaves out, numbers twice or numbers past the sample is not counted as read', async () => {
  const r = await readPhrase(fake([], rs => [...rs.slice(1), rs[5]!, { n: 99, says: 'other' }]), term, report())
  // Place 1 left out, place 6 twice (both "oxy già"): 28 read, 10 of the 12 others; place 99 isn't one.
  expect(r.read).toBe(28)
  expect(r.other).toBe(10)
})

test('an answer not of the schema\'s shape leaves only that phrase unread', async () => {
  for (const bad of [{ reads: null }, {}, { reads: [{ n: 1, says: 'maybe', means: '' }] }, { reads: [{ n: '1', says: 'term', means: '' }] }]) {
    const llm: Llm = async <T>() => bad as T
    expect(await readPhrase(llm, term, report())).toMatchObject({ read: 0, other: 0, failed: 'the answer is not a list of reads' })
  }
})

test('a limit is a whole number of phrases, one or more, refused before any call', async () => {
  const calls: string[] = []
  for (const limit of [0, -1, 1.5, Number.NaN]) await expect(writeLinkRead(tmpdir(), tmpdir(), fake(calls), '2026-11-22', { limit })).rejects.toThrow('a limit is a whole number')
  expect(calls).toHaveLength(0)
})

test('a call that fails leaves the phrase unread and says why; the page lists it apart', async () => {
  const llm: Llm = async () => { throw new Error('the glossary-link-read ceiling is reached') }
  const r = await readPhrase(llm, term, report())
  expect(r).toMatchObject({ read: 0, other: 0, failed: 'the glossary-link-read ceiling is reached' })
  const ok = await readPhrase(fake([]), term, report())
  // By share, not count: 5 of 10 (50%) comes before 12 of 30 (40%), and 0 of 30 last.
  const text = linkReadText([r, { ...ok, phrase: 'oxy hòa tan', other: 0, examples: [] }, ok, { ...ok, phrase: 'oxy già', read: 10, other: 5, examples: [] }], '2026-11-22', 'claude-sonnet-5-5')
  expect(text).toContain('Not read (1): "oxy" (the glossary-link-read ceiling is reached).')
  // Most read as another meaning first, each with its share and its examples.
  const heads = text.split('\n').filter(l => l.startsWith('## '))
  expect(heads).toEqual([
    '## oxy-hoa-tan: "oxy già", 5 of 10 answered read as another meaning (50% of the sample)',
    '## oxy-hoa-tan: "oxy", 12 of 30 answered read as another meaning (40% of the sample)',
    '## oxy-hoa-tan: "oxy hòa tan", 0 of 30 answered read as another meaning (0% of the sample)',
  ])
  expect(text).toContain('37 linked places, 12 flagged; sampled 30, 12 of them flagged; 30 answered.')
  expect(text).toContain('sampled 30, 12 of them flagged; 10 answered.')
  expect(text).toContain('the flagged ones first, so a phrase with many flagged places shows the flagged ones\' share')
  expect(text).toContain('- guides/rua-be-')
})

test('the read writes only its page: no held phrase, no change to the entries', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aq-link-read-'))
  await mkdir(join(root, 'content/glossary/oxy-hoa-tan'), { recursive: true })
  const vi = JSON.stringify({ name: 'Oxy hòa tan', definition: term.definition, altNames: [], linkNames: ['oxy'] })
  await writeFile(join(root, 'content/glossary/oxy-hoa-tan/vi.json'), vi)
  for (const p of pages.slice(0, 14)) {
    await mkdir(join(root, 'content/guides', p.id), { recursive: true })
    await writeFile(join(root, 'content/guides', p.id, 'vi.json'), JSON.stringify({ body: p.html }))
  }
  const out = join(root, 'review')
  await mkdir(out)
  const calls: string[] = []
  const { reads, file } = await writeLinkRead(root, out, fake(calls), '2026-11-22')
  expect(calls).toHaveLength(1)
  expect(reads[0]).toMatchObject({ phrase: 'oxy', read: 14, other: 12 })
  expect(await readdir(out)).toEqual(['glossary-link-read.md'])
  expect(await readFile(file, 'utf8')).toContain('The model holds nothing')
  expect(await readFile(join(root, 'content/glossary/oxy-hoa-tan/vi.json'), 'utf8')).toBe(vi)
  expect(await readdir(root)).toEqual(['content', 'review'])
})
