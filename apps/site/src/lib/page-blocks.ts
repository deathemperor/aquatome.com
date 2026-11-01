import { HTMLElement, TextNode, parse, type Node } from 'node-html-parser'
import type { Block, Image, Inline, Run } from '@aq/schema/app-page'

/**
 * A page's HTML as it's shown (after mentions, figures and the table of contents are put in) as the app's blocks
 * (packages/schema/src/app-page.ts). What it can't convert becomes a "web" block and is named in `unknown`: the site's
 * check runs every guide through it and expects none.
 */
export function htmlBlocks(html: string): { blocks: Block[]; unknown: string[] } {
  const unknown = new Set<string>()
  const blocks = toBlocks(parse(html), unknown)
  return { blocks, unknown: [...unknown].sort() }
}

type Marks = Omit<Run, 'text'>
const BLOCKS = new Set(['p', 'h2', 'h3', 'h4', 'ul', 'ol', 'table', 'figure', 'div', 'blockquote', 'section', 'pre', 'hr', 'img'])

const tagOf = (n: Node | null | undefined) => (n instanceof HTMLElement ? n.rawTagName?.toLowerCase() : undefined)
const clean = (s: string) => s.replace(/\s+/g, ' ').trim()

function toBlocks(parent: HTMLElement, unknown: Set<string>): Block[] {
  const out: Block[] = []
  let loose: Node[] = [] // text between blocks: a paragraph of its own
  const flush = () => {
    const c = inline(loose, unknown)
    if (c.length) out.push({ t: 'p', c })
    loose = []
  }
  const web = (what: string) => {
    unknown.add(what)
    if (out.at(-1)?.t !== 'web') out.push({ t: 'web' })
  }
  for (const n of parent.childNodes) {
    const tag = tagOf(n)
    if (!(n instanceof HTMLElement) || !tag || !BLOCKS.has(tag)) {
      loose.push(n)
      continue
    }
    flush()
    switch (tag) {
      case 'p': {
        const c = inline(n.childNodes, unknown)
        if (c.length) out.push({ t: 'p', c })
        break
      }
      case 'h2': case 'h3': case 'h4': {
        const text = clean(n.textContent)
        const id = n.getAttribute('id')
        if (text) out.push({ t: 'h', text, ...(id ? { id } : {}) })
        break
      }
      case 'ul': case 'ol': {
        const items: Block[][] = []
        for (const li of n.childNodes) {
          if (tagOf(li) === 'li') {
            const item = toBlocks(li as HTMLElement, unknown)
            if (item.length) items.push(item)
          } else if (li instanceof HTMLElement) unknown.add(`${tag}>${tagOf(li)}`)
        }
        if (items.length) out.push({ t: 'list', ...(tag === 'ol' ? { ordered: true as const } : {}), items })
        break
      }
      case 'table': out.push(table(n, unknown)); break
      case 'figure': {
        const f = figure(n, unknown)
        if (f) out.push(f)
        else web('figure without a sized image')
        break
      }
      case 'div': {
        const cls = n.getAttribute('class')
        // A plain box, a video section's pictures (lib/video.ts) or a guide section's (lib/figures.ts): what's inside.
        if (!cls || cls === 'vfigs' || cls === 'figs') out.push(...toBlocks(n, unknown))
        else if (n.classList.contains('moments')) {
          const m = moments(n)
          if (m) out.push(m)
          else web('div.moments without moments')
        } else web(`div.${cls}`)
        break
      }
      default: web(tag)
    }
  }
  flush()
  return out
}

/** Inline content as runs: bold, italic, links (with a glossary term's tip), line breaks; spaces as a browser shows them. */
function inline(nodes: Node[], unknown: Set<string>, cell = false): Inline[] {
  const runs: Run[] = []
  const walk = (nodes: Node[], marks: Marks) => {
    for (const n of nodes) {
      if (n instanceof TextNode) {
        const text = n.text.replace(/[ \t\r\n\f]+/g, ' ')
        if (text) runs.push({ text, ...marks })
        continue
      }
      if (!(n instanceof HTMLElement)) continue
      const tag = tagOf(n)
      switch (tag) {
        case 'strong': case 'b': walk(n.childNodes, { ...marks, b: true }); break
        case 'em': case 'i': walk(n.childNodes, { ...marks, i: true }); break
        case 'a': walk(n.childNodes, { ...marks, ...link(n) }); break
        case 'br': runs.push({ text: '\n', ...marks }); break
        case 'span': case 'sup': case 'sub': case 'small': case 'mark': case 'abbr': case 'code': walk(n.childNodes, marks); break
        // A table cell's paragraphs and lists, as lines.
        case 'p': case 'ul': case 'ol': case 'li': case 'div':
          if (!cell) unknown.add(`${tag} inside text`)
          // A new line, unless one just began (a list item's paragraph stays on its bullet's line).
          if (runs.length && !runs.at(-1)!.text.endsWith('\n') && runs.at(-1)!.text !== '• ') runs.push({ text: '\n' })
          if (tag === 'li') runs.push({ text: '• ' })
          walk(n.childNodes, marks)
          break
        default:
          unknown.add(tag ?? 'node')
          walk(n.childNodes, marks)
      }
    }
  }
  walk(nodes, {})
  return tidy(runs)
}

