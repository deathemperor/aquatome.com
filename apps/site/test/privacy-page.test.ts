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

// The owner approved these sentences (2026-11-06) for a comment's photo (worker/comments/photo.ts).
test('the privacy page says a comment can carry a photo, checked as reader photos are but its species, in every language', () => {
  const vi = page('/chinh-sach-bao-mat/').dom.textContent
  expect(vi).toContain('Bạn cũng có thể kèm một ảnh khi bình luận, cũng với tên hiển thị và xác nhận ảnh do bạn chụp. Ảnh này qua các bước như trên, trừ bước kiểm tra đúng loài, và chỉ hiện dưới bình luận của bạn, kèm tên bạn; bình luận bị gỡ thì ảnh cũng bị xóa. Bạn cũng nhận một link riêng để tự gỡ ảnh này.')
  expect(vi).toContain('You can also attach one photo to a comment, with the same display name and confirmation that you took it. It goes through the same steps except the species check, and shows only under your comment, with your name; if the comment is removed, so is the photo. You get a private link to remove it too.')
  expect(page('/id/kebijakan-privasi/').dom.textContent).toContain('Anda juga dapat melampirkan satu foto saat berkomentar')
  expect(page('/th/privacy/').dom.textContent).toContain('คุณยังแนบรูปหนึ่งรูปเมื่อแสดงความคิดเห็นได้')
})
