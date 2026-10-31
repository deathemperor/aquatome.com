import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { LlmError } from '../src/claude'
import { loadAll } from '@aq/schema'
import { approveSummaries, cardBlock, cardOf, checkNumbers, draftSummaries, pageText, profile, readSummaries, reviewDoc } from '../src/summaries'

async function content() {
  const root = join(await mkdtemp(join(tmpdir(), 'sum-')), 'content')
  await cp(new URL('../../../apps/site/test/fixture-content', import.meta.url), root, { recursive: true })
  await rm(join(root, 'summaries'), { recursive: true, force: true }) // start with no summaries
  return root
}
const now = () => new Date('2026-10-29T00:00:00Z')
const card = { tempC: { min: 23, max: 27 }, ph: { min: 4.6, max: 6.2 }, gh: { min: 1, max: 4 }, sizeCm: 3.5, tankCm: 60, difficulty: 2 }
const page = 'Cá neon vua (Paracheirodon axelrodi). Bể có đáy từ 60 × 30 cm, chứa khoảng 54 lít. 23–29 °C. pH: 3,5–7,5. Nuôi đàn ít nhất 8–10 con. Thay 30% nước mỗi tuần. Bể trưng bày 1.200 lít.'
const draft = (summary: string, mistakes: string[] = []) => ({ summary, mistakes })

test('numbers from the data card and the page text pass', () => {
  expect(checkNumbers(draft('Hợp với bể từ 60 × 30 cm (khoảng 54 lít), nước 23–27 °C, pH 4,6–6,2, độ cứng 1–4 dGH, độ khó 2/8.', ['Thả lẻ vài con: nên nuôi đàn 8–10 con.']), card, page)).toEqual([])
  // Vietnamese thousands and decimals; adult size in mm is the card's cm; one pH value inside the card's range.
  expect(checkNumbers(draft('Cá dài 35 mm, hợp bể trưng bày 1.200 lít, pH 4,6.'), card, page)).toEqual([])
})

test('a temperature, pH or hardness figure must be the card one, even when the page text says otherwise', () => {
  expect(checkNumbers(draft('Nước 23–29 °C, pH 3,5–7,5.'), card, page)).toEqual([
    '"23–29 °C" is not the card\'s temperature (23–27 °C)',
    '"pH 3,5–7,5" is not the card\'s pH (4,6–6,2)',
  ])
  expect(checkNumbers(draft('Chịu được pH 7, GH 1–12.'), card, page)).toEqual([
    '"pH 7" is not the card\'s pH (4,6–6,2)',
    '"GH 1–12" is not the card\'s hardness (1–4 dGH)',
  ])
  // One value inside the card's range is fine only when the page says it.
  expect(checkNumbers(draft('Giữ nước quanh 25 °C.'), card, page)).toEqual(['the number "25" is in neither the page text nor the data card'])
  expect(checkNumbers(draft('Độ khó 5/8, khá kén nước.'), card, page)).toEqual(['"5/8" is not the card\'s difficulty (2/8)'])
  expect(checkNumbers(draft('Độ khó 5/8, khá kén nước.'), {}, page)).toEqual(['"5/8": the card gives no difficulty'])
})

test('a tank or adult-size figure must be the card one: after "bể" the tank, after a size word the fish, else either', () => {
  expect(checkNumbers(draft('Cá lớn tới 3,5 cm, bể dài tối thiểu 60 cm. Cần bể rộng, dài từ 60 cm.', ['Cá neon vua (Paracheirodon axelrodi) dài khoảng 3,5 cm.']), card, page)).toEqual([])
  // The page's text says 5 cm and a 75 cm tank; the card says 3,5 and 60.
  expect(checkNumbers(draft('Cá lớn tới 5 cm, cần bể dài 75 cm.'), card, page + ' Cá dài 5 cm. Bể 75 cm.')).toEqual([
    '"5 cm" is not the card\'s adult size (3,5 cm)',
    '"75 cm" is not the card\'s minimum tank (60 cm)',
  ])
  expect(checkNumbers(draft('Bể 90 × 30 cm là đủ.'), card, page)).toEqual(['"90 × 30 cm" is not the card\'s minimum tank (60 cm)'])
  // The nearer word decides: a fish in a tank sentence is still a fish; "bể cá" is a tank; "60 cm x 30 cm" are dimensions.
  expect(checkNumbers(draft('Nên dành một bể riêng cho cá dài 3,5 cm này.', ['Chọn bể quá ngắn vì thấy cá chỉ 3,5 cm; cần bể cá dài 60 cm.', 'Bể có đáy 60 cm x 30 cm.']), card, page)).toEqual([])
  expect(checkNumbers(draft('Tránh nuôi chung với cá dưới 2 cm.'), card, page)).toEqual(['"2 cm" is not the card\'s adult size (3,5 cm)'])
  expect(checkNumbers(draft('Hạ mực nước thấp hơn miệng 5 cm.'), card, page + ' 5 cm')).toEqual(['"5 cm" is neither the card\'s adult size (3,5 cm) nor its minimum tank (60 cm)'])
  // A card without that field: no figure for it at all, even one the page text gives.
  expect(checkNumbers(draft('Cá lớn tới 5 cm, bể 75 cm, nước 23–29 °C.'), {}, page + ' Cá dài 5 cm. Bể 75 cm.')).toEqual([
    '"23–29 °C": the card gives no temperature',
    '"5 cm": the card gives no adult size',
    '"75 cm": the card gives no minimum tank',
  ])
})

