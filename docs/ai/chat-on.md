# What the PR that turns chat on has to carry

The owner's rulings, 2026-11-07. `CHAT` stays `"0"` in `apps/site/wrangler.jsonc` until this is all in that one PR.

## The privacy page

The chat section goes live in that PR, not before. The Vietnamese below is approved. The Writing Lead may fix small wording.
A fix that changes the meaning goes back to the owner.

Translate it (`apps/site/src/i18n/{id,th}.json`, and the page's English part), add a line under "6. Thời gian lưu", and
move the page's date.

### Hỏi đáp về cá

Khi đã đăng nhập, bạn có thể hỏi về cá và bể của mình. Câu hỏi được gửi tới máy chủ của chúng tôi rồi chuyển tới Claude,
mô hình AI của Anthropic, để trả lời. Để trả lời sát bể của bạn, Claude có thể đọc các bể bạn đã lưu: tên, kích thước,
cá, cây, nền, ghi chú, lịch đèn và thiết bị cắm ở ổ điện. Nếu bạn hỏi tiếp từ kết quả nhận diện cá, chỉ tên loài và độ
tin cậy được gửi kèm, không gửi ảnh.

Chúng tôi lưu câu hỏi và câu trả lời dưới tài khoản của bạn, cùng một bản ghi cách trả lời (những gì Claude đã tra và
đọc), không kèm địa chỉ IP hay thông tin thiết bị. Không có hạn lưu; tất cả bị xóa khi bạn xóa tài khoản.

Ẩn một cuộc trò chuyện chỉ bỏ nó khỏi danh sách của bạn, không xóa nó. Chúng tôi vẫn giữ cuộc đó và bản ghi của nó cho
tới khi bạn xóa tài khoản, và tệp "Tải dữ liệu tài khoản" vẫn có những cuộc đã ẩn.

## The rest

- The Worker serves the stop and past-conversation calls in `protocols/chat.openapi.json`, and the account's export holds
  the conversations, hidden ones marked, without the transcripts.
- The new table's production migration has run and been verified, and the owner has been told. It's approved for that
  one table. Any other production migration needs its own OK.
