import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { BREED_FIRST_STATE, breedFirst, breedRun, markBreedFirst } from '../src/breed-first'
import { writerFigures } from '../src/breed-units'
import { restoreUnreadRecords } from '../src/writer-records'

const KOI = 'Allow about 38 L per 2.5 cm of adult length (about 950 L for a 61–64 cm koi). Juveniles under 15 cm can start in a 110 L tank.'
const said = (fs: ReturnType<typeof writerFigures>) => fs.map(f => `${f.us} → ${f.litres}${f.perCm ? ' a cm' : ''}`)

test('a breed writer\'s figures, from the facts\' US figures and the litres a page\'s units findings quote, in each language\'s numbers', () => {
  // Koi: 10 gallons an inch is 15 litres a cm, not 16; 950 litres is 250 gallons, 1.000; 110 litres, quoted in Thai, 29 gallons, 120.
  expect(said(writerFigures(KOI, [{ text: 'เริ่มเลี้ยงในตู้ขนาด 110 ลิตรได้', lang: 'th' }]))).toEqual(['10 US gallons per inch of fish → 15 a cm', '250 US gallons → 1000', '29 US gallons → 120'])
  expect(said(writerFigures(KOI, [{ text: 'kira-kira 40 liter air bagi setiap 2.5 cm panjang', lang: 'ms' }]))).toEqual(['10 US gallons per inch of fish → 15 a cm', '250 US gallons → 1000'])
  expect(said(writerFigures('Pond guidance: about 1,000 gallons (about 3,800 L) per fish', [{ text: 'sekitar 3.800 liter per ekor', lang: 'id' }, { text: 'Kira-kira 3,800 liter seekor', lang: 'ms' }]))).toEqual(['1,000 US gallons → 4000'])
  // Ryukin: 35 gallons 130; a range's ends each, from the table.
  expect(said(writerFigures('For one large Ryukin, 35 US gal (about 132 L) is the bare minimum; 40–50 gal (151–189 L) is better.'))).toEqual(['35 US gallons → 130', '40 US gallons → 150', '50 US gallons → 200'])
  // Litres in the facts that aren't only a gallon conversion stay theirs: 50 to 75, 40 a goldfish.
  expect(writerFigures('Use a tank of at least 50 to 75 litres, with about 40 litres per goldfish.')).toEqual([])
})

test('the listed breeds go first, each once: written again where the page is there, written where it isn\'t; one put back or held waits', async () => {
  const root = await mkdtemp(join(tmpdir(), 'breed-first-'))
  const page = async (lang: string, id: string, v: object = {}) => { await mkdir(join(root, 'content/breeds', id), { recursive: true }); await writeFile(join(root, 'content/breeds', id, `${lang}.json`), JSON.stringify(v)) }
  for (const id of ['koi', 'butterfly-koi', 'ranchu-goldfish', 'ryukin-goldfish']) await page('vi', id)
  for (const id of ['koi', 'butterfly-koi']) await page('ms', id)
  expect(await breedFirst(root, 'ms')).toEqual({ first: [{ id: 'koi', redo: true }, { id: 'butterfly-koi', redo: true }, { id: 'ranchu-goldfish', redo: false }, { id: 'ryukin-goldfish', redo: false }], waiting: [] })
  expect((await breedFirst(root, 'vi')).first).toEqual([])
  await markBreedFirst(root, 'ms/breeds/koi', '2026-11-13T01:00:00.000Z')
  await markBreedFirst(root, 'ms/breeds/butterfly-koi', '2026-11-13T01:00:00.000Z')
  // The gate gave koi its old text back, and held butterfly koi: both wait for the chief of staff's word.
  await mkdir(join(root, 'engine-state/put-back/breeds'), { recursive: true })
  await writeFile(join(root, 'engine-state/put-back/breeds/koi.ms.json'), JSON.stringify({ at: '2026-11-13T02:00:00Z', checks: ['units', 'source'] }))
  await page('ms', 'butterfly-koi', { held: { checks: ['harm'], at: '2026-11-13' } })
  expect(await breedFirst(root, 'ms')).toEqual({
    first: [{ id: 'ranchu-goldfish', redo: false }, { id: 'ryukin-goldfish', redo: false }],
    waiting: ["ms/breeds/koi: the gate gave it its old text back for units, source; waits for the chief of staff's word", "ms/breeds/butterfly-koi: held for harm; waits for the chief of staff's word"],
  })
})

test('a listed breed the gate couldn\'t read loses its mark, and is written again', async () => {
  const root = await mkdtemp(join(tmpdir(), 'breed-first-'))
  const git = (...a: string[]) => execFileSync('git', a, { cwd: root, stdio: 'ignore' })
  git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't')
  await mkdir(join(root, 'engine-state'), { recursive: true })
  await writeFile(join(root, BREED_FIRST_STATE), JSON.stringify({ 'id/breeds/butterfly-koi': { at: '2026-11-12T01:00:00.000Z' } }))
  git('add', '.'); git('commit', '-q', '-m', 'state')
  await markBreedFirst(root, 'id/breeds/koi', '2026-11-13T01:00:00.000Z')
  await restoreUnreadRecords(root, [{ kind: 'breeds', id: 'koi', lang: 'id' }])
  expect(JSON.parse(await readFile(join(root, BREED_FIRST_STATE), 'utf8'))).toEqual({ 'id/breeds/butterfly-koi': { at: '2026-11-12T01:00:00.000Z' } })
})

test('the breed step takes the listed breeds first, written again where there, at most its limit, and marks each written', async () => {
  const root = await mkdtemp(join(tmpdir(), 'breed-first-'))
  for (const id of ['koi', 'butterfly-koi', 'ranchu-goldfish', 'ryukin-goldfish', 'betta']) { await mkdir(join(root, 'content/breeds', id), { recursive: true }); await writeFile(join(root, 'content/breeds', id, 'vi.json'), '{}') }
  await writeFile(join(root, 'content/breeds/koi/th.json'), '{}')
  const calls: string[] = []
  const write = async (id: string, redo: boolean) => { calls.push(`${id}${redo ? ' redo' : ''}`); return id === 'butterfly-koi' ? { id, failed: 'x' } : { id } }
  const now = () => new Date('2026-11-13T01:00:00Z')
  await breedRun(root, 'th', ['betta', 'koi', 'butterfly-koi', 'ranchu-goldfish', 'ryukin-goldfish'], write, { limit: 2, now })
  expect(calls).toEqual(['koi redo', 'butterfly-koi'])
  // Koi is done; butterfly koi failed and goes first again, then ranchu.
  expect(JSON.parse(await readFile(join(root, BREED_FIRST_STATE), 'utf8'))).toEqual({ 'th/breeds/koi': { at: '2026-11-13T01:00:00.000Z' } })
  calls.length = 0
  await breedRun(root, 'th', ['betta', 'koi', 'butterfly-koi', 'ranchu-goldfish', 'ryukin-goldfish'], write, { limit: 2, now })
  expect(calls).toEqual(['butterfly-koi', 'ranchu-goldfish'])
})
