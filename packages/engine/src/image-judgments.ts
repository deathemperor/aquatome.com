import { createHash, randomUUID } from 'node:crypto'

export const IMAGE_PAIR_POLICY = 'two-independent-judgments-v1'
export type Judgment<T> = { id: string; at: string; seconds: number; value?: T; failed: boolean; passes: boolean; decision: string }
/** Separate invocations, identical caller-owned input. Observe both promises even if either fails. */
export async function pairedJudgments<T>(judge: () => Promise<T>, accepts: (answer: T) => boolean, decision: (answer: T) => string = answer => accepts(answer) ? 'pass' : 'refuse') {
  const started = Date.now()
  const calls = [0, 1].map(async (): Promise<Judgment<T>> => {
    const id = randomUUID(), at = new Date().toISOString(), start = Date.now()
    try {
      const value = await judge()
      return { id, at, seconds: (Date.now()-start)/1000, value, failed: false, passes: accepts(value), decision: decision(value) }
    } catch {
      return { id, at, seconds: (Date.now()-start)/1000, failed: true, passes: false, decision: 'unavailable' }
    }
  })
  const [first, second] = await Promise.all(calls)
  return { policy: IMAGE_PAIR_POLICY, first: first!, second: second!, pass: first!.passes && second!.passes, disagreement: first!.decision !== second!.decision, incomplete: first!.failed || second!.failed, seconds: (Date.now()-started)/1000, codexSeconds: first!.seconds + second!.seconds }
}
/** Safe record for content and evidence: no free-form model observations or photo lettering. */
export function judgmentReceipt(pair: Awaited<ReturnType<typeof pairedJudgments>>) {
  return { policy: pair.policy, pass: pair.pass, disagreement: pair.disagreement, incomplete: pair.incomplete, judgments: [pair.first, pair.second].map(({ value: _value, ...record }) => record), seconds: pair.seconds, codexSeconds: pair.codexSeconds }
}
export type JudgmentPairReceipt = ReturnType<typeof judgmentReceipt>
export function validJudgmentPair(value: unknown): value is JudgmentPairReceipt {
  const p = value as JudgmentPairReceipt | undefined, rows = p?.judgments
  return !!p && p.policy === IMAGE_PAIR_POLICY && p.incomplete === false && Array.isArray(rows) && rows.length === 2
    && rows.every(r => !!r && typeof r === 'object' && typeof r.id === 'string' && !!r.id && r.failed === false && typeof r.passes === 'boolean' && typeof r.decision === 'string')
    && rows[0]!.id !== rows[1]!.id && p.pass === rows.every(r => r.passes)
    && p.disagreement === (rows[0]!.decision !== rows[1]!.decision)
}
export function judgmentHashes(pair: JudgmentPairReceipt): [string,string] {
  if(!validJudgmentPair(pair)||!pair.pass)throw new Error('two positive judgments required')
  return pair.judgments.map(j=>createHash('sha256').update(JSON.stringify(j)).digest('hex')) as [string,string]
}
