/**
 * What could send a reader somewhere, or tell where someone lives: a link or a domain, an email, a handle, an app's name
 * before a colon, a phone number, a street address. The chat's first line isn't shown with one (opening.ts); a tank's
 * notes go with every question with each taken out (tools.ts `handedTanks`).
 */
const REACH: readonly RegExp[] = [
  // An email first: its domain is one too.
  /[^\s@,;]+@[^\s@,;]+\.\p{L}{2,}/gu,
  /https?:\/\/[^\s,;)]+|www\.[^\s,;)]+|[\p{L}\p{N}-]+\.(?:com|net|org|vn|id|th|my|io|co|xyz|top|shop|info|biz|me|ly|gg)(?![\p{L}\p{N}])[^\s,;)]*/giu,
  // Any other domain, as links are typed: plain lower-case letters after the dot ("linktr.ee", "abc.vip"; not "TP.HCM",
  // "v.v.", nor two sentences run together, "cá khỏe.nước trong").
  /[\p{L}\p{N}-]+\.[a-z]{2,}(?![\p{L}\p{N}])[^\s,;)]*/gu,
  /@[\p{L}\p{N}_]{2,}/gu,
  /(?<![\p{L}\p{N}])(?:zalo|telegram|whatsapp|wa\.me|line|facebook|fb|tiktok|shopee|lazada|tokopedia)\s*[:：]\s*[^\s,;]*/giu,
  // A phone number: nine digits or more (a date has eight), starting as one does, with 0, + or the country code of Vietnam,
  // Indonesia, Thailand or Malaysia (a light's schedule and levels, "13-21 80 80 80 80", don't), in any script's digits
  // (Thai's ๐–๙ too), with spaces, dots, dashes or slashes between them.
  /(?<![\p{Nd}\p{L}])(?:(?:\+\s*\p{Nd}|[0๐])(?:[\s.\-()/]*\p{Nd}){8,}|(?:84|62|66|60)(?:[\s.\-()/]*\p{Nd}){7,})/gu,
]
/**
 * A street address: a number on a street or lane (Vietnamese), Jalan or Jl. and a name (Indonesian, Malay), a road or
 * soi (Thai), a number and a street (English). Taken out to the end of its clause, which holds the rest of it; in Thai,
 * which ends a clause with a space, the road's or soi's name and its number.
 */
const CLAUSE = '[^,.;\\n]*'
const ADDRESS: readonly RegExp[] = [
  new RegExp(`(?:(?<![\\p{L}])(?:ngõ|ngách|hẻm|kiệt|kios)\\s+\\d+|(?:quận|phường)\\s+\\d+)${CLAUSE}`, 'giu'),
  // "số" and "lô" only before a street or its name: "bể số 2" is the reader's second tank.
  new RegExp(`(?:(?<![\\p{L}])(?:[Ss]ố|[Ll]ô)\\s+\\d+[\\p{L}\\d/]*,?\\s+(?:[Đđ]ường|[Pp]hố|\\p{Lu})|\\d+\\s*(?:[Đđ]ường|[Pp]hố)\\s+\\p{Lu})${CLAUSE}`, 'gu'),
  new RegExp(`(?<![\\p{L}])(?:[Jj]l|[Jj]ln|[Jj]alan|[Ll]orong|[Ll]rg)\\.?\\s+\\p{Lu}${CLAUSE}`, 'gu'),
  /(?:ถนน|ซอย|ซ\.|ถ\.)\s*\S*(?:\s+\d+)?/gu,
  new RegExp(`\\d+\\s+\\p{L}+\\s+(?:street|st|road|rd|avenue|ave)(?![\\p{L}])${CLAUSE}`, 'giu'),
]

/** Whether the text holds a way to reach someone or an address. */
export const reaches = (text: string) => [...REACH, ...ADDRESS].some(r => { r.lastIndex = 0; return r.test(text) })

/** The text with each way to reach someone and each address taken out ("…" in its place). */
export const withoutContacts = (text: string) => [...REACH, ...ADDRESS].reduce((t, r) => t.replace(r, '…'), text.normalize('NFC'))
