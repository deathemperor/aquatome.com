import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GLOSSARY_KIND_APPROVALS, GLOSSARY_KIND_REVIEW_POLICY, kindCanonical, kindEntryCanonical, kindPhotoCanonical, loadAll, type Lang, type Photo } from '@aq/schema'

const hash = (value: string) => createHash('sha256').update(value).digest('hex')
export const waitingKindPhoto: Photo = { url: 'https://media.aquatome.com/generated/glossary/waiting-fixture.webp', width: 800, height: 600, author: 'AI', licence: 'AI-generated', sourceUrl: 'https://aquatome.com/thuat-ngu/fixture/', caption: 'Generated fixture: the base below the soil.', generated: { model: 'unreported', driverModel: 'gpt-6.1-sol', date: '2026-11-17', prompt: 'Two substrate layers, no lettering.', referenceHash: 'a'.repeat(64), pixelHash: 'b'.repeat(64) } }

/** Only a system-temp fixture, never real content or a public media store. */
export async function waitingKindStore(lang: Lang) {
  const dir = await mkdtemp(join(tmpdir(), 'aq-glossary-builders-')), root = join(dir, 'content')
  await cp(new URL('../fixture-content/', import.meta.url), root, { recursive: true })
  const entityFile = join(root, 'glossary/lua/entity.json')
  const entity = JSON.parse(await readFile(entityFile, 'utf8'))
  const body = '<h3>Các loại nền</h3><ul><li><strong>Cốt nền</strong>: Lớp lót nằm dưới lớp đất.</li></ul>'
  entity.photos = [waitingKindPhoto]
  entity.kinds = [{ id: 'cot-nen', photo: waitingKindPhoto }]
  await writeFile(entityFile, JSON.stringify(entity))
  const translation = JSON.parse(await readFile(join(root, 'glossary/lua/vi.json'), 'utf8'))
  for (const language of new Set(['vi', lang])) await writeFile(join(root, 'glossary/lua', `${language}.json`), JSON.stringify({ ...translation, body }))
  const facts = { found: true, facts: [{ section: 'kinds', fact: 'The base is below the soil.', source: 0 }] }
  await mkdir(join(dir, 'engine-state/glossary'), { recursive: true })
  await writeFile(join(dir, 'engine-state/glossary/lua.json'), JSON.stringify(facts))
  await writeFile(join(dir, 'engine-state/_photo-watermarks.json'), JSON.stringify({ [waitingKindPhoto.url]: { ocr: [] } }))
  await writeFile(join(dir, 'engine-state/_photo-rejected.json'), '{}')
  const approve = async (on: boolean) => {
    const approval = { page: 'glossary/lua', kind: 'cot-nen', recordHash: hash(kindPhotoCanonical(waitingKindPhoto)), entryHash: hash(kindEntryCanonical(entity, 'cot-nen', body)!), factsHash: hash(kindCanonical(facts)), referenceHash: waitingKindPhoto.generated!.referenceHash, pixelHash: waitingKindPhoto.generated!.pixelHash, policy: GLOSSARY_KIND_REVIEW_POLICY, noUsableRealPhoto: true, inputImages: 0, conflicts: [], ownerSeen: { date: '2026-11-17' }, ownerApproved: { date: '2026-11-17' }, checks: { curation: { verdict: 'pass', hash: 'c'.repeat(64) }, glossary: { verdict: 'pass', hash: 'd'.repeat(64) } } }
    await writeFile(join(root, GLOSSARY_KIND_APPROVALS), JSON.stringify({ photos: on ? { [waitingKindPhoto.url]: approval } : {} }))
  }
  await approve(false)
  return { dir, approve, load: (on: boolean, approvals?: false) => loadAll({ root, lang, publicBuild: true, glossaryKindApprovals: approvals, photoScreen: 'required', glossaryKindImages: on }) }
}