function link(a: HTMLElement): Marks {
  const href = a.getAttribute('href')
  const term = a.getAttribute('data-term'), text = a.getAttribute('data-tip')
  return { ...(href ? { href } : {}), ...(term && text ? { tip: { term, text } } : {}) }
}

const same = (a: Run, b: Run) =>
  a.b === b.b && a.i === b.i && a.href === b.href && a.tip?.term === b.tip?.term && a.tip?.text === b.tip?.text

/**
 * Spaces as a browser shows them: none at the ends of a paragraph or around a line break, never two in a row (also
 * across bold or a link), a run of only spaces gone. Then runs that look the same are joined.
 */
function tidy(runs: Run[]): Inline[] {
  const res: Run[] = []
  const trimEnd = () => {
    while (res.length) {
      const last = res.at(-1)!
      last.text = last.text.replace(/ +$/, '')
      if (last.text) break
      res.pop()
    }
  }
  for (const r of runs) {
    let text = r.text.replace(/ *\n */g, '\n')
    const prev = res.at(-1)?.text
    if (prev === undefined || prev.endsWith(' ') || prev.endsWith('\n')) text = text.replace(/^ +/, '')
    if (text.startsWith('\n')) trimEnd()
    if (text) res.push({ ...r, text })
  }
  trimEnd()
  // Line breaks at the ends of a paragraph show nothing.
  while (res[0]?.text.startsWith('\n')) {
    res[0].text = res[0].text.replace(/^\n+/, '')
    if (!res[0].text) res.shift()
  }
  while (res.at(-1)?.text.endsWith('\n')) {
    const last = res.at(-1)!
    last.text = last.text.replace(/\n+$/, '')
    if (!last.text) res.pop()
  }
  const out: Run[] = []
  for (const r of res) {
    const prev = out.at(-1)
    if (prev && same(prev, r)) prev.text += r.text
    else out.push(r)
  }
  return out.map(({ text, ...marks }) => (Object.keys(marks).length ? { text, ...marks } : text))
}

function table(t: HTMLElement, unknown: Set<string>): Block {
  let head: Inline[][] | undefined
  const rows: Inline[][][] = []
  for (const tr of t.querySelectorAll('tr')) {
    const cells = tr.childNodes.filter((c): c is HTMLElement => tagOf(c) === 'th' || tagOf(c) === 'td')
    const row = cells.map(c => inline(c.childNodes, unknown, true))
    const header = tagOf(tr.parentNode) === 'thead' || cells.every(c => tagOf(c) === 'th')
    if (header && !head && !rows.length) head = row
    else rows.push(row)
  }
  return { t: 'table', ...(head ? { head } : {}), rows }
}

function image(img: HTMLElement | null, credit?: Image['credit']): Image | undefined {
  const src = img?.getAttribute('src'), w = Number(img?.getAttribute('width')), h = Number(img?.getAttribute('height'))
  if (!src || !(w > 0) || !(h > 0)) return undefined
  const alt = img!.getAttribute('alt')
  return { src, w: Math.round(w), h: Math.round(h), ...(alt ? { alt } : {}), ...(credit ? { credit } : {}) }
}

/** A photo in the text (lib/figures.ts, lib/video.ts): the page it shows, its caption, its credit as the © mark gives it. */
function figure(f: HTMLElement, unknown: Set<string>): Block | undefined {
  const cap = f.querySelector('figcaption')
  const mark = cap?.querySelector('a.cite.pic')
  const credit = mark && mark.getAttribute('data-term') && mark.getAttribute('data-tip')
    ? { text: mark.getAttribute('data-term')!, licence: mark.getAttribute('data-tip')!, ...(mark.getAttribute('href') ? { url: mark.getAttribute('href')! } : {}) }
    : undefined
  mark?.remove()
  const img = image(f.querySelector('img'), credit)
  if (!img) return undefined
  const a = f.querySelector('img')!.parentNode
  const href = tagOf(a) === 'a' ? (a as HTMLElement).getAttribute('href') : undefined
  const caption = cap ? inline(cap.childNodes, unknown) : []
  return { t: 'figure', img, ...(caption.length ? { caption } : {}), ...(href ? { href } : {}) }
}

/** A video guide's stills (lib/video.ts), each playing the video from its moment. */
function moments(d: HTMLElement): Block | undefined {
  const buttons = d.querySelectorAll('button.moment')
  const youtubeId = buttons[0]?.getAttribute('data-vp-for')
  if (!youtubeId) return undefined
  const items = buttons.flatMap(b => {
    const img = image(b.querySelector('img')), at = Number(b.getAttribute('data-t'))
    return img && Number.isInteger(at) && at >= 0 ? [{ at, img, caption: clean(b.querySelector('.mc')?.textContent ?? '') }] : []
  })
  return items.length ? { t: 'moments', title: clean(d.querySelector('.mh')?.textContent ?? ''), youtubeId, items } : undefined
}
