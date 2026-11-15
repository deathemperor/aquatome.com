import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { fitKey, fitText, type FitCheck, type FitState } from '../src/fit'
import { loadPages } from '../src/pages'
import { applyCut, leans, swapOf, VIDEO_CUT_FILE, videoCut } from '../src/video-cut'

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
  expect(Object.keys(list)).toEqual([`${KEY} ${now().toISOString()}`])
  expect(list[`${KEY} ${now().toISOString()}`]).toMatchObject({ key: KEY, at: now().toISOString(), cuts: [{ field: 'body', before: 'Cây cần phân đều đặn để lên đẹp.', html: 'Bể ở đây chạy hơn ba năm.', check: 'source', quote: 'Bể ở đây chạy hơn ba năm' }] })
})

test('the list is only added to, an entry a guide and run, and a guide on it already is not cut again', async () => {
  const other = { 'vi/guides/youtube-other 2026-11-16T08:00:00.000Z': { key: 'vi/guides/youtube-other', at: '2026-11-16T08:00:00.000Z', read: 'r1', cuts: [], swaps: [], emptied: [] } }
  const body = `<p>Bể ở đây chạy hơn ba năm. Phân nền giúp rễ khỏe.</p>${LONG}`
  const root = await held(body, [{ check: 'source', quote: 'Bể ở đây chạy hơn ba năm' }])
  await writeFile(join(root, VIDEO_CUT_FILE), JSON.stringify(other))
  await videoCut(root, { now })
  const list = await kept(root)
  expect(Object.keys(list).sort()).toEqual([...Object.keys(other), `${KEY} ${now().toISOString()}`].sort())
  expect(list['vi/guides/youtube-other 2026-11-16T08:00:00.000Z']).toEqual(other['vi/guides/youtube-other 2026-11-16T08:00:00.000Z'])
  // Once cut, a guide is the mend's: a second cut could take another tenth.
  const again = await held(body, [{ check: 'source', quote: 'Bể ở đây chạy hơn ba năm' }])
  await writeFile(join(again, VIDEO_CUT_FILE), JSON.stringify({ [`${KEY} earlier`]: { key: KEY, at: 'earlier', read: 'r0', cuts: [], swaps: [], emptied: [] } }))
  const r = await videoCut(again, { now })
  expect(r.cut).toEqual([])
  expect(r.left).toEqual([`${KEY}: cut once already`])
  expect((await file(again)).body).toBe(body)
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

test('a guide is left as it is, and listed, where a cut could break it, take a step, or a person waits on it', async () => {
  const src = (quote: string) => [{ check: 'source' as const, quote }]
  const cases: [string, Promise<string>, string][] = [
    ['a dose finding', held(`<p>Bể ở đây chạy hơn ba năm.</p>${LONG}`, src('Bể ở đây chạy hơn ba năm'), { checks: ['source', 'dose'] }), 'waits for a person: dose'],
    ['advice for elsewhere', held(`<p>Mở vòi đã chỉnh sẵn nhiệt độ rồi châm thuốc khử clo.</p>${LONG}`, [{ check: 'elsewhere', quote: 'Mở vòi đã chỉnh sẵn nhiệt độ rồi châm thuốc khử clo' }]), 'held for elsewhere, which the cut doesn\'t take'],
    ['fixed by hand', held(`<p>Bể ở đây chạy hơn ba năm.</p>${LONG}`, src('Bể ở đây chạy hơn ba năm'), { bodyFixed: true }), 'fixed by hand'],
    ['a read of other text', held(`<p>Bể ở đây chạy hơn ba năm.</p>${LONG}`, src('Bể ở đây chạy hơn ba năm'), { stale: true }), 'no saved read'],
    ['a unit before a full stop', held(`<p>Bể ở đây có sưởi 50 W. Sưởi đặt gần chỗ nước chảy.</p>${LONG}`, src('Bể ở đây có sưởi 50 W')), 'runs on into the next'],
    ['a table\'s cell', held(`<table><tr><td>Đá của tiệm ở đây</td><td>Đá vôi</td></tr></table>${LONG}`, src('Đá của tiệm ở đây')), 'a table\'s cell'],
    ['an item\'s label', held(`<ul><li><strong>Anubias ở đây</strong>: loại hiếm. Cây lớn rất chậm.</li></ul>${LONG}`, src('loại hiếm')), 'names or opens what follows'],
    ['a lead-in it would cut', held(`<p>Hồ ở đây chạy hai bơm:</p><ul><li>Bơm lớn cho thác.</li></ul>${LONG}`, src('Hồ ở đây chạy hai bơm')), 'names or opens what follows'],
    ['a step in the sentence', held(`<p>Ở đây có thể thêm cây nổi ở khu ao bên trái.</p>${LONG}`, src('Ở đây có thể thêm cây nổi ở khu ao bên trái')), 'a step or a caution'],
    ['a name the guide speaks of again', held(`<p>Bể ở đây chạy hai lọc BioMaster.</p><p>BioMaster có ngăn lọc thô tháo nhanh.</p>${LONG}`, src('Bể ở đây chạy hai lọc BioMaster')), 'which the guide speaks of again'],
    ['what comes later', held(`<p>Cách set dưới đây có một tấm kỷ niệm gắn trên kính sau.</p>${LONG}`, src('Cách set dưới đây có một tấm kỷ niệm gắn trên kính sau')), 'says what comes later'],
    ['a dose beside it', held(`<p>Bể ở đây chạy ba năm. Châm 1 ml cho mỗi 40 lít nước.</p>${LONG}`, src('Bể ở đây chạy ba năm')), 'a dose in the paragraph'],
    ['a dose by its measure', held(`<p>Bể ở đây chạy ba năm.</p><p>Bể nhỏ chỉ cần một nắp.</p>${LONG}`, src('Bể ở đây chạy ba năm')), 'a dose in the paragraph'],
    ['a pronoun after the cut', held(`<p>Bể ở đây có sưởi Dennerle rất gọn. Nó chỉ chạy ở một mức 25 °C.</p>${LONG}`, src('Bể ở đây có sưởi Dennerle rất gọn')), 'reads on from it'],
    ['a pointer past the sixth word', held(`<p>Bể ở đây có thác chảy yếu. Xếp đá vào thì chắc sẽ đỡ hơn.</p>${LONG}`, src('Bể ở đây có thác chảy yếu')), 'reads on from it'],
    ['the cut\'s own thing named again', held(`<p>Ở đây bể kê trên tủ IKEA. Tủ này dài 120 cm.</p>${LONG}`, src('Ở đây bể kê trên tủ IKEA')), 'reads on from it'],
    ['a figure after a cut one with figures', held(`<p>Bể ở đây 75 lít, phòng 21 °C. Một cây sưởi 25 W giữ nhiệt ổn định.</p>${LONG}`, src('Bể ở đây 75 lít, phòng 21 °C')), 'a figure kept after'],
    ['money after a price', held(`<p>Giá khoảng 3 USD một con. Tổng tiền cá cũng không đáng là bao.</p>${LONG}`, [{ check: 'price', quote: 'khoảng 3 USD một con' }]), 'money kept after a price'],
    ['a count announced before the cut', held(`<p>Cá sống ngoài hồ quanh năm nhờ hai điều. Hồ ở đây có thác chảy suốt.</p>${LONG}`, src('Hồ ở đây có thác chảy suốt')), 'opens it'],
    ['a colon before the cut', held(`<p>Bể ở đây gồm:</p><p>Đèn của tiệm ở đây.</p>${LONG}`, src('Đèn của tiệm ở đây')), 'opens it'],
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

test('a kept sentence leans on a cut one when a pointer back stands anywhere in it', () => {
  for (const s of ['Nó chỉ chạy ở một mức.', 'Chúng thích nước mát.', 'Vì vậy bể chuyển sang sủi.', 'Tủ này dài 120 cm.', 'Bọt CO2 đi đến đó chắc đã bị cây dùng hết.', 'Đây là một cách giảm sáng cũ.', 'Đèn thứ hai lắp để thêm dòng chảy.', 'Xếp đá vào thì chắc sẽ đỡ hơn.', 'Lúc làm lại, thêm epoxy cho chắc.', 'Đổi lại, cây lớn chậm hơn nữa.'])
    expect(leans(s), s).toBe(true)
  // The guide itself, a question, something unnamed, and a sentence that stands alone.
  for (const s of ['Bài này đi lần lượt từng bước.', 'Thả cá thế nào cho đúng', 'Muốn thử một con gì đó mới thì chọn cá cờ.', 'Cá khá hiền và sống chung được với cá xiêm.'])
    expect(leans(s), s).toBe(false)
})

test('a swap is a term for a term: a fix with choices, commas, what to say, or only English is a writer\'s', () => {
  expect(swapOf('Lọc trong', 'lọc chìm')).toBe('Lọc chìm')
  expect(swapOf('lọc trong', 'lọc chìm')).toBe('lọc chìm')
  expect(swapOf('nhưng', '"nhưng", "tuy nhiên"')).toBeUndefined()
  expect(swapOf('mỗi tuần', 'hằng tuần hoặc nói thẳng')).toBeUndefined()
  expect(swapOf('Van điện (solenoid) để tắt CO2 vào ban đêm', 'van điện từ')).toBeUndefined()
  expect(swapOf('rêu cây (moss)', 'moss')).toBeUndefined()
})

test('a summary point or an answer a cut empties goes, its question with it', () => {
  const t = { summary: ['Bể ở đây chạy ba năm.', 'Châm đều.'], faq: [{ q: 'Bao lâu?', a: 'Ba năm.' }, { q: 'Bao nhiêu?', a: '1 lần.' }] }
  expect(applyCut(t, { changes: [{ field: 'summary.0', old: 'Bể ở đây chạy ba năm.', now: '' }, { field: 'faq.0.a', old: 'Ba năm.', now: '' }], emptied: [] })).toEqual({ summary: ['Châm đều.'], faq: [{ q: 'Bao nhiêu?', a: '1 lần.' }] })
})
