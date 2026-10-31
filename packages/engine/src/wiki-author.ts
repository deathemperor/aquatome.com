/**
 * Wikimedia's Artist field (HTML) → the author's name as plain text, without what wikis print beside a user name: the
 * "(talk)" and "(Uploads)" links and a signature's timestamp ("--Name (talk) 19:58, 7 October 2019 (UTC)").
 */
const LINKS = /\s*\((?:talk|thảo luận|discuter|discussion|Diskussion|discusión|discussão|обсуждение|overleg|dyskusja|tartışma|uploads|contribs|contributions)\)/gi
const SIGNED = /\s*\d{1,2}:\d{2}, \d{1,2} \p{L}+ \d{4} \(UTC\)/gu
export const authorText = (html = '') =>
  html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1').replace(/&nbsp;/g, ' ')
    .replace(LINKS, '').replace(SIGNED, '').replace(/^\s*[-–—]{1,2}\s*/, '').replace(/\s+/g, ' ').trim()