test('a number written nowhere on the page is invented: worked-out litres, conversions, rounding', () => {
  expect(checkNumbers(draft('Bể 60 × 30 × 30 cm là khoảng 54 lít, tức 14 gallon.'), card, page)).toEqual(['the number "14" is in neither the page text nor the data card'])
  expect(checkNumbers(draft('Thay 25% nước mỗi tuần.'), card, page)).toEqual(['the number "25" is in neither the page text nor the data card'])
})

test('reference lists (years, page numbers) are not the page saying a number', async () => {
  const c = await loadAll({ root: await content(), lang: 'vi', publicBuild: false })
  const neon = c.species.find(s => s.id === 'paracheirodon-innesi')!
  expect(profile(neon)).toContain('2005') // the writer sees the references
  expect(checkNumbers(draft('Mô tả năm 2005, cá đàn hiền lành.'), cardOf(neon), pageText(neon))).toEqual(['the number "2005" is in neither the page text nor the data card'])
})

test('the prompt shows the card as the page does, Vietnamese decimals', () => {
  expect(cardBlock(card)).toContain('- pH: 4,6–6,2')
  expect(cardBlock(card)).toContain('- Kích thước trưởng thành: 3,5 cm')
  expect(cardBlock(card)).toContain('- Độ khó: 2/8')
  expect(cardBlock({})).toContain('(trống)')
})

type Call = { prompt: string; schema: { properties?: Record<string, unknown> } }
const isCheck = (a: Call) => 'pass' in (a.schema.properties ?? {})
/** A fake model: drafts with `write(prompt)`, checks with `verdict(prompt)`. */
function fake(write: (prompt: string) => object, verdict: (prompt: string) => object = () => ({ pass: true, problems: [] })) {
  const calls: Call[] = []
  const llm = async <T,>(a: Call) => { calls.push(a); return (isCheck(a) ? verdict(a.prompt) : write(a.prompt)) as T }
  return { llm, calls }
}
// Numbers in the fixture text and cards: none here, so no draft trips the number check by accident.
const OK = { summary: 'Hợp với bể cộng đồng nhỏ, nước mềm, cần nuôi theo đàn.', mistakes: ['Thả đơn lẻ: nên nuôi theo đàn để cá bớt nhát.'] }

test('every published species, indexable or not, the ones readers look for first; checked drafts are approved', async () => {
  const root = await content()
  const { llm, calls } = fake(() => OK)
  const r = await draftSummaries(root, llm, { top: 100, now, publicBuild: false })
  // Staples first (neon, cardinal, discus, angelfish, cherry shrimp, ram), then the most-kept fish, then the rest.
  expect(r.approved.slice(0, 6)).toEqual(['paracheirodon-innesi', 'paracheirodon-axelrodi', 'symphysodon-aequifasciatus', 'pterophyllum-scalare', 'neocaridina-davidi', 'mikrogeophagus-ramirezi'])
  expect(r.approved).toContain('boraras-brigittae') // below the indexing bar, still a page readers open
  expect(r.approved.length).toBe(9)
  expect(r).toMatchObject({ pending: [], failed: [], stopped: '' })
  const first = calls.find(c => !isCheck(c))!.prompt
  expect(first).toContain('Chỉ dùng thông tin có trong hồ sơ')
  expect(first).toContain('THẺ DỮ LIỆU')
  expect(first).not.toMatch(/<p>/)
  expect(calls.find(isCheck)!.prompt).toContain('SUMMARY:')
  expect((await readSummaries(root)).every(s => s.review === 'approved' && !s.problems)).toBe(true)
  // Unchanged pages are not done again.
  expect((await draftSummaries(root, llm, { top: 100, now, publicBuild: false })).approved).toEqual([])
})

test('a draft the check fails is written once more with the problems as notes', async () => {
  const root = await content()
  let n = 0
  const { llm, calls } = fake(() => OK, () => (n++ === 0 ? { pass: false, problems: ['"cần nuôi theo đàn" is not on the page'] } : { pass: true, problems: [] }))
  const r = await draftSummaries(root, llm, { top: 1, now, publicBuild: false })
  expect(r.approved).toEqual(['paracheirodon-innesi'])
  expect(calls.length).toBe(4) // draft, check, redraft, check
  expect(calls[2]!.prompt).toContain('Lỗi phải sửa:\n- "cần nuôi theo đàn" is not on the page')
})

