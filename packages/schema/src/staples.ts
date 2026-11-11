/** Species Vietnamese readers look for first: they lead the home page, the species list and every batch job. */
export const STAPLE_SPECIES = ['betta-splendens', 'poecilia-reticulata', 'paracheirodon-innesi', 'paracheirodon-axelrodi', 'trigonostigma-heteromorpha', 'symphysodon-aequifasciatus', 'pterophyllum-scalare', 'neocaridina-davidi', 'astronotus-ocellatus', 'puntius-titteya', 'danio-rerio', 'mikrogeophagus-ramirezi']

/**
 * The fish Vietnamese hobbyists and shops keep most, most popular first. Wanted whether or not a page mentions them,
 * and fetched before any other wanted page, so the pages readers look for come first (engine/wanted); the home page's
 * native fish lead with them too.
 */
export const POPULAR = [
  'Pterophyllum scalare', 'Symphysodon aequifasciatus', 'Symphysodon discus', 'Xiphophorus maculatus', 'Xiphophorus hellerii',
  'Poecilia sphenops', 'Poecilia latipinna', 'Cyprinus rubrofuscus', 'Cyprinus carpio', 'Scleropages formosus', 'Osteoglossum bicirrhosum',
  'Danio rerio', 'Paracheirodon innesi', 'Gymnocorymbus ternetzi', 'Puntigrus tetrazona', 'Trichopodus trichopterus', 'Trichopodus leerii',
  'Trichogaster lalius', 'Helostoma temminkii', 'Mikrogeophagus ramirezi', 'Epalzeorhynchos bicolor', 'Epalzeorhynchos frenatum',
  'Balantiocheilos melanopterus', 'Pterygoplichthys pardalis', 'Ancistrus dolichopterus', 'Corydoras aeneus', 'Corydoras paleatus',
  'Corydoras sterbai', 'Corydoras panda', 'Hemigrammus bleheri', 'Hyphessobrycon eques', 'Hyphessobrycon herbertaxelrodi',
  'Hemigrammus erythrozonus', 'Pethia conchonius', 'Puntius titteya', 'Danio margaritatus', 'Boraras brigittae', 'Poecilia wingei',
  'Oryzias latipes', 'Macropodus opercularis', 'Pelvicachromis pulcher', 'Labidochromis caeruleus', 'Thorichthys meeki', 'Heros severus',
  'Rocio octofasciata', 'Andinoacara rivulatus', 'Channa barca', 'Channa andrao', 'Channa pulchra', 'Channa bleheri', 'Channa micropeltes',
  'Datnioides microlepis', 'Datnioides pulcher', 'Chitala ornata', 'Pangasianodon hypophthalmus', 'Phractocephalus hemioliopterus',
  'Carinotetraodon travancoricus', 'Dichotomyctere nigroviridis', 'Toxotes jaculatrix', 'Monodactylus argenteus', 'Phenacogrammus interruptus',
  'Caridina cantonensis', 'Pomacea diffusa', 'Vittina natalensis',
]

/**
 * Khám phá's plants (plant ids), in the order a Vietnamese hobbyist meets them: first-tank plants, then those tied to
 * wood and stone, easy rooted plants and stems, and carpets. Curation's list of 11 Nov 2026, from 436 Vietnamese forum
 * and blog posts and each page's difficulty and placement.
 */
export const FIRST_PLANTS = [
  'ceratophyllum-demersum', 'egeria-densa', 'spirodela-polyrrhiza', 'azolla', 'limnobium-laevigatum', 'salvinia-minima',
  'ceratopteris-thalictroides', 'vallisneria-spiralis', 'taxiphyllum-barbieri', 'anubias-barteri-nana', 'microsorum-pteropus',
  'taxiphyllum-alternans', 'vesicularia-montagnei', 'bucephalandra', 'aegagropila-linnaei', 'limnophila-sessiliflora',
  'rotala-rotundifolia', 'hygrophila-polysperma-rosanervig', 'bacopa-monnieri', 'limnophila-aromatica', 'ludwigia-repens',
  'cryptocoryne-x-willisii', 'echinodorus-grisebachii', 'hydrocotyle-tripartita', 'nymphaea-stellata', 'aponogeton-longiplumulosus',
  'eleocharis-acicularis', 'helanthium-tenellum', 'staurogyne-repens', 'pogostemon-helferi', 'micranthemum-tweediei-monte-carlo',
  'micranthemum-callitrichoides',
]

/**
 * Khám phá's first guides (guide ids), in the order a beginner needs them: the whole picture, then the tank and its
 * filter, a new tank's first weeks, the first fish, and the weekly and monthly jobs. Curation's list of 11 Nov 2026.
 */
export const FIRST_GUIDES = [
  'youtube-vyNU5afRdkU', 'youtube-_ZxeBxNRdPU', 'youtube-8ov1q3r56Kw', 'youtube-P8xilUdFS08', 'youtube-NuqFo5_oJ2s',
  'aquariumbreeder-new-tank-syndrome', 'youtube-WKr4WfuEQWU', 'aquatome-chon-ca-khoe-khi-mua-o-cua-hang-dau-hieu-ca-benh-can-tranh-va-cau-hoi-nen-hoi',
  'aquatome-tha-ca-moi-mua-vao-be-cach-thuan-nuoc-dung', 'aquatome-cho-ca-an-bao-nhieu-va-may-lan-mot-ngay-tranh-cho-an-qua-nhieu',
  'youtube-qgic_Fj3WS4', 'aquatome-ve-sinh-loc-be-ca-dung-cach-de-khong-mat-vi-sinh',
  'aquatome-ngo-doc-amoni-va-nitrit-trong-be-ca-dau-hieu-va-cach-cuu-ca', 'aquatome-cach-ly-ca-moi-mua-be-cach-ly-va-quy-trinh',
]

/** The bred fish (breed ids) Vietnamese hobbyists and shops keep most, most popular first: their galleries are filled like what shops sell (engine/gallery-plan). */
export const POPULAR_BREEDS = [
  'balloon-molly', 'koi', 'flowerhorn-cichlid', 'blood-parrot-cichlid',
  'oranda-goldfish', 'ranchu-goldfish', 'ryukin-goldfish', 'lionhead-goldfish', 'pearlscale-goldfish', 'black-moor-goldfish', 'bubble-eye-goldfish',
  'halfmoon-betta', 'plakat-betta', 'crowntail-betta', 'koi-betta',
  'full-red-guppy', 'koi-guppy', 'dumbo-ear-guppy',
  'super-red-arowana', 'red-tailed-golden-arowana', 'crossback-golden-arowana',
  'mickey-mouse-platy', 'butterfly-koi', 'pigeon-blood-discus',
]
