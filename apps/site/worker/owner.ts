import { SEGMENTS } from '@aq/schema/langs'
import { SITE_HOST, VI_SECTIONS } from './paths'
/**
 * Owner bar on every page (bottom right): links to the admin pages, and a "hide this page" button (or "bring it back" on a
 * taken-down page; not on the home page). It shows only with the aq_owner=1 flag cookie, set when the owner opens the
 * dashboard; the flag grants nothing — the dashboard and the POST to /_ab/hidden check who it is themselves. Its links are
 * /_ab/ in every page's script, whatever the Worker's vars say: pages are built ahead, and /_ab/ answers for itself, as
 * the dashboard or by a 301 to its own host (dashboard.ts).
 */
export const OWNER_COOKIE = 'aq_owner=1; Path=/; Max-Age=2592000; Secure; SameSite=Strict'
/** The flag as the dashboard's own host sets it: for the site's pages, where the bar and the checks for the owner's own visits read it. */
export const SITE_OWNER_COOKIE = `${OWNER_COOKIE}; Domain=${SITE_HOST}`

/** A page of any language: the Vietnamese home page and its sections, and the pages under the other languages' prefixes (/id/, /th/). */
const PAGE = `^\\/(?:(?:${SEGMENTS}|${VI_SECTIONS.join('|')})\\/|$)`

export const OWNER_SCRIPT = `(()=>{try{if(!/(?:^|; )aq_owner=1/.test(document.cookie))return;var p=location.pathname;if(!/${PAGE}/.test(p))return;var bar=document.createElement('div');bar.setAttribute('data-owner-bar','');bar.style.cssText='position:fixed;right:16px;bottom:16px;z-index:2147483647;display:flex;gap:8px;align-items:center;font:600 14px system-ui,sans-serif';var pill='padding:10px 14px;border:0;border-radius:8px;color:#fff;box-shadow:0 2px 10px rgba(0,0,0,.35);cursor:pointer;text-decoration:none;';[['Quản trị','/_ab/'],['Người đọc','/_ab/doc-gia/']].forEach(function(l){var a=document.createElement('a');a.href=l[1];a.textContent=l[0];a.style.cssText=pill+'background:#10241f';bar.appendChild(a)});if(!/^\\/((${SEGMENTS})\\/)?$/.test(p)){var gone=document.documentElement.dataset.gone==='1',b=document.createElement('button');b.type='button';b.textContent=gone?'Hiện lại trang này':'Ẩn trang này';b.style.cssText=pill+'background:'+(gone?'#1b6b4a':'#b3261e');b.onclick=function(){var note='';if(!gone){note=prompt('Ẩn trang này khỏi AquaTome? Lý do (tuỳ chọn):','');if(note===null)return}b.disabled=true;fetch('/_ab/hidden',{method:'POST',body:new URLSearchParams({url:p,action:gone?'unhide':'hide',note:note}),redirect:'manual'}).then(function(r){if(r.type==='opaqueredirect'||r.ok){b.textContent=gone?'Đã hiện lại':'Đã ẩn, có hiệu lực trong khoảng 1 phút';setTimeout(function(){location.reload()},1500)}else if(r.status===404){alert('Cần đăng nhập tài khoản chủ trang: mở /dang-nhap/ để đăng nhập rồi thử lại.');b.disabled=false}else r.text().then(function(t){alert(t);b.disabled=false})})};bar.appendChild(b)}document.body.appendChild(bar)}catch(e){}})()`
