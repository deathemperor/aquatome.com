import { z } from 'zod'

const label = z.string().trim().min(1)
export const repeatedTurns = z.array(z.object({
  id: label,
  post: label,
  form: z.enum(['post', 'posttank', 'tank']),
  inputHash: z.string().regex(/^[a-f0-9]{16}$/).optional(),
  text: z.string().optional(),
  failed: z.string().optional(),
  named: z.array(z.string()).optional(),
}))
type RepeatTurn = z.infer<typeof repeatedTurns>[number]
type Three<T> = readonly [T, T, T]
type Arm = { name: string; turns: RepeatTurn[] }

/** One fact under the same conditions in all three answers. Use the same units and wording for equivalent values. */
const claim = z.strictObject({ value: label, quote: label })
export const repeatReview = z.array(z.strictObject({
  id: label,
  facts: z.array(z.strictObject({
    fact: label,
    answers: z.tuple([claim.nullable(), claim.nullable(), claim.nullable()]),
    page: claim.extend({ path: z.string().startsWith('/') }).optional(),
  })),
}))
export const repeatPages = z.record(z.string().startsWith('/'), z.string())
type Reviews = z.infer<typeof repeatReview>
type Pages = z.infer<typeof repeatPages>

type Answer = { text: string; named: string[] }
type Complete = { id: string; post: string; form: RepeatTurn['form']; inputHash: string; answers: Three<Answer> }
type Incomplete = { id: string; reason: string; arms: string[] }

/** Match three independently saved arms. A failed answer or a different prompt must stay out of the denominator. */
export function groupRepeats(arms: Three<Arm>) {
  if (new Set(arms.map(arm => arm.name)).size !== 3) throw new Error('Give three distinct arms.')
  const tables = arms.map(({ name, turns }) => {
    const table = new Map<string, RepeatTurn>()
    for (const turn of turns) {
      if (table.has(turn.id)) throw new Error(`Duplicate turn ${turn.id} in ${name}.`)
      table.set(turn.id, turn)
    }
    return table
  })
  const ids = [...new Set(tables.flatMap(table => [...table.keys()]))].sort()
  const complete: Complete[] = []
  const incomplete: Incomplete[] = []
  for (const id of ids) {
    const rows = tables.map(table => table.get(id))
    const [a, b, c] = rows
    const missing = arms.filter((_, i) => !rows[i]?.text?.trim() || rows[i]?.failed).map(arm => arm.name)
    if (!a?.text || !b?.text || !c?.text || missing.length) {
      incomplete.push({ id, reason: 'missing or failed answer', arms: missing })
    } else if (b.post !== a.post || c.post !== a.post || b.form !== a.form || c.form !== a.form) {
      incomplete.push({ id, reason: 'different post or question form', arms: arms.map(arm => arm.name) })
    } else if (!a.inputHash || !b.inputHash || !c.inputHash || b.inputHash !== a.inputHash || c.inputHash !== a.inputHash) {
      incomplete.push({ id, reason: 'missing or different input fingerprints', arms: arms.map(arm => arm.name) })
    } else {
      complete.push({
        id, post: a.post, form: a.form, inputHash: a.inputHash,
        answers: [{ text: a.text, named: a.named ?? [] }, { text: b.text, named: b.named ?? [] }, { text: c.text, named: c.named ?? [] }],
      })
    }
  }
  return { arms: arms.map(arm => arm.name), complete, incomplete }
}

const PAIRS = [[0, 1], [0, 2], [1, 2]] as const

/** Count distinct answers once per category, using evidence checked against the recorded text and page snapshots. */
export function countContradictions(repeats: ReturnType<typeof groupRepeats>, reviews: Reviews, pages: Pages) {
  const reviewOf = new Map(reviews.map(review => [review.id, review]))
  if (reviewOf.size !== reviews.length) throw new Error('A case has more than one review.')
  const completeIds = new Set(repeats.complete.map(c => c.id))
  for (const id of reviewOf.keys()) {
    if (!completeIds.has(id)) throw new Error(`No complete set of answers to review for ${id}.`)
  }
  const findings = []
  const unreviewed = []
  let betweenAnswers = 0, againstPage = 0, either = 0
  for (const record of repeats.complete) {
    const review = reviewOf.get(record.id)
    if (!review) { unreviewed.push(record.id); continue }
    const seenFacts = new Set<string>()
    const disagreeing = new Set<number>()
    const against = new Set<number>()
    for (const { fact, answers, page } of review.facts) {
      const where = `${record.id}: ${fact}`
      if (seenFacts.has(fact)) throw new Error(`Repeated fact for ${where}.`)
      seenFacts.add(fact)
      for (const [i, entry] of answers.entries()) {
        if (entry && !record.answers[i]!.text.includes(entry.quote)) throw new Error(`Answer ${i + 1} doesn't contain the quote for ${where}.`)
      }
      if (page && !pages[page.path]?.includes(page.quote)) throw new Error(`Page ${page.path} doesn't contain the quote for ${where}.`)
      const pairs = PAIRS.filter(([a, b]) => answers[a] && answers[b] && answers[a].value !== answers[b].value)
      const pageConflicts = page ? answers.flatMap((entry, i) => entry && entry.value !== page.value ? [i] : []) : []
      for (const pair of pairs) for (const i of pair) disagreeing.add(i)
      for (const i of pageConflicts) against.add(i)
      if (pairs.length || pageConflicts.length) {
        findings.push({
          id: record.id, fact, between: pairs.map(pair => pair.map(i => repeats.arms[i])),
          againstPage: pageConflicts.map(i => repeats.arms[i]),
          ...(page ? { page: page.path } : {}),
        })
      }
    }
    betweenAnswers += disagreeing.size
    againstPage += against.size
    either += new Set([...disagreeing, ...against]).size
  }
  return {
    arms: repeats.arms,
    completeCases: repeats.complete.length,
    reviewedCases: reviews.length,
    reviewedAnswers: reviews.length * 3,
    incomplete: repeats.incomplete,
    unreviewed,
    betweenAnswers, againstPage, either, findings,
  }
}
