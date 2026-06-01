# Functional Specification: {{feature_name}}

---

## Document Info

| Field           | Value                          |
|-----------------|-------------------------------|
| Project         | {{project_name}}              |
| Feature ID      | FT-[XXX]                      |
| Chức năng       | {{feature_name}}              |
| Module / Epic   | [Module]                      |
| Author          | {{author}}                    |
| Tech Stack      | {{stack}}                     |
| Reviewer        | [Tên reviewer]                |
| Status          | Draft                         |
| Version         | {{version}}                   |
| Created         | {{date}}                      |

---

## 1. Overview

{{overview}}

**Scope:** [Những gì bao gồm trong spec này]

**Out of Scope:** [Các phần liên quan nhưng không thuộc spec này]

---

## 2. Actors & Permissions

{{actors}}

---

## 3. Điều kiện tiên quyết

{{preconditions}}

---

## 4. Luồng xử lý chính

{{normal_flow}}

---

## 5. Luồng xử lý thay thế

{{alternative_flows}}

---

## 6. Business Rules

{{business_rules}}

---

## 7. Data Validation Rules

| Field          | Type    | Required | Allowed Values / Format    | Regex / Constraint | Error Code | Error Message             |
|----------------|---------|----------|----------------------------|--------------------|------------|---------------------------|
| [field_name]   | string  | Yes      | [Enum / range / format]    | —                  | ERR-001    | "[Thông báo lỗi cho user]" |

---

## 8. API Contract

> [Mô tả API endpoints ở đây — method, path, request body, response examples]

---

## 9. UI Flow (nếu có)

{{ui_flow}}

---

## 10. Error Catalog

| Error Code | HTTP Status | Message                          | Trigger Condition        | Retry? |
|------------|-------------|----------------------------------|--------------------------|--------|
| ERR-001    | 400         | "[Thông báo cho user]"           | [Điều kiện kích hoạt]    | No     |

---

## 11. Non-Functional Requirements

{{non_functional}}

---

## 12. Test Hints (cho QA)

### Edge Cases cần chú ý

- [ ] [Edge case 1: mô tả tình huống biên đặc biệt]
- [ ] [Edge case 2: tình huống concurrent / race condition]
- [ ] [Edge case 3: timeout / network failure giữa chừng]

---

## 13. Open Questions

{{open_questions}}

---

## 14. Change History

| Version     | Date     | Author     | Changes       |
|-------------|----------|------------|---------------|
| {{version}} | {{date}} | {{author}} | Initial draft |
