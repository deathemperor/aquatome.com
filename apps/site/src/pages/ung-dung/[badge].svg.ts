import type { APIRoute } from 'astro'
import { APP_ON } from '../../lib/app'
import vi from '../../assets/app-store/vi.svg?raw'
import id from '../../assets/app-store/id.svg?raw'
import th from '../../assets/app-store/th.svg?raw'

/**
 * Apple's App Store badges, unmodified, from Apple's marketing tools
 * (toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/<vi-vn, id-id or th-th>).
 * Built here rather than kept in public/, which every build copies whole: with the switch off, dist has none.
 */
const BADGES = { vi, id, th }
export const getStaticPaths = () => (APP_ON ? Object.entries(BADGES).map(([lang, svg]) => ({ params: { badge: `app-store-${lang}` }, props: { svg } })) : [])
export const GET: APIRoute = ({ props }) => new Response((props as { svg: string }).svg, { headers: { 'content-type': 'image/svg+xml' } })
