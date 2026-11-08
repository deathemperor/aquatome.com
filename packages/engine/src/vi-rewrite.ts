import { readFileSync } from 'node:fs'
import type { Llm } from './claude'
import { sanitizeHtml } from './sanitize'
import { phraseCount, phraseSlips, ticCount, ticSlips, VI_STYLE as STYLE } from './phrases'

const RULES = readFileSync(new URL('./prompts/vi-rewrite.md', import.meta.url), 'utf8')
const SCHEMA = {
  type: 'object', required: ['parts'],
  properties: { parts: { type: 'array', items: { type: 'object', required: ['id', 'vi'], properties: { id: { type: 'string' }, vi: { type: 'string' } } } } },
}
const TASK = {
  fresh: 'Dịch phần EN sang tiếng Việt, như một người chơi thủy sinh lâu năm viết cho người Việt đọc. Phần chỉ có VI (không có EN) thì viết lại câu chữ cho tự nhiên, giữ nguyên mọi thông tin.',
  fix: 'Bản VI hiện tại đọc như văn dịch máy. Viết lại cho tự nhiên, đối chiếu từng ý với EN để không sai, không sót. Phần không có EN thì bản VI là nguồn duy nhất: chỉ đổi cách diễn đạt, giữ từng chi tiết (con số, đơn vị, tên cây và vật liệu, ví dụ, mức khen chê, lời khuyên), không gộp hay rút gọn ý.',
}

/** One piece of a page: the English source (when there is one) and the Vietnamese on the site now. */
export type Part = { id: string; en?: string; vi: string }
export type RewriteOpts = { mode: keyof typeof TASK; model?: string; glossary?: string[]; notes?: string[]; /** The source site's name (so the writer knows whose "we" it is and leaves it out). */ source?: string }

/**
 * New Vietnamese for each part, in the site's style guide. Never names, slugs or numbers outside the text. A part that
 * still has a word from the list of words hobbyists rarely write (phrases.ts) is written once more, told which: the
 * editors' second round found the list in the prompt alone left some on half the pages (2026-11-07). So is a part with a
 * tic (ticSlips): the third round found the listed word swapped for its neighbour, again and again. The second try is
 * kept when it has fewer of both.
 */
export async function rewriteVi(llm: Llm, parts: Part[], o: RewriteOpts): Promise<Map<string, string>> {
  const once = async (ps: Part[], left?: string[]) => {
    const body = ps.map(p => [`### ${p.id}`, ...(p.en ? [`EN:\n${p.en}`] : []), ...(o.mode === 'fix' || !p.en || left ? [`VI:\n${p.vi}`] : [])].join('\n')).join('\n\n')
    const prompt = [
      RULES.replace('{{TASK}}', left ? TASK.fix : TASK[o.mode]), STYLE,
      ...(o.source ? [`Nguồn của nội dung: ${o.source}. Chỗ bài gốc xưng "tôi"/"chúng tôi" thì viết trung tính, không nhắc ${o.source} hay "tác giả".`] : []),
      ...(o.glossary?.length ? [`Bảng thuật ngữ trên site: ${o.glossary.join(', ')}`] : []),
      ...(o.notes?.length ? [`Bản trước bị người duyệt chấm thấp. Sửa theo các ghi chú sau:\n${o.notes.map(n => `- ${n}`).join('\n')}`] : []),
      ...(left ? [`Bản VI dưới đây đã viết lại, nhưng vẫn còn những chữ trong danh sách người chơi ít khi viết, hoặc một kiểu chữ lặp lại thành tật. Viết lại cả câu có chúng, đừng thay bằng một chữ cùng nghĩa; giữ nguyên ý, đừng đổi gì khác:\n${left.map(n => `- ${n}`).join('\n')}`] : []),
      `--- NỘI DUNG ---\n${body}`,
    ].join('\n\n')
    const r = await llm<{ parts: { id: string; vi: string }[] }>({ system: 'You edit Vietnamese for an aquarium handbook. Reply only with JSON.', prompt, schema: SCHEMA, model: o.model })
    const out = new Map<string, string>()
    for (const p of ps) {
      const vi = r.parts.find(x => x.id === p.id)?.vi.trim()
      if (!vi) throw new Error(`rewrite left out part ${p.id}`)
      // The stored Vietnamese decides the format (a guide's English may be a plain outline): HTML stays HTML, plain stays plain.
      out.set(p.id, /<[a-z]/i.test(p.vi) ? sanitizeHtml(vi) : vi.replace(/<[^>]+>/g, '').trim())
    }
    return out
  }
  const misses = (t: string) => phraseCount(t, 'vi') + ticCount(t, 'vi')
  const out = await once(parts)
  const left = parts.filter(p => misses(out.get(p.id)!))
  if (!left.length) return out
  const again = await once(left.map(p => ({ ...p, vi: out.get(p.id)! })), left.flatMap(p => [...phraseSlips(out.get(p.id)!, 'vi'), ...ticSlips(out.get(p.id)!, 'vi')].map(s => `${p.id}: ${s}`)))
  for (const p of left) if (misses(again.get(p.id)!) < misses(out.get(p.id)!)) out.set(p.id, again.get(p.id)!)
  return out
}

/** How Vietnamese is written: the winner of scripts/eval-translate.ts (see docs/review/eval-translate.md). */
export const VI_WRITE: RewriteOpts = { mode: 'fix', model: 'opus' }
