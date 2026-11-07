import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Lang } from '@aq/schema'

/**
 * What the foreign products in guides are, and what readers can buy instead. A guide from a foreign source sends readers
 * to products a shop here may not list, when something cheap does the job. This table is what the writers (for-reader.ts)
 * and the checks (fit.ts) read, so no model decides whether a product is sold, or a dose.
 *
 * `market` and `REMEDIES` are by language: Indonesian and Thai get their own entries when they get a market. "hard" means
 * not found at 23 Vietnamese shops' own searches on the date given. Marketplaces and Facebook sellers weren't checked, so
 * no page may say a product isn't sold in Vietnam.
 */
export type Ref = { url: string; title: string }
export type MarketStatus = { status: 'sold' | 'hard' | 'unknown'; checkedOn: string; evidence: string }
export type ProblemId = 'ich' | 'fungus' | 'finRot' | 'quarantine' | 'cyanobacteria' | 'parasites'
export type Product = {
  name: string
  /** The product's name as a text writes it. */
  match: RegExp
  kind: 'treatment' | 'fertilizer' | 'mineral' | 'conditioner' | 'filter media' | 'bacteria'
  /** What it contains, as far as a source says. */
  ingredient: { en: string; ref: Ref }
  market: Partial<Record<Lang, MarketStatus & {
    /** The active ingredient in this language, as the writers name it. */
    ingredient?: string
    /** No source names one: what the writers are told instead. */
    noIngredient?: string
    /** Treatments: the note's sentence on what it is. */
    says?: string
  }>>
  /** Treatments: the problems its source uses it for, which a remedy in the note may answer. */
  problems?: ProblemId[]
}

const CHECKED = '2026-11-07'
const NOT_LISTED = '23 Vietnamese shops\' own searches and web searches in Vietnamese and English found no listing; marketplaces and Facebook sellers weren\'t checked'
const hard = (o: { ingredient?: string; noIngredient?: string; says?: string }): MarketStatus & typeof o => ({ status: 'hard', checkedOn: CHECKED, evidence: NOT_LISTED, ...o })
const sold = (evidence: string): MarketStatus => ({ status: 'sold', checkedOn: CHECKED, evidence })

const COOP = (slug: string, title: string): Ref => ({ url: `https://www.aquariumcoop.com/blogs/aquarium/${slug}`, title: `${title} – Aquarium Co-Op` })
const PARASITES_ARTICLE = COOP('fish-parasites', 'How to Treat Internal and External Parasites in Aquarium Fish')
const MARACYN_LABEL: Ref = { url: 'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=e05fc13b-1317-48f7-82c6-c318b660cf52', title: 'FRITZ AQUATICS MARDEL MARACYN- erythromycin powder (DailyMed)' }
const MARACYN_TWO_LABEL: Ref = { url: 'https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=83cb77b3-d479-418d-9d7f-f6f060e9f225', title: 'FRITZ AQUATICS MARDEL MARACYN TWO- minocycline powder (DailyMed)' }
const GENERAL_CURE_LABEL: Ref = { url: 'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=22e84714-366b-4a90-89e2-eae934716af4', title: 'API GENERAL CURE- metronidazole praziquantel powder (DailyMed)' }

