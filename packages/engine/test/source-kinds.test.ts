import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import type { Llm } from '../src/claude'
import { retagSources } from '../src/source-kinds'

test('research is tagged again with the kinds a page names its sources by; a farm or a forum stays one, and a kind not on the list is not taken', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kinds-'))
  await mkdir(join(root, 'engine-state/topics'), { recursive: true })
  const file = join(root, 'engine-state/topics/aquatome-x.json')
  const sources = [
    { url: 'https://forum.example/t/1', title: 'Thread', kind: 'forum' },
    { url: 'https://shop.example/blog/fin-rot', title: 'Fin rot', kind: 'article' },
    { url: 'https://fisheries.example/carp', title: 'Carp ponds', kind: 'vet' },
    { url: 'https://farm.example/a', title: 'Farm', kind: 'farm' },
    { url: 'https://angfa.example/x', title: 'ANGFA', kind: 'article' },
    { url: 'https://odd.example/x', title: 'Odd', kind: 'article' },
  ]
  const research = { found: true, species: [], facts: [{ section: 'what', fact: 'A fact.', source: 1 }], sources }
  await writeFile(file, JSON.stringify(research))
  const prompts: string[] = []
  const llm = (async (a: { prompt: string }) => {
    prompts.push(a.prompt)
    return { kinds: [{ source: 0, kind: 'keeper' }, { source: 1, kind: 'shop' }, { source: 2, kind: 'farm' }, { source: 3, kind: 'keeper' }, { source: 4, kind: 'society' }, { source: 5, kind: 'blog' }] }
  }) as Llm

  const dry = await retagSources(root, llm, { dryRun: true })
  expect(dry.changed).toHaveLength(4)
  expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(research)

  const r = await retagSources(root, llm)
  expect(prompts).toHaveLength(2) // one call a topic
  expect(prompts[0]).toContain('1. https://shop.example/blog/fin-rot | Fin rot | before: article | gave: "A fact."')
  expect(prompts[0]).toContain('0. https://forum.example/t/1 | Thread | before: forum | gave: nothing')
  expect(prompts[0]).toContain("- society: a fishkeepers' society")
  const after = JSON.parse(await readFile(file, 'utf8'))
  expect(after.sources.map((s: { kind: string }) => s.kind)).toEqual(['forum', 'shop', 'farm', 'farm', 'society', 'other'])
  expect(after.facts).toEqual(research.facts)
  expect(r.changed).toEqual([
    'aquatome-x 1: article → shop (https://shop.example/blog/fin-rot)',
    'aquatome-x 2: vet → farm (https://fisheries.example/carp)',
    'aquatome-x 4: article → society (https://angfa.example/x)',
    'aquatome-x 5: article → other (https://odd.example/x)',
  ])
})
