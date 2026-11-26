/** The kinds of fish and plants a guide can be about, in the words its titles use. */
const SUBJECTS: Record<string, string[]> = {
  platy: ['platy', 'platies', 'cá bình tích'], guppy: ['guppy', 'guppies', 'bảy màu', 'endlers?'], molly: ['molly', 'mollies'], swordtail: ['swordtails?', 'cá kiếm'],
  betta: ['bettas?', 'cá xiêm'], goldfish: ['goldfish', 'cá vàng'], koi: ['koi'], discus: ['discus', 'cá đĩa', 'cá dĩa'], angelfish: ['angelfish', 'angel fish', 'cá ông tiên', 'cá thần tiên'],
  corydoras: ['corydoras', 'cory', 'cories', 'cá chuột'], gourami: ['gouramis?', 'cá sặc'], cichlid: ['cichlids?'], tetra: ['tetras?'], rasbora: ['rasboras?'], barb: ['barbs?'], danio: ['danios?'],
  loach: ['loach', 'loaches', 'cá chạch'], pleco: ['plecos?', 'plecostomus'], killifish: ['killifish', 'killifishes'], rainbowfish: ['rainbowfish', 'rainbow fish'], arowana: ['arowanas?', 'cá rồng'], flowerhorn: ['flowerhorn', 'cá la hán'],
  oscar: ['oscars?'], puffer: ['puffers?', 'pufferfish'], shrimp: ['(?<!brine )shrimp', 'tép'], snail: ['snails?', '(?<!vỏ )ốc'], stingray: ['stingrays?', 'cá đuối'],
  anubias: ['anubias', 'ráy'], 'java fern': ['java fern', 'dương xỉ'], 'java moss': ['java moss', 'rêu java'], cryptocoryne: ['cryptocoryne', 'crypts?'], bucephalandra: ['bucephalandra'], vallisneria: ['vallisneria'],
  'amazon sword': ['amazon sword', 'sword plants?'], ludwigia: ['ludwigia'], rotala: ['rotala'], hornwort: ['hornwort'], duckweed: ['duckweed', 'bèo tấm'], hygrophila: ['hygrophila'], 'monte carlo': ['monte carlo'],
}
const SUBJECT_WORDS = Object.entries(SUBJECTS).map(([s, ws]) => [s, new RegExp(`(?<![\\p{L}\\p{N}])(?:${ws.join('|')})(?![\\p{L}\\p{N}])`, 'iu')] as const)
const SUBJECT_KINDS = new Set(['care', 'breeding', 'plantCare', 'discovery'])
const OTHERS_EXPECTED = /tank.?mates?|bạn cùng bể|cá cùng bể|nuôi chung|sống chung|chung bể|thả chung|compatib/iu

/**
 * The one kind of fish or plant a guide is about, from its kind and title and, in `also`, its video's title or an
 * article's slug; undefined if they name several, or tank mates are the headline (after a colon they're one topic of
 * several: "Hướng dẫn nuôi cá platy: cho ăn, sinh sản và cá cùng bể" is about platies).
 */
export function guideSubject(kind: string | undefined, title: string, also = ''): string | undefined {
  const [t, more] = [title, also].map(x => x.normalize('NFC').replaceAll('-', ' ')) as [string, string]
  if (!SUBJECT_KINDS.has(kind ?? '') || OTHERS_EXPECTED.test(t.split(/[:–—]/)[0]!) || OTHERS_EXPECTED.test(more)) return undefined
  const named = SUBJECT_WORDS.filter(([, w]) => w.test(`${t} ${more}`)).map(([x]) => x)
  return named.length === 1 ? named[0] : undefined
}

type GuideAbout = { kind?: string; source?: string; video?: { title?: string } }

/** Use the Vietnamese title for the same subject decision in the engine and every served language. */
export function subjectForGuide(guide: GuideAbout, id: string, vietnameseName?: string): string | undefined {
  const title = vietnameseName ?? guide.video?.title ?? id
  const slug = guide.source === 'youtube' || guide.source === 'glaser' ? undefined : id
  return guideSubject(guide.kind, title, [guide.video?.title, slug].filter(Boolean).join(' '))
}
