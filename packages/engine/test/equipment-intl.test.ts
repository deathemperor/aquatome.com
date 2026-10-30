import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import type { Llm } from '../src/claude'
import { localizeEquipment } from '../src/equipment-intl'

const photo = { url: 'https://x/1.jpg', width: 4, height: 3, licence: 'CC BY 4.0', author: 'A', sourceUrl: 'https://x/1' }
const vi = {
  category: 'loc', name: 'Lọc', lead: 'Lọc giữ nước sạch.', intro: '<p>Lọc vi sinh.</p>', hero: photo,
  types: [{ id: 'thung', name: 'Lọc thùng', match: 'thùng', desc: '<p>Cho bể từ 60 cm.</p>', pick: 'Chọn lưu lượng gấp 5 lần.', buy: 'lọc thùng', photo }],
  choose: ['Theo cỡ bể.'], mistakes: ['Rửa vật liệu bằng nước máy.'], faq: [{ q: 'Bao lâu rửa?', a: 'Mỗi tháng.' }],
}
const written = (desc: string) => ({
  name: 'Filter', lead: 'Filter menjaga air tetap bersih.', intro: '<p>Filter biologis.</p><script>x</script>',
  types: [{ id: 'thung', name: 'Canister', desc, pick: 'Pilih debit 5 kali volume.' }],
  choose: ['Sesuai ukuran akuarium.'], mistakes: ['Mencuci media dengan air keran.'], faq: [{ q: 'Kapan dicuci?', a: 'Sebulan sekali.' }],
})

test('a buying guide is translated with its photos and type matching kept; Vietnamese left in it fails the review', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aq-eq-'))
  await mkdir(join(root, 'content/equipment'), { recursive: true })
  await writeFile(join(root, 'content/equipment/loc.json'), JSON.stringify(vi))
  const calls: string[] = []
  // First draft leaves a Vietnamese phrase in; the reviewer misses it, the check doesn't. The retry is clean.
  const replies = [written('<p>Untuk akuarium 60 cm, lọc thùng.</p>'), { score: 0.9, notes: [] }, written('<p>Untuk akuarium mulai 60 cm.</p>'), { score: 0.9, notes: [] }]
  const llm = (async ({ prompt }: { prompt: string }) => { calls.push(prompt); return replies.shift() }) as unknown as Llm
  const r = await localizeEquipment(root, llm, 'id')
  expect(r.done[0]).toMatch(/^loc: Filter \(0\.9\)/)
  expect(calls[2]).toContain('Vietnamese text is left in the translation')
  const t = JSON.parse(await readFile(join(root, 'content/equipment/id/loc.json'), 'utf8'))
  expect(t).toMatchObject({ category: 'loc', name: 'Filter', hero: photo, quality: { score: 0.9, indexable: true } })
  expect(t.intro).toBe('<p>Filter biologis.</p>')
  expect(t.types[0]).toMatchObject({ id: 'thung', name: 'Canister', match: 'thùng', buy: 'lọc thùng', photo, desc: '<p>Untuk akuarium mulai 60 cm.</p>' })
  // Done: skipped next time.
  expect((await localizeEquipment(root, llm, 'id')).skipped).toEqual(['loc'])
})
