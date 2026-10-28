export type CommentInput = { entityRef: string; name: string; body: string }
export type RuleContext = { duplicate: boolean; postsToday: number }
export type Verdict = { ok: true } | { held: string } | { reject: string }

export const ENTITY_RE = /^(species|plant|guide):[a-z0-9-]{1,140}$/
const MAX_POSTS_PER_DAY = 5
/** Obvious spam/abuse vocabulary only — Claude's daily pass handles the nuance. */
const BLOCKED = ['casino', 'cá cược', 'nhà cái', 'cho vay', 'vay tiền', 'xổ số', 'lô đề', 'sex', 'viagra', 'zalo:', 'telegram:']

/** Shape check: anything failing here is rejected outright (400). */
export function parseComment(raw: unknown): CommentInput | string {
  const x = (raw ?? {}) as Record<string, unknown>
  const entityRef = typeof x.e === 'string' ? x.e : ''
  const name = typeof x.name === 'string' ? x.name.trim() : ''
  const body = typeof x.body === 'string' ? x.body.trim() : ''
  if (!ENTITY_RE.test(entityRef)) return 'bad entity'
  if (name.length < 1 || name.length > 40) return 'name must be 1–40 characters'
  if (body.length < 2 || body.length > 2000) return 'comment must be 2–2000 characters'
  return { entityRef, name, body }
}

/** Content rules that need no I/O; run before Turnstile so obvious cases cost nothing. */
export function staticRules(c: CommentInput): Verdict {
  const text = `${c.name}\n${c.body}`
  if (text.includes('<')) return { held: 'contains <' }
  if ((text.match(/https?:\/\/\S+|www\.\S+|\b[a-z0-9-]+\.(com|net|vn|io|xyz|top|shop)\b\S*/gi) ?? []).length > 1) return { held: 'more than one link' }
  const lower = text.toLowerCase()
  const hit = BLOCKED.find(t => lower.includes(t))
  if (hit) return { held: `blocked term: ${hit}` }
  return { ok: true }
}

export function checkRules(c: CommentInput, ctx: RuleContext): Verdict {
  const s = staticRules(c)
  if (!('ok' in s)) return s
  if (ctx.duplicate) return { held: 'duplicate within 24 h' }
  if (ctx.postsToday > MAX_POSTS_PER_DAY) return { held: 'more than 5 posts today' }
  return { ok: true }
}
