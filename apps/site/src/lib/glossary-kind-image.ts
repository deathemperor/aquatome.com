import type { KindAiLabelCorner, Photo } from '@aq/schema'
import { translator, type Lang } from './i18n'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

/** Shared markup for both actual placements. The reviewed corner is bound into the approval, not inferred by CSS. */
export function kindAiLabel(lang: Lang, photo: Photo, view: 'card' | 'large', corner: KindAiLabelCorner = 'top-left'): string {
  if (!photo.generated) return ''
  const inset = view === 'card' ? '8pt' : '16pt'
  const side = corner === 'top-right' ? 'right' : 'left'
  return `<span class="k-ai" data-ai-kind-label="${view}" style="top:${inset};${side}:${inset};max-width:calc(100% - 2 * ${inset})">${esc(translator(lang)('Ảnh do AI tạo'))}</span>`
}

/** A generated illustration and its label remain available when scripting is disabled. Real photos keep their path. */
export function kindLargeFallback(photo: Photo, name: string): string {
  if (!photo.generated) return ''
  return `<noscript><img src="${esc(photo.url)}" width="${photo.width}" height="${photo.height}" alt="${esc(photo.caption ?? name)}" /></noscript>`
}
