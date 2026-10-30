/** Jim Cumming's Facebook profile: posts and albums collected with a spare account, species photos added to galleries. */
export const FB = {
  id: 'facebook-jim' as const,
  name: 'Jim Cumming',
  profile: 'https://www.facebook.com/jim.cumming.982410/',
  stateFile: 'engine-state/facebook-jim-crawl.json',
  decisionsFile: 'engine-state/facebook-jim-photos.json',
  snapshotDir: 'sources/facebook-jim',
  rawPrefix: 'facebook',
  galleryPrefix: 'facebook-jim',
  polite: 5000,
}
