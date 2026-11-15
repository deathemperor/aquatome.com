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
  // Four heads where the record boxes a fish the photo's own edge cuts, so the head centres on half a fish while a whole
  // one sits beside it (Curation, 16 Nov). Each is Vision's box for the whole one.
  // Kronichthys subteres, two fish from above: the record boxes the one cut through the body at the bottom; the spotted
  // one is whole to its tail fin, whose tip touches the right edge.
  'https://media.aquatome.com/scotcat/6f1a7cd0d09014b9.webp': { x: 0.406, y: 0.215, w: 0.594, h: 0.387, why: 'the whole fish, not the one the bottom edge cuts' },
  // Hyalobagrus flavus: the record boxes a blurred fish cut by the top edge.
  'https://media.aquatome.com/scotcat/7e55f5cc1b6d5c54.webp': { x: 0.357, y: 0.377, w: 0.299, h: 0.244, why: 'the sharp whole fish, not the blurred one the top edge cuts' },
  // Hypsophrys nicaraguensis: the record boxes the fish the right edge cuts.
  'https://media.aquatome.com/commons/bb7ac2e634c413c0.webp': { x: 0.156, y: 0.311, w: 0.436, h: 0.238, why: 'the whole fish, not the one the right edge cuts' },
  // Pyrrhulina australis: the record boxes the fish behind the leaf, cut by the right edge. The sharpest whole fish is on
  // the left, which Vision lifts only from that side of the photo (its box there, x 0.047 to 0.308); joined with
  // Vision's box for the fish beside it, by Design's rule for a pair, so no frame cuts one of them.
  'https://media.aquatome.com/commons/cfeef6eac35b1b07.webp': { x: 0.047, y: 0.305, w: 0.551, h: 0.533, why: 'the whole fish on the left and those beside them, not the one the right edge cuts' },
}
