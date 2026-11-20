import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import type { Llm } from '../src/claude'
import { houseForm, openDiseaseGuides } from '../src/glossary-dose'
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

test('the open disease guides: a disease guide search engines may index, by its name before ": " and its address', async () => {
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
  await mkdir(join(root, 'content/guides', 'e-empty'))
  expect(await openDiseaseGuides(root)).toEqual([
    { title: 'Cá bị thối vây, thối đuôi', address: '/vi/huong-dan/ca-bi-thoi-vay-thoi-duoi/' },
    { title: 'Cách loại bỏ hydra khỏi bể cá nước ngọt', address: '/vi/huong-dan/cach-loai-bo-hydra/' },
  ])
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
