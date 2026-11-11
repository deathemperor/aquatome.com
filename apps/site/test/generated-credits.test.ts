import { expect, test } from 'vitest'
import { LANGS, type Photo } from '@aq/schema'
import { photoCredit, photoMark } from '../src/lib/cite'
import { galleryLine, galleryNote } from '../src/lib/gallery'
import { translator } from '../src/lib/i18n'
const real: Photo = { url: 'https://media.aquatome.com/real.webp', width: 800, height: 600, author: 'Source', licence: 'CC BY-SA 4.0', sourceUrl: 'https://commons.wikimedia.org/example' }
const ai = { ...real, author: 'AI', licence: 'AI-generated', generated: { model: 'gpt-image-2', driverModel: 'gpt-5.6-sol', date: '2026-11-10', prompt: 'fish', referenceHash: 'a'.repeat(64) } }
for (const lang of LANGS) test(`${lang}: visible AI label and app credit, truthful mixed album`, () => {
  const t = translator(lang), label = t('Ảnh do AI tạo')
  expect(photoMark(lang, ai)).toContain(label)
  expect(photoMark(lang, ai)).not.toContain('data-tip')
  expect(photoCredit(lang, ai)).toMatchObject({ text: label, licence: '' })
  expect(galleryNote(t, [real, ai], {})).toContain('AI')
  expect(galleryLine(t, [real, ai], {})).toContain('Wikimedia Commons')
  expect(galleryNote(t, [ai], {})).not.toContain('Wikimedia Commons')
})
test('a changed open-licence photograph keeps visible attribution, licence and notice of alteration', () => {
  const p: Photo = { ...real, altered: [{ method: 'mark-removal', date: '2026-11-10', originalHash: 'a'.repeat(64) }] }
  const mark = photoMark('vi', p)
  for (const text of ['Source', 'CC BY-SA 4.0', 'Ảnh đã chỉnh sửa', real.sourceUrl]) expect(mark).toContain(text)
  expect(photoCredit('vi', p).text).toContain('Ảnh đã chỉnh sửa')
})

import { htmlBlocks } from '../src/lib/page-blocks'
import { loadAll } from '@aq/schema'
import { fileURLToPath } from 'node:url'
import { fishDoc, listedPaths } from '../src/lib/app-page'
import { PageDoc } from '@aq/schema/app-page'
for (const lang of LANGS) test(`${lang}: complete inline figures keep true licences in app JSON`, () => {
 const altered: Photo = { ...real, altered: [{ method:'mark-removal',date:'2026-11-10',originalHash:'a'.repeat(64) }] }
 const {blocks,unknown}=htmlBlocks([ai,altered].map(p=>`<figure><img src="${p.url}" width="800" height="600" alt="Fish"><figcaption>Fish${photoMark(lang,p)}</figcaption></figure>`).join(''))
 expect(unknown).toEqual([]); const figures=blocks.filter(b=>b.t==='figure'); expect(figures).toHaveLength(2)
 expect(figures[0]!.img.credit).toMatchObject({text:translator(lang)('Ảnh do AI tạo'),licence:''}); expect(figures[0]!.img.credit?.author).toBeUndefined()
 expect(figures[1]!.img.credit?.licence).toBe('CC BY-SA 4.0');expect(figures[1]!.img.credit?.text).toContain('Source');expect(figures[1]!.img.credit?.text).toContain(translator(lang)('Ảnh đã chỉnh sửa'));expect(figures[1]!.img.credit?.author).toBeUndefined()
})
for(const lang of LANGS) test(`${lang}: complete fish data labels AI lead and inline, excludes AI from album grid`,async()=>{
 const c=await loadAll({root:fileURLToPath(new URL('./fixture-content',import.meta.url)),lang:'vi',publicBuild:false})
 const s=c.species.find(s=>s.id==='paracheirodon-innesi')!, generatedLead={...ai,url:'https://media.aquatome.com/generated-lead.webp'},generatedInline={...ai,url:'https://media.aquatome.com/generated-inline.webp'}
 s.photos=[generatedLead,generatedInline];c.galleries[s.id]=[...Array.from({length:6},(_,i)=>({...real,url:`https://media.aquatome.com/gallery-${i}.webp`})),{...ai,url:'https://media.aquatome.com/generated-grid.webp'}]
 const doc=await fishDoc(lang,c,s,listedPaths(lang,c));expect(PageDoc.safeParse(doc).success).toBe(true);expect(doc.lead?.credit?.text).toBe(translator(lang)('Ảnh do AI tạo'))
 const figure=doc.blocks.find(b=>b.t==='figure'&&b.img.src===generatedInline.url);expect(figure?.t==='figure'&&figure.img.credit?.licence).toBe('')
 const galleries=doc.blocks.filter(b=>b.t==='gallery');expect(galleries).toHaveLength(1);expect(galleries[0]!.photos.every(p=>!p.src.includes('generated'))).toBe(true);expect(galleries[0]!.photos).toHaveLength(6)
})
