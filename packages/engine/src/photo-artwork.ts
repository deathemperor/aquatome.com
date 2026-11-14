/** The existing source-title and manual dead-screen artwork predicate, shared without retaining its input words. */
export const ARTWORK = /(?<!\p{L})(?:in art|artworks?|drawings?|illustrations?|illustrated|engravings?|engraved|lithographs?|lithography|paintings?|watercolou?rs?|sketch(?:es)?|line art|clip ?art|cartoons?|iconographia|stamps?|postage|plates? [ivxlc\d]+|pl\. ?[ivxlc\d]+)(?!\p{L})/iu
export const artworkObservation=(v:{note?:unknown;hints?:{artwork?:boolean}}):boolean=>typeof v.hints?.artwork==='boolean'?v.hints.artwork:ARTWORK.test(typeof v.note==='string'?v.note:'')
