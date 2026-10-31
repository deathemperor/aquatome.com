import { NAME_PREFIX, UART, askStatus, clockOf, firmwareOf, modelOf, nextId, type Clock, type Model } from './chihiros'

/**
 * One Chihiros light over Web Bluetooth: connect, send frames one at a time, read what the light reports back
 * (firmware, clock). The browser's Bluetooth object is passed in, so tests can stand in a fake light.
 */
type Char = EventTarget & { value?: DataView; properties: { write: boolean }; writeValueWithoutResponse(b: Uint8Array): Promise<void>; writeValueWithResponse(b: Uint8Array): Promise<void>; startNotifications(): Promise<Char> }
type Gatt = { connected?: boolean; connect(): Promise<{ getPrimaryService(uuid: string): Promise<{ getCharacteristic(uuid: string): Promise<Char> }> }>; disconnect(): void }
export type BtDevice = EventTarget & { name?: string; gatt?: Gatt }
export type Bluetooth = { requestDevice(o: object): Promise<BtDevice> }

export type Light = {
  name: string
  model: Model
  firmware?: number
  clock?: { at: Date; clock: Clock }
  send(make: (id: number) => Uint8Array, gap?: number): Promise<void>
  /** Ask for the status replies again (firmware, clock); resolves once they are in or after 1.5 s. */
  status(): Promise<void>
  /** Connect again to the same light after it dropped, without the browser's picker. */
  reconnect(): Promise<void>
  disconnect(): void
}
export type Failure = { error: 'cancelled' } | { error: 'unsupported'; name: string } | { error: 'connect'; why: string } | { error: 'bluetooth'; why: string }

const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

/** The browser's device picker (only lights named `name`, when given), then the connection. */
export async function connect(bt: Bluetooth, o: { name?: string; onGone: () => void }): Promise<Light | Failure> {
  let d: BtDevice
  try {
    d = await bt.requestDevice({ filters: [o.name ? { name: o.name } : { namePrefix: NAME_PREFIX }], optionalServices: [UART.service] })
  } catch (e) {
    // NotFoundError: the picker was closed without choosing.
    return (e as Error).name === 'NotFoundError' ? { error: 'cancelled' } : { error: 'bluetooth', why: (e as Error).message }
  }
  const model = modelOf(d.name ?? '')
  if (!model) return { error: 'unsupported', name: d.name ?? '?' }

  let tx: Char | undefined
  let id = 0
  let queue: Promise<unknown> = Promise.resolve()
  const light: Light = {
    name: d.name ?? '',
    model,
    send(make, gap = 80) {
      // Writes go one at a time (the light drops frames sent too close together; Chrome refuses overlapping GATT
      // writes), each acknowledged like the My Chihiros app's, so a lost frame fails here instead of silently.
      const run = async () => {
        if (!tx) throw new Error('not connected')
        id = nextId(id)
        const f = make(id)
        await (tx.properties.write ? tx.writeValueWithResponse(f) : tx.writeValueWithoutResponse(f))
        await wait(gap)
      }
      const p = queue.then(run)
      queue = p.catch(() => {})
      return p
    },
    async status() {
      const asked = Date.now()
      await light.send(askStatus)
      for (let i = 0; i < 15 && !(light.firmware !== undefined && light.clock && light.clock.at.getTime() >= asked); i++) await wait(100)
    },
    async reconnect() { await open() },
    disconnect() { d.gatt?.disconnect() },
  }
  async function open() {
    const svc = await (await d.gatt!.connect()).getPrimaryService(UART.service)
    const rx = await svc.getCharacteristic(UART.notify)
    tx = await svc.getCharacteristic(UART.write)
    id = 0
    rx.addEventListener('characteristicvaluechanged', () => {
      const v = rx.value
      if (!v) return
      const b = new Uint8Array(v.buffer, v.byteOffset, v.byteLength)
      light.firmware = firmwareOf(b) ?? light.firmware
      const c = clockOf(b)
      if (c) light.clock = { at: new Date(), clock: c }
    })
    await rx.startNotifications()
    d.addEventListener('gattserverdisconnected', () => { tx = undefined; o.onGone() }, { once: true })
  }
  try {
    await open()
    await light.status()
  } catch (e) {
    d.gatt?.disconnect()
    return { error: 'connect', why: (e as Error).message }
  }
  return light
}
