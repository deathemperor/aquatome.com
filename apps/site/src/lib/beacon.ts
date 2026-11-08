import { VISITOR_STATS } from '../../worker/stats-switch'

/** The visitor code, and «Không đếm tôi»'s mark: local storage keys the privacy page names. */
export const VID = 'aq_vid'
export const NOCOUNT = 'aq_nocount'
/** 13 months: a visitor code older than this is replaced. */
export const VID_MS = 3.42e10

/**
 * The readers' beacon, inline in every page (layouts/Base.astro): view (+ referring site), scroll 50/90%, time 30/60/180 s
 * and shop-link clicks → /_e (Worker → Analytics Engine), from when the page is shown, not while it's only preloaded. The
 * tab's session code is in session storage (ts_sid). With the visitor switch on (worker/stats-switch.ts), also:
 * - a visitor code on each event: random, kept in local storage (aq_vid) with when it was made, and replaced after 13
 *   months; none when Global Privacy Control or Do Not Track is on, or when storage is blocked (the tab's count stays);
 * - clicks on what carries data-ev: "add to tank" (tank) and a page's source links (src);
 * - nothing at all, once «Không đếm tôi» on the privacy page set aq_nocount, in a tab already open too.
 * Under 1,500 characters either way (test/styles.test.ts).
 */
export function beaconScript(on = VISITOR_STATS): string {
  const who = on
    ? `var u='',n,L,g=!navigator.globalPrivacyControl&&navigator.doNotTrack!='1';try{L=localStorage;n=L.getItem('${NOCOUNT}');if(!n&&g){var a=(L.getItem('${VID}')||'').split('.');if(!(Date.now()-a[1]<${VID_MS})){a=[Math.random().toString(36).slice(2,12),Date.now()];L.setItem('${VID}',a.join('.'))}u=a[0]}}catch(e){}if(n)return;`
    : ''
  // Each event looks again, so «Không đếm tôi» pressed in an open tab stops it there too, and a deleted code isn't sent.
  const check = on ? `try{if(L.getItem('${NOCOUNT}'))return;u=g?(L.getItem('${VID}')||'').split('.')[0]:''}catch(e){}` : ''
  const body = on ? `{p:p,t:t,v:v,sid:i,r:t==='view'?r:'',u:u}` : `{p:p,t:t,v:v,sid:i,r:t==='view'?r:''}`
  const click = on ? `closest('a[rel~=sponsored],[data-ev]');a&&f(a.dataset.ev||'aff',1)` : `closest('a[rel~=sponsored]');a&&f('aff',1)`
  return `(()=>{var go=function(){try{${who}var d=document.documentElement,k='ts_sid',i=sessionStorage.getItem(k);if(!i){i=(Math.random().toString(36).slice(2)+'000000000000').slice(0,12);sessionStorage.setItem(k,i)}var p=location.pathname.slice(0,200),r='';try{var h=document.referrer&&new URL(document.referrer).hostname;if(h)r=h.slice(0,100)}catch(e){}var f=function(t,v){${check}navigator.sendBeacon&&navigator.sendBeacon('/_e',JSON.stringify(${body}))},seen={};f('view',1);addEventListener('scroll',function(){var r=100*(scrollY+innerHeight)/d.scrollHeight;[50,90].forEach(function(m){if(r>=m&&!seen[m]){seen[m]=1;f('scroll',m)}})},{passive:true});[30,60,180].forEach(function(t){setTimeout(function(){document.visibilityState==='visible'&&f('time',t)},t*1e3)});document.addEventListener('click',function(e){var a=e.target.closest&&e.target.${click}},true)}catch(e){}};document.prerendering?document.addEventListener('prerenderingchange',go,{once:true}):go()})()`
}

/** Cloudflare Web Analytics' loader starts with this with the switch on: «Không đếm tôi» stops every statistic. */
export const nocountGuard = (on = VISITOR_STATS) => (on ? `try{if(localStorage.getItem('${NOCOUNT}'))return}catch(e){}` : '')
