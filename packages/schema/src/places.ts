/** One country sources spell different ways → the place id it is kept under (engine placeId; the other ids' old addresses redirect). */
export const PLACE_ALIASES: Record<string, string> = {
  usa: 'united-states',
  'dr-congo': 'democratic-republic-of-the-congo',
  'democratic-republic-of-congo': 'democratic-republic-of-the-congo',
  'republic-of-congo': 'republic-of-the-congo',
  'brunei-darussalam': 'brunei',
}
