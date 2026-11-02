/**
 * One Analytics Engine data point per POST /api/fish-id (dataset aquatome_fishid, binding FISHID_LOG), for the owner's
 * dashboard: what each identification cost and how it ended. Analytics Engine keeps about 3 months.
 *
 * Never the photo, the IP, a cookie, the Turnstile token or a key: a key by its hash only (keys.ts).
 *
 * outcome: the error code the reader got for a refusal before any call ('fish_id_off', 'cross-origin', 'too large',
 * 'bad form', 'no file', 'not an image', 'turnstile', 'rate', 'busy', 'resting'), else how the call ended: 'ok',
 * 'refused' (Claude declined), 'unreadable' (its answer wasn't the schema's), 'request' (our request refused),
 * 'unavailable' (the keys tried failed for now), 'resting' (every key tried set aside; attempts > 0 tells it from the
 * refusal before a call).
 *
 * Layout: blob1 outcome, blob2 model, blob3 key hash (the one that answered, else the last tried; '' with no call),
 * blob4 verdict, blob5 top guess's scientific name, blob6 its page id ('' when none), blob7 reader's language, blob8
 * where the photo came from ('page': the tool's page, 'tank': the tank's editor; '' unknown), blob9 country;
 * double1 input tokens, double2 output tokens, double3 cost in USD at list price (0 for a model not in PRICES),
 * double4 ms from the request's arrival, double5 calls made (attempts), double6 top guess's confidence, double7 guesses;
 * index outcome. Counts and sums read through _sample_interval (SUM(_sample_interval), SUM(_sample_interval * double3)).
 */
export const FROM = ['page', 'tank'] as const
export type From = (typeof FROM)[number]

export type CallLog = {
  outcome: string
  model: string
  key: string
  verdict: string
  top: string
  page: string
  lang: string
  from: From | ''
  country: string
  input: number
  output: number
  cost: number
  ms: number
  attempts: number
  confidence: number
  guesses: number
}

export const emptyLog = (model: string): CallLog => ({
  outcome: '', model, key: '', verdict: '', top: '', page: '', lang: '', from: '', country: '',
  input: 0, output: 0, cost: 0, ms: 0, attempts: 0, confidence: 0, guesses: 0,
})

export const toFishIdPoint = (l: CallLog) => ({
  blobs: [l.outcome, l.model, l.key, l.verdict, l.top, l.page, l.lang, l.from, l.country],
  doubles: [l.input, l.output, l.cost, l.ms, l.attempts, l.confidence, l.guesses],
  indexes: [l.outcome],
})
