/**
 * Profanity and slurs in the site's four languages and English: what comments hold for the owner's review
 * (comments/rules.ts) and what the chat's first line never shows (chat/opening.ts). The spam terms stay with the
 * comments' rules. The editors read it (two seats, Anthropic and xAI, 2026-11-09).
 *
 * Only forms that can't be an ordinary word in a fishkeeping text: "cc" and "ml" are doses, "Cl" chlorine, "lon" a can,
 * "óc chó" walnut, "súc vật" livestock, "VLL" filter media (vật liệu lọc), "tai ikan" and "taik ikan" fish waste,
 * "bego" an excavator, "cmn" Indonesian for "only", "babi" a pig, "anjing" and "asu" a dog, "ass" the salam that opens
 * Indonesian and Malay comments ("Ass. Wr. Wb."), "piss" Indonesian for peace ("piss bro"), "dm" a direct message,
 * "mẹ mày" a sibling's "your mum", "retard" what a glass lid does to evaporation; unaccented Vietnamese ("du ma", "deo",
 * "cac") is ordinary too. Where the language spaces its
 * words a term must stand alone; Thai, which doesn't, matches anywhere in the text, so a Thai term inside an ordinary
 * word (กู in กูเกิล, หี in หีบ, สัด in สัดส่วน) or one hobbyists also say plainly (มึง, a friend's "you"; เหี้ย, the
 * water monitor) is left out or narrowed. "ไอ้เหี้ย" is the commonest Thai insult, so it holds even of the lizard: a
 * match costs one review.
 */
