import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { byRank, guideRank, guideRisk } from '../src/video-order'

test('guideRisk: medicine and treatments first, then water, then the rest; by the title, or the text often', () => {
  expect(guideRisk('Cách trị bệnh đốm trắng (Ich) cho cá cảnh', '')).toBe(1)
  expect(guideRisk('Diệt rêu hại', 'Dùng Excel. Liều 1 ml. Đừng quá liều. Oxy già 3%. Thuốc diệt rêu.')).toBe(1)
  expect(guideRisk('Diệt rêu hại', 'Liều 1 ml, đừng quá liều, thuốc diệt rêu.')).toBe(3) // 3 times: not often enough
  expect(guideRisk('Nước máy hay nước RO cho bể thủy sinh', '')).toBe(3)
  expect(guideRisk('Giữ pH 6.5 cho cá đĩa', '')).toBe(2)
  expect(guideRisk('Bể mới', 'CO2 vừa đủ, KH 4, GH 6, thay nước 30%, nhiệt độ 26 °C.')).toBe(2)
  // Whole words: "phải", "phân", "khá" and "ghép" hold no pH, KH or GH.
  expect(guideRisk('Những việc phải làm khi ghép cá', 'Phải phân loại khá kỹ. '.repeat(10))).toBe(3)
  // The video's English title counts as a title.
  expect(guideRisk('Cứu bể cá Fin rot treatment that works', '')).toBe(1)
})

test('byRank: first place first, place by place', () => {
  expect([[1, 3, 0], [0, 3, 9], [1, 1, Infinity], [1, 1, 2]].sort(byRank)).toEqual([[0, 3, 9], [1, 1, 2], [1, 1, Infinity], [1, 3, 0]])
})

test('guideRank: the guide named first, then risk, then its most popular species; a guide about none after', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vo-'))
  const guide = async (id: string, name: string, mentions: string[] = []) => {
    await mkdir(join(root, 'content/guides', id), { recursive: true })
    await writeFile(join(root, 'content/guides', id, 'entity.json'), JSON.stringify({ id, mentions, video: { youtubeId: id.slice(8), title: 'A video' } }))
    await writeFile(join(root, 'content/guides', id, 'vi.json'), JSON.stringify({ name, body: '<p>Bài.</p>', summary: [], faq: [] }))
  }
  await guide('youtube-5uUPuLt0j2s', 'Rêu tóc: vì sao mọc')
  await guide('youtube-meds', 'Trị nấm cho cá bằng thuốc', ['danio-rerio'])
  await guide('youtube-guppy', 'Nuôi cá bảy màu', ['poecilia-reticulata'])
  await guide('youtube-neon', 'Giữ nhiệt độ cho cá neon', ['paracheirodon-innesi'])
  await guide('youtube-rare', 'Nuôi cá hiếm', ['some-fish'])
  await guide('youtube-none', 'Dựng bố cục bằng đá')
  const rank = await guideRank(root, ['poecilia-reticulata', 'paracheirodon-innesi', 'danio-rerio'])
  const ids = ['youtube-none', 'youtube-rare', 'youtube-guppy', 'youtube-neon', 'youtube-meds', 'youtube-5uUPuLt0j2s']
  expect(ids.sort((a, b) => byRank(rank(a), rank(b)) || a.localeCompare(b))).toEqual(['youtube-5uUPuLt0j2s', 'youtube-meds', 'youtube-neon', 'youtube-guppy', 'youtube-none', 'youtube-rare'])
})