export const PRODUCTS: Product[] = [
  { name: 'Ich-X', match: /\bich[\s-]?x\b/i, kind: 'treatment', problems: ['ich', 'fungus', 'quarantine'],
    ingredient: { en: 'formaldehyde and malachite green chloride, in water with methanol', ref: PARASITES_ARTICLE },
    market: { vi: hard({ ingredient: 'formaldehyde và xanh malachite (malachite green chloride)', says: 'Ich-X có hoạt chất là formaldehyde và xanh malachite (malachite green chloride).' }) } },
  { name: 'Maracyn', match: /\bmaracyn(?![\s-]*(?:2|two|ii)\b)/i, kind: 'treatment', problems: ['fungus', 'finRot', 'cyanobacteria', 'quarantine'],
    ingredient: { en: 'erythromycin', ref: MARACYN_LABEL },
    market: { vi: hard({ ingredient: 'kháng sinh erythromycin', says: 'Maracyn là kháng sinh erythromycin. Maracyn Two là thuốc khác, hoạt chất là minocycline.' }) } },
  { name: 'ParaCleanse', match: /\bpara[\s-]?cleanse\b/i, kind: 'treatment', problems: ['parasites'],
    ingredient: { en: 'praziquantel and metronidazole; amounts per packet not read', ref: PARASITES_ARTICLE },
    market: { vi: hard({ ingredient: 'praziquantel và metronidazole', says: 'ParaCleanse có praziquantel để trị giun sán và metronidazole để diệt một số vi khuẩn và đơn bào.' }) } },
  // Never "erythromycin": the maker's page, seen only in a search excerpt, says it contains none.
  { name: 'Slime Out', match: /\bslime[\s-]?out\b/i, kind: 'treatment', problems: ['cyanobacteria'],
    ingredient: { en: 'not disclosed', ref: COOP('blue-green-algae', 'How to Get Rid of Blue-Green Algae in Freshwater Aquariums') },
    market: { vi: hard({ noIngredient: 'không rõ thuốc này có hoạt chất gì, đừng nói nó chứa gì. Điều dữ kiện nói về một hoạt chất (như erythromycin) thì vẫn nói được, nhưng tách khỏi thuốc này', says: 'Slime Out là thuốc trị tảo lam. AquaTome chưa tìm được nguồn nêu rõ hoạt chất của nó.' }) } },
  { name: 'Easy Green', match: /\beasy\s?green\b/i, kind: 'fertilizer',
    ingredient: { en: 'nitrogen, phosphorus, potassium and six micronutrients', ref: COOP('which-aquatic-fertilizer-is-right-for-you', 'Which Planted Tank Fertilizer Is Right for You? | Aquarium Plants 101') },
    market: { vi: hard({ ingredient: 'phân nước có đạm, lân, kali và vi lượng' }) } },
  { name: 'Easy Root Tabs', match: /\beasy\s?root\s?tabs?\b/i, kind: 'fertilizer',
    ingredient: { en: 'mineralized topsoil, red clay and nutrients such as nitrate, phosphate, potassium and iron', ref: COOP('easy-fertilizer-for-aquarium-plants', 'Beginner’s Guide to Fertilizing Your Planted Tank the EASY Way') },
    market: { vi: hard({ ingredient: 'viên phân nền từ đất khoáng, đất sét đỏ và dinh dưỡng' }) } },
  // A guide's "Easy Carbo" is Easy-Life's. Aquarium Co-Op's Easy Carbon is another product, and the shops weren't searched for it.
  { name: 'Easy Carbo', match: /\beasy\s?carbo\b/i, kind: 'fertilizer',
    ingredient: { en: 'glutaraldehyde', ref: { url: 'https://aquariumbreeder.com/misconception-of-liquid-carbon-in-aquarium-products/', title: 'Misconception of Liquid Carbon in Aquarium Products' } },
    market: { vi: hard({ ingredient: 'glutaraldehyde' }) } },
  { name: 'Wonder Shell', match: /\bwonder\s?shells?\b/i, kind: 'mineral',
    ingredient: { en: 'calcium, magnesium and other trace elements; no ingredient list read', ref: COOP('nerite-snail-care', 'Care Guide for Nerite Snails – Favorite Nano Algae Eater') },
    market: { vi: hard({ ingredient: 'khoáng canxi, magie và vi lượng' }) } },
  { name: 'Maracyn 2', match: /\bmaracyn[\s-]*(?:2|two|ii)\b/i, kind: 'treatment', ingredient: { en: 'minocycline', ref: MARACYN_TWO_LABEL },
    market: { vi: sold('lovefishaqua.com.vn, greendeal.vn, as "Lovefish - Maracyn Two"') } },
  { name: 'API General Cure', match: /\bgeneral\s?cure\b/i, kind: 'treatment', ingredient: { en: '250 mg metronidazole and 75 mg praziquantel a packet', ref: GENERAL_CURE_LABEL },
    market: { vi: sold('m.carong1068.com, greendeal.vn (out of stock)') } },
  { name: 'API Melafix', match: /\bmelafix\b/i, kind: 'treatment', ingredient: { en: 'Melaleuca 1.0%', ref: { url: 'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=79dbc5ed-7deb-4f79-97b8-a4fcd8775cf4', title: 'API Melafix (DailyMed)' } },
    market: { vi: sold('thuysinhbichphuong.vn') } },
  { name: 'Seachem Prime', match: /\bseachem\s+prime\b/i, kind: 'conditioner', ingredient: { en: 'not disclosed', ref: { url: 'https://www.seachem.com/prime.php', title: 'Seachem Prime' } },
    market: { vi: sold('senaquatic.vn, tepxinhaqua.com, greendeal.vn (out of stock)') } },
  { name: 'Seachem Flourish Excel', match: /\b(?:flourish|seachem)\s+excel\b/i, kind: 'fertilizer', ingredient: { en: 'not named by the maker', ref: { url: 'https://www.seachem.com/flourish-excel.php', title: 'Seachem Flourish Excel' } },
    market: { vi: sold('thuysinhtim.vn') } },
  { name: 'Seachem Flourish', match: /\bseachem\s+flourish(?!\s+(?:excel|trace|advance|tabs|iron|nitrogen|phosphorus|potassium))\b/i, kind: 'fertilizer', ingredient: { en: 'a comprehensive plant supplement of mineral salts', ref: { url: 'https://www.seachem.com/flourish.php', title: 'Seachem Flourish' } },
    market: { vi: sold('thuysinh365.com (by contact), vuaqua.vn (no price)') } },
  { name: 'Seachem Equilibrium', match: /\bseachem\s+equilibrium\b/i, kind: 'mineral', ingredient: { en: 'potassium, calcium, magnesium, ferric and manganese sulfates', ref: { url: 'https://www.seachem.com/equilibrium.php', title: 'Seachem Equilibrium' } },
    market: { vi: sold('thuysinhbichphuong.vn, shrimphome.vn (out of stock)') } },
  { name: 'Seachem Purigen', match: /\bpurigen\b/i, kind: 'filter media', ingredient: { en: 'a macro-porous synthetic polymer', ref: { url: 'https://www.seachem.com/purigen.php', title: 'Seachem Purigen' } },
    market: { vi: sold('thuysinhtim.vn') } },
  { name: 'Seachem Stability', match: /\bseachem\s+stability\b/i, kind: 'bacteria', ingredient: { en: 'a blend of bacteria; no species named', ref: { url: 'https://www.seachem.com/stability.php', title: 'Seachem Stability' } },
    market: { vi: sold('thuysinhtim.vn') } },
  // A pet wholesaler's listing, maybe eight years old, of a live product: not counted as sold.
  { name: 'Dr. Tim\'s One & Only', match: /\bone\s*(?:&|and)\s*only\b/i, kind: 'bacteria', ingredient: { en: 'live nitrifying bacteria; no species named', ref: { url: 'https://www.saltwateraquarium.com/one-only-freshwater-live-nitrifying-bacteria-2-oz-30-gallons-dr-tims/', title: 'Dr. Tim\'s One & Only' } },
    market: { vi: { status: 'unknown', checkedOn: CHECKED, evidence: 'none of the aquarium shops searched lists it; vietpet.net does, unreliably' } } },
]

