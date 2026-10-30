import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { addWikidataNames } from '../src/wikidata'

test("Wikidata's Thai names join a page's other names unless Latin, already there, or another species' name", async () => {
  const root = await mkdtemp(join(tmpdir(), 'aq-wd-'))
  const page = async (id: string, sci: string, th?: { name: string; altNames: string[] }) => {
    await mkdir(join(root, 'content/species', id), { recursive: true })
    await writeFile(join(root, 'content/species', id, 'entity.json'), JSON.stringify({ scientificName: sci }))
    if (th) await writeFile(join(root, 'content/species', id, 'th.json'), JSON.stringify({ slug: id, ...th }))
  }
  await page('balantiocheilos-melanopterus', 'Balantiocheilos melanopterus', { name: 'ปลาหางไหม้', altNames: ['Bala shark'] })
  await page('datnioides-pulcher', 'Datnioides pulcher', { name: 'ปลาเสือตอ', altNames: [] })
  await page('datnioides-microlepis', 'Datnioides microlepis', { name: 'ปลาเสือตออินโด', altNames: [] })
  await page('betta-splendens', 'Betta splendens')
  const urls: string[] = []
  const row = (name: string, label: string) => ({ name: { value: name }, lang: { value: 'th' }, label: { value: label } })
  const http = async (url: string) => {
    urls.push(url)
    return { results: { bindings: [
      row('Balantiocheilos melanopterus', 'ปลาฉลามหางไหม้'), row('Balantiocheilos melanopterus', 'Balantiocheilos melanopterus'), row('Balantiocheilos melanopterus', 'ปลา หางไหม้'), row('Balantiocheilos melanopterus', 'สายพันธุ์ที่นิยมของตลาด'),
      // One name for two species: neither gets it. A species' Wikidata name that another page uses as its own: not added.
      row('Datnioides pulcher', 'ปลาเสือตอลายใหญ่'), row('Datnioides microlepis', 'ปลาเสือตอลายใหญ่'), row('Datnioides pulcher', 'ปลาเสือตออินโด'),
    ] } }
  }
  const added = await addWikidataNames(root, http, 'th')
  expect(added).toEqual(['balantiocheilos-melanopterus: ปลาฉลามหางไหม้'])
  expect(JSON.parse(await readFile(join(root, 'content/species/balantiocheilos-melanopterus/th.json'), 'utf8')).altNames).toEqual(['Bala shark', 'ปลาฉลามหางไหม้'])
  expect(JSON.parse(await readFile(join(root, 'content/species/datnioides-pulcher/th.json'), 'utf8')).altNames).toEqual([])
  // Cached: the next run asks Wikidata nothing, and adds nothing twice.
  expect(await addWikidataNames(root, http, 'th')).toEqual([])
  expect(urls).toHaveLength(1)
})
