import sharp from 'sharp'
import { containsBox, cropFitsFrame, validPixelBox, type CropGeometry, type PixelBox } from '@aq/schema'

const area = (b: PixelBox) => (b.x1-b.x0)*(b.y1-b.y0)
function ratioWindow(b: PixelBox, s: PixelBox, ratio: number, scale=1): PixelBox | undefined {
  const height = Math.floor(Math.min(b.y1-b.y0,(b.x1-b.x0)/ratio)*scale), width = Math.floor(height*ratio)
  const minX = Math.max(b.x0,s.x1-width), maxX = Math.min(b.x1-width,s.x0), minY = Math.max(b.y0,s.y1-height), maxY = Math.min(b.y1-height,s.y0)
  if (minX>maxX || minY>maxY) return
  const x0 = Math.round(Math.max(minX,Math.min(maxX,(s.x0+s.x1-width)/2))), y0 = Math.round(Math.max(minY,Math.min(maxY,(s.y0+s.y1-height)/2)))
  return { x0,y0,x1:x0+width,y1:y0+height }
}
/** All windows are native original pixels, outside every padded mark and around the entire subject plus a margin. */
export function markCropOptions(width: number, height: number, subject: PixelBox, marks: PixelBox[]): CropGeometry[] {
  if (!validPixelBox(subject,width,height) || !marks.length || marks.length>8 || marks.some(b => !validPixelBox(b,width,height))) return []
  const padding = Math.max(4,Math.ceil(Math.min(width,height)*.01)), margin = Math.max(6,Math.ceil(Math.min(width,height)*.025))
  const safe = { x0:subject.x0-margin,y0:subject.y0-margin,x1:subject.x1+margin,y1:subject.y1+margin }
  if (!validPixelBox(safe,width,height)) return []
  const out: CropGeometry[] = []
  for (const x0 of [0,...marks.map(b=>b.x1+padding)]) for (const x1 of [width,...marks.map(b=>b.x0-padding)]) for (const y0 of [0,...marks.map(b=>b.y1+padding)]) for (const y1 of [height,...marks.map(b=>b.y0-padding)]) {
    const band = { x0,y0,x1,y1 }
    if (!validPixelBox(band,width,height) || !containsBox(band,safe) || marks.some(m => !(m.x1+padding<=x0 || m.x0-padding>=x1 || m.y1+padding<=y0 || m.y0-padding>=y1))) continue
    for (const window of [band,...[4/3,16/9,400/420].flatMap(r=>[1,.95,.9,.8,.7].map(scale=>ratioWindow(band,safe,r,scale)))]) if (window && validPixelBox(window,width,height) && containsBox(window,safe)) out.push({ originalWidth:width,originalHeight:height,subject,margin,window })
  }
  const rank = (c: CropGeometry) => Number([4/3,16/9].every(r=>cropFitsFrame(c,r)))*2 + Number([4/3,400/420,16/9,1.6].every(r=>cropFitsFrame(c,r)))
  return [...new Map(out.map(c=>[JSON.stringify(c.window),c])).values()].sort((a,b)=>rank(b)-rank(a) || area(b.window)-area(a.window))
}

/** Verify every retained pixel after encoding. A crop cannot manufacture detail or borrow pixels from a repaint. */
export async function retainedPixelProof(original: Uint8Array, candidate: Uint8Array, window: PixelBox): Promise<number> {
  const upright = sharp(original).rotate().toColourspace('srgb').ensureAlpha(), m = await upright.metadata()
  if (!validPixelBox(window,m.autoOrient.width,m.autoOrient.height)) throw new Error('crop window outside original')
  const expected = await upright.extract({ left:window.x0,top:window.y0,width:window.x1-window.x0,height:window.y1-window.y0 }).raw().toBuffer({ resolveWithObject:true })
  const got = await sharp(candidate).rotate().toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject:true })
  if (expected.info.width!==got.info.width || expected.info.height!==got.info.height) throw new Error('crop size changed')
  let changed = 0
  for(let n=0;n<expected.data.length;n+=4) if(!expected.data.subarray(n,n+4).equals(got.data.subarray(n,n+4))) changed++
  return changed
}
export async function cropOriginal(original: Uint8Array, crop: CropGeometry): Promise<Buffer> {
  const b = crop.window, bytes = await sharp(original).rotate().toColourspace('srgb').extract({ left:b.x0,top:b.y0,width:b.x1-b.x0,height:b.y1-b.y0 }).png().toBuffer()
  if (await retainedPixelProof(original,bytes,b)!==0) throw new Error('crop changed retained pixels')
  return bytes
}
