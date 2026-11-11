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

for(const lang of LANGS)test(`${lang}: a permission-licensed cropped photo's credit names the photographer, source and licence, with no alteration notice`,()=>{
 const p:Photo={...real,licence:'dùng với sự cho phép',ownerCrop:{id:'fixture',pixelHash:'a'.repeat(64)},altered:[{method:'mark-crop',date:'2026-11-11',originalHash:'a'.repeat(64)}]}
 const t=translator(lang),plain=`${t('Ảnh:')} Source`,credit=photoCredit(lang,p),mark=photoMark(lang,p)
 expect(credit).toMatchObject({text:plain,licence:'',url:p.sourceUrl})
 expect(mark).toContain('Source');expect(mark).toContain(p.sourceUrl);expect(mark).not.toContain(t('Ảnh đã chỉnh sửa'));expect(mark).not.toContain('Đã cắt bỏ dấu của nguồn ảnh')
 const {blocks}=htmlBlocks(`<figure><img src="${p.url}" width="800" height="600" alt="Fish"><figcaption>${mark}</figcaption></figure>`)
 expect(blocks[0]?.t==='figure'&&blocks[0].img.credit).toMatchObject({text:plain,licence:'',url:p.sourceUrl})
})
for(const lang of LANGS)test(`${lang}: a CC BY cropped photo says it was edited; CC0 and public domain stay silent`,()=>{
 const crop:Photo['altered']=[{method:'mark-crop',date:'2026-11-11',originalHash:'a'.repeat(64)}]
 const t=translator(lang),edited=`${t('Ảnh:')} Source · ${t('Ảnh đã chỉnh sửa')}`
 const cc:Photo={...real,altered:crop},credit=photoCredit(lang,cc),mark=photoMark(lang,cc)
 expect(credit).toMatchObject({text:edited,licence:'CC BY-SA 4.0',url:cc.sourceUrl})
 expect(mark).toContain(t('Ảnh đã chỉnh sửa'));expect(mark).not.toContain('Đã cắt bỏ dấu của nguồn ảnh')
 const {blocks}=htmlBlocks(`<figure><img src="${cc.url}" width="800" height="600" alt="Fish"><figcaption>${mark}</figcaption></figure>`)
 expect(blocks[0]?.t==='figure'&&blocks[0].img.credit).toMatchObject({licence:'CC BY-SA 4.0',url:cc.sourceUrl})
 expect(blocks[0]?.t==='figure'&&blocks[0].img.credit?.text).toContain(edited)
 for (const licence of ['CC0 1.0','Public domain']) expect(photoCredit(lang,{...cc,licence}).text).toBe(`${t('Ảnh:')} Source`)
})
test('a crop preserves the existing combined source and contributor credit',()=>{
 const p:Photo={...real,source:'scotcat',author:'Fixture contributor / ScotCat',altered:[{method:'mark-crop',date:'2026-11-11',originalHash:'a'.repeat(64)}]}
 const credit=photoCredit('vi',p)
 expect(credit.text).toBe('Ảnh: Fixture contributor / ScotCat · Ảnh đã chỉnh sửa')
 expect(credit.url).toBe(p.sourceUrl);expect(photoMark('vi',p)).toContain(credit.text)
})

test('an unsafe cropped head stays out of app lead data until the app can fit it, while album data and credits remain',async()=>{
 const c=await loadAll({root:fileURLToPath(new URL('./fixture-content',import.meta.url)),lang:'vi',publicBuild:false}),s=c.species.find(s=>s.id==='paracheirodon-innesi')!
 const crop:Photo={...real,width:800,height:520,headFit:'contain',altered:[{method:'mark-crop',date:'2026-11-11',originalHash:'a'.repeat(64),crop:{originalWidth:800,originalHeight:600,window:{x0:0,y0:0,x1:800,y1:520},subject:{x0:30,y0:180,x1:760,y1:420},margin:15}}]}
 s.photos=[crop];c.galleries[s.id]=Array.from({length:6},(_,i)=>({...crop,url:`https://media.aquatome.com/crop-${i}.webp`}))
 const doc=await fishDoc('vi',c,s,listedPaths('vi',c));expect(doc.lead).toBeUndefined()
 const album=doc.blocks.find(b=>b.t==='gallery');expect(album?.t==='gallery'&&album.photos.length).toBe(6);expect(album?.t==='gallery'&&album.photos[0]?.credit?.text).toContain('Ảnh đã chỉnh sửa')
 // Site-shaped alone does not make the current app's much taller banner safe.
 s.photos=[{...crop,headFit:undefined,altered:[{...crop.altered![0]!,crop:{...crop.altered![0]!.crop!,subject:{x0:110,y0:180,x1:690,y1:420}}}]}]
 const shaped=await fishDoc('vi',c,s,listedPaths('vi',c));expect(shaped.lead).toBeUndefined()
 s.photos=[real];expect((await fishDoc('vi',c,s,listedPaths('vi',c))).lead?.src).toBe(real.url)
})

import { appIndex } from '../src/lib/app-index'
for(const lang of ['vi','ms'] as const)test(`${lang}: a loaded whole-photo head never reaches either app banner input`,async()=>{
 const c=await loadAll({root:fileURLToPath(new URL('./fixture-content',import.meta.url)),lang,publicBuild:false})
 const s=c.species.find(s=>s.id==='apistogramma-cacatuoides')!
 // The site's cockatoo cichlid fixture carries headFit, outside the shared vectors and with no crop alteration.
 expect(s.photos[0]?.headFit).toBe('contain')
 const photo=s.photos[0]!,before=JSON.stringify(s.photos)
 expect((await fishDoc(lang,c,s,listedPaths(lang,c))).lead).toBeUndefined()
 expect(appIndex(lang,c).items.find(i=>i.id===s.id)?.img).toBeUndefined()
 expect(JSON.stringify(s.photos)).toBe(before)
 s.photos=[{...photo,headFit:undefined}]
 expect((await fishDoc(lang,c,s,listedPaths(lang,c))).lead?.src).toBe(photo.url)
 expect(appIndex(lang,c).items.find(i=>i.id===s.id)?.img).toBeTruthy()
})
