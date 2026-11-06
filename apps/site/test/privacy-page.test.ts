import { expect, test } from 'vitest'
import { page } from './dist'

// The owner approved these privacy page sentences (2026-11-06) before the app's anonymous statistics went on: the app's
// sends are counted by a keyed hash of the IP address, gone after a day; a synced light's Bluetooth address is kept.
test('the privacy page says how the app\'s sends are counted and that a light\'s Bluetooth address is kept, in every language', () => {
  const vi = page('/chinh-sach-bao-mat/').dom.textContent
  expect(vi).toContain('Để chống lạm dụng, máy chủ đếm số lần gửi bằng một mã băm có khóa của địa chỉ IP, xóa sau một ngày.')
  expect(vi).toContain('và các bể, đèn (tên và địa chỉ Bluetooth của đèn), lịch đèn bạn lưu.')
  expect(vi).toContain('To stop abuse, the server counts sends with a keyed hash of your IP address, deleted after a day.')
  expect(vi).toContain("and the tanks, lights (each light's name and Bluetooth address) and light schedules you save.")
  const id = page('/id/kebijakan-privasi/').dom.textContent
  expect(id).toContain('hash berkunci dari alamat IP, yang dihapus setelah satu hari.')
  expect(id).toContain('lampu (nama dan alamat Bluetooth lampu)')
  const th = page('/th/privacy/').dom.textContent
  expect(th).toContain('ค่าแฮชแบบใช้คีย์ของที่อยู่ IP ซึ่งจะถูกลบหลังจากหนึ่งวัน')
  expect(th).toContain('ไฟ (ชื่อและที่อยู่ Bluetooth ของไฟ)')
})
