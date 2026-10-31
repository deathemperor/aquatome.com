# Hồ sơ đánh giá tác động xử lý dữ liệu cá nhân: tài khoản "Bể của tôi" (BẢN NHÁP)

> **For the owner (English).** Draft of the personal data processing impact assessment (DPIA) for AquaTome's optional
> accounts, under the Personal Data Protection Law 2025 (Law 91/2025/QH15) and Decree 356/2025/NĐ-CP (in force
> 1 Jan 2026). Nothing has been filed. Before filing:
>
> 1. **Check whether AquaTome has to file at all.** Decree 356 exempts household businesses and micro enterprises, and
>    small enterprises and start-ups for five years from 1 Jan 2026. The exemption is lost when the operator runs a
>    data processing service, processes sensitive data, or has processed the data of 100,000 or more people in total.
>    AquaTome processes no sensitive data and has far fewer accounts. If AquaTome is run by a person or a small business
>    and stays below 100,000 accounts, filing is likely optional. Keeping this document up to date is still good
>    practice; it is the record we would show if asked.
> 2. **Use the official form.** Secondary sources disagree on whether the DPIA report is Mẫu số 09 or 10 (the other is
>    the cross-border transfer assessment). Copy the content below into the official form from the decree's appendix
>    (vbpl.vn / chinhphu.vn).
> 3. **Cross-border transfer.** The data is stored on Cloudflare (US company; D1 database outside Vietnam) and, for email
>    sign-in, a mail service (AWS SES or Resend). That may also need the cross-border transfer impact assessment (the
>    other form). Section 8 below has its content.
> 4. **Filing** goes to A05 (Cục An ninh mạng và phòng, chống tội phạm sử dụng công nghệ cao, Bộ Công an), reportedly
>    within 60 days of starting to process. A05 reviews it in 15 days, and missing items must be supplied within 30
>    days. The file must be updated every 6 months when purposes, processors or third parties change, and within 10
>    days of a reorganisation or a change of service provider.
>
> Facts marked **[điền]** need the owner's details. Facts about the system are from the code in this repository
> (`apps/site/worker/accounts/`, `apps/site/migrations/0004_accounts.sql`, `docs/my-tanks-sync.md`) as of 31/10/2026.

## 1. Bên kiểm soát dữ liệu

| | |
| --- | --- |
| Tên | **[điền: tên cá nhân / hộ kinh doanh / doanh nghiệp vận hành AquaTome]** |
| Mã số thuế / ĐKKD | **[điền]** |
| Địa chỉ | **[điền]** |
| Liên hệ về dữ liệu cá nhân | **[điền: CONTACT_EMAIL trong apps/site/src/lib/site.ts]** |
| Dịch vụ | aquatome.com (trang web) và ứng dụng AquaTome trên iOS |
| Vai trò | Bên kiểm soát và xử lý dữ liệu cá nhân |

## 2. Hoạt động xử lý

**Tên hoạt động:** Tài khoản không bắt buộc để sao lưu và đồng bộ "Bể của tôi" (thông tin bể cá, đèn và lịch đèn)
giữa trang web và ứng dụng.

**Mục đích:** để người dùng đăng nhập và giữ thông tin bể của mình trên nhiều thiết bị. Dữ liệu không dùng cho
quảng cáo, không bán, không chia sẻ cho bên thứ ba ngoài các bên xử lý ở mục 4.

**Không bắt buộc:** mọi tính năng "Bể của tôi" dùng được mà không cần đăng nhập. Khi đó dữ liệu chỉ nằm trên thiết bị
(bộ nhớ trình duyệt, bộ nhớ ứng dụng) và không gửi về máy chủ.

**Cơ sở xử lý:** sự đồng ý của chủ thể dữ liệu. Người dùng chủ động bấm đăng nhập, sau khi được thông báo
(chính sách bảo mật, câu thông báo cạnh nút đăng nhập). Người dùng rút lại sự đồng ý bằng cách xóa tài khoản ngay trong
trang hoặc ứng dụng.

## 3. Dữ liệu cá nhân xử lý

| Nhóm | Dữ liệu | Lưu ở đâu | Thời gian lưu |
| --- | --- | --- | --- |
| Định danh tài khoản | Mã tài khoản ngẫu nhiên (UUID), ngày tạo | D1 `users` | Đến khi xóa tài khoản |
| Cách đăng nhập | Mã người dùng do Apple hoặc Google cấp (`sub`); mã khóa passkey và khóa công khai; với email: **mã băm có khóa (HMAC-SHA-256) của địa chỉ email**, không lưu địa chỉ | D1 `credentials` | Đến khi xóa tài khoản hoặc gỡ cách đăng nhập |
| Phiên đăng nhập | Mã băm SHA-256 của mã phiên, loại thiết bị (web/app), thời điểm tạo, hết hạn, dùng gần nhất | D1 `sessions` | 180 ngày (web), 365 ngày (app) kể từ lần dùng cuối; xóa khi đăng xuất hoặc xóa tài khoản |
| Mã một lần | Mã băm của liên kết/mã đăng nhập email, nonce, thử thách passkey | D1 `auth_challenges` | 10–15 phút; xóa hằng ngày |
| Giới hạn tần suất | Mã băm có khóa của dải IP hoặc của email kèm bộ đếm | D1 `rate_limits` | Tối đa 24 giờ; xóa hằng ngày |
| Thông tin bể | Tên bể, kích thước, loại nền, loài cá và cây (mã trang), ghi chú tự do, thiết bị (đèn, tên Bluetooth của đèn, lịch, mức sáng) | D1 `tank_records` | Đến khi người dùng xóa bể hoặc xóa tài khoản |

