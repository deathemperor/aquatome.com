/**
 * Who a source credits a photo to, by the credit's form alone: a person, an organisation, a person with an organisation
 * ("<name>/<site>.org", "<name>, <university>"), a business (a shop's or a photo business's name, a web address), a
 * picture agency (only one the source's permission record names), or unclear (one word that could be a person's handle
 * or a brand). No name of anyone is in this file: what a credit names is read from its form, and agencies from the record.
 */
export const CREDIT_KINDS = ['person', 'organisation', 'person-with-organisation', 'business', 'agency', 'unclear'] as const
export type CreditKind = (typeof CREDIT_KINDS)[number]

const ORG_TLD = /^(org|edu|gov|int|ac|museum)$/i
const DOMAIN = /\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.([a-z]{2,})(?:\/\S*)?$/i
const ORGANISATION = /soci(?:ety|edad|edade|été|età)|associa|asociaci|verein|\bclub\b|institut|museum|museo|universi|college|foundation|funda[cç]|council|department|ministry|\bwiki|project|projeto|proyecto|^pro-|network|portal|\bgroup\b|\bteam\b|\bcent(?:re|er)\b|survey|conservation|biodiversity|fisheries|research|\bestudios\b/i
const BUSINESS = /photograph(?:y|ie|ers)|(?:photo|foto)s?$|pix\b|\bstudio\b|\bltd\b|\bgmbh\b|\binc\b|\bllc\b|\baquari(?:um|a|stik)s?\b|\baquatics?\b|\bshop\b|\bstore\b|\btrading\b|\bimports?\b|\bexports?\b|\bfarm\b|\bhatchery\b|consult|\bimages\b|\bmedia\b/i
// "Photography" and "Photographers" name a business; "Photographer" alone is a person's trade, as in a credit's "Photographer <name>".
/** Dotted capitals ("A.B.C."); plain capitals ("ABC") may be a person's initials, so they stay unclear. */
const DOTTED = /^(?:[A-Z]\.){2,6}$/
const PARTICLE = /^(?:van|von|der|den|de|da|das|do|dos|du|la|le|del|di|y|e|bin|binti|al|el|ter|ten|&|and|et|al\.)$/i
/** A person's name: two or more words of letters, the first capitalised, each a word, an initial or a particle ("J. D. Name", "Name van der Name"), or authors ("Name et al.", "Name & Name"). */
const personLike = (s: string) => {
  const words = s.split(/\s+/).filter(Boolean)
  return words.length >= 2 && /^\p{Lu}/u.test(words[0]!) && words.every(w => PARTICLE.test(w) || /^(?:\p{Lu}\.){1,3}$/u.test(w) || /^\p{L}[\p{L}'’.-]*$/u.test(w))
}

function one(part: string, agencies: Set<string>): CreditKind {
  const s = part.trim()
  if (agencies.has(s.toLowerCase())) return 'agency'
  const domain = DOMAIN.exec(s)
  if (domain) return ORG_TLD.test(domain[1]!) ? 'organisation' : 'business'
  if (ORGANISATION.test(s) || DOTTED.test(s)) return 'organisation'
  if (BUSINESS.test(s)) return 'business'
  return personLike(s) ? 'person' : 'unclear'
}

/**
 * A credit's kind. Parts after a slash are an affiliation (Seriously Fish's "<person>/<organisation>"): one that is
 * unclear there is an organisation's name. Parts after a comma are read each on their own, and one that is unclear there
 * (a surname in a list of authors, a year) counts for nothing. A person with any part that is an organisation or a
 * business is a person with an organisation.
 * `agencies`: the picture agencies the source's permission record names, matched whole and ignoring case.
 */
export function creditKind(credit: string, agencies: readonly string[] = []): CreditKind {
  const named = new Set(agencies.map(a => a.trim().toLowerCase()))
  // A copyright sign and the punctuation left before it ("…. © Name") are not part of the name.
  const text = credit.replace(/©|\(c\)/gi, ' ').replace(/\s+/g, ' ').replace(/^[^\p{L}\p{N}]+/u, '').trim()
  if (!text) return 'unclear'
  if (named.has(text.toLowerCase())) return 'agency'
  const [first, ...affiliations] = text.split(/\s*\/\s*/)
  const parts = [...first!.split(/\s*,\s*/), ...affiliations.map(a => ({ a }))]
  const kinds = parts.map(p => (typeof p === 'string' ? one(p, named) : (k => (k === 'unclear' ? 'organisation' : k))(one(p.a, named))))
  if (kinds.includes('agency')) return 'agency'
  if (kinds.length === 1) return kinds[0]!
  const person = kinds.includes('person')
  const other = kinds.filter(k => k === 'organisation' || k === 'business')
  if (!other.length) return person ? 'person' : 'unclear'
  if (person) return 'person-with-organisation'
  return other.includes('business') ? 'business' : 'organisation'
}
