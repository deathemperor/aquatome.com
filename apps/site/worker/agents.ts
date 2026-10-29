/** RFC 9727 API catalog: the site's read endpoints, described by /openapi.json and /llms.txt. */
export const apiCatalog = (origin: string) => new Response(JSON.stringify({
  linkset: [{
    anchor: `${origin}/`,
    'service-desc': [{ href: `${origin}/openapi.json`, type: 'application/json' }],
    'service-doc': [{ href: `${origin}/llms.txt`, type: 'text/plain' }],
  }],
}), { headers: { 'content-type': 'application/linkset+json', 'cache-control': 'public, max-age=3600' } })

/** RFC 8288 discovery header for the homepage. */
export const DISCOVERY_LINK = '</.well-known/api-catalog>; rel="api-catalog", </llms.txt>; rel="describedby"'
