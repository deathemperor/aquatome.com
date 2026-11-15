import type { SubjectFractions } from './image-geometry'

/**
 * Head boxes set by hand, where the box step's (engine-state/_photo-boxes.json: the largest thing macOS Vision lifts
 * from the photo) sits on the wrong thing: a fish's plainer sex beside its showier one, a tube, a shell (the chief of
 * staff, 15 Nov 2026, from Curation's look at the 72 heads with a second object). The loader takes these over the
 * record, so no box step run, and no rewritten record, moves them, as `nameFixed` holds a name. Each is Vision's own box
 * for the fish (or the pair's two boxes joined), read from the photo; keyed by the photo's address, so a page that
 * changes its head leaves its line unused.
 */
export const HAND_BOXES: Readonly<Record<string, SubjectFractions & { why: string }>> = {
  // Endler's livebearer: the record boxes the plain female, so the wide card moves onto her and cuts the coloured male.
  // The pair, by Design's rule for Limia (15 Nov): boxed alone, he'd cut her on the wide card; together every frame keeps
  // both whole, and he is as clear.
  'https://media.aquatome.com/aquariumcoop/fe5723ff2df7f1f3.webp': { x: 0.168, y: 0.109, w: 0.604, h: 0.8, why: 'the coloured male and the female, not the female alone' },
  // Limia melanogaster: the record boxes the female, so the head moves onto her and cuts the yellow-tailed male; boxed
  // alone, he'd cut her tail instead. The pair (Design, 15 Nov).
  'https://media.aquatome.com/commons/4e48471f68141ae7.webp': { x: 0.09, y: 0.348, w: 0.816, h: 0.297, why: 'the yellow-tailed male and the female, not the female alone' },
  // Betta picta: the record boxes a blue tube in front of the fish.
  'https://media.aquatome.com/commons/f13afd8a0cd3649e.webp': { x: 0.207, y: 0.15, w: 0.686, h: 0.504, why: 'the fish, not the tube' },
  // Hemirhamphodon pogonognathus: the record boxes a snail shell in the corner.
  'https://media.aquatome.com/inaturalist/316028882.webp': { x: 0.385, y: 0.098, w: 0.369, h: 0.682, why: 'the fish, not the shell' },
}
