import type { APIRoute } from 'astro'
import { APP_STATE } from '../../lib/app'
import type { Lang } from '../../lib/i18n'
import vi from '../../assets/app-store/vi.svg?raw'
import id from '../../assets/app-store/id.svg?raw'
import th from '../../assets/app-store/th.svg?raw'
import ms from '../../assets/app-store/ms.svg?raw'

/**
 * Apple's App Store badges, unmodified, from Apple's marketing tools
 * (toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/<vi-vn, id-id, th-th or ms-my>).
 * Built here rather than kept in public/, which every build copies whole: with the switch off, dist has none. The
 * Worker leaves them open in every state: a hidden invitation's badge is never fetched (loading=lazy).
 */
const BADGES: Record<Lang, string> = { vi, id, th, ms }
export const getStaticPaths = () => (APP_STATE !== 'off' ? Object.entries(BADGES).map(([lang, svg]) => ({ params: { badge: `app-store-${lang}` }, props: { svg } })) : [])
export const GET: APIRoute = ({ props }) => new Response((props as { svg: string }).svg, { headers: { 'content-type': 'image/svg+xml' } })
