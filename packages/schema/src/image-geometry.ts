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

/** Where the fish is, as the engine's box step records it: fractions of the photo from its top-left corner (photo-boxes.ts). */
export type SubjectFractions = { x: number; y: number; w: number; h: number }
/** The box in a photo's whole pixels, its edges rounded outward and kept inside the photo; none where nothing of it is. */
export function subjectPixels(f: SubjectFractions, width: number, height: number): PixelBox | undefined {
  const b = {
    x0: Math.max(0, Math.floor(f.x*width+1e-6)), y0: Math.max(0, Math.floor(f.y*height+1e-6)),
    x1: Math.min(Math.floor(width), Math.ceil((f.x+f.w)*width-1e-6)), y1: Math.min(Math.floor(height), Math.ceil((f.y+f.h)*height-1e-6)),
  }
  return validPixelBox(b, width, height) ? b : undefined
}
/**
 * A photo's box as the app reads it (`box`, `imgBox`): fractions of the photo, right for every resized copy of it, to four
 * places, rounded outward. None where the photo has no box.
 */
export function boxFractions(p: { width: number; height: number; subject?: PixelBox }): SubjectFractions | undefined {
  const s = p.subject
  if (!validPixelBox(s, p.width, p.height)) return undefined
  const down = (v: number) => Math.floor(v*1e4+1e-6)/1e4, up = (v: number) => Math.min(1, Math.ceil(v*1e4-1e-6)/1e4)
  const x = down(s.x0/p.width), y = down(s.y0/p.height)
  return { x, y, w: +(up(s.x1/p.width)-x).toFixed(4), h: +(up(s.y1/p.height)-y).toFixed(4) }
}
/**
 * How much of the fish's length a frame may cut and still show it whole: fin tips (the chief of staff, 2026-11-12, set by
 * eye on tiles at the app's size; the Design Lead confirmed it on 27.2 the same day). One constant: it is written into
 * protocols/photo-crop-vectors.json (packages/schema/test/photo-crop-vectors.test.ts), for the app's tests to hold its own
 * rule and cut to.
 */
export const SUBJECT_CUT = 0.05
/** The rule's slack on SUBJECT_CUT, so the last bit of a window's edge can't turn exactly SUBJECT_CUT into more. */
export const SUBJECT_SLACK = 1e-9
/**
 * Whether the loader gives each photo its box (`subject`), which every frame reads through subjectFrame. Off: no photo
 * has one, and every frame draws as today. On once the owner has seen the Design Lead's "whole" for the tile, the banner
 * and the card (the chief of staff, 2026-11-12). The loader's `subjectFrames` stands in for it.
 */
export const SUBJECT_FRAMES = false
/** How a frame shows a photo: covering it, its window placed at `x`, `y` (CSS object-position, 0–1), or the photo whole. */
export type SubjectFrame = { fit: 'cover'; x: number; y: number } | { fit: 'whole' }
/**
 * The rule as the app runs it, on what the app is sent: how a frame of `ratio` (width over height) shows a photo of
 * `aspect` (its width over height) whose fish is at `box` (fractions, as `box` and `imgBox` carry it). Centred, as today,
 * where that cuts SUBJECT_CUT of the fish or less; else moved onto the fish where that does; else the photo whole. No
 * box (not boxed yet, or no animal found): centred, as today, never whole. protocols/photo-crop-vectors.json has its cases.
 */
export function frameOf(aspect: number, box: SubjectFractions | undefined, ratio: number): SubjectFrame {
  if (!box || !(box.w > 0 && box.h > 0)) return { fit: 'cover', x: 0.5, y: 0.5 }
  // A cover window cuts one side only: along it, the window's share of the photo, and where the fish starts and ends.
  const across = aspect > ratio
  const [span, a, b] = across ? [ratio/aspect, box.x, box.x+box.w] : [aspect/ratio, box.y, box.y+box.h]
  const lost = (at: number) => (Math.max(0, at-a)+Math.max(0, b-at-span))/(b-a)
  const at = [(1-span)/2, Math.min(Math.max((a+b-span)/2, 0), 1-span)].find(at => lost(at) <= SUBJECT_CUT+SUBJECT_SLACK)
  if (at === undefined) return { fit: 'whole' }
  const pos = span < 1 ? at/(1-span) : 0.5
  return across ? { fit: 'cover', x: pos, y: 0.5 } : { fit: 'cover', x: 0.5, y: pos }
}
/**
 * How a frame of `ratio` shows a photo with the loader's box (`subject`): frameOf on the fractions the app is sent
 * (boxFractions), so the site and the app decide alike.
 */
export const subjectFrame = (p: { width: number; height: number; subject?: PixelBox }, ratio: number): SubjectFrame =>
  frameOf(p.width/p.height, boxFractions(p), ratio)
