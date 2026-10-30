/** Jim Cumming's Facebook profile: posts and albums collected with a spare account, species photos added to galleries. */
export const FB = {
  id: 'facebook-jim' as const,
  name: 'Jim Cumming',
  profile: 'https://www.facebook.com/jim.cumming.982410/',
  /** Facebook's numeric id for the profile (posts by anyone else on the timeline are not his). */
  ownerId: '100008605184261',
  stateFile: 'engine-state/facebook-jim-crawl.json',
  decisionsFile: 'engine-state/facebook-jim-photos.json',
  snapshotDir: 'sources/facebook-jim',
  rawPrefix: 'facebook',
  galleryPrefix: 'facebook-jim',
  polite: 5000,
}
