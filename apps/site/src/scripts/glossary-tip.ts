import { ct } from './ct'

type Box = { left: number; top: number; bottom: number }
/** Where the card goes (viewport px): under the term, or over it when there's no room below; never off the sides. */
export function placeTip(term: Box, w: number, h: number, viewW: number, viewH: number, gap = 6): { left: number; top: number } {
  const left = Math.max(8, Math.min(term.left, viewW - w - 8))
  const top = term.bottom + gap + h > viewH && term.top - gap - h >= 0 ? term.top - gap - h : term.bottom + gap
  return { left, top }
}

/** Glossary terms, and source marks (lib/cite.ts: a text source's number, a photo's ©), which use the same card. */
const SEL = 'a.gl[data-tip], a.cite[data-tip]'

/**
 * Glossary terms in the text (a.gl, dotted underline, with data-term / data-tip): hovering or focusing one shows what it
 * means and a click still opens its page. On a touch screen the first tap shows the card, with a link to the page; a second
 * tap on the term opens it too.
 */
export function initGlossaryTips() {
  if (!document.querySelector(SEL)) return
  const tip = document.createElement('div')
  tip.className = 'gl-tip'
  tip.id = 'gl-tip'
  tip.setAttribute('role', 'tooltip')
  tip.hidden = true
  document.body.append(tip)
  let open: HTMLAnchorElement | null = null
  let touch = false
  let timer = 0

  const termOf = (e: Event) => (e.target instanceof Element ? e.target.closest<HTMLAnchorElement>(SEL) : null)
  function show(a: HTMLAnchorElement, tapped: boolean) {
    const name = document.createElement('strong')
    name.textContent = a.dataset.term ?? a.textContent
    const text = document.createElement('p')
    text.textContent = a.dataset.tip!
    tip.replaceChildren(name, text)
    if (tapped) {
      const more = document.createElement('a')
      more.href = a.href
      if (a.rel) more.rel = a.rel
      more.textContent = a.dataset.more ?? ct('Đọc thêm →')
      tip.append(more)
    }
    tip.classList.toggle('tapped', tapped)
    tip.hidden = false
    const r = a.getClientRects()[0] ?? a.getBoundingClientRect()
    const { left, top } = placeTip(r, tip.offsetWidth, tip.offsetHeight, document.documentElement.clientWidth, innerHeight)
    tip.style.left = `${left + scrollX}px`
    tip.style.top = `${top + scrollY}px`
    open?.removeAttribute('aria-describedby')
    a.setAttribute('aria-describedby', tip.id)
    open = a
  }
  function hide() {
    clearTimeout(timer)
    tip.hidden = true
    open?.removeAttribute('aria-describedby')
    open = null
  }

  document.addEventListener('pointerdown', e => {
    touch = e.pointerType !== 'mouse'
    if (open && !tip.contains(e.target as Node) && termOf(e) !== open) hide()
  }, true)
  // Mouse: a short wait, so passing over a term on the way elsewhere shows nothing.
  document.addEventListener('mouseover', e => {
    const a = termOf(e)
    if (!a || touch) return
    clearTimeout(timer)
    timer = window.setTimeout(() => show(a, false), 150)
  })
  document.addEventListener('mouseout', e => {
    const a = termOf(e)
    if (!a || touch || a.contains(e.relatedTarget as Node)) return
    clearTimeout(timer)
    if (open === a) hide()
  })
  document.addEventListener('focusin', e => { const a = termOf(e); if (a && !touch) show(a, false) })
  document.addEventListener('focusout', e => { if (termOf(e) === open && !tip.classList.contains('tapped')) hide() })
  document.addEventListener('click', e => {
    const a = termOf(e)
    if (a && touch && open !== a) { e.preventDefault(); show(a, true) }
  })
  document.addEventListener('keydown', e => { touch = false; if (e.key === 'Escape') hide() })
  addEventListener('resize', hide)
}
