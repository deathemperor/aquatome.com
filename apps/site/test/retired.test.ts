import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { localizePath, type Lang } from '../src/lib/i18n'
import { retiredForwards } from '../src/lib/retired'
import { LANGS } from '@aq/schema'
import { listParent } from '../worker/paths'

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

// A stand-in read, 15 Nov 2026: with the guides off, the Vietnamese guides list had 15 numbered pages where it had 17, and
// /huong-dan/trang/16/ and /17/ answered 404. A list's numbered page the build didn't make goes to its list, in every
// language, and the Worker is asked for it wherever a list can shrink by guides taken off (the Vietnamese ones only).
test('a numbered page a shorter list no longer has goes to its list, and the Worker is asked for it', () => {
  const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, ''))
  const first: string[] = config.assets.run_worker_first
  const glob = (p: string) => new RegExp(`^${p.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`)
  for (const lang of LANGS) for (const list of ['/vi/huong-dan/', '/vi/cay/', '/vi/kham-pha/', '/vi/nhom/ca-chuot/', '/vi/video/kenh/aquarium-co-op/']) {
    const page = localizePath(lang, `${list}trang/17/`)
    expect(listParent(page), page).toBe(localizePath(lang, list))
    if (lang === 'vi') expect(first.some(r => !r.startsWith('!') && glob(r).test(page)), `${page}: its line in run_worker_first`).toBe(true)
  }
  for (const page of ['/huong-dan/trang/', '/huong-dan/trang-tri-be/', '/huong-dan/trang/2/thua/', '/ca/trang/x/']) expect(listParent(page), page).toBeUndefined()
})
