# What the PR that turns chat on has to carry

The owner's rulings, 2026-11-07. `CHAT` stays `"0"` in `apps/site/wrangler.jsonc` until this is all in that one PR.

## The privacy page

All of the Vietnamese below is approved, and it goes live in that PR, not before. A change that alters the meaning goes back
to the owner. Translate it into Indonesian, Thai and Malay (`apps/site/src/i18n/{id,th,ms}.json`) and into the page's
English part, and move the page's date. The Writing Lead reads the translations; a faithful one doesn't go back to the
owner.

### The new section: Hỏi về cá

Khi đã đăng nhập, bạn có thể hỏi về cá và bể đang nuôi. Câu hỏi được gửi tới máy chủ của chúng tôi rồi chuyển tới Claude,
mô hình AI của Anthropic, để trả lời. Để câu trả lời đúng với bể của bạn, Claude có thể đọc các bể bạn đã lưu: tên, kích
thước, cá, cây, nền, ghi chú, lịch đèn và thiết bị nào đang cắm vào ổ cắm thông minh. Nếu bạn hỏi tiếp từ kết quả nhận
diện cá, chúng tôi chỉ gửi kèm tên loài và độ tin cậy, không gửi ảnh.

Chúng tôi lưu câu hỏi và câu trả lời gắn với tài khoản của bạn, cùng nhật ký của từng câu hỏi, kể cả câu bạn đã dừng:
Claude đã nghĩ gì, tra gì và đọc được gì, kể cả dữ liệu bể nếu Claude đọc tới. Nhật ký này dùng để kiểm tra chất lượng câu
trả lời. Chúng tôi không lưu kèm địa chỉ IP hay thông tin về máy của bạn. Tất cả được giữ không thời hạn và bị xóa khi bạn
xóa tài khoản.

Chọn "Ẩn" chỉ bỏ một cuộc trò chuyện khỏi danh sách của bạn trên mọi máy, không xóa nó. Chúng tôi vẫn giữ cuộc trò chuyện
đó và nhật ký của nó cho tới khi bạn xóa tài khoản, và tệp bạn tải bằng "Tải dữ liệu tài khoản" vẫn có những cuộc trò
chuyện đã ẩn. Muốn xóa hẳn một cuộc trò chuyện thì hiện chỉ có cách xóa cả tài khoản.

### Three lines elsewhere on the page

- What's in the file, in the account part: "Tệp tải dữ liệu có thông tin tài khoản và các cách đăng nhập, các bể, thông tin
  về các ảnh nhận diện bạn cho giữ (không gồm tệp ảnh) và các cuộc trò chuyện, cả những cuộc đã ẩn. Tệp không có nhật ký,
  và không có bình luận, ảnh bạn đã gửi."
- What deleting an account removes, adding: "các cuộc trò chuyện cùng nhật ký của chúng".
- Under "6. Thời gian lưu": "Câu hỏi, câu trả lời và nhật ký khi hỏi về cá: đến khi bạn xóa tài khoản."
- In the new section, after the paragraph on "Ẩn", for "Báo sai" (the chief's wording, 2026-11-08): "Khi bạn báo câu
  trả lời sai, chúng tôi lưu câu trả lời đó, báo cáo và lý do bạn ghi (nếu có) để xem lại và cải thiện các câu trả lời
  sau này. Khi bạn xóa tài khoản, chúng tôi xóa luôn dữ liệu này." The Writing Lead's translations, to go in as they are:
  - id: "Saat Anda melaporkan jawaban yang salah, kami menyimpan jawaban tersebut, laporannya, dan alasan yang Anda tulis
    (jika ada) untuk ditinjau dan untuk meningkatkan kualitas jawaban berikutnya. Saat Anda menghapus akun, data ini juga
    kami hapus."
  - th: "เมื่อคุณรายงานว่าคำตอบผิด เราจะเก็บคำตอบนั้น รายงาน และเหตุผลที่คุณระบุ (ถ้ามี) ไว้เพื่อตรวจสอบและปรับปรุงคำตอบ
    ในอนาคต เมื่อคุณลบบัญชี เราจะลบข้อมูลเหล่านี้ด้วย"
  - ms: "Apabila anda melaporkan jawapan yang salah, kami menyimpan jawapan itu, laporan anda dan sebab yang anda tulis
    (jika ada) untuk disemak dan untuk menambah baik jawapan pada masa hadapan. Apabila anda memadam akaun, kami turut
    memadam data ini."

## The chat screen

- The line on where answers come from (approved 2026-11-08): "Claude, mô hình AI của Anthropic, trả lời dựa trên cẩm nang
  AquaTome. Phần nào cẩm nang chưa có thì Claude dùng kiến thức chung về nuôi cá." Nothing in the chat's words may still
  say it answers only from the handbook.
- Under the chat box (the chief's wording, 2026-11-08): "AquaTome gửi câu hỏi tới Claude và lưu đến khi bạn xóa tài
  khoản." Indonesian, Thai and Malay: the Writing Lead's, to come.

## The rest

- The Worker serves the stop and past-conversation calls in `protocols/chat.openapi.json`. The account's export holds the
  conversations, hidden ones marked, without the logs, comments or photos.
- A stopped question's log is kept, the owner's ruling.
- The Worker serves "Báo sai" (`POST /api/chat/conversations/{id}/report`) and the stop limit (`counted`, `freeLeft`;
  `freeStops` in the status). A report is kept in R2 under the account, as its conversations are, so it needs no
  migration, and deleting the account deletes it. The chat's evals read reports there, by reference, and never copy one
  into the repository (it is public, and its history can't be deleted): results there name a report by an id that
  doesn't name the account, never its words, the Mac's eval caches drop a report's answers once the report is gone, and
  a report's question goes to Claude only through the chat's API key, never a person's Claude login. So deleting the
  account takes it out of the evals too, the chief's condition.
