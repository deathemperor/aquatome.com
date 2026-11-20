import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import type { Llm } from '../src/claude'
import { guideNotes, houseForm, LABEL, openDiseaseGuides } from '../src/glossary-dose'
import { checkSentences } from '../src/glossary-facts'

// The house form for a medicine's dose (the Writing Lead, with the chief of staff's yes, 20 Nov 2026). Tảo's label line
// was stopped by the fact check in 3 reads of 3, as no fact says "follow the label". The check passes the form, whole, and
// only the form (the chief of staff, 20 Nov 2026: never a prefix; both slots closed; the label form has no slot).
const guides = [{ title: 'Cá bị thối vây, thối đuôi', address: '/vi/huong-dan/ca-bi-thoi-vay-thoi-duoi/' }]

test('the label form is that one sentence, and nothing more', () => {
  expect(houseForm('Liều và cách dùng: theo nhãn thuốc.', guides)).toBe(true)
  expect(houseForm('Liều và cách dùng: theo nhãn thuốc, 1 viên cho 40 lít.', guides)).toBe(false)
  expect(houseForm('Liều và cách dùng: theo nhãn thuốc của hãng.', guides)).toBe(false)
  expect(houseForm('Liều và cách dùng: theo nhãn thuốc. Dùng nửa liều.', guides)).toBe(false)
})

test('the guide form names an open guide by its title, with nothing inside or after it', () => {
  expect(houseForm('Liều và cách dùng: xem bài Cá bị thối vây, thối đuôi.', guides)).toBe(true)
  expect(houseForm('Liều và cách dùng: xem bài Cá bị thối vây, thối đuôi, 1 thìa muối cho 20 lít.', guides)).toBe(false)
  expect(houseForm('Liều và cách dùng: xem bài hướng dẫn chữa bệnh.', guides)).toBe(false)
  expect(houseForm('Liều và cách dùng: xem bài Cá bị nấm.', guides)).toBe(false)
  expect(houseForm('Liều và cách dùng: xem bài Cá bị thối vây, thối đuôi.', [])).toBe(false)
})

test('the pointer names a disease as that same guide\'s title writes it, whole words', () => {
  expect(houseForm('Cách chữa thối vây: xem bài Cá bị thối vây, thối đuôi.', guides)).toBe(true)
  expect(houseForm('Cách chữa thối đuôi: xem bài Cá bị thối vây, thối đuôi.', guides)).toBe(true)
  // A real title with a disease it isn't about.
  expect(houseForm('Cách chữa đốm trắng: xem bài Cá bị thối vây, thối đuôi.', guides)).toBe(false)
  expect(houseForm('Cách chữa thối vây bằng muối: xem bài Cá bị thối vây, thối đuôi.', guides)).toBe(false)
  expect(houseForm('Cách chữa thối vâ: xem bài Cá bị thối vây, thối đuôi.', guides)).toBe(false)
  expect(houseForm('Cách chữa thối vây: xem bài hướng dẫn chữa bệnh.', guides)).toBe(false)
})

test('the open disease guides: a disease guide search engines may index and that isn\'t held, by its name before ": " and its address', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aq-glossary-dose-'))
  expect(await openDiseaseGuides(root)).toEqual([])
  const guide = async (id: string, kind: string, vi: object) => {
    await mkdir(join(root, 'content/guides', id), { recursive: true })
    await writeFile(join(root, 'content/guides', id, 'entity.json'), JSON.stringify({ id, kind }))
    await writeFile(join(root, 'content/guides', id, 'vi.json'), JSON.stringify(vi))
  }
  await guide('a-fin-rot', 'disease', { slug: 'ca-bi-thoi-vay-thoi-duoi', name: 'Cá bị thối vây, thối đuôi: dấu hiệu, nguyên nhân, cách chữa và phòng', quality: { score: 0.93, indexable: true } })
  await guide('b-held', 'disease', { slug: 'ca-bi-nam', name: 'Cá bị nấm: dấu hiệu', quality: { score: 0.7, indexable: false } })
  await guide('c-care', 'care', { slug: 'thay-nuoc', name: 'Thay nước: cách làm', quality: { score: 0.9, indexable: true } })
  await guide('d-whole', 'disease', { slug: 'cach-loai-bo-hydra', name: 'Cách loại bỏ hydra khỏi bể cá nước ngọt', quality: { score: 0.9, indexable: true } })
  // Held while still marked for search, as the white-spot guide was on main (the chief of staff, 20 Nov 2026): its page is 404.
  await guide('f-held-in-search', 'disease', { slug: 'ca-bi-dom-trang-bi-nam', name: 'Cá bị đốm trắng, bị nấm: cách nhận biết, chữa và phòng', quality: { score: 0.8, indexable: true }, held: { checks: ['dose-caution'], at: '2026-11-20' } })
  await mkdir(join(root, 'content/guides', 'e-empty'))
  const open = await openDiseaseGuides(root)
  expect(open).toEqual([
    { title: 'Cá bị thối vây, thối đuôi', address: '/vi/huong-dan/ca-bi-thoi-vay-thoi-duoi/' },
    { title: 'Cách loại bỏ hydra khỏi bể cá nước ngọt', address: '/vi/huong-dan/cach-loai-bo-hydra/' },
  ])
  // A pointer to the held guide isn't the house form, so the fact check reads it like any other sentence.
  const toHeld = 'Cách chữa đốm trắng: xem bài Cá bị đốm trắng, bị nấm.'
  expect(houseForm(toHeld, open)).toBe(false)
  expect(houseForm('Cách chữa thối vây: xem bài Cá bị thối vây, thối đuôi.', open)).toBe(true)
  const { llm, given } = stopAll()
  const r = await checkSentences(llm, { facts: [] }, { definition: '', body: `<p>${toHeld}</p>` }, t => houseForm(t, open))
  expect(given[0]).toEqual([toHeld])
  expect(r.stops.map(s => s.text)).toEqual([toHeld])
})

