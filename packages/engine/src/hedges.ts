/**
 * How often and how sure a text says a thing, and the sentences a writer said more surely than what it wrote from: "a lot of
 * times a fungal infection means an open wound" written "nấm chỉ mọc trên vết thương hở". The reviewer pairs each hedged
 * sentence of the source with the written sentence for it; the code holds each pair to both texts (a sentence the reviewer
 * made up counts for nothing) and decides whether the written one still hedges. The guide writer (for-reader.ts) and the
 * part rewriter (reader.ts rewritePart, through quality.ts) both hold their text to it.
 */

/** How often and how sure, in English… */
export const HEDGE_EN = /\b(?:may|might|can|could|often|usually|typically|generally|sometimes|occasionally|a lot of times|many times|most of the time|in some cases|likely|probably|possibly|tends? to|i think|seems?)\b/i
/** …and in Vietnamese. "Thường" in "bình thường", "bất thường", "khác thường" isn't "often", and "dễ" alone is "easy"; "hay" before a word is "often" ("hay vướng") as well as "or", and counts. */
export const HEDGE_VI = /(?<!\p{L})(?:có thể|(?<!(?:bình|bất|khác|coi|bồi|phi|tầm|dị|thất|lạ) )thường|đôi khi|đôi lúc|nhiều khi|nhiều lúc|có khi|có lúc|lắm lúc|có khả năng|(?:một số|vài) trường hợp|thỉnh thoảng|có lẽ|chắc là|hình như|nghe nói|dễ (?:bị|nhiễm|chết|lây|mắc)|hay(?= \p{L})|tùy|tuỳ|chưa chắc|không phải lúc nào|phần lớn|đa số|hầu hết|chủ yếu)(?!\p{L})/iu

/**
 * A Vietnamese sentence written from hedges only by these: "hay" before a word is as often "or" ("trùn huyết hay artemia"),
 * so only before the verbs it hedges. The written sentence is read with HEDGE_VI, which takes any of them: a check that
 * wrongly finds a hedge lost throws a good rewrite away, one that wrongly finds it kept lets a hardened one through, and
 * the second is rarer than the first.
 */
const HEDGE_VI_FROM = new RegExp(HEDGE_VI.source.replace('hay(?= \\p{L})', 'hay (?:bị|gặp|có|mọc|bùng|làm|thấy|ăn|đẻ|chết|cắn|đuổi|nhảy|trốn|vướng)'), 'iu')
/** In its own language: "can thiệp" and "may mắn" are Vietnamese, not "can" and "may". */
const hedged = (s: string) => (/\p{M}/u.test(s.normalize('NFD')) ? HEDGE_VI_FROM : HEDGE_EN).test(s)

export type HedgePair = { from: string; to: string }
const ENTITY: Record<string, string> = { lt: '<', gt: '>', amp: '&', nbsp: ' ', quot: '"', '#39': "'" }
/**
 * A text as a reviewer quotes it: no tags (an inline one, as in "<em>C. punctatus</em>,", leaves nothing; a block's end
 * leaves a space), entities read, no space before punctuation. Only a tag is a tag: "<40 ppm … >30 °C" stays.
 */
const text = (s: string) => s
  .replace(/<\/?(?:p|li|ul|ol|h[1-6]|tr|td|th|table|div|br)\b[^>]*>/gi, ' ').replace(/<\/?[a-z][^>]*>/gi, '')
  .replace(/&(lt|gt|amp|nbsp|quot|#39);/g, (_, e: string) => ENTITY[e]!)
  .replace(/\s+/g, ' ').replace(/ ([,.;:!?)])/g, '$1').trim()

/** The pairs whose source sentence hedges and whose written sentence, there in the text, no longer does. */
export function hedgesLost(pairs: HedgePair[], from: string, to: string): HedgePair[] {
  const a = text(from), b = text(to)
  return pairs.filter(x => x.to.trim() && a.includes(text(x.from)) && hedged(text(x.from)) && b.includes(text(x.to)) && !HEDGE_VI.test(text(x.to)))
}

/** What a reviewer is asked for, naming its two texts as its prompt does ("EN" and "VI", "BEFORE" and "AFTER"). */
export const hedgesAsk = (from: string, to: string) =>
  `hedges: every sentence in ${from} that says how often or how sure (may, might, often, usually, sometimes, a lot of times, likely, probably, có thể, thường, hay, nhiều khi, đôi khi, có lẽ; can or could only where it means may, as in "bacteria can follow", not where it means is able to, as in "the medicine can only kill adults"), copied exactly, with one pair for each ${to} sentence that says the same thing, each copied exactly, or one pair with "" if ${to} leaves it out.`
export const HEDGES_SCHEMA = { type: 'array', items: { type: 'object', additionalProperties: false, required: ['from', 'to'], properties: { from: { type: 'string' }, to: { type: 'string' } } } }
