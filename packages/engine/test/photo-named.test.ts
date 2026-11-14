import { expect, test } from 'vitest'
import { CF, GENUS, knownNames, namedAs, namedOrder, SPECIES, type Named } from '../src/photo-named'

// The 30 heads on main whose source's words said "sp.", "spp." or "cf." (the chief of staff's rulings, 2026-11-14): each
// page's scientific name, the photo's address and its caption, as they were.
const THIRTY: [string, string, string, Named][] = [
  // Named only to the genus, as an undescribed form or as another fish.
  ['Colossoma macropomum', 'https://commons.wikimedia.org/wiki/File:Piaractus_sp,_Zoo_Leipzig_01.jpg', 'Piaractus sp., Zoo Leipzig', GENUS],
  ['Tropheops tropheops', 'https://commons.wikimedia.org/wiki/File:Tropheops_brooding.jpg', 'Tropheops spp. mouth brooding female, Thumbi West Island', GENUS],
  ['Uaru amphiacanthoides', 'https://commons.wikimedia.org/wiki/File:Uaru.jpg', 'Uaru sp.', GENUS],
  ['Corydoras melanotaenia', 'https://commons.wikimedia.org/wiki/File:Corydoras_sp._CW010.jpg', 'Nhóm cá chuột xanh vàng bơi trên nền sỏi trong bể', GENUS],
  ['Lepidocephalichthys hasselti', 'https://www.seriouslyfish.com/species/lepidocephalichthys-sp-le1', 'This undescribed species is rare in the trade.', GENUS],
  ['Ophthalmotilapia ventralis', 'https://commons.wikimedia.org/wiki/File:Ophthalmotilapia_sp._-_5287.jpg', 'Ophthalmotilapia in the Zoo Basel.', GENUS],
  ['Hemigrammus ulreyi', 'https://commons.wikimedia.org/wiki/File:Hemigrammus_ulreyi.JPG', 'Flaggensalmler (Hemigrammus ulreyi) o. Hyphessobrycon sp. "paraguay"', GENUS],
  ['Enteromius holotaenia', 'https://commons.wikimedia.org/wiki/File:Barbus_sp_line_(7003781859).jpg', 'Barbus sp., Barbus cf. holotaenia', GENUS],
  ['Botia rostrata', 'https://www.seriouslyfish.com/species/botia-rostrata', "Adult male of B. sp. 'Upper Brahmaputra'.", GENUS],
  // "cf.", but its source says the fish has what this species shouldn't: another fish (the chief of staff).
  ['Geophagus brachybranchus', 'https://www.seriouslyfish.com/species/geophagus-brachybranchus', 'Adult pair of G. cf. brachybranchus from Guyana. These match the description closely but appear to possess faint flank bars which this species should not have.', GENUS],
  // "cf.": the source isn't sure of the species.
  ['Badis badis', 'https://www.seriouslyfish.com/species/badis-badis', 'Male individual of Badis cf. badis from Buxa Tiger Reserve, Jalpaiguri district, Weat Bengal state, northern India.', CF],
  ['Eirmotus insignis', 'https://www.seriouslyfish.com/species/eirmotus-insignis', 'E. cf insignis from the ornamental trade.', CF],
  ['Hemiodus gracilis', 'https://commons.wikimedia.org/wiki/File:Hemiodopsis_cf_gracilis.jpg', 'Hemiodus cf gracilis', CF],
  ['Leporinus fasciatus', 'https://www.seriouslyfish.com/species/leporinus-fasciatus', 'Adult specimen of L. cf. fasciatus from the rio Negro, Brazil.', CF],
  ['Leptodoras cataniai', 'https://www.scotcat.com/doradidae/leptodoras_cataniai.htm', "Leptodoras cf. cataniai 'Nanay Form'", CF],
  ['Maylandia elegans', 'https://www.aquariumglaser.de/en/25-perchlike-fishes/25b-perchlike-fishes-2-cichlids-from-the-great-african-lakes/shell-dwelling-cichlids-from-lake-malawi-maylandia-cf-elegans-likoma/', '568352-maylandia-elegans-likoma-frau', CF],
  ['Moema hellneri', 'https://www.aquariumglaser.de/en/18-toothcarps-killis-and-livebearers/moema_hellneri_m_cf_ortegai__en/', '', CF],
  ['Pseudacanthicus leopardus', 'https://www.seriouslyfish.com/species/pseudacanthicus-cf-leopardus', 'Adult individual.', CF],
  ['Pseudohomaloptera leonardi', 'https://www.seriouslyfish.com/species/homaloptera-leonardi', 'H. cf. leonardi from the U.S. aquarium trade.', CF],
  ['Pseudohomaloptera sexmaculata', 'https://www.seriouslyfish.com/species/homaloptera-sexmaculata', 'H. cf. sexmaculata from the European aquarium trade.', CF],
  ['Rasbora dandia', 'https://www.seriouslyfish.com/species/rasbora-cf-dandia', 'R cf. dandia is normally sold as R. wilpita.', CF],
  ['Schistura balteata', 'https://www.seriouslyfish.com/species/schistura-cf-balteata', "Schistura sp. cf. balteata; 'pink' form.", CF],
  // This species: ScotCat's "Genus sp. epithet", a trade name, a shop's address with the epithet, a file code in capitals,
  // a sentence about the genus.
  ['Akysis ephippifer', 'https://www.scotcat.com/akysidae/akysis_ephippifer.htm', 'Akysis sp. ephippifer', SPECIES],
  ['Akysis varius', 'https://www.scotcat.com/akysidae/akysis_varius.htm', 'Akysis sp. varius', SPECIES],
  ['Boraras naevus', 'https://www.seriouslyfish.com/species/boraras-naevus', "This species has been traded as B. sp. 'micros' or 'red micros', B. sp. 'Petch Noi', B. sp. 'Thailand', B. sp. 'south Thailand' or 'strawberry rasbora'", SPECIES],
  ['Devario assamensis', 'https://www.seriouslyfish.com/species/devario-assamensis', "Specimen collected in northern West Bengal state, India. This population has been given the trade name D. sp. 'blood stripe'.", SPECIES],
  ['Lentipes ikeae', 'https://bwaquatics.com/products/lentipes-sp-ikeae', '', SPECIES],
  ['Schistura hypsiura', 'https://www.seriouslyfish.com/species/schistura-hypsiura', "This species has been traded as Schistura sp. 'super convict'.", SPECIES],
  ['Serrasalmus sanchezi', 'https://commons.wikimedia.org/wiki/File:SP_A0154.jpg', 'Serrasalmus sanchezi in the home aquaria', SPECIES],
  ['Vaillantella maassi', 'https://www.seriouslyfish.com/species/vaillantella-maassi', 'Vaillantella spp. are easily told apart from other loach genera by their unusually long dorsal fins.', SPECIES],
]

