import type { T } from './i18n'

export type ToolCard = { href: string; name: string; what: string; icon: string }

/**
 * Every tool, drawn (pages/cong-cu/, and four on the home page): six have pages of their own, the other three are
 * calculators further down the tools page (`#…`). `icon`: the inside of a 48 × 48 line drawing.
 */
export function toolCards(t: T): ToolCard[] {
  return [
    { href: '/vi/cong-cu/nhan-dien-ca/', name: t('Nhận diện cá'), what: t('Chụp ảnh con cá, tép hay cây: công cụ đoán tên loài và mở hồ sơ.'),
      icon: '<rect x="5" y="13" width="38" height="26" rx="3"/><path d="M17 13l3-5h8l3 5"/><path d="M14 26c4-5 11-5 15 0-4 5-11 5-15 0z"/><path d="M29 26l5-4v8z"/>' },
    { href: '/vi/cong-cu/nuoi-chung/', name: t('Nuôi chung'), what: t('Các loài có hợp nước, hợp tính không, và thả bao nhiêu con là vừa.'),
      icon: '<path d="M5 19c6-8 17-8 22 0-5 8-16 8-22 0z"/><path d="M27 19l7-6v12z"/><path d="M21 34c3-4 9-4 12 0-3 4-9 4-12 0z"/><path d="M33 34l5-4v8z"/>' },
    { href: '/vi/cong-cu/the-tich-be/', name: t('Thể tích bể'), what: t('Bể bao nhiêu lít, 12 kiểu bể, kính dày bao nhiêu.'),
      icon: '<path d="M7 9v29h34V9"/><path d="M7 16c4 2.5 7.5-2.5 11.5 0s7.5 2.5 11.5 0 7.5-2.5 11 0"/>' },
    { href: '/vi/cong-cu/du-toan-be/', name: t('Dự toán chi phí'), what: t('Set một bể hết bao nhiêu: giá từng món, tiền điện và tiền nuôi mỗi tháng.'),
      icon: '<path d="M11 5h26v38l-4.3-3-4.4 3-4.3-3-4.3 3-4.4-3L11 43z"/><path d="M17 14h14M17 21h14M17 28h8"/><path d="M27 34h4"/>' },
    { href: '#nen', name: t('Lượng nền'), what: t('Trải trước thấp sau cao: bao nhiêu lít, mấy bao.'),
      icon: '<path d="M7 9v29h34V9"/><path d="M7 33l34-9"/><circle cx="14" cy="35" r="1"/><circle cx="24" cy="32" r="1"/><circle cx="33" cy="30" r="1"/>' },
    { href: '#suoi', name: t('Công suất sưởi'), what: t('Bể này cần sưởi bao nhiêu W cho mùa lạnh.'),
      icon: '<rect x="20" y="6" width="8" height="34" rx="4"/><path d="M24 30v-6"/><path d="M12 14c-3 3 3 6 0 9s3 6 0 9M36 14c-3 3 3 6 0 9s3 6 0 9"/>' },
    { href: '#phan-bon', name: t('Liều phân nước'), what: t('Mỗi lần châm bao nhiêu gam, ra bao nhiêu ppm.'),
      icon: '<path d="M29 7l12 12"/><path d="M26 10l12 12"/><path d="M32 16 17 31l-6 1 1-6 15-15"/><path d="M11 37c-1.5 2-2.5 3.5-2.5 4.5a2.5 2.5 0 0 0 5 0c0-1-1-2.5-2.5-4.5z"/>' },
    { href: '/vi/cong-cu/den-chihiros/', name: t('Đèn Chihiros'), what: t('Hẹn giờ, chỉnh độ sáng từng màu qua Bluetooth.'),
      icon: '<rect x="6" y="10" width="36" height="6" rx="1.5"/><path d="M14 21l-3 8M24 21v10M34 21l3 8"/><path d="M9 40h30"/>' },
    { href: '/vi/cong-cu/be-cua-toi/', name: t('Bể của tôi'), what: t('Ghi lại từng bể: kích thước, nền, cá, cây và lịch đèn, ngay trên máy này.'),
      icon: '<rect x="10" y="6" width="28" height="36" rx="2"/><path d="M16 14h16M16 21h16M16 28h10"/><path d="M14 6v36"/>' },
  ]
}
