import { cp, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { LlmError } from '../src/claude'
import { CHECKLIST, fitKey, fitText, type FitState } from '../src/fit'
import { loadPages } from '../src/pages'
import { copiesToRedo, foreignSeasons, redoCopies, type Redone } from '../src/seasons'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const FIXTURE = join(ROOT, 'apps/site/test/fixture-content')

test('a season the reader\'s countries don\'t have is named; their own seasons aren\'t', () => {
  // Indonesia and Malaysia: a rainy and a dry season.
  expect(foreignSeasons('Wabah paling sering terjadi pada musim panas. Saat musim hujan dan musim kemarau…', 'id')).toEqual(['musim panas'])
  expect(foreignSeasons('Beri makan sedikit pada musim dingin dan musim semi; musim gugur juga.', 'id')).toEqual(['musim semi', 'musim gugur', 'musim dingin'])
  expect(foreignSeasons('Pada musim panas, air cepat panas. Musim tengkujuh membawa hujan.', 'ms')).toEqual(['musim panas'])
  // Thailand: hot and rainy. Its own cool season (ฤดูหนาว, หน้าหนาว) is no guide's fact: in a copy it was always
  // someone else's winter (the Writing Lead, 13 Nov 2026).
  expect(foreignSeasons('ช่วงฤดูหนาวน้ำเย็นลง ส่วนฤดูร้อนและฤดูฝนต้องระวัง', 'th')).toEqual(['ฤดูหนาว'])
  expect(foreignSeasons('<h3>รับมือหน้าหนาว</h3><p>หน้าร้อนให้วันละ 1–3 ครั้ง</p>', 'th')).toEqual(['หน้าหนาว'])
  // A disease's name isn't a season: spring viraemia of carp, as the Thai copy of the anchor worm guide names it.
  expect(foreignSeasons('เป็นพาหะของไวรัส SVC (โรคเลือดออกฤดูใบไม้ผลิในปลาคาร์ป)', 'th')).toEqual([])
  expect(foreignSeasons('โรคเลือดออกฤดูใบไม้ผลิ พบบ่อยในฤดูใบไม้ผลิ', 'th')).toEqual(['ฤดูใบไม้ผลิ'])
  expect(foreignSeasons('ให้อาหารน้อยลงในฤดูใบไม้ร่วงและฤดูใบไม้ผลิ', 'th')).toEqual(['ฤดูใบไม้ผลิ', 'ฤดูใบไม้ร่วง'])
  // Vietnam has all of them, the North's four and the South's two.
  expect(foreignSeasons('mùa hè, mùa đông', 'vi')).toEqual([])
  // Split by markup, a line break or an entity, as a reader still reads it (Astra's read).
  expect(foreignSeasons('<p>Saat musim <strong>panas</strong>, air cepat hangat.</p>', 'id')).toEqual(['musim panas'])
  expect(foreignSeasons('Saat musim\npanas', 'id')).toEqual(['musim panas'])
  expect(foreignSeasons('Saat musim&#32;panas', 'id')).toEqual(['musim panas'])
  expect(foreignSeasons('<p>ให้อาหารน้อยลงในฤดู<strong>ใบไม้ผลิ</strong></p>', 'th')).toEqual(['ฤดูใบไม้ผลิ'])
})

test('copies to write again first: one naming a season its readers don\'t have, or read as advice for elsewhere; twice at most', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aq-seasons-'))
  await cp(FIXTURE, join(root, 'content'), { recursive: true })
  // The fixture's AquaTome and Aquarium Co-op guides aren't shown on a public build, which is what the checker reads: here they are.
  const sourcesFile = join(root, 'content/sources.json')
  const sources = JSON.parse(await readFile(sourcesFile, 'utf8')) as Record<string, object>
  for (const s of ['aquatome', 'aquariumcoop']) Object.assign(sources[s]!, { publish: true, permission: { date: '2026-11-13', file: 'test', scope: ['text'] } })
  await writeFile(sourcesFile, JSON.stringify(sources))
  const dir = join(root, 'content/guides')
  const copy = (id: string, body: string) => writeFile(join(dir, id, 'id.json'), JSON.stringify({ slug: `${id}-id`, name: 'Panduan', altNames: [], sections: {}, quality: { score: 0.9, indexable: true }, body, summary: ['Ringkas.'], faq: [] }))
  await copy('aquatome-phan-loai-ca-dia', '<p>Wabah sering terjadi pada musim panas.</p>')
  await copy('loc-cho-be-nano', '<p>Pasang pemanas di ventilasi pemanas rumah.</p>')
  await copy('setup-be-dau-tien', '<p>Ganti air seminggu sekali saat musim hujan.</p>')
  const pages = await loadPages(join(root, 'content'), ['id'])
  const nano = pages.find(p => p.kind === 'guides' && p.id === 'loc-cho-be-nano')!
  const reading = (hash: string): FitState => ({ [fitKey(nano)]: { at: '2026-11-13', hash, model: 'opus', checklist: CHECKLIST, findings: [{ check: 'elsewhere', part: 'P1', quote: 'ventilasi pemanas rumah', why: 'a house heating vent', by: 'model' }], products: [] } })
  expect(copiesToRedo(pages, 'id', reading(fitText(nano).hash), {})).toEqual(['aquatome-phan-loai-ca-dia', 'loc-cho-be-nano'])
  // A reading of an older text says nothing of this one; a copy tried twice waits for a person.
  expect(copiesToRedo(pages, 'id', reading('older'), {})).toEqual(['aquatome-phan-loai-ca-dia'])
  expect(copiesToRedo(pages, 'id', reading(fitText(nano).hash), { 'id/aquatome-phan-loai-ca-dia': { at: '2026-11-13', n: 2 } })).toEqual(['loc-cho-be-nano'])
})

