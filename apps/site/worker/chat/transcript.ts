import type { Turn } from '../fishid/transcript'
import type { Found } from './handover'

/**
 * What each question in the chat said and did, for the owner's evals and checks: kept as its conversation is, with no
 * time limit, and deleted with the account (the owner's decision, 2026-11-07). In the private UPLOADS bucket under the
 * account's own prefix, chat-run/<account>/<conversation>/<n>-<run>.json (the account as its HMAC, store.ts), so
 * deleting the account finds them (deleteChatOf); one object a question the agent took up, a failed one too.
 *
 * Text only, as fish ID's (fishid/transcript.ts): the question, what Claude thought (its summarised thinking), wrote and
 * asked of the tools, what the tools answered (cut short; the reader's tanks too, when it read them), and the answer
 * the reader got. Never an account id, the IP, a cookie or a key.
 */
export const transcriptKey = (account: string, conversation: string, n: number, run: string) =>
  `chat-run/${account}/${conversation}/${String(n).padStart(3, '0')}-${run}.json`

export type ChatRunRecord = {
  v: 1
  conversation: string
  /** The question's number in its conversation (a run that failed has the number the next question takes too). */
  n: number
  at: string
  lang: string
  model: string
  question: string
  /** 'ok', or the error the reader got ('failed', 'unavailable'). */
  outcome: string
  ms: number
  /**
   * In ms from the question's arrival: to the run's start (`before`); on a stream, to the text's first piece (`words`) and
   * its last (`last`), to the run's end (`answered`), and to `done` or the error (`done`), sent once the turn is saved;
   * and to the last write that reached the reader (`seen`): before `done`, they left.
   */
  timing?: { before: number; words?: number; last?: number; answered?: number; done?: number; seen?: number }
  cost: number
  tokens: { input: number; output: number }
  agent: { calls: number; tools: number; stopped: string }
  answer?: { text: string; covered: boolean; blocks: number; dropped: string[] }
  /** The first line the reader was shown while the run read (agent.ts `opening`), when one was. */
  opening?: string
  /** The sections a search handed Claude before its first call (handover.ts), when it did. */
  handed?: Found[]
  turns: Turn[]
}
