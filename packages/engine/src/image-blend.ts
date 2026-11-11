import type { MarkBox } from './image-transforms'

export const MARK_BLEND_VERSION = 'harmonic-boundary-v1'
type PatchArea = { left: number; top: number; width: number; height: number }
/** Match a repaint's low-frequency colour to the original boundary without blurring its detail or changing outside pixels. */
export function blendMarkPixels(original: Uint8Array, paint: Uint8Array, width: number, area: PatchArea, box: MarkBox, recoverThreePixelFeather = false) {
  const w = box.x1 - box.x0, h = box.y1 - box.y0, g = new Float32Array(w * h * 3), shift = new Float32Array(g.length), out = Buffer.from(original)
  if (w < 3 || h < 3) throw new Error('mark blend box too small')
  for (let y=0;y<h;y++) for(let x=0;x<w;x++) {
    const at=((y+box.y0)*width+x+box.x0)*4, from=((y+box.y0-area.top)*area.width+x+box.x0-area.left)*4, i=(y*w+x)*3
    const d=Math.min(x,w-1-x,y,h-1-y), weight=recoverThreePixelFeather?Math.min(1,(d+1)/3):1
    for(let c=0;c<3;c++)g[i+c]=Math.max(0,Math.min(255,(paint[from+c]!-(1-weight)*original[at+c]!)/weight))
  }
  const delta=(x:number,y:number,c:number)=>original[((y+box.y0)*width+x+box.x0)*4+c]!-g[(y*w+x)*3+c]!
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
    const u=x/(w-1),v=y/(h-1)
    for(let c=0;c<3;c++) {
      const corners=(1-u)*(1-v)*delta(0,0,c)+u*(1-v)*delta(w-1,0,c)+(1-u)*v*delta(0,h-1,c)+u*v*delta(w-1,h-1,c)
      shift[(y*w+x)*3+c]=(1-v)*delta(x,0,c)+v*delta(x,h-1,c)+(1-u)*delta(0,y,c)+u*delta(w-1,y,c)-corners
    }
  }
  let iterations=0,maxDelta=Infinity
  const row=w*3,omega=1.9
  for(;iterations<1200&&maxDelta>.02;iterations++) {
    maxDelta=0
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++)for(let c=0;c<3;c++) {
      const i=(y*w+x)*3+c,d=omega*((shift[i-3]!+shift[i+3]!+shift[i-row]!+shift[i+row]!)/4-shift[i]!)
      shift[i]!+=d;maxDelta=Math.max(maxDelta,Math.abs(d))
    }
  }
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++) {
    const at=((y+box.y0)*width+x+box.x0)*4,i=(y*w+x)*3
    for(let c=0;c<3;c++)out[at+c]=Math.round(Math.max(0,Math.min(255,g[i+c]!+shift[i+c]!)))
  }
  return { data: out, iterations, maxDelta }
}
