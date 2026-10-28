import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse, type HTMLElement } from 'node-html-parser'

export const DIST = fileURLToPath(new URL('../dist', import.meta.url))
export const page = (path: string): { html: string; dom: HTMLElement } => {
  const clean = path.replace(/^\/|\/$/g, '')
  const file = clean === '404' ? `${DIST}/404.html` : `${DIST}/${clean}/index.html`.replace('//index', '/index')
  if (!existsSync(file)) throw new Error(`missing page ${path} (${file})`)
  const html = readFileSync(file, 'utf8')
  return { html, dom: parse(html) }
}