/** A term, or one with the ordinary text it must not match: what may not come right after it, or right before. */
type Term = string | { w: string; next?: string[]; prev?: string[] }
const SPACED: readonly Term[] = [
  // Vietnamese, with the short forms readers type
  'địt', 'đụ', 'đéo', 'lồn', { w: 'buồi', next: [' chiều', ' sáng', ' tối', ' trưa', ' of', ' học', ' họp', ' đêm'] }, 'cặc', 'đĩ', 'đệt', 'đjt', 'djt', 'đm', 'đcm', 'dcm', 'đcmm', 'dcmm', 'đmm', 'dmm', 'đkm', 'dkm', 'cmnl', 'thì cc', 'thì cl',
  { w: 'cmm', prev: ['dòng '] }, 'cmnr', 'clm', 'clmm', 'clgt', { w: 'vl', prev: ['ở ', 'o ', 'tại ', 'tai ', 'ship ', 'thành ', 'thanh ', 'phố ', 'tỉnh ', 'tinh ', 'về ', 'từ ', 'đi ', 'dân ', 'em ', 'người ', 'bên ', 'khách ', 'shop ', 'cá ', 'phân ', 'thay ', 'châm ', 'bổ sung ', 'tp.', 'tp. ', 'tp ', 'ae ', 'đl ', 'đl, ', 'đl/', 'và ', 'thiếu ', 'dư ', 'thêm ', 'dùng ', 'cho ', 'rửa ', 'có ', 'còn ', 'mua '], next: [' lọc', ' sứ', ' có', ' này'] }, 'vler', 'vloz', 'vlon', 'vailon', 'vcl', 'như cc', 'biết cc', { w: 'như cl', prev: ['mùi '] }, 'kệ cc', 'kệ cl', 'như lol', 'mặt lol', 'vãi lìn', 'đ.m', 'vkl', 'vclm', 'vklm', 'vãi l', 'vãi lol', 'vãi cả lol', 'vãi đái', 'đồ điếm', 'con điếm', 'loz', 'địt mẹ', 'địtmẹ', 'dit me', 'ditme', 'đụ má', 'đù má', 'đù mé', 'mẹ kiếp', { w: 'đồ chó', prev: ['bán ', 'mua ', 'shop ', 'cửa hàng ', 'phụ kiện '], next: [' mèo', ', mèo', '/mèo', ' và mèo', ' cảnh', ' cưng'] }, { w: 'chó má', next: [' mình', ' tôi', ' em', ' nhà'] }, 'đếch', 'đệch', { w: 'éo', prev: ['uốn '], next: [' le', ' èo'] }, { w: 'như cứt', next: [' chuột'] }, 'đồ cứt', 'cái cc', 'cái cl', 'cái lol', 'v.l', 'v.cl', 'ngu cc', 'ngu cl', 'ngu lol', 'làm cc', 'biết cl', 'vãi cc', 'vãi cl', 'vãi c', { w: 'vcc', prev: ['nối ', 'chân ', 'cấp '] }, 'vlz', 'vclz', 'đell', 'đel', 'đek', 'đếk', 'đíu', 'con khốn', 'lũ khốn', 'thằng súc vật', 'thằng súc sinh', { w: 'chó đẻ', prev: ['con ', 'nhà '], next: [' con', ' mấy'] }, { w: 'làm cl', next: [' cho'] }, 'làm lol', 'biết lol', 'kệ lol', 'thằng lol', 'đồ lol', { w: 'sml', prev: ['size ', 'size: ', 'túi ', 'còn ', 'có ', 'đủ ', 'kml, ', 'kml ', 'dòng ', 'cá ', 'con '] }, 'thằng ml', 'đồ ml', 'con ml', { w: 'thằng chó', next: [' nhà', ' con', ' của', ' mình', ' em'] },
  'đồ óc chó', 'thằng óc chó', 'đồ súc vật', 'lũ súc vật', 'bọn súc vật', 'đồ súc sinh', 'lũ súc sinh', 'bọn súc sinh', 'khốn nạn', 'khốn kiếp', 'đồ khốn', 'thằng khốn', 'mất dạy',
  { w: 'đồ ngu', next: [' ngơ'] }, { w: 'thằng ngu', next: [' ngơ'] }, { w: 'con ngu', next: [' ngơ'] }, 'khựa', 'pê đê', 'bê đê', 'pêđê', 'bêđê', 'đồ phò', 'con phò', 'parky', 'namkiki',
  // Indonesian
  'bangsat', 'bgst', 'kontol', 'kntl', 'memek', 'ngentot', 'ngentod', 'entot', 'ngewe', 'goblok', 'goblog', 'gblk', 'dasar bego', 'bego lu', 'bego lo', 'bego banget', 'tolol', 'bajingan',
  'jancok', 'jancuk', 'dancok', 'brengsek', 'keparat', 'pepek', 'jembut', 'lonte', 'jablay', 'perek', 'pecun', 'pantek', 'bencong',
  'maho', 'anjg', 'ajg', 'pukimai', 'anjing lu', 'anjing lo', 'babi lu', 'babi lo', 'dasar anjing', 'dasar babi', 'dasar monyet', 'sialan', 'peler', 'anjeng', 'lu bego', 'lo bego', 'banci lu', 'banci lo', 'njing', 'anj', 'cukimai', 'dasar asu', 'asu kowe', 'asu lu', 'asu lo', 'monyet lu', 'monyet lo', { w: 'kampret', prev: ['ada ', 'seekor ', 'sarang '] }, 'kamvret', 'ewe lu', 'ewe lo', 'anjing lah', 'dasar banci', 'bangsad', 'dasar bodoh', 'tai lu', 'tai lo', 'taik lu', 'taik lo', 'dancuk', 'dientot', 'bacot', 'mampus lu', 'mampus lo', 'berengsek', 'bego bgt', 'anjing banget', 'anjing bgt', 'bangke lu', 'dasar bangke', 'anjing loe', 'mampus loe', 'babi loe', 'loe bego', 'lu mampus', 'ngentotin', 'bacotin', 'goblokin', 'anjing bener', 'emang anjing', 'anjing emang', 'bangke lo', 'anjing elo', 'bego elo', 'ndasmu', { w: 'taik kucing', next: [' masuk', ' dalam', ' di', ' jatuh'] }, 'bego amat', 'anjing amat', 'mahal anjing', 'mahal banget anjing', 'mahal bgt anjing', { w: 'parah anjing', next: [' saya', ' gue', ' gw', ' aku', ' kami'] }, { w: 'sih anjing', next: [' saya', ' gue', ' gw', ' aku', ' kami'] }, 'penjualnya anjing', 'sellernya anjing',
  // Malay
  'pukimak', 'pukimaq', 'puki', 'kimak', { w: 'knn', prev: ['ke ', 'sebelah ', 'kiri ', 'sisi ', 'bagian ', 'bahagian ', 'di ', 'belah ', 'pojok ', 'samping ', 'sblh ', 'depan ', 'belakang '] }, 'kanina', 'kannina', 'cibai', 'chibai', 'lanjiao', 'sohai', 'pundek', 'kote', { w: 'sundal', next: [' malam'] }, 'pelacur', 'lancau',
  'butoh', { w: 'buto', next: [' ijo'] }, 'ccb', 'chee bye', 'bangang', 'kampang', 'haram jadah', 'haramjadah', 'kepala hotak', 'pondan', { w: 'bapok', prev: ['harga '] }, { w: 'keling', prev: ['paku ', 'besi ', 'beli ', 'ikan '] }, 'babi kau', 'anjing kau', 'bodoh kau', 'kau bodoh', 'bodo kau', 'kau bodo', 'bodo ko', 'bongok', 'kanasai', 'nabeh', 'nabei',
  'babi ko', 'cina babi', 'gila babi', 'celaka punya', 'celaka kau', 'celaka lu', 'ko bodoh', 'lan jiao', { w: 'bengap', prev: ['mata '] }, 'anak haram', 'bahlul', 'anjing ko', 'bodoh ko', 'kau babi', 'kau anjing', 'ko bodo', 'bodoh sial', 'babi sial', 'sial kau', 'sial punya', 'mampus kau', 'pergi mampus', 'kepala otak kau', 'kaninabei', 'kaninabeh', 'knnccb', 'knnbccb', 'celaka ko', 'kepala bapak kau', 'bodoh punya', 'babi punya', 'babi la', 'babi lah', 'babi betul', 'melayu babi', 'kepala otak ko', 'kepala bapak ko', 'kbk', 'pala hotak', 'pale hotak', 'pala otak kau', 'pale otak kau', 'pala bapak kau', 'pale bapak kau', 'lahanat', { w: 'tahi kucing', next: [' masuk', ' dalam', ' kat', ' di', ' jatuh'] }, 'palui', 'laknat',
  // English
  'fuck', 'fucks', 'fucked', 'fucker', 'fuckers', 'fuckin', 'fucking', 'fck', 'fcking', 'fkn', 'fking', 'motherfucker', 'motherfucking',
  // Hobbyists on Vietnamese forums write "shit" for what a fish leaves on the substrate.
  { w: 'shit', prev: ['ăn ', 'ra ', 'hết ', 'có ', 'thấy ', 'hút ', 'cục ', 'miếng ', 'miếng "'], next: [' của', ' cá', ' trong', ' dính', ' rùa', ' tép'] }, 'shite', 'shitty', 'bullshit', 'horseshit', 'shithole', 'fuckup', 'kiss my ass', 'your ass', 'my ass', 'pain in the ass', 'fcuk', 'fucc', 'shits', 'shitting', 'pissed', 'pissing', 'piss off', 'arse', 'wank', 'wanking', 'wankers', 'twats', 'dickheads', 'motherfuckers', 'fuk', 'fuking', 'fukin', 'bitch', 'bitches', 'cunt', 'cunts', 'twat', 'wanker', 'dick', 'dicks', 'dickhead', { w: 'pussy', next: [' willow'] },
  'asshole', 'assholes', 'arsehole', 'whore', 'whores', 'slut', 'sluts', 'bastard', 'bastards', 'dumbass', 'jackass', 'bollocks', 'mfer', 'tranny', 'fckin', 'dipshit', 'shithead', 'fuckhead', 'fuckwit', 'clusterfuck', 'cocksucker', 'cocksuckers', 'wtf', 'stfu', 'nigger', 'niggers',
  'nigga', 'niggas', 'niggaz', 'faggot', 'faggots', { w: 'fag', next: [' end'] }, 'gook',
]
/** A Thai vowel or tone mark: after ง, it makes ง the start of a syllable of its own (แม่งาน), not the curse's end. */
const MARK = '[\\u0E30-\\u0E3A\\u0E47-\\u0E4E]'
/** What's put before a Thai insult: ไอ้, typed too without its tone mark or as ไอ่, or อี. */
const AI = '(?:ไอ[้่]?|อี)'
/** Thai, anywhere in the text, but where the term is part of an ordinary word (กระดอง, น้ำเชี่ยว, ดอกทองกวาว, ไอ้ห่าน, ไอห่าง, ไอ้หีบ, ตัวแม่งดอาหาร, ตัวแม่งงๆ, ต้นแม่งอก, ตัวแม่งอแง, ตัวแม่งวงช้าง, ไอ้สัตว์น้ำ, ไอ้สัดส่วน, อีดอกบัว, แควย่อย, โคตรเหี้ยม). */
const THAI: readonly RegExp[] = [
  'โคตรเหี้ย(?!ม(?!าก))', '(?<!แ)ควย', 'สัดๆ', 'เหี้ยเอ๊ย', 'เหี้ยเอ้ย', 'เหี้ยไร', 'ทำเหี้ย', 'หน้าหี(?!บ)', 'ตุ๊ด(?!ตู่)', `${AI}ญวน`, `${AI}แกว(?!่)`, 'กระหรี่', 'เย็ด', 'สัส', 'ระยำ', 'ส้นตีน', 'แม่มึง', 'พ่อมึง', 'เหี้ยๆ', 'แพงเหี้ย', 'แพงสัด', 'ห่วยสัด', 'สัดเอ้ย', 'สัดเอ๊ย', 'ช้าสัด(?!ส่วน)', `${AI}เหี้ย`, '(?<!ตัว)แม่งงง', 'ตอแหล', `${AI}โง่`, 'เชี้ย', 'ชิบหาย', 'ฉิบหาย', 'จัญไร',
  `${AI}ควาย`, `${AI}เวร`,
  'เชี่ย(?!ว(?!่?ะ)|ง)', `${AI}หี(?!บ)`, 'กระดอ(?![งนม])', 'ดอกทอง(?!อุไร|กวาว|หลาง)', `${AI}ห่า(?!น(?!ี่|ั่น)|ง)`, `แม่ง(?!${MARK}|ด(?!${MARK})|ง(?!ี้|ั้น)|อ(?:ก|น|ตัว|แง)|วงช้าง)`, `พ่อง(?!${MARK}|ด(?!${MARK})|ง(?!ี้|ั้น)|อ(?:ก|น|ตัว|แง)|วงช้าง)`, 'ชาติหมา(?!ย)',
  `${AI}สัด(?!ส่วน)`, `${AI}สัตว์(?!น้ำ|ประหลาด|เลี้ยง|ตัว|ป่า)`, 'อีดอก(?!บัว)', 'แมร่ง', 'อีกะหรี่', 'ร้าน(?:นี้)?เหี้ย(?!ม(?!าก))', 'เหี้ยอะไร', 'ห่วยเหี้ย', 'แย่เหี้ย', '(?<!ตัว|มี|โดน|เจอ)เหี้ยเลย(?!ลง|เข้า|มา|กิน)', 'ดีสัด(?!ส่วน)', 'โคตรสัด(?!ส่วน)', '(?<!เป็น|ส่วน|ติด|ได้)สัด(?![\\u0E00-\\u0E7F])', '(?<!อา|วิ|เ)สาส(?!น|์|ม)', 'ตายห่า(?!ง|น)', `(?<!กระ|ปลา|กุ้ง|ตัว|ลาย|บัว)เสือก(?!${MARK})`, 'โครตเหี้ย(?!ม(?!าก))', `${AI}สาด`, `${AI}หมา(?!ย|ก)`, 'หน้าตีน', `${AI}เจ๊ก`, `(?<!มี|ตัว|โดน)เหี้ยมาก(?!${MARK}|ลับ|ลาง)`, `ถูกเหี้ย(?=\\s|$|เลย|มาก(?!${MARK}|ล)|จริง|ๆ|เว้ย|นะ)`, '(?:เว็บ(?:นี้)?|แอดมิน|คนขาย|แม่ค้า|พ่อค้า|ขายของ|ซื้อของ|ส่งของ|ได้ของ)เหี้ย(?!ม(?!าก))', 'สารเลว', 'กวนตีน', 'สวยเหี้ย', 'เฮงซวย', 'ช่างหี(?!บ)', 'ช่างเหี้ย(?!ม(?!าก))', 'โคตรหี(?!บ)', 'หีมาก', '(?<!ตัว|มี|โดน|เจอ)เหี้ยจริง(?!หรือ|ไหม|เหรอ)', '(?<![\\u0E00-\\u0E7F])หี(?![\\u0E00-\\u0E7F])', '(?<!ตัว|คุณ)แม่งง(?=\\s|$)',
].map(w => new RegExp(w, 'u'))

