import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { placeNamed, type Translation } from '@aq/schema'
import { LlmError, type Llm } from '../src/claude'
import { judgePlaces } from '../src/place-judge'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(r => rm(r, { recursive: true, force: true }))) })

const NOW = new Date('2026-11-16T05:00:00Z')
const HUE = 'Asia: Mekong basin, Hue River, the Malay Peninsula and Indonesia, including Sumatra, Java and Borneo.'

/** A content folder: the Planet Catfish sentence on Pseudolais micronemus, and places with their names by language. */
async function store(places: Record<string, { kind?: string; countries?: string[]; vi?: string; names: Partial<Record<'id' | 'th' | 'ms', Partial<Translation> & { name: string }>> }>) {
  const root = await mkdtemp(join(tmpdir(), 'place-judge-'))
  roots.push(root)
  const fish = join(root, 'content/species/pseudolais-micronemus')
  await mkdir(fish, { recursive: true })
  await writeFile(join(fish, 'entity.json'), JSON.stringify({ id: 'pseudolais-micronemus', range: { native: { countries: ['ID'], regions: ['Mekong', 'Hue River'], sources: ['planetcatfish'], quotes: [{ source: 'planetcatfish', quote: HUE, countries: [], regions: ['Mekong', 'Hue River'] }] } } }))
  for (const [id, p] of Object.entries(places)) {
    const dir = join(root, 'content/places', id)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'entity.json'), JSON.stringify({ id, kind: p.kind ?? 'river', ...(p.countries ? { countries: p.countries } : {}) }))
    await writeFile(join(dir, 'vi.json'), JSON.stringify({ slug: id, name: p.vi ?? id, altNames: [], sections: {}, quality: { score: 1, indexable: true } }))
    for (const [lang, t] of Object.entries(p.names)) await writeFile(join(dir, `${lang}.json`), JSON.stringify({ slug: id, altNames: [], sections: {}, quality: { score: 0.05, indexable: false }, ...t }))
  }
  return root
}
const read = async (root: string, id: string, lang: string) => JSON.parse(await readFile(join(root, 'content/places', id, `${lang}.json`), 'utf8')) as Translation

/** A judge that answers from a table by the name it is asked about, and keeps every prompt. */
function judgeOf(answers: Record<string, { score: number; why?: string; better?: string; record?: string } | 'stop'>) {
  const prompts: string[] = []
  const llm: Llm = async <T>({ prompt }: { prompt: string }) => {
    prompts.push(prompt)
    const name = /name to check: (.+)$/m.exec(prompt)![1]!
    const a = answers[name] ?? { score: 0.9 }
    if (a === 'stop') throw new LlmError('the engine\'s daily limit reached for judge-places')
    return { why: 'ok', ...a } as T
  }
  return { llm, prompts, asked: () => prompts.map(p => /name to check: (.+)$/m.exec(p)![1]!) }
}

// The chief of staff, 14 Nov 2026: "Hue" on the Indonesian Pseudolais micronemus page went out under a batch's 0.05. The
// Catalog of Fishes puts the species in the "Mekong and Hue rivers, Vietnam": the Hương at Huế, which an Indonesian
// atlas calls Sungai Parfum. This holds the plumbing with a judge whose answers are given: that the judge is asked about
// "Hue" alone, with the sentence its source wrote it in, and that a name it gives is judged again before it's written.
// Whether the model catches it is the first run's to show (its report lists each failed and renamed name).
test('each name is judged alone against its source\'s sentence, and a name the judge gives is judged again before it is written', async () => {
  const root = await store({ 'hue-river': { countries: ['ID'], vi: 'sông Hue', names: { id: { name: 'Hue' } } } })
  const j = judgeOf({ Hue: { score: 0.1, why: 'a river cut to its city', better: 'Sungai Parfum', record: 'the Hue River is in Vietnam (sông Hương at Huế), not Indonesia' }, 'Sungai Parfum': { score: 0.9 } })
  const r = await judgePlaces(root, j.llm, { limit: 10, now: () => NOW })
  expect(j.asked()).toEqual(['Hue', 'Sungai Parfum'])
  for (const p of j.prompts) {
    expect(p).toContain(HUE)
    expect(p).toContain('hue-river (river, in ID). Its Vietnamese name: sông Hue.')
    expect(p.match(/name to check:/g)).toHaveLength(1)
  }
  const t = await read(root, 'hue-river', 'id')
  expect([t.name, t.nameCheck]).toEqual(['Sungai Parfum', { ok: true, score: 0.9, at: NOW.toISOString() }])
  expect(placeNamed(t)).toBe(true)
  expect(r.renamed).toEqual(['id/hue-river: "Hue" → "Sungai Parfum" (a river cut to its city)'])
  expect(r.records).toEqual(['id/hue-river: the Hue River is in Vietnam (sông Hương at Huế), not Indonesia'])
})