test('a draft with a number off the card skips the model check and goes back; still wrong, it stays pending with the problems', async () => {
  const root = await content()
  const { llm, calls } = fake(() => ({ ...OK, summary: 'Hợp với bể cộng đồng, nước 10–40 °C, nuôi theo đàn.' }))
  const r = await draftSummaries(root, llm, { top: 1, now, publicBuild: false })
  expect(calls.length).toBe(2) // draft, redraft: the number check failed both, no model check
  expect(r.approved).toEqual([])
  expect(r.pending).toEqual([{ id: 'paracheirodon-innesi', problems: ['"10–40 °C" is not the card\'s temperature (20–26 °C)'] }])
  const [s] = await readSummaries(root)
  expect(s).toMatchObject({ id: 'paracheirodon-innesi', review: 'pending', problems: r.pending[0]!.problems })
  const doc = await reviewDoc(root, false)
  expect(doc).toContain('id: `paracheirodon-innesi`')
  expect(doc).toContain('- "10–40 °C" is not the card\'s temperature (20–26 °C)')
  // Its page hasn't changed: not tried again every run.
  expect((await draftSummaries(root, llm, { top: 1, now, publicBuild: false })).pending.map(p => p.id)).toEqual(['paracheirodon-axelrodi'])
  // The owner can still approve it by hand; the check's problems go with the pending state.
  expect(await approveSummaries(root, ['paracheirodon-innesi'])).toEqual(['paracheirodon-innesi'])
  const approved = JSON.parse(await readFile(join(root, 'summaries', 'paracheirodon-innesi.json'), 'utf8'))
  expect(approved.review).toBe('approved')
  expect(approved.problems).toBeUndefined()
  expect(await reviewDoc(root, false)).not.toContain('id: `paracheirodon-innesi`')
})

test('a pending draft from before the check is checked; a changed page is done again', async () => {
  const root = await content()
  const { llm } = fake(() => OK)
  await draftSummaries(root, llm, { top: 2, now, publicBuild: false })
  const file = join(root, 'summaries', 'paracheirodon-innesi.json')
  const s = JSON.parse(await readFile(file, 'utf8'))
  await writeFile(file, JSON.stringify({ ...s, review: 'pending' }))
  await writeFile(join(root, 'summaries', 'paracheirodon-axelrodi.json'), JSON.stringify({ ...s, id: 'paracheirodon-axelrodi', speciesUpdatedAt: '2026-01-01' }))
  expect((await draftSummaries(root, llm, { top: 100, now, publicBuild: false })).approved.slice(0, 2)).toEqual(['paracheirodon-innesi', 'paracheirodon-axelrodi'])
})

test('--only redoes the given species, whatever their state', async () => {
  const root = await content()
  const { llm } = fake(() => OK)
  await draftSummaries(root, llm, { top: 100, now, publicBuild: false })
  const later = () => new Date('2026-11-01T00:00:00Z')
  const r = await draftSummaries(root, llm, { top: 100, now: later, publicBuild: false, only: ['danio-margaritatus', 'paracheirodon-axelrodi'] })
  expect(r.approved).toEqual(['paracheirodon-axelrodi', 'danio-margaritatus']) // reading order, not the order given
  expect((await readSummaries(root)).filter(s => s.generatedAt.startsWith('2026-11-01')).map(s => s.id).sort()).toEqual(['danio-margaritatus', 'paracheirodon-axelrodi'])
})

test('bad model output fails that species, nothing written; a failed model call stops the run', async () => {
  const root = await content()
  const bad = await draftSummaries(root, async <T,>() => ({ summary: 'x' }) as T, { top: 1, now, publicBuild: false })
  expect(bad).toMatchObject({ approved: [], failed: ['paracheirodon-innesi'] })
  expect(await readSummaries(root)).toEqual([])
  let n = 0
  const r = await draftSummaries(root, async <T,>(a: Call) => { if (++n > 4) throw new LlmError('usage limit'); return (isCheck(a) ? { pass: true, problems: [] } : OK) as T }, { top: 100, now, publicBuild: false, jobs: 1 })
  expect(r.approved).toEqual(['paracheirodon-innesi', 'paracheirodon-axelrodi'])
  expect(r.stopped).toBe('symphysodon-aequifasciatus: usage limit')
  expect((await readSummaries(root)).map(s => s.id).sort()).toEqual(['paracheirodon-axelrodi', 'paracheirodon-innesi'])
})

test('jobs run species side by side and finish them all', async () => {
  const root = await content()
  let open = 0
  let most = 0
  const llm = async <T,>(a: Call) => { most = Math.max(most, ++open); await new Promise(r => setTimeout(r, 5)); open--; return (isCheck(a) ? { pass: true, problems: [] } : OK) as T }
  const r = await draftSummaries(root, llm, { top: 100, now, publicBuild: false, jobs: 4 })
  expect(r.approved.length).toBe(9)
  expect(most).toBe(4)
})
