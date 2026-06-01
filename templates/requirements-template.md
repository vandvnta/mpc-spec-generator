# [Tên chức năng] - Requirements

<!--
Hướng dẫn dùng:
1. Copy file này vào project của bạn, đặt tên ví dụ: requirements/REQ_ten_chuc_nang.md
2. Điền đầy đủ các section bên dưới
3. Nói với Claude: "Tạo spec từ file requirements này: <đường dẫn file>"
4. Claude sẽ tự đọc và gọi generate_spec — không cần điền tham số thủ công
-->

---

## Thông tin chung

| Trường | Giá trị |
|---|---|
| Dự án | _(tên project)_ |
| Tên chức năng | _(tên feature ngắn gọn, VD: "Đăng ký tài khoản")_ |
| Người phụ trách | _(tên BA / developer)_ |
| Tech stack | _(VD: Laravel 10 + React 18, NestJS + PostgreSQL)_ |
| Ngày viết | _(YYYY-MM-DD)_ |

---

## Mô tả tổng quan (Overview)

<!--
Viết 2-3 câu: chức năng này làm gì, phục vụ ai, giải quyết vấn đề gì.
Không cần liệt kê chi tiết — phần đó ở các section bên dưới.
-->

_(VD: Chức năng cho phép người dùng mới tạo tài khoản bằng email và mật khẩu.
Sau khi đăng ký thành công, hệ thống gửi email xác nhận để kích hoạt tài khoản.)_

---

## Actors (Người dùng liên quan)

<!--
Liệt kê từng role trên một dòng.
VD nếu dùng user story: "As a Guest, I want to..."  → ghi "Guest"
-->

- _(VD: Guest — người chưa có tài khoản)_
- _(VD: Admin — quản lý danh sách tài khoản)_

---

## Điều kiện tiên quyết (Preconditions)

<!--
Những gì phải đúng TRƯỚC KHI flow bắt đầu.
Nếu không có điều kiện gì đặc biệt → ghi "Không có"
-->

- _(VD: User chưa có tài khoản với email đó)_
- _(VD: Hệ thống email đang hoạt động)_

---

## Luồng chính (Normal Flow)

<!--
Happy path — kịch bản thành công.
Đánh số từng bước. Bắt đầu từ hành động của user, kết thúc bằng response của hệ thống.

Nếu feature có NHIỀU sub-flow độc lập (VD: vừa có API lấy danh sách vừa có API tạo mới),
dùng heading ### để phân nhóm:

### Lấy danh sách
1. ...

### Tạo mới
1. ...
-->

1. _(VD: User điền email, mật khẩu, họ tên vào form đăng ký)_
2. _(VD: Hệ thống validate: email đúng format, mật khẩu ≥ 8 ký tự, họ tên không rỗng)_
3. _(VD: Hệ thống kiểm tra email chưa tồn tại trong DB)_
4. _(VD: Tạo bản ghi user với trạng thái "pending")_
5. _(VD: Gửi email xác nhận chứa link kích hoạt)_
6. _(VD: Trả về HTTP 201 kèm thông báo "Vui lòng kiểm tra email để kích hoạt tài khoản")_

---

## Luồng thay thế / Ngoại lệ (Alternative Flows)

<!--
Các trường hợp không đi theo happy path.
Format: "Điều kiện kích hoạt → Hệ thống xử lý như thế nào"

Có thể nhóm theo tình huống:
### Validation thất bại
- Email sai format → ...

### Lỗi hệ thống
- DB không kết nối được → ...
-->

- _(VD: Email đã tồn tại trong DB → Trả về HTTP 409 "Email đã được đăng ký")_
- _(VD: Mật khẩu không đủ mạnh → Trả về HTTP 422 kèm thông báo lỗi validation)_
- _(VD: Gửi email thất bại → Rollback tạo user, trả về HTTP 500 "Không thể gửi email xác nhận")_

---

## Quy tắc nghiệp vụ (Business Rules)

<!--
Các ràng buộc, validation rules, công thức tính toán, quy tắc trạng thái.
Mỗi rule trên một dòng. Càng cụ thể càng tốt.
-->

- _(VD: Email phải đúng format RFC 5321)_
- _(VD: Mật khẩu tối thiểu 8 ký tự, phải có ít nhất 1 chữ hoa và 1 số)_
- _(VD: Link kích hoạt có hiệu lực trong 24 giờ)_
- _(VD: Tài khoản chưa kích hoạt không thể đăng nhập)_
- _(VD: Mỗi email chỉ được đăng ký 1 tài khoản)_

---

## UI Flow (nếu có)

<!--
Mô tả luồng giao diện người dùng nếu chức năng có màn hình.
Bỏ qua section này nếu chức năng là pure API (không có UI).

Gợi ý điền:
- Entry point: user bắt đầu từ đâu (màn hình nào, nút nào)
- Các màn hình / bước UI theo thứ tự
- Trạng thái loading, success, error hiển thị như thế nào
- Hành vi khi submit / confirm / cancel

Có thể dùng ### để phân nhóm nếu có nhiều sub-flow UI:
### Màn hình nhập liệu
1. ...

### Màn hình kết quả
1. ...
-->

_(Bỏ trống nếu không có UI — chức năng này là pure API)_

---

## Yêu cầu phi chức năng (Non-Functional Requirements)

<!--
Performance, security, scalability... Bỏ trống nếu không có yêu cầu cụ thể.
-->

- _(VD: Response time < 500ms trong điều kiện bình thường)_
- _(VD: Mật khẩu lưu dưới dạng bcrypt hash, không plain text)_
- _(VD: Rate limit: tối đa 5 lần đăng ký từ cùng IP trong 1 giờ)_

---

## Câu hỏi còn mở (Open Questions)

<!--
Những điểm chưa được quyết định, cần confirm thêm với stakeholder.
Bỏ trống nếu không có.
-->

- _(VD: Email xác nhận có cần re-send nếu user không nhận được không? Timeout bao lâu?)_
- _(VD: Có hỗ trợ đăng ký bằng Google/Facebook OAuth không?)_
