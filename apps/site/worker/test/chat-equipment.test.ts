import type { Device, TankStore } from '@aq/schema/tanks'
import { expect, test } from 'vitest'
import { equipmentChoices, equipmentOf, equipmentProposal } from '../chat/equipment'

const at = '2026-11-26T00:00:00.000Z'
const tank = { id: 'a1000000-0000-4000-8000-000000000001', name: 'Bể rêu', species: [], plants: [], createdAt: at, updatedAt: at }
const other = { ...tank, id: 'a1000000-0000-4000-8000-000000000002' }
const lamp = { id: 'b1000000-0000-4000-8000-000000000001', tankId: tank.id, kind: 'light', brand: 'loveecology', createdAt: at, updatedAt: at }
const plug: Device = {
  ...lamp, id: 'b1000000-0000-4000-8000-000000000002', kind: 'plug', brand: 'tuya', remoteId: 'physical-strip',
  outlets: [
    { code: 'switch_1', role: 'fan', label: 'Quạt https://example.test' }, { code: 'switch_2', role: 'co2' },
    { code: 'switch_3', role: 'heater' }, { code: 'switch_4', role: 'filter' }, { code: 'switch_5', role: 'air' },
    { code: 'switch_6', role: 'light' }, { code: 'switch_7' },
  ],
}
const saved: TankStore = { v: 1, tanks: [tank, other], devices: [lamp, plug] }

test('only the selected tank’s supported switches are offered with safe directions', () => {
  const offers = equipmentOf(saved, tank.id)
  expect(equipmentChoices(offers)).toEqual([
    { option: 1, role: 'lamp', label: 'Love Ecology', states: ['on', 'off'] },
    { option: 2, role: 'fan', label: 'Quạt …', states: ['on', 'off'] },
    { option: 3, role: 'co2', label: undefined, states: ['off'] },
  ])
  expect(equipmentOf(saved, other.id)).toEqual([])
  expect(equipmentOf({ ...saved, tanks: [{ id: tank.id, deletedAt: at, updatedAt: at }] }, tank.id)).toEqual([])

  expect(equipmentProposal(tank.id, offers, { option: 2, on: true })).toEqual({
    tank: tank.id, role: 'fan', command: { device: plug.id, outlet: 'switch_1', on: true },
  })
  for (const pick of [
    { option: 3, on: true }, { option: 0, on: false }, { option: 4, on: false }, { option: 1.5, on: false },
    { option: 2, on: 'false' }, { option: 1, on: true, outlet: 'switch_3' }, { option: 2, on: false, minutes: 5 },
    [{ option: 2, on: false }], null,
  ]) expect(equipmentProposal(tank.id, offers, pick)).toBeUndefined()
})

test('ambiguous physical devices and duplicate outlet codes are ineligible', () => {
  const otherLamp = { ...lamp, id: 'b1000000-0000-4000-8000-000000000003', tankId: other.id }
  const copy = { ...plug, id: 'b1000000-0000-4000-8000-000000000004', tankId: other.id, outlets: [{ code: 'switch_1', role: 'filter' }] }
  expect(equipmentOf({ ...saved, devices: [...saved.devices, otherLamp, copy] }, tank.id)).toEqual([])
  const duplicateOutlet = { ...plug, outlets: [...plug.outlets!, { code: 'switch_1', role: 'filter' }] }
  expect(equipmentOf({ ...saved, devices: [duplicateOutlet] }, tank.id)).toEqual([{ device: plug.id, outlet: 'switch_2', role: 'co2' }])
  const deletedCopy = { id: copy.id, deletedAt: at, updatedAt: at }
  expect(equipmentOf({ ...saved, devices: [...saved.devices, deletedCopy] }, tank.id)).toEqual(equipmentOf(saved, tank.id))
})
