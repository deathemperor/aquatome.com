# Readers' photos on a fish's gallery page: before and after

The fixture build (`/ca/ca-neon-vua/anh/`), phone (Pixel 7, 412 px) and computer (1280 px). The Worker's list (`/_p`)
is a stand-in with 8 photos and a `next`, as in `e2e/reader-photos.spec.ts`; the gallery's own photos are plain
stand-ins, since the media host is blocked locally.

- `before-gallery-end-*`, `after-gallery-end-*`: the gallery's last rows, then "Ảnh bạn đọc", "Xem thêm" and the send button.
- `after-viewer-*`: a reader's photo open in the viewer, "Ảnh của Bạn đọc 2 · 2/11/2026 · 2/8".
- `before-strip-*`, `after-strip-*`: the fish page's link to its gallery, "Xem tất cả 45 ảnh và ảnh bạn đọc →".
- `narrow-id-320.png`: the Indonesian link with 100 photos on a 320 px phone wraps instead of scrolling sideways.
