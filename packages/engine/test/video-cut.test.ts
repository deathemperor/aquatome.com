import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { fitKey, fitText, type FitCheck, type FitState } from '../src/fit'
import { loadPages } from '../src/pages'
import { applyCut, climate, leans, swapOf, VIDEO_CUT_FILE, videoCut } from '../src/video-cut'

const FIXTURE = new URL('../../../apps/site/test/fixture-content', import.meta.url).pathname
const GUIDE = 'content/guides/youtube-r53ZQW0m8VM/vi.json'
const KEY = 'vi/guides/youtube-r53ZQW0m8VM'
const now = () => new Date('2026-11-16T18:00:00+07:00')

/** A paragraph long enough that a one-sentence cut takes well under a tenth of the guide's words. */
const LONG =
  '<p>Cây thủy sinh cần đủ ánh sáng, khí CO2 và chất dinh dưỡng thì mới lên đều. Khi thiếu một trong ba thứ, cây chậm lớn, ' +
  'lá vàng hoặc bị rêu bám. Phân nước cung cấp đạm, lân, kali và vi lượng như sắt. Phân nền nằm dưới lớp sỏi và nuôi rễ ' +
  'của những loài cây ăn rễ mạnh. Bể có đèn mạnh và châm CO2 thì cây dùng phân nhanh hơn, nên cần châm đều hơn. Bể ít ' +
  'đèn thì châm ít lại để tránh thừa, vì phân thừa là thức ăn của rêu.</p>'

type Said = { check: FitCheck; quote: string; field?: string; fix?: string }
/** The fixture content with the guide held for `checks`, its text `body`, and a saved read finding `said` in it. */
async function held(body: string, said: Said[], o: { checks?: string[]; summary?: string[]; stale?: boolean; bodyFixed?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'video-cut-'))
  await cp(FIXTURE, join(root, 'content'), { recursive: true })
  await mkdir(join(root, 'engine-state'))
  const t = JSON.parse(await readFile(join(root, GUIDE), 'utf8'))
  const checks = o.checks ?? [...new Set(said.filter(x => x.check !== 'words').map(x => x.check))]
  await writeFile(join(root, GUIDE), `${JSON.stringify({ ...t, body, summary: o.summary ?? [], faq: [], ...(o.bodyFixed ? { bodyFixed: true } : {}), held: { checks, at: '2026-11-09' } }, null, 2)}\n`)
  const p = (await loadPages(join(root, 'content'), ['vi'])).find(x => x.id === 'youtube-r53ZQW0m8VM')!
  const { parts, hash } = fitText(p)
  const part = (field = 'body') => parts.find(x => x.field === field)!.id
  const findings = said.map(x => ({ check: x.check, part: part(x.field), quote: x.quote, why: `${x.check}: why`, ...(x.fix ? { fix: x.fix } : {}), by: 'model' as const }))
  const state: FitState = { [fitKey(p)]: { at: '2026-11-09', hash: o.stale ? 'old' : hash, model: 'm', products: [], findings, checklist: 3 } }
  await writeFile(join(root, 'engine-state/_fit.json'), `${JSON.stringify(state)}\n`)
  return root
}
const file = async (root: string) => JSON.parse(await readFile(join(root, GUIDE), 'utf8'))
const kept = async (root: string) => JSON.parse(await readFile(join(root, VIDEO_CUT_FILE), 'utf8'))

test('a held video guide has each sentence its read names as the source talking cut whole, and the sentence kept on the list', async () => {
  const body = `<p>Cây cần phân đều đặn để lên đẹp.</p><p>Bể ở đây chạy hơn ba năm. Phân nền giúp rễ khỏe.</p>${LONG}`
  const root = await held(body, [{ check: 'source', quote: 'Bể ở đây chạy hơn ba năm' }])
  const r = await videoCut(root, { now })
  expect(r.left).toEqual([])
  expect(r.cut.map(c => c.key)).toEqual([KEY])
  const t = await file(root)
  expect(t.body).toBe(`<p>Cây cần phân đều đặn để lên đẹp.</p><p>Phân nền giúp rễ khỏe.</p>${LONG}`)
  // The gate, last in the run, reads it again and lets it out: the cut doesn't.
  expect(t.held).toEqual({ checks: ['source'], at: '2026-11-09' })
  const list = await kept(root)
  expect(list[KEY]).toHaveLength(1)
  expect(list[KEY][0]).toMatchObject({ at: now().toISOString(), cuts: [{ field: 'body', before: 'Cây cần phân đều đặn để lên đẹp.', html: 'Bể ở đây chạy hơn ba năm.', check: 'source', quote: 'Bể ở đây chạy hơn ba năm' }] })
})