/** Reads that stop every sentence they're given ("unsupported"), and the sentences each read was given. */
function stopAll() {
  const given: string[][] = []
  const llm: Llm = async ({ prompt }) => {
    if (prompt.includes('\n\nSENTENCE:\n')) return { verdict: 'unsupported', why: 'not in the facts' } as never
    const list = [...prompt.split('\n\nSENTENCES:\n')[1]!.matchAll(/^(\d+)\. (.*)$/gm)]
    given.push(list.map(m => m[2]!))
    return { verdicts: list.map(m => ({ n: Number(m[1]), verdict: 'unsupported', why: 'not in the facts' })) } as never
  }
  return { llm, given }
}

test('the fact check passes the house form unread, and reads a sentence that only starts like it', async () => {
  const facts = { term: 'Tảo', english: 'Algae', sources: [], facts: [{ section: 'what', fact: 'Erythromycin kills cyanobacteria', source: 0 }] }
  const e = {
    definition: '',
    body: '<p>Kháng sinh erythromycin cũng diệt được nó. Liều và cách dùng: theo nhãn thuốc.</p><p>Cách chữa thối vây: xem bài Cá bị thối vây, thối đuôi. Liều và cách dùng: theo nhãn thuốc, 1 viên cho 40 lít.</p>',
  }
  const pass = (t: string) => houseForm(t, guides)
  const { llm, given } = stopAll()
  const r = await checkSentences(llm, facts, e, pass)
  expect(given[0]).toEqual(['Kháng sinh erythromycin cũng diệt được nó.', 'Liều và cách dùng: theo nhãn thuốc, 1 viên cho 40 lít.'])
  expect(r.stops.map(s => s.text)).toEqual(['Kháng sinh erythromycin cũng diệt được nó.', 'Liều và cách dùng: theo nhãn thuốc, 1 viên cho 40 lít.'])
  // Without the pass, the reads stop the form too, as they stopped Tảo's.
  const without = await checkSentences(stopAll().llm, facts, e)
  expect(without.stops.map(s => s.text)).toContain('Liều và cách dùng: theo nhãn thuốc.')
})

// The dose rule's code half (the chief of staff, 20 Nov 2026: Rule 13 stops a save for a pointer to "the treatment guide" or
// to any guide that isn't open). Every sentence that points to a guide is the house form by an open guide, or it is noted.
test('a sentence that points to a guide is the house form by an open guide, or a Rule 13 note', () => {
  const body = [
    '<p>Kháng sinh X diệt được nó. Liều và cách dùng: xem bài hướng dẫn chữa bệnh.</p>',
    '<p>Cách chữa đốm trắng: xem bài Cá bị đốm trắng, bị nấm.</p>',
    '<p>Đọc bài hướng dẫn chữa bệnh để biết thêm.</p>',
    '<p>Cách chữa thối vây: xem bài Cá bị thối vây, thối đuôi. Liều và cách dùng: theo nhãn thuốc.</p>',
    '<p>Liều và cách dùng: xem bài Cá bị thối vây, thối đuôi.</p>',
    '<p>Cách rã đông: xem mục Thức ăn đông lạnh.</p>',
  ].join('')
  const notes = guideNotes({ definition: '', body }, guides)
  expect(notes.map(n => /^Rule 13: "(.*?)" /.exec(n)?.[1])).toEqual([
    'Liều và cách dùng: xem bài hướng dẫn chữa bệnh.',
    'Cách chữa đốm trắng: xem bài Cá bị đốm trắng, bị nấm.',
    'Đọc bài hướng dẫn chữa bệnh để biết thêm.',
  ])
  expect(guideNotes({ definition: 'Liều và cách dùng: xem bài Cá bị nấm.', body: '' }, guides)).toHaveLength(1)
  expect(guideNotes({ definition: '', body: '<p>Cách chữa thối vây: xem bài Cá bị thối vây, thối đuôi.</p>' }, [])).toHaveLength(1)
})

// The writer's prompt writes the forms the check passes, so the two can't drift apart.
test('the forms the writer is given are the forms the check passes', () => {
  const md = readFileSync(new URL('../src/prompts/glossary-entry.md', import.meta.url), 'utf8')
  const forms = [...md.matchAll(/"((?:Liều và cách dùng|Cách chữa)[^"]*)"/gu)].map(m => m[1]!)
  expect(forms).toContain(LABEL)
  expect(forms).toHaveLength(3)
  for (const f of forms) expect(houseForm(f.replace('<tên bài>', guides[0]!.title).replace('<tên bệnh>', 'thối vây'), guides)).toBe(true)
})
