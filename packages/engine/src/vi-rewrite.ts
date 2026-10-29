import { readFileSync } from 'node:fs'
import type { Llm } from './claude'
import { sanitizeHtml } from './sanitize'

const RULES = readFileSync(new URL('./prompts/vi-rewrite.md', import.meta.url), 'utf8')
const STYLE = readFileSync(new URL('./prompts/vi-style.md', import.meta.url), 'utf8')
const SCHEMA = {
  type: 'object', required: ['parts'],
  properties: { parts: { type: 'array', items: { type: 'object', required: ['id', 'vi'], properties: { id: { type: 'string' }, vi: { type: 'string' } } } } },
}
const TASK = {
  fresh: 'Dịch phần EN sang tiếng Việt, như một người chơi thủy sinh lâu năm viết cho người Việt đọc. Phần chỉ có VI (không có EN) thì viết lại câu chữ cho tự nhiên, giữ nguyên mọi thông tin.',
  fix: 'Bản VI hiện tại đọc như văn dịch máy. Viết lại cho tự nhiên, đối chiếu từng ý với EN để không sai, không sót. Phần không có EN thì chỉ sửa câu chữ, giữ nguyên mọi thông tin.',
}

/** One piece of a page: the English source (when there is one) and the Vietnamese on the site now. */
export type Part = { id: string; en?: string; vi: string }
export type RewriteOpts = { mode: keyof typeof TASK; model?: string; glossary?: string[]; notes?: string[] }

/** New Vietnamese for each part, in the site's style guide. Never names, slugs or numbers outside the text. */
export async function rewriteVi(llm: Llm, parts: Part[], o: RewriteOpts): Promise<Map<string, string>> {
  const body = parts.map(p => [`### ${p.id}`, ...(p.en ? [`EN:\n${p.en}`] : []), ...(o.mode === 'fix' || !p.en ? [`VI:\n${p.vi}`] : [])].join('\n')).join('\n\n')
  const prompt = [
    RULES.replace('{{TASK}}', TASK[o.mode]), STYLE,
    ...(o.glossary?.length ? [`Bảng thuật ngữ trên site: ${o.glossary.join(', ')}`] : []),
    ...(o.notes?.length ? [`Bản trước bị người duyệt chấm thấp. Sửa theo các ghi chú sau:\n${o.notes.map(n => `- ${n}`).join('\n')}`] : []),
    `--- NỘI DUNG ---\n${body}`,
  ].join('\n\n')
  const r = await llm<{ parts: { id: string; vi: string }[] }>({ system: 'You edit Vietnamese for an aquarium handbook. Reply only with JSON.', prompt, schema: SCHEMA, model: o.model })
  const out = new Map<string, string>()
  for (const p of parts) {
    const vi = r.parts.find(x => x.id === p.id)?.vi.trim()
    if (!vi) throw new Error(`rewrite left out part ${p.id}`)
    // The stored Vietnamese decides the format (a guide's English may be a plain outline): HTML stays HTML, plain stays plain.
    out.set(p.id, /<[a-z]/i.test(p.vi) ? sanitizeHtml(vi) : vi.replace(/<[^>]+>/g, '').trim())
  }
  return out
}

/** How Vietnamese is written: the winner of scripts/eval-translate.ts (see docs/review/eval-translate.md). */
export const VI_WRITE: RewriteOpts = { mode: 'fix', model: 'opus' }