/**
 * The guide copies on the site that name a season their readers' countries don't have, on 13 Nov 2026 (the chief of staff's
 * count). The copy writer saves no new one (topics.ts localizeTopic) and writes these again first (localize-guides), so
 * this list only shrinks: a copy not on it that names one fails here. Take a copy off when it's written again.
 */
const STILL_TO_REDO = [
  'id/aquatome-benh-nam-mieng-nam-lung-columnaris-o-ca-canh-nhan-biet-cach-chua-va-phong',
  'id/aquatome-ca-ngoi-len-mat-nuoc-tho-gap-nguyen-nhan-va-cach-xu-ly',
  'id/aquatome-cham-soc-ca-canh-mua-he-va-mua-dong-mua-mua',
  'id/aquatome-giu-be-ca-mat-trong-mua-nong',
  'id/aquatome-nuoi-ca-koi-trong-be-kinh-va-ho-nho-the-tich-loc-thuc-an-va-mat-do',
  'id/aquatome-trung-mo-neo-va-ran-ca-nhan-biet-va-cach-diet',
  'ms/aquatome-benh-nam-mieng-nam-lung-columnaris-o-ca-canh-nhan-biet-cach-chua-va-phong',
  'ms/aquatome-ca-ngoi-len-mat-nuoc-tho-gap-nguyen-nhan-va-cach-xu-ly',
  'ms/aquatome-cham-soc-ca-canh-mua-he-va-mua-dong-mua-mua',
  'th/aquatome-cham-soc-ca-canh-mua-he-va-mua-dong-mua-mua',
  'th/aquatome-nuoi-ca-koi-trong-be-kinh-va-ho-nho-the-tich-loc-thuc-an-va-mat-do',
]

test('no copy of AquaTome\'s own guides names a season its readers\' countries don\'t have, but those still to be written again', async () => {
  const dir = join(ROOT, 'content/guides')
  const named: string[] = []
  for (const id of (await readdir(dir)).filter(g => g.startsWith('aquatome-')).sort()) {
    for (const lang of ['id', 'th', 'ms'] as const) {
      const file = join(dir, id, `${lang}.json`)
      if (!existsSync(file)) continue
      const t = JSON.parse(await readFile(file, 'utf8')) as { name: string; body?: string; summary?: string[]; faq?: { q: string; a: string }[] }
      const text = [t.name, t.body ?? '', ...(t.summary ?? []), ...(t.faq ?? []).flatMap(f => [f.q, f.a])].join('\n')
      if (foreignSeasons(text, lang).length) named.push(`${lang}/${id}`)
    }
  }
  expect(named.filter(k => !STILL_TO_REDO.includes(k))).toEqual([])
})

test('every try at a copy counts, a failed one too, against the run\'s limit and the copy\'s two; a usage limit ends the run uncounted', async () => {
  const redone: Redone = {}
  const tried: string[] = []
  const run = (fail: (id: string) => Error | undefined, limit = 1) => redoCopies(['a', 'b', 'c'], 'id', redone, {
    limit, save: async () => {}, now: () => new Date('2026-11-13T09:00:00Z'),
    write: async id => { tried.push(id); const e = fail(id); if (e) throw e; return { id } },
  })
  // The writer fails on the first: that try counts, and the run's limit of one is spent on it.
  expect(await run(id => (id === 'a' ? new Error('the reviewer\'s reply was cut off') : undefined))).toEqual({ made: 1 })
  expect(tried).toEqual(['a'])
  expect(redone['id/a']).toEqual({ at: '2026-11-13T09:00:00.000Z', n: 1 })
  // A usage limit: the run ends there, and the copy's count stays as it was.
  const out = 'claude failed: the engine\'s daily limit reached for localize-guides ($4.00 of $4 today)'
  expect(await run(() => new LlmError(out), 3)).toEqual({ made: 0, stopped: out })
  expect(tried).toEqual(['a', 'a'])
  expect(redone['id/a']!.n).toBe(1)
  expect(redone['id/b']).toBeUndefined()
  // Any other failed call is a try like the rest: the next copy goes on.
  expect(await run(id => (id === 'a' ? new LlmError('claude failed (1): the reply was cut off') : undefined), 2)).toEqual({ made: 2 })
  expect(tried).toEqual(['a', 'a', 'a', 'b'])
  expect(redone['id/a']!.n).toBe(2)
})