/** The problems a remedy answers, as a guide names them. `min`: how often a guide names it before it counts as one the guide is about. */
export const PROBLEMS: Record<ProblemId, { names: RegExp; min: number; heading: string }> = {
  ich: { names: /đốm trắng|\bich\b(?![\s-]?x\b)/gi, min: 1, heading: 'trị bệnh đốm trắng' },
  fungus: { names: /nấm/gi, min: 3, heading: 'trị nhiễm nấm nhẹ' },
  finRot: { names: /thối vây/gi, min: 3, heading: 'trị thối vây' },
  quarantine: { names: /cách ly/gi, min: 6, heading: 'ngâm cá mới trong bể cách ly' },
  cyanobacteria: { names: /tảo lam|vi khuẩn lam|\bBGA\b/g, min: 1, heading: 'trị tảo lam' },
  parasites: { names: /ký sinh|giun|sán/gi, min: 1, heading: 'trị ký sinh trùng' },
}

/**
 * A line on a page with figures in it. Every figure is inside `words`, and `words` are word for word in `guide` (a
 * Vietnamese guide, whose metric wording the site already gives), so no dose here is converted or re-derived.
 * `quotes`: the English it comes from, in `sources/`, word for word. `label`: the same, from a page outside this
 * repository, read on the date given (the figures must be the quote's).
 */
