# mcp-spec-generator

## 1. Giới thiệu

MCP server sinh tài liệu kỹ thuật tự động từ các tham số đầu vào, hỗ trợ 3 loại output:

| Tool | Output | Format |
|------|--------|--------|
| `generate_spec` | Functional Specification | Markdown |
| `generate_testcase` | Test Case | XLSX (Excel) |
| `generate_review` | Review Report | Markdown + JSON |

Thay vì viết tay từng tài liệu, bạn chỉ cần cung cấp thông tin ngắn gọn và Claude Code sẽ gọi tool tương ứng, tạo file có cấu trúc chuẩn và lưu vào thư mục `output/`.

---

## 2. Yêu cầu hệ thống

| Phần mềm | Phiên bản tối thiểu |
|----------|---------------------|
| Node.js  | >= 18               |
| npm      | >= 9                |

Kiểm tra nhanh:

```bash
node -v   # v18.x.x trở lên
npm -v    # 9.x.x trở lên
```

---

## 3. Cài đặt

```bash
# Bước 1: Copy hoặc clone thư mục mcp-spec-generator vào máy
# (không cần đưa lên Git public, chỉ cần có trên máy local)

# Bước 2: Cài dependencies
cd mcp-spec-generator
npm install

# Bước 3: Build TypeScript → JavaScript
npm run build

# Kiểm tra build thành công
ls dist/index.js   # phải tồn tại
```

---

## 4. Tích hợp vào project

Để dùng MCP server trong một project, cần copy **2 file template** từ thư mục `templates/` vào thư mục gốc của project đó:

```
mcp-spec-generator/templates/
├── .mcp.json     → copy vào gốc project
└── CLAUDE.md     → copy vào gốc project
```

### Bước 1 — Copy 2 file template

```bash
# Từ thư mục chứa mcp-spec-generator
cp mcp-spec-generator/templates/.mcp.json  /đường-dẫn/project-của-bạn/.mcp.json
cp mcp-spec-generator/templates/CLAUDE.md  /đường-dẫn/project-của-bạn/CLAUDE.md
```

Hoặc copy thủ công bằng Explorer/Finder.

### Bước 2 — Chỉnh đường dẫn trong `.mcp.json`

Mở file `.mcp.json` vừa copy và thay `/ĐƯỜNG_DẪN_TUYỆT_ĐỐI/`:

```json
{
  "mcpServers": {
    "spec-generator": {
      "command": "node",
      "args": ["/ĐƯỜNG_DẪN_TUYỆT_ĐỐI/mcp-spec-generator/dist/index.js"]
    }
  }
}
```

Ví dụ thực tế:

- **Windows:** `C:/Users/yourname/tools/mcp-spec-generator/dist/index.js`
- **macOS/Linux:** `/home/yourname/tools/mcp-spec-generator/dist/index.js`

> `CLAUDE.md` không cần chỉnh sửa — dùng ngay được.

### Vai trò của từng file

| File | Vai trò |
|------|---------|
| `.mcp.json` | Khai báo MCP server để Claude Code kết nối |
| `CLAUDE.md` | Hướng dẫn Claude tự động gọi đúng tool khi nhận yêu cầu liên quan đến spec / testcase / review |

---

## 5. Cách dùng trong Claude Code

Sau khi tích hợp, khởi động lại Claude Code (hoặc reload MCP servers). Chỉ cần nói chuyện tự nhiên — Claude sẽ đọc `CLAUDE.md` và tự gọi tool phù hợp:

```
Tạo spec cho chức năng Đăng nhập
```

```
Tạo test case cho màn hình Giỏ hàng
```

```
Tạo review report cho PR của Tran Van B, chức năng Thanh toán
```

Claude sẽ đọc source code để suy luận các tham số, hỏi gộp những gì còn thiếu, rồi gọi tool ngay — không cần bạn liệt kê tham số thủ công.

---

## 6. Ví dụ output

File được tạo tự động tại: `output/spec_Dang_nhap_20260519_143022.md`

---

```markdown
# Functional Specification: Đăng nhập

## Thông tin tài liệu
| Trường       | Giá trị                    |
|--------------|----------------------------|
| Dự án        | App bán hàng               |
| Chức năng    | Đăng nhập                  |
| Tác giả      | Nguyen Van A               |
| Tech stack   | Laravel 10 + React 18      |
| Ngày tạo     | 2026-05-19 14:30           |
| Phiên bản    | 1.0                        |

## 1. Tổng quan
Cho phép người dùng đăng nhập bằng email và mật khẩu. Hệ thống xác thực
thông tin và tạo session. Hỗ trợ ghi nhớ đăng nhập 30 ngày.

## 2. Actors (Người dùng liên quan)
- Khách hàng
- Hệ thống xác thực
- Database

## 3. Điều kiện tiên quyết
- Người dùng đã có tài khoản
- Email đã được xác minh
- Hệ thống đang hoạt động

## 4. Luồng xử lý chính
1. Người dùng truy cập trang đăng nhập
2. Nhập email và mật khẩu
3. Nhấn nút Đăng nhập
4. Hệ thống validate form phía client
5. Gửi request POST /api/auth/login
6. Server kiểm tra email tồn tại
7. Server xác thực mật khẩu
8. Tạo JWT token và lưu session
9. Trả về token và redirect về Dashboard

## 5. Luồng xử lý thay thế
1. Sai mật khẩu (tối đa 5 lần)
2. Lần 5 sai → khóa tài khoản 15 phút
3. Hiển thị thông báo lỗi tương ứng

## 6. Business Rules
- Mật khẩu phải >= 8 ký tự
- Khóa tài khoản sau 5 lần sai liên tiếp
- JWT token hết hạn sau 24 giờ
- Remember me kéo dài token lên 30 ngày

## 7. Yêu cầu phi chức năng
- Response time < 500ms
- Mật khẩu lưu dạng bcrypt hash
- Rate limiting 10 request/phút/IP

## 8. Open Questions
- [ ] Có hỗ trợ đăng nhập bằng Google OAuth không?
- [ ] Có cần 2FA không?
```

---

## 7. Kiểm tra hoạt động

### Kiểm tra MCP server kết nối

Mở project bằng Claude Code, chạy lệnh:

```
/mcp
```

Phải thấy `spec-generator` trong danh sách với trạng thái **connected**.

### Kiểm tra bằng terminal

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  | node /ĐƯỜNG_DẪN/mcp-spec-generator/dist/index.js
```

Output phải chứa cả 3 tool: `generate_spec`, `generate_testcase`, `generate_review`.

### Lưu ý

- Server không cần chạy thường trực — Claude Code tự start/stop theo nhu cầu.
- File output lưu vào `mcp-spec-generator/output/`, không phụ thuộc vào project đang mở.
- Mỗi lần gọi tool tạo ra một file mới (tên có timestamp), không ghi đè file cũ.
- Nếu Claude không tự gọi tool, kiểm tra lại `CLAUDE.md` đã có ở gốc project chưa.
