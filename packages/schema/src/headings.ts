import { HTMLElement } from 'node-html-parser'

/** A heading's own number: "#3 …", "3. …", "3) …", "Bước 3", "Top 3" (a heading that merely starts with a count, "10 loại cây", has none). */
export const OWN_NUMBER = /^(?:#\s?(\d+)|(\d+)[.):]\s|(?:top|bước|step|langkah|อันดับ|ขั้นที่)\s?(\d+)\b)/iu
export const ownNumber = (heading: string) => { const m = heading.trim().match(OWN_NUMBER); return m ? Number(m[1] ?? m[2] ?? m[3]) : undefined }

/**
 * `group`: a heading over sub-sections; `section`: one with text under it; `empty`: one with nothing under it. `sub`: one
 * of the numbered run a group holds.
 */
export type HeadingRole = { el: HTMLElement; text: string; role: 'group' | 'section' | 'empty'; sub: boolean }

const shape = (s: string) => s.toLowerCase().replace(/\d+/g, '#')
/** How a heading's own number is written: "#", "1." or the word before it ("bước", "top"). */
const numbering = (h: string) => { const m = h.trim().match(OWN_NUMBER); return m ? (m[1] ? '#' : m[2] ? '1.' : m[0].replace(/[\s\d]+$/, '').toLowerCase()) : undefined }
/**
 * Two headings of one list: numbered the same way ("1. …", "2. …"; "Bước 2: …", "Bước 3: …"), or the same words but
 * for their numbers ("Ngày 16…", "Ngày 26…"). "Top 5 lý do" over "5. …" is a group over its countdown.
 */
const peers = (a: string, b: string) => { const k = numbering(a); return (k !== undefined && k === numbering(b)) || shape(a) === shape(b) }

/**
 * What each heading of a stored text is. The engine writes every heading as an h3 (sanitize.ts), so a heading over
 * sub-headings looks the same as one with nothing under it; what follows it tells them apart:
 * - empty: the end of the text, or a heading that is not its sub-section (an empty one, a group, or its peer)
 * - group: a heading straight over one with text under it, its first sub-section ("Lựa chọn loài" over a heading a
 *   species, "Ưu điểm" over "1. Nhẹ"). When that first one has a number, the group holds the numbered run (`sub`). An
 *   unnumbered group's end the text doesn't say ("Môi trường bể nuôi" over "Thông số nước", then "Cho ăn" and 12 more
 *   of feeding, all h3), so none of the headings after it is marked as its own.
 * The engine's sweep drops the empty ones (content-rules.ts); the site shows a group a level above its sub-sections
 * (lib/toc.ts), and its built-page check calls a heading empty by those levels: nothing until the next heading of its
 * level or higher, or the end.
 */
export function headingRoles(root: HTMLElement): HeadingRole[] {
  const blocks = root.childNodes.filter((n): n is HTMLElement => n instanceof HTMLElement && !(n.rawTagName === 'h3' && !n.text.trim()))
  const text = (el: HTMLElement | undefined) => (el?.rawTagName === 'h3' ? el.text.trim() : undefined)
  const role: (HeadingRole['role'] | undefined)[] = []
  for (let i = blocks.length - 1; i >= 0; i--) {
    const h = text(blocks[i])
    if (h === undefined) continue
    const next = blocks[i + 1], n = text(next)
    role[i] = !next ? 'empty' : n === undefined ? 'section' : role[i + 1] === 'section' && !peers(h, n) ? 'group' : 'empty'
  }
  const out: HeadingRole[] = []
  let run = false
  blocks.forEach((el, i) => {
    const h = text(el)
    if (h === undefined) return
    run = role[i] === 'group' ? ownNumber(text(blocks[i + 1])!) !== undefined : run && ownNumber(h) !== undefined
    out.push({ el, text: h, role: role[i]!, sub: role[i] !== 'group' && run })
  })
  return out
}