test.each(THIRTY)('%s: %s', (sci, sourceUrl, caption, want) => {
  expect(namedAs({ sourceUrl, caption }, { sci })).toBe(want)
})

test('a name elsewhere in a caption is another fish the sentence brings in, not the photo\'s subject', () => {
  const at = (sci: string, caption: string) => namedAs({ sourceUrl: 'https://www.seriouslyfish.com/species/x', caption }, { sci })
  expect(at('Hampala macrolepidota', 'Juveniles display a cryptic, vertically-barred patterning which may serve to conceal them among shoals of smaller Puntius spp.')).toBe(SPECIES)
  expect(at('Sewellia albisuera', "Ventral detail, a character which separates this species from S. sp. 'SEW01'.")).toBe(SPECIES)
  expect(at('Channa andrao', "Specimen from West Bengal state, northern India; this may have appeared in the trade as C. sp. 'real blue'.")).toBe(SPECIES)
  expect(at('Erromyzon sinensis', 'Erromyzon spp. typically possess four rostral barbels.')).toBe(SPECIES)
  expect(at('Lepidocephalichthys guntea', 'Lepidocephalichthys spp. do best when maintained in groups.')).toBe(SPECIES)
  // Its subject, after "of": the undescribed form.
  expect(at('Botia almorhae', "Adult female of B. sp. 'Teesta'.")).toBe(GENUS)
})

test("a page's own form, a genus's own page and a fish's own number are this fish", () => {
  const c = (sci: string, title: string, codes?: string[]) => namedAs({ sourceUrl: `https://commons.wikimedia.org/wiki/File:${title.replace(/ /g, '_')}.jpg` }, { sci, ...(codes ? { codes } : {}) })
  expect(c('Apistogramma hongsloi', 'Apistogramma hongsloi sp. "Red" 002')).toBe(SPECIES)
  expect(c('Cambarellus patzcuarensis', 'Cambarellus patzcuarensis sp. orange 2')).toBe(SPECIES)
  expect(c('Azolla', 'Azolla sp Palm Beach Gold Coast IMGP0005')).toBe(SPECIES)
  expect(c("Bucephalandra sp. 'Red'", 'Bucephalandra sp. Red 3')).toBe(SPECIES)
  expect(c("Bucephalandra sp. 'Red'", 'Bucephalandra sp. Degori')).toBe(GENUS)
  expect(c('Bucephalandra sp.', 'Bucephalandra sp. 4')).toBe(SPECIES)
  expect(namedAs({ sourceUrl: 'https://www.glaser.de/x', caption: 'Peckoltia sp. (L 134)' }, { sci: 'Peckoltia compta', codes: ['L134'] })).toBe(SPECIES)
  expect(namedAs({ sourceUrl: 'https://www.glaser.de/x', caption: 'Peckoltia sp. (L 134)' }, { sci: 'Peckoltia compta' })).toBe(GENUS)
  // "aff.": another fish close to this one.
  expect(c('Corydoras paleatus', 'Corydoras aff. paleatus')).toBe(GENUS)
})

