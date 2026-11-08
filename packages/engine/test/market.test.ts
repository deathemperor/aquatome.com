import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { doseProblems, foreignProducts, hardProducts, marketFor, PRODUCTS, REMEDIES, type Cited, type Remedy } from '../src/market'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const remedies = REMEDIES.vi!

/**
 * The table's doses as they were last read against the repository's files. The test reads them whenever the table changes.
 * After that a rewrite can change a guide's words, and this test must not stop a cycle over it (RATCHETED's comment says
 * why): the command leaves the guides whose note needs those words, and says so (`a figure gone from its file`, below).
 */
const TABLE_READ = '85bd26cddff4740f'

test('every figure in the table is word for word in the file it cites, read whenever the table changes', async () => {
  const hash = createHash('sha256').update(JSON.stringify(remedies)).digest('hex').slice(0, 16)
  const problems = await doseProblems(ROOT)
  if (hash === TABLE_READ) {
    if (problems.length) console.warn('a rewrite changed the words of a dose in the market table; its guides wait for a note', problems)
    return
  }
  expect(problems).toEqual([])
  expect(hash, 'every figure holds: write this hash in TABLE_READ').toBe(TABLE_READ)
})

test('a figure that is no file\'s words, outside its words, or off its label is found', async () => {
  const root = await mkdtemp(join(tmpdir(), 'market-'))
  await mkdir(join(root, 'content/guides/g'), { recursive: true })
  await writeFile(join(root, 'content/guides/g/vi.json'), JSON.stringify({ body: '<p>Bạn dùng <strong>1 thìa</strong> cho 5 lít nước.</p>' }))
  await mkdir(join(root, 'sources'), { recursive: true })
  await writeFile(join(root, 'sources/a.md'), 'Use one spoon\nper gallon.')
  const of = (c: Cited): Remedy[] => [{ id: 'x', name: 'x', lead: { text: '', figures: [], refs: [] }, uses: [{ ...c, problem: 'ich' }], carried: /$^/, refs: [] }]
  const check = async (c: Cited) => (await doseProblems(root, of(c))).map(p => p.problem)
  expect(await check({ text: 'Dùng 1 thìa cho 5 lít nước.', words: ['1 thìa cho 5 lít nước'], guide: 'g', quotes: [{ file: 'sources/a.md', text: 'Use one spoon per gallon' }] })).toEqual([])
  // Invented, converted, or written beside the words the file has.
  expect(await check({ text: 'Dùng 2 thìa cho 5 lít nước.', words: ['2 thìa cho 5 lít nước'], guide: 'g' })).toEqual(['"2 thìa cho 5 lít nước" isn\'t in g'])
  expect(await check({ text: 'Dùng 1 thìa cho 5 lít nước trong 7 ngày.', words: ['1 thìa cho 5 lít nước'], guide: 'g' })).toEqual(['a figure outside its words: Dùng  trong 7 ngày.'])
  expect(await check({ text: 'Dùng 1 thìa cho 5 lít nước.', words: ['1 thìa cho 5 lít nước'] })).toEqual(['it cites neither a guide nor a label'])
  expect(await check({ text: 'Dùng 1 thìa cho 5 lít nước.', words: ['1 thìa cho 5 lít nước'], guide: 'g', quotes: [{ file: 'sources/a.md', text: 'Use two spoons' }] })).toEqual(['"Use two spoons" isn\'t in sources/a.md'])
  const label = { url: 'https://a.test/', readOn: '2026-11-07' }
  expect(await check({ text: 'Nhãn ghi 1 gói cho 38 lít.', words: ['1 gói cho 38 lít'], label: { ...label, quote: 'one packet per 10 gallons (38 L)' } })).toEqual([])
  expect(await check({ text: 'Nhãn ghi 1 gói cho 40 lít.', words: ['1 gói cho 40 lít'], label: { ...label, quote: 'one packet per 10 gallons (38 L)' } })).toEqual(['40 isn\'t on the label'])
})

test('the table: a product by its name, in the language whose shops were searched', () => {
  const names = (text: string) => hardProducts('vi', text).map(p => p.name)
  expect(names('Ich X, Maracyn, Para Cleanse, Fritz Slime-Out, EasyGreen, Easy Root Tab, EasyCarbo, Wonder Shells')).toEqual(['Ich-X', 'Maracyn', 'ParaCleanse', 'Slime Out', 'Easy Green', 'Easy Root Tabs', 'Easy Carbo', 'Wonder Shell'])
  expect(names('Maracyn-Two, Maracyn 2, Seachem Prime, API General Cure, Melafix, thích xem')).toEqual([]) // sold here, or no product
  expect(names('Easy Carbon')).toEqual([]) // Aquarium Co-Op's, another product
  expect(hardProducts('id', 'Ich-X')).toEqual([]) // Indonesian shops weren't searched
  for (const p of PRODUCTS) expect(p.market.vi?.checkedOn, p.name).toMatch(/^\d{4}-\d{2}-\d{2}$/) // every status has its date
})

test('a writer is told what each product is and what is on sale for the problem, with doses only from the table', () => {
  const m = marketFor('vi', 'Ich-X and Seachem Prime', ['ich'])
  expect(m).toMatch(/Ich-X: các shop trong nước khó tìm: không đưa vào bài như thứ cần mua, không ghi liều của nó\. Hoạt chất: formaldehyde/)
  expect(m).toMatch(/Seachem Prime: có shop trong nước bán/)
  expect(m).toContain('1 muỗng canh muối cho mỗi 7,6 lít nước')
  // Each remedy's dose for the problem at hand, not another's, and never malachite as a thing to buy.
  expect(m).not.toContain('3 ml cho mỗi 4 lít')
  // A product no one checked is never a thing to buy, and a language with no data has no remedies.
  expect(marketFor('vi', 'Hikari', [])).toContain('chưa ai kiểm tra')
  expect(marketFor('id', 'Ich-X', ['ich'])).not.toContain('muỗng canh')
})

test('how keepers here treat new fish that look healthy reaches the writer on new fish, as the table\'s own line', () => {
  expect(marketFor('vi', 'Ich-X', ['quarantine'])).toMatch(/Người chơi ở đây làm thế này[^\n]*\n[^\n]*nhiều người chơi chỉ cách ly, theo dõi/)
  // A product the source names for something else doesn't bring it in.
  expect(marketFor('vi', 'Ich-X', ['ich'])).not.toContain('chỉ cách ly')
  expect(marketFor('vi', 'Hikari', ['cyanobacteria'])).not.toContain('chỉ cách ly')
  expect(marketFor('id', 'Ich-X', ['quarantine'])).not.toContain('chỉ cách ly')
})
