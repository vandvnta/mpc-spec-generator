# Review Report Template — Cấu trúc section cố định

File Markdown output luôn có đúng 7 section theo thứ tự sau:

# Review Report: {{feature_name}}

## Thông tin review
| Trường | Giá trị |
|--------|---------|
| Dự án | {{project_name}} |
| Chức năng | {{feature_name}} |
| Reviewer | {{reviewer}} |
| Reviewee | {{reviewee}} |
| Stack | {{stack}} |
| Ngày review | {{date}} |
| Kết quả tổng thể | {{overall_result}} |

## 1. Tóm tắt (Summary)
{{summary}}

## 2. Những điểm tốt (Good Points)
{{good_points}}

## 3. Vấn đề phát hiện (Issues Found)
{{issues}}

## 4. Mức độ nghiêm trọng (Severity Overview)
| Mức độ | Số lượng |
|--------|----------|
| Critical | {{critical_count}} |
| Major | {{major_count}} |
| Minor | {{minor_count}} |

## 5. Đề xuất cải thiện (Recommendations)
{{recommendations}}

## 6. Kết luận (Conclusion)
{{conclusion}}

## 7. Checklist
{{checklist}}