test('a file named for another species the site has a page for is another fish; an old genus, a plant or this fish too is not', () => {
  const known = knownNames([{ scientificName: 'Betta raja' }, { scientificName: 'Betta anabatoides' }, { scientificName: 'Heros severus' }, { scientificName: 'Heros notatus' }, { scientificName: 'Apteronotus leptorhynchus' }, { scientificName: 'Esmaeilius persicus', synonyms: ['Aphanius persicus'] }])
  const at = (sci: string, sourceUrl: string, latin?: string[]) => namedAs({ sourceUrl }, { sci, known, ...(latin ? { latin } : {}) })
  expect(at('Betta raja', 'https://bwaquatics.com/products/betta-anabatoides-wild-type-bettas-1')).toBe(GENUS)
  // The digits a file's name runs on with ("Heros_notatus01") don't hide it.
  expect(at('Heros severus', 'https://commons.wikimedia.org/wiki/File:Heros_notatus01.jpg')).toBe(GENUS)
  expect(at('Apteronotus macrostomus', 'https://commons.wikimedia.org/wiki/File:Apteronotus_leptorhynchus_A._macrostomus_2.jpg')).toBe(SPECIES)
  expect(at('Aphanius persicus', 'https://www.seriouslyfish.com/species/esmaeilius-persicus', ['Esmaeilius persicus'])).toBe(SPECIES)
  // A plant in a fish's tank: the fish's names are the species' alone.
  expect(namedAs({ sourceUrl: 'https://commons.wikimedia.org/wiki/File:Anubias_barteri_with_a_betta.jpg' }, { sci: 'Betta raja', known: knownNames([{ scientificName: 'Betta raja' }]) })).toBe(SPECIES)
})

const ph = (url: string, words: string, o: { generated?: boolean } = {}) => ({ url, sourceUrl: `https://commons.wikimedia.org/wiki/File:${words.replace(/ /g, '_')}.jpg`, ...(o.generated ? { generated: true } : {}) })
const sci = { sci: 'Colossoma macropomum' }
const cls = (p: { sourceUrl?: string; caption?: string }) => namedAs(p, sci)

test('a genus-only head goes behind a passing photo named to the species, "cf." between, AI pictures last, and twice changes nothing', () => {
  const genus = ph('g', 'Piaractus sp Zoo'), cf = ph('c', 'Colossoma cf macropomum'), own = ph('o', 'Colossoma macropomum 1'), other = ph('x', 'Colossoma macropomum 2'), ai = ph('ai', 'Colossoma macropomum', { generated: true })
  const passes = (p: { url: string }) => p.url !== 'x'
  const once = namedOrder([genus, cf, other, own, ai], cls, passes)
  expect(once.map(p => p.url)).toEqual(['x', 'o', 'c', 'g', 'ai'])
  expect(namedOrder(once, cls, passes)).toEqual(once)
})

test('where nothing named to the species passes, "cf." isn\'t held back; where nothing passes at all, nothing moves', () => {
  const genus = ph('g', 'Piaractus sp Zoo'), cf = ph('c', 'Colossoma cf macropomum'), own = ph('o', 'Colossoma macropomum 1')
  expect(namedOrder([genus, cf, own], cls, p => p.url !== 'o').map(p => p.url)).toEqual(['c', 'o', 'g'])
  expect(namedOrder([genus, own], cls, () => false).map(p => p.url)).toEqual(['g', 'o'])
  // A page's only photo stays.
  expect(namedOrder([genus], cls, () => true).map(p => p.url)).toEqual(['g'])
})

test("the source's description naming this species outranks a file's name naming another (the chief of staff, 2026-11-14); our own Vietnamese captions aren't the source's words", () => {
  const known = knownNames([{ scientificName: 'Heros severus' }, { scientificName: 'Heros notatus' }])
  const at = (sci: string, title: string, caption: string) => namedAs({ sourceUrl: `https://commons.wikimedia.org/wiki/File:${title}.jpg`, caption }, { sci, known })
  expect(at('Colossoma macropomum', 'Piaractus_sp,_Zoo', 'Schwarzer Pacu (Colossoma macropomum), Tierpark Hellabrunn')).toBe(SPECIES)
  expect(at('Heros severus', 'Heros_notatus01', 'H. severus, adult male')).toBe(SPECIES)
  // Not where the description has its own "sp.", "cf." or doubt, or names it only further on.
  expect(at('Colossoma macropomum', 'Piaractus_sp,_Zoo', 'Colossoma macropomum or Piaractus sp.')).toBe(GENUS)
  expect(at('Ophthalmotilapia ventralis', 'Ophthalmotilapia_sp._-_5287', 'Ophthalmotilapia in the Zoo Basel. A label gave Ophthalmotilapia ventralis but I am unsure of that.')).toBe(GENUS)
  expect(at('Heros severus', 'Heros_notatus01', 'Heros severus, though I am unsure of that')).toBe(GENUS)
  // A caption the album step wrote in Vietnamese: the file's name decides.
  expect(at('Ophthalmotilapia ventralis', 'Ophthalmotilapia_sp._-_5289', 'Cá Ophthalmotilapia ventralis màu vàng ô liu bơi trong bể thủy sinh')).toBe(GENUS)
  expect(at('Heros severus', 'Heros_notatus01', 'Cá severus đực màu tím ánh xanh, đốm đen')).toBe(GENUS)
})