test('the list is only added to: a later cut of a guide goes after what was kept, and other guides\' entries stay', async () => {
  const root = await held(`<p>Bể ở đây chạy hơn ba năm. Phân nền giúp rễ khỏe.</p>${LONG}`, [{ check: 'source', quote: 'Bể ở đây chạy hơn ba năm' }])
  const before = { [KEY]: [{ at: 'earlier', read: 'r0', cuts: [], swaps: [], emptied: [] }], 'vi/guides/youtube-other': [{ at: 'earlier', read: 'r1', cuts: [], swaps: [], emptied: [] }] }
  await writeFile(join(root, VIDEO_CUT_FILE), JSON.stringify(before))
  await videoCut(root, { now })
  const list = await kept(root)
  expect(list['vi/guides/youtube-other']).toEqual(before['vi/guides/youtube-other'])
  expect(list[KEY].map((x: { at: string }) => x.at)).toEqual(['earlier', now().toISOString()])
})

test('a dry run writes nothing', async () => {
  const body = `<p>Bể ở đây chạy hơn ba năm. Phân nền giúp rễ khỏe.</p>${LONG}`
  const root = await held(body, [{ check: 'source', quote: 'Bể ở đây chạy hơn ba năm' }])
  const r = await videoCut(root, { now, dryRun: true })
  expect(r.cut).toHaveLength(1)
  expect((await file(root)).body).toBe(body)
  await expect(readFile(join(root, VIDEO_CUT_FILE), 'utf8')).rejects.toThrow()
})

test('a words finding has its fix put in where it is a term for the term quoted, and a writer\'s instructions are left', async () => {
  const body = `<p>Châm phân nước mỗi tuần một lần. Bể ở đây chạy hơn ba năm. Lọc trong chạy êm.</p>${LONG}`
  const root = await held(body, [
    { check: 'source', quote: 'Bể ở đây chạy hơn ba năm' },
    { check: 'words', quote: 'Lọc trong', fix: 'lọc chìm' },
    { check: 'words', quote: 'mỗi tuần', fix: '"hằng tuần", hoặc nói thẳng' },
  ])
  const r = await videoCut(root, { now })
  expect(r.cut[0]!.swaps).toEqual([{ field: 'body', quote: 'Lọc trong', fix: 'Lọc chìm' }])
  expect(r.cut[0]!.unswapped).toHaveLength(1)
  expect((await file(root)).body).toBe(`<p>Châm phân nước mỗi tuần một lần. Lọc chìm chạy êm.</p>${LONG}`)
})

test('a guide is left as it is, and listed, where a cut could break it or a person waits on it', async () => {
  const src = (quote: string) => [{ check: 'source' as const, quote }]
  const cases: [string, Promise<string>, string][] = [
    ['a dose finding', held(`<p>Bể ở đây chạy hơn ba năm.</p>${LONG}`, src('Bể ở đây chạy hơn ba năm'), { checks: ['source', 'dose'] }), 'waits for a person: dose'],
    ['fixed by hand', held(`<p>Bể ở đây chạy hơn ba năm.</p>${LONG}`, src('Bể ở đây chạy hơn ba năm'), { bodyFixed: true }), 'fixed by hand'],
    ['a read of other text', held(`<p>Bể ở đây chạy hơn ba năm.</p>${LONG}`, src('Bể ở đây chạy hơn ba năm'), { stale: true }), 'no saved read'],
    ['a pronoun after the cut', held(`<p>Bể ở đây dùng sưởi Dennerle rất gọn. Nó chỉ chạy ở một mức 25 °C.</p>${LONG}`, src('Bể ở đây dùng sưởi Dennerle rất gọn'), {}), 'reads on from it'],
    ['a unit before a full stop', held(`<p>Bể ở đây dùng sưởi 50 W. Sưởi nên đặt gần chỗ nước chảy.</p>${LONG}`, src('Bể ở đây dùng sưởi 50 W'), {}), 'runs on into the next'],
    ['the cut\'s own thing named again', held(`<p>Có thể kê bể lên tủ IKEA. Tủ này dài 120 cm.</p>${LONG}`, [{ check: 'elsewhere', quote: 'Có thể kê bể lên tủ IKEA' }]), 'reads on from it'],
    ['a count announced before the cut', held(`<p>Cá sống ngoài hồ quanh năm nhờ hai điều. Hồ ở đây có thác chảy suốt.</p>${LONG}`, src('Hồ ở đây có thác chảy suốt')), 'opens it'],
    ['a colon before the cut', held(`<p>Bể ở đây dùng:</p><p>Đèn của tiệm ở đây.</p>${LONG}`, src('Đèn của tiệm ở đây')), 'opens it'],
    ['a climate condition', held(`<p>Hồ đủ sâu thì nước không đóng băng hết, cá nằm im qua mùa đông.</p>${LONG}`, [{ check: 'elsewhere', quote: 'Hồ đủ sâu thì nước không đóng băng hết' }]), 'climate'],
    ['a dose beside it', held(`<p>Bể ở đây chạy ba năm. Châm 1 ml cho mỗi 40 lít nước.</p>${LONG}`, src('Bể ở đây chạy ba năm')), 'a dose in the paragraph'],
    ['a quote across two sentences', held(`<p>Bể ở đây chạy ba năm. Cây lên rất đẹp.</p>${LONG}`, src('chạy ba năm. Cây lên')), 'across two sentences'],
    ['more than a tenth of its words', held('<p>Bể ở đây chạy hơn ba năm rồi. Cây cần phân đều đặn để lên đẹp.</p>', src('Bể ở đây chạy hơn ba năm rồi')), 'of its words'],
  ]
  for (const [name, root, why] of cases) {
    const r = await videoCut(await root, { now })
    expect(r.cut, name).toEqual([])
    expect(r.left.join(' | '), name).toContain(why)
    await expect(readFile(join(await root, VIDEO_CUT_FILE), 'utf8'), name).rejects.toThrow()
  }
})

