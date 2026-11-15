import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { localizePath, type Lang } from '../src/lib/i18n'
import { retiredForwards } from '../src/lib/retired'

// The chief of staff, 14 Nov 2026: the gallery posts of other people's tanks and the seller-site notices go off for good,
// every address forwarding (@aq/schema retired.ts).
test('a retired guide forwards from each address it had, in each language, to its fish there, else to the guides list', async () => {
  const root = await mkdtemp(join(tmpdir(), 'retired-'))
  const put = async (id: string, lang: string, t: object) => {
    await mkdir(join(root, 'guides', id), { recursive: true })
    await writeFile(join(root, 'guides', id, `${lang}.json`), JSON.stringify(t))
  }
  // A seller's notice to Corydoras burgessi, which the Indonesian site has no page for; a gallery post; a guide that stays.
  const seller = 'glaser-en-10-catfishes-10a-catfishes-corydoras-co-new-rare-corys-en'
  await put(seller, 'vi', { slug: 'cac-loai-corydoras-moi-hiem', redirectFrom: [{ slug: 'corydoras-moi', name: '' }] })
  await put(seller, 'id', { slug: 'corydoras-baru-langka' })
  await put('2hraquarist-blogs-aquascaping-ideas-someone-else', 'vi', { slug: 'be-cua-nguoi-khac' })
  await put('aquariumcoop-thay-nuoc', 'vi', { slug: 'thay-nuoc' })
  const none = { species: [], breeds: [], plants: [] }
  const vi = { ...none, species: [{ id: 'corydoras-burgessi', t: { slug: 'ca-chuot-burgess' } }] }
  const out = await retiredForwards(root, async (lang: Lang) => (lang === 'vi' ? vi : none) as never)
  const fish = localizePath('vi', '/vi/ca/ca-chuot-burgess/')
  expect(out).toEqual({
    [localizePath('vi', '/vi/huong-dan/cac-loai-corydoras-moi-hiem/')]: fish,
    [localizePath('vi', '/vi/huong-dan/corydoras-moi/')]: fish,
    [localizePath('id', '/vi/huong-dan/corydoras-baru-langka/')]: localizePath('id', '/vi/huong-dan/'),
    [localizePath('vi', '/vi/huong-dan/be-cua-nguoi-khac/')]: localizePath('vi', '/vi/huong-dan/'),
  })
})
