import { expect, test, vi as vitest } from 'vitest'
import { translator } from '../src/lib/i18n'
import { errorText, genusHtml, guessHtml, hasGuesses, own, sure, verdictLine, type Answer, type Result } from '../src/scripts/fish-id-client'
import { guessEntry } from '../src/scripts/life-photo'

// The fish-ID tool's client, shared by its page and the "Bể của tôi" editor (src/scripts/fish-id-client.ts). Its modules
// read the page's translations as they load (reader-photos.ts): here, a page with none.
vitest.hoisted(() => { (globalThis as { document?: unknown }).document ??= { getElementById: () => null } })
const vi = translator('vi')
const guess = (r: Partial<Result> = {}): Result => ({ scientificName: 'Paracheirodon innesi', commonName: 'Neon tetra', variety: null, confidence: 0.9, reason: '', ...r })

test('confidence in words, never a number: each band from its lower edge', () => {
  expect([0.95, 0.8, 0.79, 0.55, 0.54, 0.3, 0.29, 0].map(c => sure(vi, c))).toEqual(['Gần như chắc chắn', 'Gần như chắc chắn', 'Khá giống', 'Khá giống', 'Có thể', 'Có thể', 'Ít khả năng', 'Ít khả năng'])
  expect(sure(translator('id'), 0.9)).toBe('Hampir pasti')
})

test('a failed identification says why: the reader\'s limit (from the answer, else the tool\'s), off, resting; anything else is "try later"', () => {
  const off = 'Tắt.'
  expect(errorText(vi, 'rate', 5, 10, off)).toBe('Bạn đã dùng hết 5 lượt nhận diện hôm nay. Quay lại ngày mai nhé.')
  expect(errorText(vi, 'rate', undefined, 10, off)).toBe('Bạn đã dùng hết 10 lượt nhận diện hôm nay. Quay lại ngày mai nhé.')
  expect(errorText(vi, 'fish_id_off', undefined, 10, off)).toBe(off)
  expect(errorText(vi, 'resting', undefined, 10, off)).toBe('Công cụ đang tạm nghỉ. Bạn quay lại sau vài giờ nhé.')
  expect(errorText(vi, 'busy', undefined, 10, off)).toBe('Hôm nay công cụ đã hết lượt cho mọi người. Quay lại ngày mai nhé.')
  for (const e of ['failed', 'constructor', undefined]) expect(errorText(vi, e, undefined, 10, off)).toBe('Chưa nhận diện được lúc này. Thử lại sau ít phút nhé.')
  expect(errorText(translator('th'), 'rate', 10, 10, off)).not.toBe(errorText(vi, 'rate', 10, 10, off))
})

test('the line before the guesses: not a fish, nothing to name, only a guess; none for a clear answer', () => {
  const a = (verdict: Answer['verdict'], results: Result[]): Answer => ({ verdict, results })
  expect(verdictLine(vi, a('other', []))).toMatch(/^Ảnh này có vẻ không có cá/)
  expect(hasGuesses(a('other', [guess()]))).toBe(false)
  expect(verdictLine(vi, a('unclear', []))).toMatch(/^Chưa nhìn rõ để nhận diện/)
  expect(hasGuesses(a('fish', []))).toBe(false)
  expect(verdictLine(vi, a('unclear', [guess()]))).toMatch(/^Ảnh chưa rõ lắm, đây chỉ là phỏng đoán/)
  expect(verdictLine(vi, a('fish', [guess()]))).toBe('')
  expect(hasGuesses(a('fish', [guess()]))).toBe(true)
})