export type Cited = {
  text: string
  words: string[]
  guide?: string
  quotes?: { file: string; text: string }[]
  label?: { url: string; quote: string; readOn: string }
}
export type Use = Cited & { problem: ProblemId; refs?: Ref[] }
export type Remedy = {
  id: string
  /** As the note's heading names it. */
  name: string
  /** What's sold and what it's sold as. `figures`: its size and price, from the shop's page on the date in its ref's title. */
  lead: { text: string; figures: string[]; refs: Ref[] }
  uses: Use[]
  how?: Cited
  risks?: string
  /** A guide that has this already gets a line saying so, not the dose again: it would repeat, and may round differently. */
  carried: RegExp
  /** The guide with the rest of it, for readers who need more. */
  more?: string
  /** What the doses and risks come from. */
  refs: Ref[]
}

const SALT_GUIDE = 'aquariumcoop-blogs-aquarium-aquarium-salt-for-sick-fish'
const SALT_FILE = 'sources/aquariumcoop/blogs-aquarium-aquarium-salt-for-sick-fish.md'
const FINROT_FILE = 'sources/aquariumcoop/blogs-aquarium-fin-rot.md'
const PEROXIDE_GUIDE = 'aquariumbreeder-blue-green-algae-cyanobacteria-profile-and-how-to-remove'
const PEROXIDE_FILE = 'sources/aquariumbreeder/blue-green-algae-cyanobacteria-profile-and-how-to-remove.md'

/**
 * What's on sale here for the problems those products treat, each with what its source says it treats. Not here, and why:
 * xanh methylen (the pharmacy's bottle is 1%, the source's dose is for 2.303%); xanh malachite (never recommended);
 * baking soda (no source gives it for a disease); Co.op's "Muối biển hột" (the salt source says no marine salt).
 */