test('a name whose new name fails too is marked failed as it stands, and the site shows the source\'s name until one passes', async () => {
  const root = await store({ 'hue-river': { names: { id: { name: 'Hue' }, ms: { name: 'Sungai Hue', quality: { score: 0.2, indexable: false } } } } })
  const j = judgeOf({ Hue: { score: 0.1, why: 'cut short', better: 'Hue' }, 'Sungai Hue': { score: 0.3, why: 'the city\'s name', better: 'Sungai Perfume' }, 'Sungai Perfume': { score: 0.5 } })
  const r = await judgePlaces(root, j.llm, { limit: 10, jobs: 1, now: () => NOW })
  // The same name given back is no new name: it isn't asked twice.
  expect(j.asked()).toEqual(['Hue', 'Sungai Hue', 'Sungai Perfume'])
  const id = await read(root, 'hue-river', 'id'), ms = await read(root, 'hue-river', 'ms')
  expect([id.name, id.nameCheck]).toEqual(['Hue', { ok: false, score: 0.1, at: NOW.toISOString(), why: 'cut short' }])
  expect([ms.name, ms.nameCheck?.ok]).toEqual(['Sungai Hue', false])
  expect([placeNamed(id), placeNamed(ms)]).toEqual([false, false])
  expect(r.failed).toEqual(['id/hue-river: "Hue" (cut short)', 'ms/hue-river: "Sungai Hue" (the city\'s name); "Sungai Perfume" failed too'])
})

test('unjudged names go first, lowest batch score first; a passed name is done, and a failed one is asked again after a week', async () => {
  const day = 86_400_000
  const root = await store({
    'kayan-river': { names: { id: { name: 'Sungai Kayan', quality: { score: 0.9, indexable: true } }, th: { name: 'แม่น้ำกายัน', quality: { score: 0.4, indexable: false } } } },
    'hue-river': { names: { id: { name: 'Hue' }, ms: { name: 'Sungai Hue', nameCheck: { ok: false, score: 0.2, at: new Date(NOW.getTime() - 8 * day).toISOString() } } } },
    'mekong': { names: { id: { name: 'Mekong', nameCheck: { ok: true, score: 0.9, at: NOW.toISOString() } }, th: { name: 'แม่น้ำโขง', nameCheck: { ok: false, score: 0.6, at: new Date(NOW.getTime() - 2 * day).toISOString() } } } },
  })
  const j = judgeOf({})
  const r = await judgePlaces(root, j.llm, { limit: 10, jobs: 1, now: () => NOW })
  expect(j.asked()).toEqual(['Hue', 'แม่น้ำกายัน', 'Sungai Kayan', 'Sungai Hue'])
  expect(r.left).toBe(0)
  // At its limit, the run judges the first ones (a score's names Indonesian, Thai, Malay) and leaves the rest for the next.
  const k = judgeOf({})
  const again = await judgePlaces(await store({ a: { names: { id: { name: 'A' }, th: { name: 'B' } } }, b: { names: { id: { name: 'C' } } } }), k.llm, { limit: 2, jobs: 1, now: () => NOW })
  expect([k.asked(), again.judged, again.left]).toEqual([['A', 'C'], 2, 1])
})

test('a stop (the line spent, the accounts out) ends the run, and the names judged before it are kept', async () => {
  const root = await store({ a: { names: { id: { name: 'A' } } }, b: { names: { id: { name: 'B' } } }, c: { names: { id: { name: 'C' } } } })
  const j = judgeOf({ B: 'stop' })
  const r = await judgePlaces(root, j.llm, { limit: 10, jobs: 1, now: () => NOW })
  expect(r.stopped).toContain('daily limit')
  expect([r.judged, r.passed, r.left]).toEqual([1, ['id/a'], 2])
  expect((await read(root, 'a', 'id')).nameCheck?.ok).toBe(true)
  expect((await read(root, 'b', 'id')).nameCheck).toBeUndefined()
})