**Không thu thập:** họ tên, số điện thoại, ngày sinh, ảnh, vị trí, danh bạ. Không lưu địa chỉ email và địa chỉ IP.
Không xử lý dữ liệu cá nhân nhạy cảm.

**Dữ liệu chỉ đi qua, không lưu:** địa chỉ email người dùng nhập để nhận mã đăng nhập (chỉ dùng để gửi một email);
mã thông báo danh tính (ID token) của Apple và Google, có thể chứa email (chỉ dùng để kiểm tra, lấy mã băm của email
đã xác minh); địa chỉ IP (Cloudflare nhận để phục vụ trang; máy chủ chỉ tính mã băm cho giới hạn tần suất).

**Ghi chú tự do** có thể chứa thông tin người dùng tự nhập. Ô ghi chú ghi rõ đây là ghi chú về bể, và không có trường
nào yêu cầu thông tin cá nhân.

**Chủ thể dữ liệu:** người dùng tự nguyện tạo tài khoản; dự kiến **[điền: ước tính, ví dụ dưới 10.000 trong năm
đầu]**. Không nhắm tới trẻ em. **[điền: độ tuổi tối thiểu, nếu chủ trang quyết định nêu]**

## 4. Bên xử lý và bên thứ ba

| Bên | Vai trò | Dữ liệu | Nơi xử lý |
| --- | --- | --- | --- |
| Cloudflare, Inc. (Workers, D1, Turnstile) | Bên xử lý: chạy máy chủ, lưu cơ sở dữ liệu, chống bot | Toàn bộ mục 3; IP khi truy cập | Mạng toàn cầu; D1 đặt ở **[điền: vùng của cơ sở dữ liệu thuysinh]** |
| AWS (Amazon SES) **hoặc** Resend **[điền: chọn một]** | Bên xử lý: gửi email đăng nhập | Địa chỉ email, nội dung email (mã một lần) | **[điền: vùng, ví dụ ap-southeast-1 Singapore]** |
| Apple Inc. (Sign in with Apple) | Bên thứ ba người dùng chọn | Apple xác thực người dùng; chúng tôi nhận mã người dùng và (có thể) email ẩn danh của Apple | Theo chính sách của Apple |
| Google LLC (Sign in with Google) | Bên thứ ba người dùng chọn | Tương tự Apple | Theo chính sách của Google |

**[điền: bản sao hợp đồng/điều khoản xử lý dữ liệu]:** Cloudflare Data Processing Addendum; AWS DPA hoặc Resend DPA.

## 5. Luồng dữ liệu

```text
Thiết bị người dùng (trình duyệt / ứng dụng iOS)
  ├─ không đăng nhập: dữ liệu bể chỉ ở bộ nhớ thiết bị
  └─ đăng nhập (tự chọn):
       Apple / Google ──ID token──► Worker (Cloudflare) ── kiểm tra chữ ký, lưu sub ──► D1
       email ──► Worker ── Turnstile, giới hạn tần suất ── gửi mã ──► SES/Resend ──► hộp thư người dùng
                         └─ lưu HMAC(email), băm(mã) ──► D1
       đồng bộ: thiết bị ⇄ Worker ⇄ D1 (các bản ghi bể, gộp theo thời điểm sửa)
       xuất dữ liệu: D1 ──► Worker ──► tệp JSON trên thiết bị
       xóa tài khoản: Worker xóa mọi bản ghi của tài khoản trong D1
```

## 6. Biện pháp bảo vệ

- **Tối thiểu hóa:** không lưu email, IP, họ tên; email lưu dưới dạng HMAC với khóa bí mật chỉ máy chủ có.
- **Mã hóa đường truyền:** chỉ HTTPS (HSTS của Cloudflare).
- **Phiên:** cookie `__Host-`, HttpOnly, Secure, SameSite=Lax; ứng dụng dùng bearer token lưu trong Keychain. Máy chủ
  chỉ lưu mã băm của mã phiên.