export const REMEDIES: Partial<Record<Lang, Remedy[]>> = { vi: [
  {
    id: 'salt', name: 'muối hột',
    lead: { text: 'Có shop trong nước bán muối hột cho hồ cá, túi 1 kg. Các liều dưới đây dùng muối hồ cá thông thường hoặc muối mỏ NaCl. Đừng dùng muối ăn, muối biển hay muối Epsom.', figures: ['1 kg'],
      refs: [{ url: 'https://thucanchoca.com/san-pham/muoi-hot-cho-ho-ca', title: 'Muối hột cho hồ cá, túi 1 kg (Thức Ăn Cho Cá, xem ngày 07/11/2026)' }] },
    uses: [
      { problem: 'ich', guide: SALT_GUIDE, quotes: [{ file: SALT_FILE, text: 'Use a concentration of 1 Tbsp of salt per 2 gallons of water' }, { file: SALT_FILE, text: 'you can use this recipe to treat ich (a common ailment also known as white spot disease) for a period of 10 days' }],
        text: 'Với bệnh đốm trắng, bạn cho 1 muỗng canh muối cho mỗi 7,6 lít nước và giữ trong 10 ngày. Nếu sau 5 ngày mà triệu chứng cứ nặng dần, bạn thử tăng nồng độ thêm lần nữa.',
        words: ['1 muỗng canh muối cho mỗi 7,6 lít nước', 'trong 10 ngày', 'sau 5 ngày mà triệu chứng cứ nặng dần'] },
      { problem: 'fungus', guide: SALT_GUIDE, quotes: [{ file: SALT_FILE, text: 'Add 1 tablespoon (Tbsp) of salt per 3 gallons of water' }, { file: SALT_FILE, text: 'It’s used to fight mild cases of bacterial and fungal infection' }],
        text: 'Với nhiễm khuẩn và nhiễm nấm nhẹ, bạn cho 1 muỗng canh muối cho 11,4 lít nước. Bạn giữ cá trong nước muối 4 đến 5 ngày. Nếu cá không đỡ thì tăng nồng độ lên.',
        words: ['1 muỗng canh muối cho 11,4 lít nước', 'Bạn giữ cá trong nước muối 4 đến 5 ngày'] },
      { problem: 'finRot', guide: SALT_GUIDE, quotes: [{ file: FINROT_FILE, text: 'try treating the fin rot with aquarium salt' }, { file: FINROT_FILE, text: 'this method generally takes longer to cure the infection' }, { file: SALT_FILE, text: 'Add 1 tablespoon (Tbsp) of salt per 3 gallons of water' }],
        text: 'Với thối vây, bạn bắt đầu từ 1 muỗng canh muối cho 11,4 lít nước, rồi tăng dần nếu cá vẫn chưa hết triệu chứng. Cách này thường lâu khỏi hơn thuốc.',
        words: ['1 muỗng canh muối cho 11,4 lít nước'], refs: [COOP('fin-rot', '5 Quick and Easy Steps for Treating Fin Rot in Aquarium Fish')] },
      { problem: 'quarantine', guide: SALT_GUIDE, quotes: [{ file: SALT_FILE, text: 'you can treat new fish using the level 1 low salt dosage for 2 weeks' }],
        text: 'Với cá mới trong bể cách ly, bạn có thể ngâm cá suốt 2 tuần, liều 1 muỗng canh muối cho 11,4 lít nước.',
        words: ['1 muỗng canh muối cho 11,4 lít nước', 'suốt 2 tuần'] },
    ],
    how: { guide: SALT_GUIDE, quotes: [{ file: SALT_FILE, text: 'aquarium salt does not evaporate or get filtered out' }],
      text: '1 muỗng canh vào khoảng 15 ml. Bạn đo muối cho cẩn thận vì rất dễ quá liều. Muối không bay hơi và lọc cũng không lọc nó ra được, nên bạn chỉ châm thêm muối khi thay nước, và chỉ châm đúng phần tương ứng với lượng nước thay.',
      words: ['1 muỗng canh vào khoảng 15 ml'] },
    risks: 'Muối không dùng được với phần lớn cây thủy sinh và ốc. Cá da trơn anchor rất nhạy với muối, và các loài cá da trơn, cá chạch có thể nhạy cảm hơn với sự thay đổi độ mặn. Quá liều thì muối giết sạch mọi thứ trong bể.',
    carried: /\d muỗng (?:canh|cà phê) muối cho/i,
    more: SALT_GUIDE,
    refs: [
      COOP('aquarium-salt-for-sick-fish', 'Aquarium Salt: How to Use It Properly for Treating Sick Fish'),
      COOP('how-to-treat-ich-on-freshwater-fish', 'How to Treat Ich or White Spot Disease on Freshwater Fish'),
      COOP('fish-fungus', 'How to Cure Fungus on Aquarium Fish | Recommended Fungal Treatments'),
    ],
  },
  {
    id: 'peroxide', name: 'oxy già 3%',
    lead: { text: 'Thứ này dễ mua mà rẻ. Nhà thuốc có bán, chai 60 ml khoảng 3.000 đồng. Chỉ dùng loại 3%.', figures: ['oxy già 3%', '60 ml', '3.000 đồng', 'loại 3%'],
      refs: [{ url: 'https://www.pharmacity.vn/oxy-gia-vp-3-60ml-loc-10-chai.html', title: 'Nước oxy già VP 3%, chai 60 ml (Pharmacity, giá xem ngày 07/11/2026)' }] },
    uses: [
      { problem: 'cyanobacteria', guide: PEROXIDE_GUIDE, quotes: [{ file: PEROXIDE_FILE, text: 'Fill a syringe with 3% Hydrogen peroxide, (3ml for every 1 gallon or 4 liters)' }],
        text: 'Với tảo lam, bạn tắt lọc để vi sinh không bị ảnh hưởng, tắt sủi oxy để nước gần như đứng yên, rồi tắt đèn, vì có ánh sáng thì oxy già phân hủy nhanh hơn nhiều. Hút oxy già 3% vào xi lanh. Đây là liều bơm tại chỗ, không phải liều châm đều cả bể: 3 ml cho mỗi 4 lít nước trong bể. Oxy già làm bỏng mang, mà mang tép và cá rất nhạy, nên đừng bơm quá liều. Bơm thẳng lên chỗ có tảo lam, đừng để trúng cây, tép và cá. Vài giờ sau, gỡ bằng tay chỗ tảo đang chết rồi bật lọc, sủi oxy và đèn lại. Hôm sau thay nước như mọi tuần.',
        words: ['Hút oxy già 3% vào xi lanh', '3 ml cho mỗi 4 lít nước trong bể'] },
    ],
    risks: 'Oxy già có thể làm bỏng mang, nên quá liều sẽ hại cả cá và tép. Nguồn của liều này không ghi liều nhẹ hơn cho bể có tép, và nói làm cách này là có rủi ro, bể nào cũng vậy. Rêu cảnh, hẹ nước (Vallisneria) và Bucep có thể bị nhũn lá, còn nhiều cây khác thường chịu được. Oxy già chỉ diệt phần tảo đang có. Chưa sửa nguyên nhân thì tảo lam vẫn có thể quay lại.',
    carried: /oxy già 3%[^.]{0,40}\d ml/i,
    refs: [{ url: 'https://aquariumbreeder.com/blue-green-algae-cyanobacteria-profile-and-how-to-remove/', title: 'Blue-Green Algae (Cyanobacteria) Profile and How to Remove' }],
  },
  {
    id: 'general-cure', name: 'API General Cure',
    lead: {
      text: 'Thuốc này có cùng hai hoạt chất với ParaCleanse là metronidazole và praziquantel. AquaTome chưa đọc được hàm lượng của ParaCleanse, nên đừng lấy liều của thuốc này áp cho thuốc kia. Khi xem ngày 07/11/2026, hai shop trong nước liệt kê hộp 10 gói. Một shop ghi 290.000 đồng và đang hết hàng, shop kia ghi 450.000 đồng và không nói còn hay hết.',
      figures: ['hộp 10 gói', '290.000 đồng', '450.000 đồng', '07/11/2026'],
      refs: [
        GENERAL_CURE_LABEL,
        { url: 'https://www.greendeal.vn/api-general-cure', title: 'API - General Cure, hộp 10 gói 290.000 đồng, hết hàng (GreenDeal, xem ngày 07/11/2026)' },
        { url: 'https://m.carong1068.com/api-general-cure-tri-cac-loai-ky-sinh-ca-thung-dau-lo-mom-2905.htm', title: 'Api General Cure, hộp 10 gói 450.000 đồng (carong1068, xem ngày 07/11/2026)' },
      ],
    },
    uses: [
      { problem: 'parasites', label: { url: GENERAL_CURE_LABEL.url, readOn: CHECKED, quote: 'For each 10 gallons (38 L) of water, empty one packet directly into aquarium. Repeat dose after 48 hours. Wait another 48 hours then change 25% of the aquarium water' },
        text: 'Nhãn thuốc ghi 1 gói cho mỗi 38 lít nước, 48 giờ sau cho thêm một liều, chờ thêm 48 giờ rồi thay 25% nước. Nhãn cũng bảo lấy than hoạt tính hoặc tấm lọc có tẩm than ra khỏi lọc trong lúc trị. Với ký sinh trùng bên trong, muối kém hiệu quả hơn.',
        words: ['1 gói cho mỗi 38 lít nước', '48 giờ', '25% nước'] },
    ],
    carried: /general cure[^.]{0,60}\d gói/i,
    refs: [GENERAL_CURE_LABEL, PARASITES_ARTICLE],
  },
] }

