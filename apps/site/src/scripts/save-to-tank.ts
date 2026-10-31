import type { Tank } from '@aq/schema'
import { cpath, ct } from './ct'
import * as store from './tank-store'

/**
 * "Lưu vào Bể của tôi" on a tool (components/SaveToTank.astro): what the tool worked out goes onto a new tank or one
 * saved in this browser. The tool gives the fields (`fields`, knowing the tank it goes on) and a name for a new tank.
 */
export type SaveTo = {
  /** A new tank's name when none is typed. */
  name: () => string
  fields: (kept: Tank | undefined) => Omit<store.TankFields, 'name'>
}

/** The tank's fish with these added: a fish already there gets the new number; its other keys stay. */
export function withSpecies(kept: Tank['species'] = [], add: { id: string; count: number }[]): Tank['species'] {
  const out = kept.map(s => ({ ...s }))
  for (const a of add) {
    const i = out.findIndex(s => s.id === a.id)
    if (i >= 0) out[i] = { ...out[i]!, count: a.count }
    else out.push(a)
  }
  return out
}

export function initSaveToTank(o: SaveTo): { show(on: boolean): void } {
  const root = document.querySelector<HTMLElement>('.save-tank')!
  const form = root.querySelector('form')!
  const pick = form.elements.namedItem('tank') as HTMLSelectElement
  const name = form.elements.namedItem('name') as HTMLInputElement
  const msg = root.querySelector<HTMLElement>('[role=status]')!

  // The tanks saved here, oldest first (as on "Bể của tôi"); the one picked stays picked if it is still there.
  function fill() {
    const tanks = store.liveTanks(store.load()).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
    const was = pick.value
    pick.replaceChildren(new Option(ct('Bể mới'), ''), ...tanks.map(t => new Option(t.name, t.id)))
    pick.value = tanks.some(t => t.id === was) ? was : ''
    name.closest('label')!.hidden = pick.value !== ''
  }
  pick.addEventListener('change', () => { name.closest('label')!.hidden = pick.value !== '' })
  addEventListener('storage', e => { if (e.key === store.KEY) fill() })

  form.addEventListener('submit', e => {
    e.preventDefault()
    const s = store.load()
    const kept = store.liveTanks(s).find(t => t.id === pick.value)
    const tank = store.putTank(s, { name: kept?.name ?? (name.value.trim() || o.name()), ...o.fields(kept) }, kept?.id)
    store.save(s)
    name.value = ''
    fill()
    pick.value = tank.id
    name.closest('label')!.hidden = true
    const a = Object.assign(document.createElement('a'), { href: `${cpath('/vi/cong-cu/be-cua-toi/')}#be-${tank.id}`, textContent: ct('Xem trong Bể của tôi →') })
    msg.replaceChildren(ct('Đã lưu vào “{name}”.', { name: tank.name }), ' ', a)
  })

  let shown = false
  return {
    show(on) {
      // The list is read when the row appears (and when another tab changes it), not on every keystroke.
      if (on && !shown) fill()
      shown = on
      root.hidden = !on
      name.placeholder = o.name()
      // The tool changed: what was saved is no longer what it shows.
      msg.replaceChildren()
    },
  }
}