- **Chống giả mạo yêu cầu (CSRF):** mọi thay đổi phải đến từ chính trang aquatome.com (Origin) hoặc không có cookie.
- **Chống lạm dụng:** Cloudflare Turnstile và giới hạn tần suất cho email; nonce một lần cho Apple/Google; mã email dùng
  một lần, hết hạn sau 15 phút và chỉ dùng được trên thiết bị đã yêu cầu.
- **Kiểm tra mã thông báo:** chữ ký RS256 theo khóa công bố của Apple/Google, đúng bên phát hành, đúng client id, còn hạn.
- **Phân quyền:** chỉ chủ trang có quyền quản trị Cloudflare (xác thực hai lớp **[điền: xác nhận]**). Khóa bí mật lưu
  trong Cloudflare Secrets, không nằm trong mã nguồn.
- **Kiểm thử:** kiểm thử tự động cho đăng nhập, CSRF, phiên, gộp dữ liệu, xuất và xóa (`apps/site/worker/test/accounts.test.ts`);
  rà soát bảo mật trước khi bật.
- **Mặc định tắt:** tính năng chỉ chạy khi chủ trang bật (`ACCOUNTS`).

## 7. Quyền của chủ thể dữ liệu

| Quyền | Cách thực hiện |
| --- | --- |
| Được biết | Chính sách bảo mật (`/vi/chinh-sach-bao-mat/`), câu thông báo cạnh nút đăng nhập |
| Xem, nhận bản sao | Nút "Tải dữ liệu của tôi" (tệp JSON) trong trang và ứng dụng: ngay lập tức |
| Sửa | Người dùng tự sửa thông tin bể trong trang/ứng dụng |
| Xóa, rút lại đồng ý | Nút "Xóa tài khoản" trong trang và ứng dụng: xóa ngay mọi dữ liệu của tài khoản |
| Khiếu nại, yêu cầu khác | Email **[điền]**; phản hồi đầu tiên trong 2 ngày làm việc, hoàn tất trong thời hạn Nghị định 356 |

Bản sao lưu: **[điền: Cloudflare D1 Time Travel giữ trạng thái cơ sở dữ liệu tới 30 ngày; dữ liệu đã xóa còn trong bản
sao lưu đó tối đa 30 ngày rồi mất hẳn. Xác nhận cấu hình.]**

## 8. Chuyển dữ liệu ra nước ngoài (nội dung cho hồ sơ đánh giá tác động chuyển dữ liệu ra nước ngoài, nếu áp dụng)

- **Bên nhận:** Cloudflare, Inc. (Hoa Kỳ); AWS hoặc Resend (Hoa Kỳ; vùng xử lý **[điền]**).
- **Dữ liệu:** như mục 3 (không có dữ liệu nhạy cảm; email chỉ đi qua dịch vụ gửi mail).
- **Mục đích:** lưu trữ, vận hành máy chủ, gửi email đăng nhập.
- **Biện pháp:** như mục 6; điều khoản xử lý dữ liệu của từng bên (mục 4).

## 9. Rủi ro và đánh giá

| Rủi ro | Khả năng | Mức ảnh hưởng | Biện pháp | Rủi ro còn lại |
| --- | --- | --- | --- | --- |
| Lộ cơ sở dữ liệu | Thấp | Thấp: không có email, tên, IP; chỉ mã băm và thông tin bể cá | Mục 6; HMAC có khóa riêng | Thấp |
| Chiếm tài khoản | Thấp | Thấp: xem/sửa thông tin bể | Nonce, mã một lần gắn với thiết bị, CSRF, phiên băm | Thấp |
| Gửi email hàng loạt qua form đăng nhập | Trung bình | Thấp | Turnstile, giới hạn theo IP, theo email, theo ngày | Thấp |
| Người dùng ghi thông tin cá nhân vào ghi chú | Thấp | Thấp | Ghi chú có giới hạn độ dài; chỉ người dùng thấy; xóa được | Thấp |
| Truy cập trái phép vào quản trị Cloudflare | Thấp | Trung bình | Xác thực hai lớp, token API giới hạn quyền | Thấp |

**Kết luận:** mức rủi ro thấp. Hoạt động xử lý dùng dữ liệu tối thiểu, không có dữ liệu nhạy cảm, có sự đồng ý và
người dùng tự xóa được.

## 10. Xử lý sự cố

Khi phát hiện vi phạm: khóa tính năng (`ACCOUNTS` tắt), thu hồi mọi phiên (xóa bảng `sessions`), đổi khóa liên quan,
đánh giá phạm vi, thông báo cho A05 và người dùng bị ảnh hưởng theo thời hạn của Nghị định 356, lưu hồ sơ sự cố ít nhất
5 năm. **[điền: người chịu trách nhiệm, cách liên hệ]**

## 11. Cập nhật

Lập: **[điền ngày]**. Cập nhật khi đổi mục đích, bên xử lý hoặc bên thứ ba (ví dụ: chọn SES hay Resend, thêm Android),
và khi số tài khoản tiến gần 100.000.
