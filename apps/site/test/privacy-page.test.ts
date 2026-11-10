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

// The Chief of Staff approved this clause (2026-11-08; privacy edits are theirs to approve now) when accounts began
// keeping the id of the profile picture a reader picks (worker/accounts/api.ts, migration 0009).
test('the privacy page says an account keeps the id of the profile picture its reader picks, in every language', () => {
  const vi = page('/chinh-sach-bao-mat/').dom.textContent
  expect(vi).toContain('các phiên đăng nhập (chỉ lưu mã băm); ảnh đại diện bạn chọn trong bộ ảnh cá của ứng dụng (chỉ lưu mã của ảnh); và các bể')
  expect(vi).toContain("sign-in sessions (as hashes only); the profile picture you pick from the app's set of fish photos (its ID only); and the tanks")
  expect(page('/id/kebijakan-privasi/').dom.textContent).toContain('foto profil yang Anda pilih dari kumpulan foto ikan di aplikasi (hanya ID-nya yang disimpan);')
  expect(page('/th/privacy/').dom.textContent).toContain('รูปโปรไฟล์ที่คุณเลือกจากชุดรูปปลาในแอป (เก็บเฉพาะรหัสของรูป);')
})

test('the privacy page names the device word and says nothing else about the device is kept, in every language', () => {
  const vi = page('/chinh-sach-bao-mat/').dom.textContent
  expect(vi).toContain('quốc gia, loại thiết bị (điện thoại, máy tính bảng hay máy tính), mức cuộn')
  expect(vi).toContain('trong thống kê này, chúng tôi chỉ lưu một từ đó, không lưu thông tin trình duyệt hay kích thước màn hình.')
  expect(vi).toContain('thì không có mã khách; các sự kiện khác, gồm quốc gia và loại thiết bị, vẫn được ghi.')
  expect(vi).toContain('country, device type (phone, tablet or computer), scroll depth')
  expect(vi).toContain("in these statistics we keep only that one word, not your browser's details or screen size.")
  expect(vi).toContain('gets no visitor code; its other events, including country and device type, are still recorded.')
  for (const [path, type, kept, signals] of [
    ['/id/kebijakan-privasi/', 'jenis perangkat (ponsel, tablet, atau komputer)', 'dalam statistik ini kami hanya menyimpan satu kata itu', 'termasuk negara dan jenis perangkat, tetap dicatat.'],
    ['/th/privacy/', 'ประเภทอุปกรณ์ (โทรศัพท์ แท็บเล็ต หรือคอมพิวเตอร์)', 'ในสถิตินี้เราเก็บเพียงคำเดียวนั้น', 'รวมถึงประเทศและประเภทอุปกรณ์ ยังคงถูกบันทึก'],
    ['/ms/dasar-privasi/', 'jenis peranti (telefon, tablet atau komputer)', 'dalam statistik ini kami hanya menyimpan satu perkataan itu', 'termasuk negara dan jenis peranti, tetap direkodkan.'],
  ] as const) {
    const text = page(path).dom.textContent
    expect(text, path).toContain(type)
    expect(text, path).toContain(kept)
    expect(text, path).toContain(signals)
  }
})

// The page promises its date moves with its text (section 8): the device word's line moved it to 10 November 2026.
test('the privacy page\'s date is the last approved edit\'s, in every language and the English block', () => {
  const updated = (path: string) => page(path).dom.querySelector('.updated')?.textContent
  expect(updated('/chinh-sach-bao-mat/')).toBe('Cập nhật: 10/11/2026')
  expect(updated('/id/kebijakan-privasi/')).toBe('Diperbarui: 10/11/2026')
  expect(updated('/th/privacy/')).toBe('อัปเดต: 10/11/2026')
  expect(page('/chinh-sach-bao-mat/').dom.textContent).toContain('Last updated: 10 November 2026.')
})