const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const source = (t: Term) => (typeof t === 'string' ? escape(t) : `${(t.prev ?? []).map(p => `(?<!(?<![\\p{L}\\p{M}\\p{N}])${escape(p)})`).join('')}${escape(t.w)}${t.next ? `(?!${t.next.map(escape).join('|')})` : ''}`)
/** A term alone, or with Indonesian and Malay's -nya, -lah or -la after it ("gobloknya", "kimaklah", "bangangla"). */
const WORD = new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])(?:${SPACED.map(source).join('|')})(?:nya|lah|la)?(?![\\p{L}\\p{M}\\p{N}])`, 'iu')

/** Letters only Vietnamese spells. */
const VI = '[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]'
/** Vietnamese "cmn", with a word only Vietnamese spells within two words of it: elsewhere it's Indonesian for "only" ("cmn mau tanya", "satu ekor cmn"). */
const CMN = new RegExp(`(?<=${VI}\\p{L}*\\s+(?:\\p{L}+\\s+)?)cmn(?![\\p{L}\\p{M}\\p{N}])|(?<![\\p{L}\\p{M}\\p{N}])cmn(?=(?:\\s+\\p{L}+)?\\s+\\p{L}*${VI})`, 'u')
/** "anjing" said as a curse, opening a sentence with a comma or "!" after it: otherwise a dog. */
const EXCLAIMED = /(?:^|(?<=[.!?…]\s))anjing(?=\s*[,!])/u

const found = (t: string) => t.match(WORD)?.[0] ?? t.match(CMN)?.[0] ?? t.match(EXCLAIMED)?.[0] ?? THAI.map(r => t.match(r)?.[0]).find(Boolean)

/**
 * The first profane or slurring term in the text, as it is written there (lower case), or undefined when there is none.
 * Spaces count as one; a Latin letter typed three times or more ("vcllll", "fuckkk", "cmmm") counts once, or twice; a
 * word's last letter typed twice ("goblokk", "vcll"), or an i or u inside one ("shiit", "fuuck"), counts once, but "VLL" (vật liệu lọc, filter media) isn't "vl", nor
 * "VL" in capitals in a comment that isn't all capitals (Vĩnh Long, the province).
 */
export function rudeWord(text: string): string | undefined {
  // เเ, two เ typed for แ, reads as แ.
  const n = text.normalize('NFC').replace(/เเ/g, 'แ')
  // In a comment that isn't all capitals, "VL" is Vĩnh Long ("VL có shop nào bán cá dĩa không"), "Cl" chlorine, "CC" a credit card, and "Dick" before a capital a man's name.
  // Thai has no capitals, so its letters count as lower case here. What's taken out leaves a mark, so its neighbours stay apart.
  const t = (/[\p{Ll}\p{Lo}]/u.test(n) ? n.replace(/(?<![\p{L}\p{M}\p{N}])(?:VL|Cl|CC|Dick(?=\s\p{Lu}))(?![\p{L}\p{M}\p{N}])/gu, '|') : n).toLowerCase().replace(/\s+/g, ' ')
  // Letters typed again and again, in the Latin script only: Thai stretches a word with ๆ or a long vowel, and its doubled
  // consonants are words ("งง", confused). "vll" is filter media, never "vl".
  const runs = (to: string) => t.replace(/(\p{Script=Latin})\1{2,}/gu, to)
  const doubled = t.replace(/(?<![\p{L}\p{M}\p{N}])vll(?![\p{L}\p{M}\p{N}])/gu, ' ').replace(/(\p{Script=Latin})\1(?![\p{L}\p{M}])/gu, '$1').replace(/([iu])\1/gu, '$1')
  return found(t) ?? found(runs('$1')) ?? found(runs('$1$1')) ?? found(doubled)
}
