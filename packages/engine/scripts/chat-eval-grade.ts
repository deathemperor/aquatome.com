/** The chat eval's grading of figures (chat-eval.ts): which numbers an answer has, and what Claude was given to read. */

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
