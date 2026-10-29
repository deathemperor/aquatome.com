// Post-build: write index.md beside every page's index.html so the Worker can answer `Accept: text/markdown`.
// Front matter mirrors Cloudflare's Markdown for Agents (title, description, image); the body is <main> minus chrome.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'node-html-parser'
import TurndownService from 'turndown'

const DROP = 'script, style, noscript, template, svg, form, button, nav, .comments, .products'
const td = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced' })
// Card links (an <a> wrapping a heading and labels) become one list line: "- [heading](href) · label · label".
td.addRule('card', {
  filter: node => node.nodeName === 'A' && !!node.querySelector('h1, h2, h3, h4, h5, h6'),
  replacement: (_, node) => {
    const a = node as HTMLAnchorElement
    const words = (el: Element) => el.textContent!.replace(/\s+/g, ' ').trim()
    const h = a.querySelector('h1, h2, h3, h4, h5, h6')!
    // Every innermost element outside the heading is one label.
    const rest = Array.from(a.getElementsByTagName('*')).filter(el => !el.firstElementChild && !h.contains(el)).map(words).filter(Boolean)
    const title = words(h)
    return `\n- [${title}](${a.getAttribute('href')})${rest.map(r => ` · ${r}`).join('')}\n`
  },
})

export function toMarkdown(html: string): string | null {
  const doc = parse(html)
  const main = doc.querySelector('main')
  if (!main) return null
  const meta = (sel: string) => doc.querySelector(sel)?.getAttribute('content')?.trim()
  const base = doc.querySelector('link[rel="canonical"]')?.getAttribute('href')
  for (const el of main.querySelectorAll(DROP)) el.remove()
  // Absolute links and images: agents read the markdown away from the page.
  if (base) for (const el of main.querySelectorAll('[href], [src]')) for (const a of ['href', 'src']) {
    const v = el.getAttribute(a)
    if (v && !/^(#|mailto:|data:)/.test(v)) el.setAttribute(a, new URL(v, base).href)
  }
  // Fact cards (dl > div > dt + dd) read as "label: value" lines, not run-together text.
  for (const dl of main.querySelectorAll('dl')) {
    const items = dl.querySelectorAll('dt').map(dt => `<li><strong>${dt.innerHTML}:</strong> ${dt.nextElementSibling?.innerHTML ?? ''}</li>`)
    dl.replaceWith(`<ul>${items.join('')}</ul>`)
  }
  const front = Object.entries({
    title: meta('meta[name="title"]') ?? meta('meta[property="og:title"]') ?? doc.querySelector('title')?.text.trim(),
    description: meta('meta[name="description"]') ?? meta('meta[property="og:description"]'),
    image: meta('meta[property="og:image"]'),
  }).filter(([, v]) => v).map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
  const body = td.turndown(main.innerHTML).replace(/\n{3,}/g, '\n\n').trim()
  return `${front.length ? `---\n${front.join('\n')}\n---\n\n` : ''}${body}\n`
}

const pages = (dir: string): string[] =>
  readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? pages(p) : f === 'index.html' ? [p] : [] })

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let n = 0
  for (const f of pages(fileURLToPath(new URL('../dist', import.meta.url)))) {
    const md = toMarkdown(readFileSync(f, 'utf8'))
    if (md) { writeFileSync(f.replace(/\.html$/, '.md'), md); n++ }
  }
  console.log(`markdown: ${n} pages`)
}
