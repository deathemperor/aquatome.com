/** The chat eval's grading (chat-eval.ts): which numbers an answer has, what Claude was given to read, which pages it read,
 * and how a FAQ question was found. */

/**
 * The numbers in a text, as Vietnamese writes them: "1.000" and "2.000.000" are thousands, "6,5" and "0,125" decimals,
 * "1.234,5" both. A group of three after a leading 0 is a decimal, so a dose like 0,125 isn't read as 125.
 */
export const numbersIn = (s: string): number[] =>
  (s.match(/\d+(?:[.,]\d+)*/g) ?? []).map(n =>
    /^[1-9]\d{0,2}([.,]\d{3})+$/.test(n) ? Number(n.replace(/[.,]/g, ''))
    : /^[1-9]\d{0,2}(\.\d{3})+,\d+$/.test(n) ? Number(n.replace(/\./g, '').replace(',', '.'))
    : Number(n.replace(',', '.')))

type Sent = { role: string; content: unknown }

/**
 * What Claude was given to read in a request: the user turns' text and every tool result (a search's list, the part of a
 * page it opened). Each request holds the turns before it, so the run's last request holds all it read.
 */
export function sentText(messages: readonly Sent[]): string {
  const parts: string[] = []
  const add = (c: unknown): void => {
    if (typeof c === 'string') { parts.push(c); return }
    const b = c as { type?: string; text?: unknown; content?: unknown } | null
    if (b?.type === 'text' && typeof b.text === 'string') parts.push(b.text)
    else if (b?.type === 'tool_result') (Array.isArray(b.content) ? b.content : [b.content]).forEach(add)
  }
  for (const m of messages) if (m.role === 'user') (Array.isArray(m.content) ? m.content : [m.content]).forEach(add)
  return parts.join('\n')
}

type Turn = { role: string; content: unknown }

/**
 * The pages a run read, by path: each `read_page` call whose result wasn't an error. The agent records a read before the
 * page loads, so a page that failed to load (or no page at that path) is in its steps but was never read.
 */
export function readPages(history: readonly Turn[]): string[] {
  const blocks = (m: Turn) => (Array.isArray(m.content) ? m.content : []) as { type?: string; id?: string; name?: string; input?: { path?: unknown }; tool_use_id?: string; is_error?: boolean }[]
  const failed = new Set(history.filter(m => m.role === 'user').flatMap(blocks).filter(b => b.type === 'tool_result' && b.is_error).map(b => b.tool_use_id))
  const read = history.filter(m => m.role === 'assistant').flatMap(blocks)
    .filter(b => b.type === 'tool_use' && b.name === 'read_page' && !failed.has(b.id) && typeof b.input?.path === 'string')
    .map(b => b.input!.path as string)
  return [...new Set(read)]
}

/**
 * A FAQ question, found: its guide read or shown and answered from (`covered` not false: having read the answer and
 * said the handbook hasn't it is the wrong refusal the eval is for), another page shown and answered as covered, or
 * neither.
 */
export const faqFound = (guideTouched: boolean, covered: boolean | undefined, pagesShown: number): 'guide' | 'other' | 'none' =>
  guideTouched && covered !== false ? 'guide' : covered && pagesShown ? 'other' : 'none'

const slug = (path: string) => path.split('/').filter(Boolean).at(-1) ?? ''
type Part = { type?: string; id?: string; name?: string; tool_use_id?: string; is_error?: boolean; content?: unknown }
const parts = (m: Turn) => (Array.isArray(m.content) ? m.content : []) as Part[]

/**
 * What check_tank_mates answered in a run (apps/site/worker/chat/mates.ts): each check's fish, as a tank-mates link
 * names them ("ca-betta:1,ca-neon-xanh:10", sorted), its verdict's level and sentence, and the head the text opens with.
 */
export function matesChecks(history: readonly Turn[]): { fish: string; level?: string; text?: string; head?: string }[] {
  const calls = new Set(history.filter(m => m.role === 'assistant').flatMap(parts).filter(b => b.type === 'tool_use' && b.name === 'check_tank_mates').map(b => b.id))
  return history.filter(m => m.role === 'user').flatMap(parts).filter(b => b.type === 'tool_result' && calls.has(b.tool_use_id) && !b.is_error).flatMap(b => {
    try {
      const r = JSON.parse(String(b.content)) as { fish: { path: string; count: number }[]; verdict?: { level: string; text: string }; answer?: { head: string } }
      return [{ fish: r.fish.map(f => `${slug(f.path)}:${f.count}`).sort().join(','), level: r.verdict?.level, text: r.verdict?.text, head: r.answer?.head }]
    } catch { return [] }
  })
}