test('a guess is inert HTML: Claude\'s words are text; only this site\'s pages and our photo host\'s https photos', () => {
  const html = guessHtml(vi, guess({ scientificName: '<b>x</b>', variety: '"><img src=x>', reason: '<script>alert(1)</script>', page: { id: 'x', name: 'n', img: 'javascript:alert(1)' } }), 'Tên', '')
  expect(html).not.toMatch(/<script|<b>|<img/)
  expect(html).toContain('&lt;script&gt;')
  expect(html).toContain('<li class="hit">')
  expect(guessHtml(vi, guess({ page: { id: 'x', name: 'n', img: 'https://media.example/p.jpg' } }), 'Tên', '')).toContain('<img src="https://media.example/p.jpg"')
  expect(guessHtml(vi, guess(), 'Tên', '<p>thêm</p>')).toMatch(/^<li class="miss"><div><span class="sure">Gần như chắc chắn<\/span><h3>Tên<\/h3>.*<p>thêm<\/p><\/div><\/li>$/)
  // Fish ID's answers name Vietnamese pages in the apps' /vi/ form: the page links their address (the root).
  expect(['/vi/ca/x/', '/ca/x/', '/id/ikan/x/', '/th/fish/x/'].map(own)).toEqual(['/ca/x/', '/ca/x/', '/id/ikan/x/', '/th/fish/x/'])
  expect(['javascript:alert(1)', '//evil.test/vi/', 'https://evil.test/vi/', '/en/x/', '/_ab/', undefined].map(own)).toEqual([undefined, undefined, undefined, undefined, undefined, undefined])
  // Dropping /vi must not leave another site's address: "//evil.test/", or "/\evil.test/", which a browser reads the same way.
  expect(['/vi//evil.test/', '/vi/\\evil.test/', '/vi///evil.test/'].map(own)).toEqual([undefined, undefined, undefined])
})

test('"not this one?": the genus\'s other pages in a closed list, its genus the matched page\'s, in italics; none without any', () => {
  const sib = [{ id: 'betta-macrostoma', kind: 'species' as const, name: 'Cá betta Brunei', sci: 'Betta macrostoma', url: '/vi/ca/ca-betta-macrostoma/' }, { id: 'b', name: '<b>x</b>' }]
  const item = (l: { name: string }) => l.name
  const matched = genusHtml(vi, guess({ scientificName: 'Betta splendens', page: { id: 'betta-splendens', name: 'Cá betta', sci: 'Betta splendens' }, sameGenus: sib }), item)
  expect(matched).toMatch(/^<details class="genus"><summary>Không phải\? 2 loài <i>Betta<\/i> khác trong cẩm nang<\/summary><ul><li>Cá betta Brunei<\/li>/)
  // A former name matched: the list is of the page's genus, and says so.
  expect(genusHtml(vi, guess({ scientificName: 'Corydoras panda', page: { id: 'p', name: 'Cá chuột panda', sci: 'Hoplisoma panda' }, sameGenus: sib }), item)).toContain('<i>Hoplisoma</i>')
  expect(genusHtml(vi, guess({ scientificName: 'Betta sp. <x>', sameGenus: sib }), item)).toContain('<summary>2 loài <i>Betta</i> có trong cẩm nang</summary>')
  expect(genusHtml(translator('id'), guess({ scientificName: 'Betta splendens', page: { id: 'x', name: 'n' }, sameGenus: sib }), item)).toContain('Bukan? 2 spesies <i>Betta</i> lain di panduan')
  expect(genusHtml(vi, guess({ sameGenus: [] }), item)).toBe('')
  expect(genusHtml(vi, guess(), item)).toBe('')
})

test('a guess without a page fills in the "Thêm …" form: fish unless the photo is of a plant, its common name, its scientific name; cut to what the form holds', () => {
  expect(guessEntry(guess(), 'fish')).toEqual({ kind: 'fish', name: 'Neon tetra', sci: 'Paracheirodon innesi' })
  expect(guessEntry(guess(), 'unclear')).toEqual({ kind: 'fish', name: 'Neon tetra', sci: 'Paracheirodon innesi' })
  expect(guessEntry(guess({ commonName: '', scientificName: ' Bucephalandra sp. ' }), 'plant')).toEqual({ kind: 'plant', name: 'Bucephalandra sp.', sci: 'Bucephalandra sp.' })
  const long = guessEntry(guess({ commonName: 'a'.repeat(100), scientificName: 'b'.repeat(130) }), 'fish')
  expect([long.name.length, long.sci.length]).toEqual([80, 120])
})
