import { expect, test } from 'vitest'
import type { Llm } from '../src/claude'
import type { FitCheck } from '../src/fit'
import { asked, mendPart, type Dropped } from '../src/mend'
import { sentences } from '../src/sentences'

/**
 * The four parts the front list's first run didn't keep because its reviewer asked back what a reader-fit finding had
 * dropped (13 Nov 2026, engine-state/_fit-front.json): each part as the site had it, its English, the finding, and what
 * the writer made of the sentence the finding quotes (and of the one after it, where that no longer read).
 */
const CASES: { page: string; html: string; en: string; check: FitCheck; quote: string; at: number; to: string; next?: string }[] = [
  {
    page: 'species/boraras-merah dimorphism:glaser',
    html: '<p>Loài này rất gần với B. brigittae. Ở một số quần thể, con cái trông như B. brigittae còn con đực lại giống B. merah. Còn ở đợt cá mới nhập về thì có vẻ cả đực lẫn cái đều mang màu của B. merah.</p>',
    en: '<p>The species is very closely related to B. brigittae. In at least some populations the females look like B. brigittae while the males look like B. merah. In the population imported now, however, both sexes appear to show B. merah colouration.</p>',
    check: 'source', quote: 'Còn ở đợt cá mới nhập về thì có vẻ cả đực lẫn cái đều mang màu của B. merah.', at: 3, to: '',
  },
  {
    page: 'plants/hygrophila-difformis maintenance:tropica',
    html: '<p>Cây được bán theo bó thân hoặc theo nhóm cây non gom lại bằng một chiếc kẹp. Bạn tháo kẹp ra rồi tách thành từng cây riêng.</p><p>Cần lưu ý rằng cây dạng bó hiện KHÔNG được trồng tại vườn ươm của chính nhà cung cấp. Vì thế không có gì đảm bảo cây sạch thuốc trừ sâu độc hại, và tốt nhất là KHÔNG cho thẳng vào bể có tép hay các loài cá nhạy cảm. Bạn nên để cây dạng bó trong một bể riêng, thay nước hai lần mỗi tuần, giữ như vậy 2 tuần rồi mới thả tép hoặc cá vào.</p>',
    en: '<p>A bundle of stems or young plants gathered in an anchor. Remove the anchor and split into separate plants.</p><p>Please note that bunches/bundled plants are currently NOT produced at Tropica\'s own nursery. We are unable to guarantee that they are free from harmful pesticides and thus recommend NOT putting them directly in tanks with shrimps and other delicate fish. Keep bundled plants in tanks where water is changed twice a week for 2 weeks before you add shrimps or fish.</p>',
    check: 'source', quote: 'cây dạng bó hiện KHÔNG được trồng tại vườn ươm của chính nhà cung cấp', at: 3, to: '',
    next: 'Không có gì đảm bảo cây dạng bó sạch thuốc trừ sâu độc hại, nên tốt nhất là KHÔNG cho thẳng vào bể có tép hay các loài cá nhạy cảm.',
  },
  {
    page: 'species/mikrogeophagus-ramirezi distribution:seriouslyfish',
    html: '<p>Phần lớn tài liệu cho rằng loài này chỉ có ở vùng llanos của Venezuela và Colombia, thuộc lưu vực sông Orinoco. Tuy vậy, một trong các mẫu cá trong ảnh được cho là bắt ở sông Purus, Brazil. Đây là một phụ lưu của Amazon, nằm khá xa lưu vực Orinoco.</p><p>Nơi thu mẫu chuẩn là \'hệ thống Orinoco, Venezuela\'.</p>',
    en: '<p>The majority of literature suggests that this species is restricted to the Venezuelan and Colombian llanos of the Río Orinoco drainage, although one of the specimens in the images is said to have been collected in the rio Purus, Brazil, an Amazon tributary located some distance from that watershed.</p><p>Type locality is \'Orinoco system, Venezuela\'.</p>',
    check: 'source', quote: 'một trong các mẫu cá trong ảnh', at: 2, to: 'Tuy vậy, có một mẫu cá được cho là bắt ở sông Purus, Brazil.',
  },
  {
    page: 'plants/vallisneria quickFacts:aquariumcoop',
    html: '<p>Vallisneria là loại cây không đòi hỏi khắt khe, có thể biến bể cá thành một khu rừng xanh tươi. Cây mọc nhanh và hấp thụ nhiều nitrat. Cây rẻ và thường có ở các cửa hàng cá với giá dưới 10 đô la.</p>',
    en: '<p>Vallisneria is an undemanding plant that can transform an aquarium into a lush jungle. It grows quickly and takes up a lot of nitrates. It is cheap and frequently found at fish stores for less than $10.</p>',
    check: 'price', quote: 'với giá dưới 10 đô la', at: 3, to: 'Cây rẻ và thường có ở các cửa hàng cá.',
  },
]

