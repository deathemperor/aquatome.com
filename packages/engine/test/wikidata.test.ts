import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { addWikidataNames, fetchWikidataNames } from '../src/wikidata'

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
  // A breed page's name the species would lose to the sweep: never added.
  await mkdir(join(root, 'content/breeds/albino-bala-shark'), { recursive: true })
  await writeFile(join(root, 'content/breeds/albino-bala-shark/th.json'), JSON.stringify({ slug: 'albino-bala-shark', name: 'ปลาหางไหม้เผือก (Albino bala shark)', altNames: [] }))
  const urls: string[] = []
  const row = (name: string, label: string) => ({ name: { value: name }, lang: { value: 'th' }, label: { value: label } })
  const http = async (url: string) => {
    urls.push(url)
    return { results: { bindings: [
      row('Balantiocheilos melanopterus', 'ปลาฉลามหางไหม้'), row('Balantiocheilos melanopterus', 'Balantiocheilos melanopterus'), row('Balantiocheilos melanopterus', 'ปลา หางไหม้'), row('Balantiocheilos melanopterus', 'สายพันธุ์ที่นิยมของตลาด'),
      row('Balantiocheilos melanopterus', 'ปลาหางไหม้เผือก'), row('Balantiocheilos melanopterus', 'Bala Shark'),
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

test("a language added later: the species cached before it are asked once, for it alone; what the cache has for the others stays", async () => {
  const root = await mkdtemp(join(tmpdir(), 'aq-wd-'))
  await mkdir(join(root, 'engine-state'), { recursive: true })
  // As the cache stands when Malay joins: names in Indonesian or Thai, or none at all (null).
  const before = { 'Betta splendens': { id: ['Cupang'], th: ['ปลากัด'] }, 'Datnioides pulcher': null }
  await writeFile(join(root, 'engine-state/_wikidata-names.json'), JSON.stringify(before))
  const queries: string[] = []
  const http = async (url: string) => {
    const q = decodeURIComponent(url)
    queries.push(q)
    return { results: { bindings: q.includes('Betta splendens') ? [{ name: { value: 'Betta splendens' }, lang: { value: 'ms' }, label: { value: 'Ikan Laga' } }] : [] } }
  }
  const cache = await fetchWikidataNames(root, http, ['Betta splendens', 'Datnioides pulcher', 'Danio rerio'])
  expect(cache['Betta splendens']).toEqual({ id: ['Cupang'], th: ['ปลากัด'], ms: ['Ikan Laga'] })
  expect(cache['Datnioides pulcher']).toEqual({ ms: [] })
  // Those two together, for Malay alone; a species new to the cache, for every language.
  expect(queries).toHaveLength(2)
  expect(queries[0]).toContain('Betta splendens')
  expect(queries[0]).toContain('IN ("ms")')
  expect(queries[1]).toContain('Danio rerio')
  expect(queries[1]).toContain('IN ("id", "th", "ms")')
  // Asked once: the next run has nothing to ask.
  await fetchWikidataNames(root, http, ['Betta splendens', 'Datnioides pulcher', 'Danio rerio'])
  expect(queries).toHaveLength(2)
})
