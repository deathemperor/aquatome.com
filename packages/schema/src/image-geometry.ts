export type PixelBox = { x0: number; y0: number; x1: number; y1: number }
export type CropGeometry = { originalWidth: number; originalHeight: number; window: PixelBox; subject: PixelBox; margin: number }
export const validPixelBox = (b: PixelBox | undefined, width: number, height: number): b is PixelBox => !!b && [b.x0,b.y0,b.x1,b.y1].every(Number.isInteger) && b.x0 >= 0 && b.y0 >= 0 && b.x1 <= width && b.y1 <= height && b.x0 < b.x1 && b.y0 < b.y1
export const containsBox = (b: PixelBox, s: PixelBox) => s.x0 >= b.x0 && s.y0 >= b.y0 && s.x1 <= b.x1 && s.y1 <= b.y1
export function coverWindow(b: PixelBox, ratio: number): PixelBox {
  const width = b.x1-b.x0, height = b.y1-b.y0
  if (width/height > ratio) { const cut = (width-height*ratio)/2; return { ...b, x0: b.x0+cut, x1: b.x1-cut } }
  const cut = (height-width/ratio)/2; return { ...b, y0: b.y0+cut, y1: b.y1-cut }
}
export function validCropGeometry(c: CropGeometry | undefined): c is CropGeometry {
  return !!c && Number.isInteger(c.originalWidth) && Number.isInteger(c.originalHeight) && validPixelBox(c.window,c.originalWidth,c.originalHeight) && validPixelBox(c.subject,c.originalWidth,c.originalHeight) && Number.isInteger(c.margin) && c.margin >= 6 && containsBox(c.window,{ x0:c.subject.x0-c.margin,y0:c.subject.y0-c.margin,x1:c.subject.x1+c.margin,y1:c.subject.y1+c.margin })
}
export function cropFitsFrame(c: CropGeometry | undefined, ratio: number): boolean {
  if (!validCropGeometry(c)) return false
  return containsBox(coverWindow(c.window,ratio),{ x0:c.subject.x0-c.margin,y0:c.subject.y0-c.margin,x1:c.subject.x1+c.margin,y1:c.subject.y1+c.margin })
}
export function markOutsideCrop(c: CropGeometry,mark:PixelBox):boolean {
  if(!validCropGeometry(c)||!validPixelBox(mark,c.originalWidth,c.originalHeight))return false
  const padding=Math.max(4,Math.ceil(Math.min(c.originalWidth,c.originalHeight)*.01)),b=c.window
  return mark.x1+padding<=b.x0||mark.x0-padding>=b.x1||mark.y1+padding<=b.y0||mark.y0-padding>=b.y1
}
type CroppedPhoto = { width: number; height: number; altered?: { method: string; crop?: CropGeometry }[] }
const cropped = (p: CroppedPhoto) => p.altered?.find(a => a.method === 'mark-crop')
/** Existing photos retain their current policy. New crops must preserve the whole subject in every served frame. */
export function photoFitsHead(p: CroppedPhoto): boolean {
  const c = cropped(p)
  return !c || validCropGeometry(c.crop) && p.width === c.crop.window.x1-c.crop.window.x0 && p.height === c.crop.window.y1-c.crop.window.y0 && [4/3,16/9].every(r => cropFitsFrame(c.crop,r))
}
/** A whole-photo head needs the complete subject and margin inside the retained native crop, not a cover window. */
export function photoFitsWholeHead(p: CroppedPhoto): boolean {
  const c=cropped(p)
  return !!c && validCropGeometry(c.crop) && p.width===c.crop.window.x1-c.crop.window.x0 && p.height===c.crop.window.y1-c.crop.window.y0
}
export function photoFitsCard(p: CroppedPhoto): boolean {
  const c = cropped(p)
  return !c || validCropGeometry(c.crop) && p.width === c.crop.window.x1-c.crop.window.x0 && p.height === c.crop.window.y1-c.crop.window.y0 && [4/3,400/420,16/9,1.6].every(r => cropFitsFrame(c.crop,r))
}