/** The writer (the quoted sentence as the case has it, and the next one said why) and a reviewer that lists the drop under finding 1. */
const llmFor = (c: (typeof CASES)[number], prompts: string[] = []) => (async ({ prompt, schema }: { prompt: string; schema: { required: string[] } }) => {
  prompts.push(prompt)
  if (schema.required.includes('sentences')) return { sentences: [{ n: c.at, vi: c.to }, ...(c.next ? [{ n: c.at + 1, vi: c.next, why: 'it said "therefore" of the sentence that went' }] : [])] }
  return { score: 0.9, notes: [], dropped: [{ sentence: c.at, finding: 1, text: c.quote }], hedges: [] }
}) as Llm

const others = (before: string, after: string, at: number[]) => {
  const a = sentences(before).filter(p => p.sentence).map(p => p.html)
  const b = sentences(after).filter(p => p.sentence).map(p => p.html)
  return { before: a.filter((_, i) => !at.includes(i + 1)), after: b }
}

test('a drop a reader-fit finding on that part names passes: the four parts the first run lost to it', async () => {
  for (const c of CASES) {
    const prompts: string[] = []
    const r = await mendPart(llmFor(c, prompts), c.html, [{ check: c.check, quote: c.quote, note: 'Write it for a keeper in Vietnam; drop what only holds abroad.' }], { en: c.en })
    if (typeof r === 'string') throw new Error(`${c.page}: ${r}`)
    expect(r.unasked, c.page).toEqual([])
    expect(r.score, c.page).toBe(0.9)
    expect(r.html, c.page).not.toContain(c.quote)
    // The reviewer is shown the finding that asks for it, and only the sentences that changed.
    expect(prompts[1], c.page).toContain(`quotes "${c.quote}"`)
    expect(prompts[1], c.page).not.toContain('Nơi thu mẫu chuẩn')
    // Every sentence but the one the finding quotes (and a neighbour said why) is as it was.
    const changed = [c.at, ...(c.next ? [c.at + 1] : [])]
    const kept = others(c.html, r.html, changed)
    for (const s of kept.before) expect(r.html, c.page).toContain(s)
  }
})

test('the same drop with no finding that asks for it fails: none on that part, or one that asks for a word or a unit', async () => {
  for (const c of CASES) {
    // The same writer and the same reviewer, but the sentence is named only by a finding that asks for another word.
    for (const check of ['words', 'units'] as const) {
      const r = await mendPart(llmFor(c), c.html, [{ check, quote: c.quote, note: 'A word keepers here don\'t use.' }], { en: c.en })
      if (typeof r === 'string') throw new Error(`${c.page}: ${r}`)
      expect(r.unasked.length, `${c.page} ${check}`).toBeGreaterThan(0)
      expect(r.notes[0], `${c.page} ${check}`).toMatch(/^Left out, and no finding asks for it to go/)
    }
    // No finding at all: nothing names the sentence, so what the reviewer lists is asked by none.
    const drop: Dropped = { sentence: c.at, finding: 1, text: c.quote }
    expect(asked(drop, []), c.page).toBe(false)
    expect(asked({ ...drop, finding: 0 }, [{ check: c.check, sentences: [c.at] }]), c.page).toBe(false)
    // A finding that asks for something to go, but in another sentence.
    expect(asked(drop, [{ check: c.check, sentences: [c.at === 1 ? 2 : 1] }]), c.page).toBe(false)
    expect(asked(drop, [{ check: c.check, sentences: [c.at] }]), c.page).toBe(true)
  }
})

test('a part that would lose every sentence isn\'t mended here: the dealer check settles it', async () => {
  const html = '<p>Hiện có cá phượng hoàng bắt ngoài tự nhiên từ Venezuela, con nào cũng đã lớn hẳn.</p>'
  const llm = (async () => ({ sentences: [{ n: 1, vi: '' }] })) as unknown as Llm
  expect(await mendPart(llm, html, [{ check: 'source', quote: 'Hiện có cá phượng hoàng', note: 'n' }])).toMatch(/every sentence would go/)
})