/** The times a text names a product. */
export const mentions = (p: Pick<Product, 'match'>, text: string) => text.match(new RegExp(p.match.source, 'gi'))?.length ?? 0
/** The products a text names that shops in this language's country may not list. */
export const hardProducts = (lang: Lang, text: string) => PRODUCTS.filter(p => p.market[lang]?.status === 'hard' && mentions(p, text) > 0)

/** For the writers' prompts: each hard product and its active ingredient, in this language's words. */
export const foreignProducts = (lang: Lang) => PRODUCTS.flatMap(p => {
  const m = p.market[lang]
  if (m?.status !== 'hard') return []
  return [`- ${p.name}: ${m.ingredient ?? m.noIngredient}`]
}).join('\n')

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim()
/** A guide's text as a reader gets it, without its note: its title, text, summary and FAQ, tags out. */
export const guideText = (t: { name?: string; body?: string; summary?: string[]; faq?: { q: string; a: string }[] }) =>
  collapse([t.name ?? '', t.body ?? '', ...(t.summary ?? []), ...(t.faq ?? []).flatMap(f => [f.q, f.a])].join(' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&'))

/** Each line in the table whose figures its files no longer carry, word for word: its words and why. */
export async function doseProblems(root: string, remedies: Remedy[] = REMEDIES.vi ?? []): Promise<{ text: string; problem: string }[]> {
  const out: { text: string; problem: string }[] = []
  const guide = (id: string) => readFile(join(root, 'content/guides', id, 'vi.json'), 'utf8').then(s => guideText(JSON.parse(s) as Parameters<typeof guideText>[0]), () => '')
  const source = (file: string) => readFile(join(root, file), 'utf8').then(collapse, () => '')
  for (const r of remedies) for (const c of [...r.uses, ...(r.how ? [r.how] : [])]) {
    const say = (problem: string) => out.push({ text: c.text, problem })
    if (c.words.some(w => !c.text.includes(w))) say('its words aren\'t in its text')
    const left = c.words.reduce((s, w) => s.replaceAll(w, ''), c.text)
    if (/\d/.test(left)) say(`a figure outside its words: ${left}`)
    if (c.guide) {
      const text = await guide(c.guide)
      for (const w of c.words) if (!text.includes(w)) say(`"${w}" isn't in ${c.guide}`)
    } else if (!c.label) say('it cites neither a guide nor a label')
    for (const q of c.quotes ?? []) if (!(await source(q.file)).includes(collapse(q.text))) say(`"${q.text}" isn't in ${q.file}`)
    if (c.label) for (const n of c.text.match(/\d+(?:[.,]\d+)?/g) ?? []) if (n !== '1' && !c.label.quote.includes(n)) say(`${n} isn't on the label`)
  }
  return out
}