test('a kept sentence leans on a cut one when it opens with a pronoun, or names again what the cut named', () => {
  expect(leans('Nó chỉ chạy ở một mức.')).toBe(true)
  expect(leans('Chúng thích nước mát.')).toBe(true)
  expect(leans('Vì vậy bể chuyển sang sủi.')).toBe(true)
  expect(leans('Tủ này dài 120 cm.', 'Có thể kê bể lên tủ IKEA.')).toBe(true)
  // The guide itself, a question, something unnamed, and a thing the cut never named.
  expect(leans('Bài này đi lần lượt từng bước.', 'Bài viết của tiệm.')).toBe(false)
  expect(leans('Thả cá thế nào cho đúng', '')).toBe(false)
  expect(leans('Muốn thử một con gì đó mới thì chọn cá cờ.')).toBe(false)
  expect(leans('Bể này dài 60 cm.', 'Hồ ở đây chạy ba năm.')).toBe(false)
})

test('a climate is a season, frost or the tropics, and not a room\'s temperature or a cedar board', () => {
  expect(climate('Cây nhiệt đới cho mùa hè nên đợi thời tiết ổn định.')).toBe(true)
  expect(climate('Hồ không đóng băng hết.')).toBe(true)
  expect(climate('Phòng có sưởi, nhiệt độ phòng khoảng 21 °C.')).toBe(false)
  expect(climate('Ván gỗ tuyết tùng khá rẻ.')).toBe(false)
})

test('a swap is a term for a term: a fix with choices, commas or what to say is a writer\'s', () => {
  expect(swapOf('Lọc trong', 'lọc chìm')).toBe('Lọc chìm')
  expect(swapOf('lọc trong', 'lọc chìm')).toBe('lọc chìm')
  expect(swapOf('nhưng', '"nhưng", "tuy nhiên"')).toBeUndefined()
  expect(swapOf('mỗi tuần', 'hằng tuần hoặc nói thẳng')).toBeUndefined()
  expect(swapOf('Van điện (solenoid) để tắt CO2 vào ban đêm', 'van điện từ')).toBeUndefined()
})

test('a summary point or an answer a cut empties goes, its question with it', () => {
  const t = { summary: ['Bể ở đây chạy ba năm.', 'Châm đều.'], faq: [{ q: 'Bao lâu?', a: 'Ba năm.' }, { q: 'Bao nhiêu?', a: '1 lần.' }] }
  expect(applyCut(t, { changes: [{ field: 'summary.0', old: 'Bể ở đây chạy ba năm.', now: '' }, { field: 'faq.0.a', old: 'Ba năm.', now: '' }], emptied: [] })).toEqual({ summary: ['Châm đều.'], faq: [{ q: 'Bao nhiêu?', a: '1 lần.' }] })
})
