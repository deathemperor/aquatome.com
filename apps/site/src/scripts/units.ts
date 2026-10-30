const toF = (c: number) => Math.round((c * 9 / 5 + 32) * 10) / 10
const toIn = (cm: number) => Math.round((cm / 2.54) * 10) / 10
const fmt = (n: number) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(n)
const pair = ([a, b]: number[]) => (a === b ? fmt(a!) : `${fmt(a!)}–${fmt(b!)}`)

export function applyUnits(units: 'metric' | 'imperial', root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-c]').forEach(el => {
    const v = el.dataset.c!.split(',').map(Number)
    el.textContent = units === 'metric' ? `${pair(v)}°C` : `${pair(v.map(toF))}°F`
  })
  root.querySelectorAll<HTMLElement>('[data-cm]').forEach(el => {
    const v = el.dataset.cm!.split(',').map(Number)
    el.textContent = units === 'metric' ? `${pair(v)} cm` : `${pair(v.map(toIn))} in`
  })
  root.querySelectorAll<HTMLButtonElement>('[data-units-toggle]').forEach(b => {
    b.textContent = units === 'metric' ? 'cm · °C' : 'in · °F'
    b.setAttribute('aria-label', units === 'metric' ? 'cm · °C, đổi sang inch và °F' : 'in · °F, đổi sang cm và °C')
  })
}