const MARKET_LINE: Record<MarketStatus['status'], string> = {
  hard: 'các shop trong nước khó tìm: không đưa vào bài như thứ cần mua, không ghi liều của nó',
  sold: 'có shop trong nước bán: nhắc tên được, liều theo dữ kiện hoặc theo nhãn',
  unknown: 'chưa rõ có bán không: nói loại sản phẩm, đừng đưa tên làm thứ cần mua',
}
/**
 * What a writer needs to know of its market: each product the source names, then what's on sale here for the problems it's
 * about, with its doses and where they come from. A language with no market data says so: no product is known to be sold.
 */
export function marketFor(lang: Lang, source: string, problems: ProblemId[]): string {
  const named = PRODUCTS.filter(p => mentions(p, source))
  const lines = named.map(p => {
    const m = p.market[lang]
    return `- ${p.name}: ${MARKET_LINE[m?.status ?? 'unknown']}. ${m?.ingredient ? `Hoạt chất: ${m.ingredient}.` : m?.noIngredient ?? ''}`.trim()
  })
  const unlisted = 'Sản phẩm khác trong dữ kiện chưa ai kiểm tra: nói loại sản phẩm hoặc hoạt chất, không đưa tên hãng làm thứ cần mua, liều theo nhãn.'
  const wanted = new Set([...problems, ...named.flatMap(p => p.problems ?? [])])
  const remedies = (REMEDIES[lang] ?? []).filter(r => r.uses.some(u => wanted.has(u.problem))).map(r => [
    `${r.name}: ${r.lead.text}`,
    ...r.uses.filter(u => wanted.has(u.problem)).map(u => u.text),
    ...(r.how ? [r.how.text] : []),
    ...(r.risks ? [`Rủi ro: ${r.risks}`] : []),
  ].join('\n'))
  return [...lines, unlisted, ...(remedies.length ? ['', 'Có bán ở đây cho chuyện này, liều đã có nguồn. Dùng đúng con số này khi bài đang nói về việc trị đó. Bài về chuyện khác thì bỏ hẳn:', ...remedies] : [])].join('\n')
}
