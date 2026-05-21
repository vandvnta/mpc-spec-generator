# Test Case Template — Cấu trúc cột cố định

File XLSX output luôn có đúng 8 cột theo thứ tự sau, không thay đổi dù project hay stack khác nhau:

| Cột | Tên cột | Mô tả |
|-----|---------|-------|
| A | Test Case ID | Mã định danh, format: TC-001, TC-002, ... |
| B | Feature | Tên chức năng đang test |
| C | Scenario | Tên kịch bản test |
| D | Preconditions | Điều kiện tiên quyết |
| E | Test Steps | Các bước thực hiện (đánh số, mỗi bước cách nhau bằng newline) |
| F | Expected Result | Kết quả mong đợi |
| G | Priority | High / Medium / Low |
| H | Status | Not Run / Pass / Fail |

## Quy tắc định dạng:
- Hàng 1: Header, background màu #2F5496, chữ trắng, bold, font size 12
- Hàng 2 trở đi: Data rows, các hàng xen kẽ màu trắng và #EEF2FF
- Tất cả các cột căn trái, wrap text
- Độ rộng cột cố định: ID(10), Feature(20), Scenario(30), Preconditions(25), Steps(40), Expected(30), Priority(12), Status(12)
- Border mỏng cho tất cả các cell
