import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import ExcelJS from "exceljs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// M3: Module-scope to avoid rebuilding on every toSlug() call
const VIET_CHAR_MAP: Record<string, string> = {
  à:"a",á:"a",ả:"a",ã:"a",ạ:"a",
  ă:"a",ằ:"a",ắ:"a",ẳ:"a",ẵ:"a",ặ:"a",
  â:"a",ầ:"a",ấ:"a",ẩ:"a",ẫ:"a",ậ:"a",
  è:"e",é:"e",ẻ:"e",ẽ:"e",ẹ:"e",
  ê:"e",ề:"e",ế:"e",ể:"e",ễ:"e",ệ:"e",
  ì:"i",í:"i",ỉ:"i",ĩ:"i",ị:"i",
  ò:"o",ó:"o",ỏ:"o",õ:"o",ọ:"o",
  ô:"o",ồ:"o",ố:"o",ổ:"o",ỗ:"o",ộ:"o",
  ơ:"o",ờ:"o",ớ:"o",ở:"o",ỡ:"o",ợ:"o",
  ù:"u",ú:"u",ủ:"u",ũ:"u",ụ:"u",
  ư:"u",ừ:"u",ứ:"u",ử:"u",ữ:"u",ự:"u",
  ỳ:"y",ý:"y",ỷ:"y",ỹ:"y",ỵ:"y",đ:"d",
  À:"A",Á:"A",Ả:"A",Ã:"A",Ạ:"A",
  Ă:"A",Ằ:"A",Ắ:"A",Ẳ:"A",Ẵ:"A",Ặ:"A",
  Â:"A",Ầ:"A",Ấ:"A",Ẩ:"A",Ẫ:"A",Ậ:"A",
  È:"E",É:"E",Ẻ:"E",Ẽ:"E",Ẹ:"E",
  Ê:"E",Ề:"E",Ế:"E",Ể:"E",Ễ:"E",Ệ:"E",
  Ì:"I",Í:"I",Ỉ:"I",Ĩ:"I",Ị:"I",
  Ò:"O",Ó:"O",Ỏ:"O",Õ:"O",Ọ:"O",
  Ô:"O",Ồ:"O",Ố:"O",Ổ:"O",Ỗ:"O",Ộ:"O",
  Ơ:"O",Ờ:"O",Ớ:"O",Ở:"O",Ỡ:"O",Ợ:"O",
  Ù:"U",Ú:"U",Ủ:"U",Ũ:"U",Ụ:"U",
  Ư:"U",Ừ:"U",Ứ:"U",Ử:"U",Ữ:"U",Ự:"U",
  Ỳ:"Y",Ý:"Y",Ỷ:"Y",Ỹ:"Y",Ỵ:"Y",Đ:"D",
};

// L1, H4: Shared project_path validation for all 3 schemas
const projectPathField = z
  .string()
  .max(500)
  .refine((val) => !val.includes(".."), 'project_path không được chứa ".."')
  .optional();

const GenerateSpecSchema = z.object({
  project_name:      z.string().min(1).max(500),
  project_path:      projectPathField,
  feature_name:      z.string().min(1).max(500),
  author:            z.string().min(1).max(500),
  stack:             z.string().min(1).max(500),
  overview:          z.string().min(1).max(10_000),
  actors:            z.string().min(1).max(10_000),
  preconditions:     z.string().min(1).max(10_000),
  normal_flow:       z.string().min(1).max(10_000),
  alternative_flows: z.string().max(10_000).optional(),
  business_rules:    z.string().min(1).max(10_000),
  non_functional:    z.string().max(10_000).optional(),
  open_questions:    z.string().max(10_000).optional(),
});

type SpecParams = z.infer<typeof GenerateSpecSchema>;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// L2: Added .toLowerCase() so filenames are always lowercase
function toSlug(str: string): string {
  return str
    .split("").map((c) => VIET_CHAR_MAP[c] ?? c).join("")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatTimestamp(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function toBulletList(value: string | undefined): string {
  if (!value) return "N/A";
  return value
    .split("\n")
    .filter((item) => item.trim() !== "")
    .map((item) => `- ${item.trim()}`)
    .join("\n");
}

function toNumberedList(value: string | undefined): string {
  if (!value) return "N/A";
  let counter = 0;
  return value
    .split(" | ")
    .filter((step) => step.trim() !== "")
    .map((step) => {
      const trimmed = step.trim();
      if (trimmed.startsWith("##")) {
        return `\n### ${trimmed.slice(2).trim()}`;
      }
      counter++;
      return `${counter}. ${trimmed}`;
    })
    .join("\n");
}

// H2: Throw clearly when project_path is a root path (basename returns "")
function resolveOutputDir(baseOutputDir: string, subDir: string, projectPath?: string): string {
  if (!projectPath) return path.join(baseOutputDir, subDir);
  const dirName = path.basename(projectPath.replace(/[/\\]+$/, ""));
  if (!dirName) {
    throw new Error(
      `project_path không hợp lệ: "${projectPath}" — chỉ lấy basename, không được là root path`
    );
  }
  return path.join(baseOutputDir, dirName, subDir);
}

function toCheckboxList(value: string | undefined): string {
  if (!value) return "N/A";
  return value
    .split("\n")
    .filter((item) => item.trim() !== "")
    .map((item) => `- [ ] ${item.trim()}`)
    .join("\n");
}

// M7: assertParsed — throws with field-level error messages, narrows type via asserts
function assertParsed<T>(result: z.SafeParseSuccess<T> | z.SafeParseError<T>): asserts result is z.SafeParseSuccess<T> {
  if (!result.success) {
    const msg = result.error.issues
      .map((issue: z.ZodIssue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Input không hợp lệ — ${msg}`);
  }
}

function renderSpec(params: SpecParams, now: Date): string {
  const {
    project_name,
    feature_name,
    author,
    stack,
    overview,
    actors,
    preconditions,
    normal_flow,
    alternative_flows,
    business_rules,
    non_functional,
    open_questions,
  } = params;

  return `# Functional Specification: ${feature_name}

## Thông tin tài liệu
| Trường       | Giá trị              |
|--------------|----------------------|
| Dự án        | ${project_name}      |
| Chức năng    | ${feature_name}      |
| Tác giả      | ${author}            |
| Tech stack   | ${stack}             |
| Ngày tạo     | ${formatDate(now)}   |
| Phiên bản    | 1.0                  |

## 1. Tổng quan
${overview}

## 2. Actors (Người dùng liên quan)
${toBulletList(actors)}

## 3. Điều kiện tiên quyết
${toBulletList(preconditions)}

## 4. Luồng xử lý chính
${toNumberedList(normal_flow)}

## 5. Luồng xử lý thay thế
${toNumberedList(alternative_flows)}

## 6. Business Rules
${toBulletList(business_rules)}

## 7. Yêu cầu phi chức năng
${toBulletList(non_functional)}

## 8. Open Questions
${toCheckboxList(open_questions)}
`;
}

const TEST_PURPOSE_VALUES = [
  "Regression Testing", "Integration Testing", "System Testing", "Acceptance Testing",
  "Load Testing", "Stress Testing", "Security Testing", "Usability Testing",
  "Compatibility Testing", "Exploratory Testing", "Smoke Testing", "Sanity Testing",
] as const;

const SCENARIO_TYPE_VALUES = [
  "Positive Scenario", "Negative Scenario", "Boundary Scenario", "Edge Scenario",
  "Normal Scenario", "Exception Scenario", "Error Handling", "Invalid Data",
  "Null Input", "Timeout Scenario",
] as const;

const TEST_TYPE_VALUES = ["API", "UI", "DB"] as const;

const TestCaseItemSchema = z.object({
  category:        z.string().min(1),
  test_title:      z.string().min(1),
  test_purpose:    z.enum(TEST_PURPOSE_VALUES),
  scenario_type:   z.enum(SCENARIO_TYPE_VALUES),
  test_type:       z.enum(TEST_TYPE_VALUES),
  preconditions:   z.string().min(1),
  steps:           z.string().min(1),
  test_data:       z.string().default(""),
  expected_result: z.string().min(1),
  notes:           z.string().default(""),
});

// Removed project_name/author/stack — these were validated but never used in Excel output
const GenerateTestcaseSchema = z.object({
  project_path: projectPathField,
  feature:      z.string().min(1).max(500),
  test_cases:   z.string().min(1).max(500_000),
});

type TestCaseItem = z.infer<typeof TestCaseItemSchema>;

// L4: Module-scope to avoid re-creating on every generateXlsx() call
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top:    { style: "thin" },
  left:   { style: "thin" },
  bottom: { style: "thin" },
  right:  { style: "thin" },
};

const LEFT_WRAP: Partial<ExcelJS.Alignment> = {
  horizontal: "left",
  vertical:   "top",
  wrapText:   true,
};

const DEFAULT_STATUS = "Not run";
const TEMPLATE_PATH = path.resolve(__dirname, "../templates/TESTCASE.xlsx");
const TC_DATA_START_ROW = 13;

async function generateXlsx(
  feature: string,
  items: TestCaseItem[],
  outputDir: string,
  timestamp: string
): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(TEMPLATE_PATH);
  const sheet = workbook.getWorksheet("TestCase");
  if (!sheet) throw new Error("Sheet 'TestCase' không tìm thấy trong template TESTCASE.xlsx");

  // Set Screen/Function name in D4 (next to merged label B4:C4)
  sheet.getRow(4).getCell(4).value = feature;

  const altFill: ExcelJS.Fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFEEF2FF" },
  };

  items.forEach((tc, i) => {
    const row = sheet.getRow(TC_DATA_START_ROW + i);

    row.getCell(2).value  = i + 1;
    row.getCell(3).value  = `TC-${String(i + 1).padStart(3, "0")}`;
    row.getCell(4).value  = tc.category;
    row.getCell(5).value  = tc.test_title;
    row.getCell(6).value  = tc.test_purpose;
    row.getCell(7).value  = tc.scenario_type;
    row.getCell(8).value  = tc.test_type;
    row.getCell(9).value  = tc.preconditions;
    row.getCell(10).value = tc.steps.split(" | ").filter((s) => s.trim() !== "").map((s, n) => `${n + 1}. ${s.trim()}`).join("\n");
    row.getCell(11).value = tc.test_data;
    row.getCell(12).value = tc.expected_result;
    row.getCell(13).value = DEFAULT_STATUS;
    row.getCell(14).value = "";
    row.getCell(15).value = "";
    row.getCell(16).value = tc.notes;

    const useAlt = i % 2 === 1;
    for (let c = 2; c <= 16; c++) {
      const cell = row.getCell(c);
      cell.alignment = LEFT_WRAP;
      cell.border    = THIN_BORDER;
      if (useAlt) cell.fill = altFill;
    }
    row.commit();
  });

  // Apply data validations to all data rows
  for (let r = TC_DATA_START_ROW; r < TC_DATA_START_ROW + items.length; r++) {
    sheet.getCell(`F${r}`).dataValidation = { type: "list", allowBlank: true, formulae: [`"${TEST_PURPOSE_VALUES.join(",")}"`] };
    sheet.getCell(`G${r}`).dataValidation = { type: "list", allowBlank: true, formulae: [`"${SCENARIO_TYPE_VALUES.join(",")}"`] };
    sheet.getCell(`H${r}`).dataValidation = { type: "list", allowBlank: true, formulae: [`"${TEST_TYPE_VALUES.join(",")}"`] };
    sheet.getCell(`M${r}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"Passed,Failed,Not run"'] };
  }

  const safeFeature = toSlug(feature) || "unnamed";
  const filename = `testcase_${safeFeature}_${timestamp}.xlsx`;
  const filePath = path.join(outputDir, filename);
  await workbook.xlsx.writeFile(filePath);
  return filePath;
}

const IssueItemSchema = z.object({
  title:       z.string().min(1),
  severity:    z.enum(["Critical", "Major", "Minor"]),
  description: z.string().min(1),
  suggestion:  z.string().min(1),
});

// H1: Enum aligned with RESULT_EMOJI and inputSchema
const GenerateReviewSchema = z.object({
  project_name:    z.string().min(1).max(500),
  project_path:    projectPathField,
  feature_name:    z.string().min(1).max(500),
  reviewer:        z.string().min(1).max(500),
  reviewee:        z.string().min(1).max(500),
  stack:           z.string().min(1).max(500),
  overall_result:  z.enum(["Approved", "Approved with Changes", "Rejected"]),
  summary:         z.string().min(1).max(10_000),
  good_points:     z.string().min(1).max(10_000),
  issues:          z.string().min(1).max(500_000),
  recommendations: z.string().min(1).max(10_000),
  conclusion:      z.string().min(1).max(10_000),
  checklist:       z.string().min(1).max(10_000),
});

type IssueItem = z.infer<typeof IssueItemSchema>;

const RESULT_EMOJI: Record<string, string> = {
  "Approved":             "✅",
  "Approved with Changes":"⚠️",
  "Rejected":             "❌",
};

function renderIssues(items: IssueItem[]): string {
  if (items.length === 0) return "Không phát hiện vấn đề nào.";
  return items
    .map(
      (issue) =>
        `### [${issue.severity}] ${issue.title}\n**Mô tả:** ${issue.description}\n**Đề xuất:** ${issue.suggestion}`
    )
    .join("\n\n");
}

function renderChecklist(value: string, hasCritical: boolean): string {
  const mark = hasCritical ? "[ ]" : "[x]";
  return value
    .split("\n")
    .filter((item) => item.trim() !== "")
    .map((item) => `- ${mark} ${item.trim()}`)
    .join("\n");
}

// M5: Extracted to avoid duplicating filter logic in renderReview + handler
function countBySeverity(issues: IssueItem[]): { critical: number; major: number; minor: number } {
  return issues.reduce(
    (acc, issue) => {
      if (issue.severity === "Critical")     acc.critical++;
      else if (issue.severity === "Major")   acc.major++;
      else                                   acc.minor++;
      return acc;
    },
    { critical: 0, major: 0, minor: 0 }
  );
}

function renderReview(
  params: z.infer<typeof GenerateReviewSchema>,
  issues: IssueItem[],
  now: Date
): string {
  const { critical: criticalCount, major: majorCount, minor: minorCount } = countBySeverity(issues);
  const emoji = RESULT_EMOJI[params.overall_result] ?? "";

  return `# Review Report: ${params.feature_name}

## Thông tin review
| Trường | Giá trị |
|--------|---------|
| Dự án | ${params.project_name} |
| Chức năng | ${params.feature_name} |
| Reviewer | ${params.reviewer} |
| Reviewee | ${params.reviewee} |
| Stack | ${params.stack} |
| Ngày review | ${formatDate(now)} |
| Kết quả tổng thể | ${emoji} ${params.overall_result} |

## 1. Tóm tắt (Summary)
${params.summary}

## 2. Những điểm tốt (Good Points)
${toBulletList(params.good_points)}

## 3. Vấn đề phát hiện (Issues Found)
${renderIssues(issues)}

## 4. Mức độ nghiêm trọng (Severity Overview)
| Mức độ | Số lượng |
|--------|----------|
| Critical | ${criticalCount} |
| Major | ${majorCount} |
| Minor | ${minorCount} |

## 5. Đề xuất cải thiện (Recommendations)
${toBulletList(params.recommendations)}

## 6. Kết luận (Conclusion)
${params.conclusion}

## 7. Checklist
${renderChecklist(params.checklist, criticalCount > 0)}
`;
}

const server = new Server(
  { name: "mcp-spec-generator", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// L5: Clarified project_path description (only basename is used)
const PROJECT_PATH_DESC =
  "(Tùy chọn) Tên project để tạo subdirectory trong output/. Chỉ phần basename được dùng — ví dụ: '/home/user/my-project' → output/my-project/";

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "generate_spec",
      description:
        "Sinh tài liệu Functional Specification dạng Markdown và lưu vào thư mục output/",
      inputSchema: {
        type: "object",
        properties: {
          project_name:      { type: "string", description: "Tên dự án" },
          project_path:      { type: "string", description: PROJECT_PATH_DESC },
          feature_name:      { type: "string", description: "Tên chức năng" },
          author:            { type: "string", description: "Tên kỹ sư phụ trách" },
          stack:             { type: "string", description: 'Tech stack, ví dụ: "Laravel 10 + React 18"' },
          overview:          { type: "string", description: "Mô tả ngắn chức năng (1-3 câu)" },
          actors:            { type: "string", description: "Danh sách actors, mỗi item một dòng (\\n)" },
          preconditions:     { type: "string", description: "Điều kiện tiên quyết, mỗi item một dòng (\\n)" },
          normal_flow:       { type: "string", description: 'Các bước luồng chính, cách nhau bằng " | ". Dùng "##TÊN_NHÓM" để tạo group header, ví dụ: "##POSTS | GET /api/posts:... | ##COMMENTS | POST /api/comments:..."' },
          alternative_flows: { type: "string", description: '(Tùy chọn) Luồng thay thế, cách nhau bằng " | ". Hỗ trợ "##TÊN_NHÓM" làm group header' },
          business_rules:    { type: "string", description: "Business rules, mỗi item một dòng (\\n)" },
          non_functional:    { type: "string", description: "(Tùy chọn) Yêu cầu phi chức năng, mỗi item một dòng (\\n)" },
          open_questions:    { type: "string", description: "(Tùy chọn) Câu hỏi còn mở, mỗi item một dòng (\\n)" },
        },
        required: [
          "project_name", "feature_name", "author", "stack",
          "overview", "actors", "preconditions", "normal_flow", "business_rules",
        ],
      },
    },
    {
      name: "generate_testcase",
      description:
        "Sinh file Test Case dạng XLSX (Excel) từ danh sách kịch bản test và lưu vào thư mục output/",
      inputSchema: {
        type: "object",
        properties: {
          project_path: { type: "string", description: PROJECT_PATH_DESC },
          feature:      { type: "string", description: "Tên chức năng đang test" },
          test_cases: {
            type: "string",
            description:
              'JSON array string (tối đa 500 items). Mỗi phần tử: {"category":"...","test_title":"...","test_purpose":"Regression Testing|Integration Testing|System Testing|Acceptance Testing|Load Testing|Stress Testing|Security Testing|Usability Testing|Compatibility Testing|Exploratory Testing|Smoke Testing|Sanity Testing","scenario_type":"Positive Scenario|Negative Scenario|Boundary Scenario|Edge Scenario|Normal Scenario|Exception Scenario|Error Handling|Invalid Data|Null Input|Timeout Scenario","test_type":"API|UI|DB","preconditions":"...","steps":"bước 1 | bước 2","test_data":"","expected_result":"...","notes":""}',
          },
        },
        required: ["feature", "test_cases"],
      },
    },
    {
      name: "generate_review",
      description:
        "Sinh báo cáo Review dạng Markdown + JSON và lưu vào thư mục output/",
      inputSchema: {
        type: "object",
        properties: {
          project_name:   { type: "string", description: "Tên dự án" },
          project_path:   { type: "string", description: PROJECT_PATH_DESC },
          feature_name:   { type: "string", description: "Tên chức năng được review" },
          reviewer:       { type: "string", description: "Tên người review" },
          reviewee:       { type: "string", description: "Tên người được review" },
          stack:          { type: "string", description: 'Tech stack, ví dụ: "Laravel 10 + React 18"' },
          // H1, H3: enum values aligned with Zod schema and RESULT_EMOJI
          overall_result: {
            type: "string",
            enum: ["Approved", "Approved with Changes", "Rejected"],
            description: '"Approved" | "Approved with Changes" | "Rejected"',
          },
          summary:         { type: "string", description: "Tóm tắt tổng thể (1-3 câu)" },
          good_points:     { type: "string", description: "Điểm tốt, mỗi item một dòng (\\n)" },
          issues: {
            type: "string",
            description:
              'JSON array string (tối đa 500 items). Mỗi phần tử: {"title":"...","severity":"Critical|Major|Minor","description":"...","suggestion":"..."}',
          },
          recommendations: { type: "string", description: "Đề xuất, mỗi item một dòng (\\n)" },
          conclusion:      { type: "string", description: "Kết luận ngắn gọn" },
          checklist:       { type: "string", description: "Checklist items, mỗi item một dòng (\\n)" },
        },
        required: [
          "project_name", "feature_name", "reviewer", "reviewee",
          "stack", "overall_result", "summary", "good_points",
          "issues", "recommendations", "conclusion", "checklist",
        ],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const toolName = request.params.name;

  if (toolName === "generate_spec") {
    try {
      const parseResult = GenerateSpecSchema.safeParse(request.params.arguments);
      assertParsed(parseResult);
      const params = parseResult.data;
      const now = new Date();
      const content = renderSpec(params, now);

      const outputDir = resolveOutputDir(path.resolve(__dirname, "../output"), "spec", params.project_path);
      await fs.mkdir(outputDir, { recursive: true });

      const safeFeature = toSlug(params.feature_name) || "unnamed";
      const filename = `spec_${safeFeature}_${formatTimestamp(now)}.md`;
      const filePath = path.join(outputDir, filename);

      await fs.writeFile(filePath, content, "utf-8");

      return {
        content: [
          { type: "text", text: `File saved: ${filePath}\n\n---\n\n${content}` },
        ],
      };
    } catch (error) {
      console.error("[generate_spec] Error:", error); // M1: log for debugging via stderr
      const message = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{ type: "text", text: `Error generating spec: ${message}` }],
      };
    }
  }

  if (toolName === "generate_testcase") {
    try {
      const parseResult = GenerateTestcaseSchema.safeParse(request.params.arguments);
      assertParsed(parseResult);
      const params = parseResult.data;

      let rawItems: unknown;
      try {
        rawItems = JSON.parse(params.test_cases);
      } catch {
        throw new Error("test_cases không phải JSON hợp lệ");
      }
      if (!Array.isArray(rawItems) || rawItems.length === 0) {
        throw new Error("test_cases phải là JSON array không rỗng");
      }
      // H4: Limit array size to prevent memory/disk exhaustion
      if (rawItems.length > 500) {
        throw new Error("test_cases tối đa 500 items — hãy chia nhỏ nếu cần");
      }
      const items = rawItems.map((item, i) => {
        const result = TestCaseItemSchema.safeParse(item);
        if (!result.success) {
          throw new Error(`test_cases[${i}] không hợp lệ: ${result.error.message}`);
        }
        return result.data;
      });

      const now = new Date();
      const outputDir = resolveOutputDir(path.resolve(__dirname, "../output"), "testcase", params.project_path);
      await fs.mkdir(outputDir, { recursive: true });

      const filePath = await generateXlsx(params.feature, items, outputDir, formatTimestamp(now));

      return {
        content: [
          {
            type: "text",
            text: `File saved: ${filePath}\nTest cases generated: ${items.length}`,
          },
        ],
      };
    } catch (error) {
      console.error("[generate_testcase] Error:", error);
      const message = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{ type: "text", text: `Error generating testcase: ${message}` }],
      };
    }
  }

  if (toolName === "generate_review") {
    try {
      const parseResult = GenerateReviewSchema.safeParse(request.params.arguments);
      assertParsed(parseResult);
      const params = parseResult.data;

      let rawIssues: unknown;
      try {
        rawIssues = JSON.parse(params.issues);
      } catch {
        throw new Error("issues không phải JSON hợp lệ");
      }
      if (!Array.isArray(rawIssues)) {
        throw new Error("issues phải là JSON array");
      }
      // H4: Limit array size
      if (rawIssues.length > 500) {
        throw new Error("issues tối đa 500 items");
      }
      const issues = rawIssues.map((item, i) => {
        const result = IssueItemSchema.safeParse(item);
        if (!result.success) {
          throw new Error(`issues[${i}] không hợp lệ: ${result.error.message}`);
        }
        return result.data;
      });

      const now = new Date();
      const outputDir = resolveOutputDir(path.resolve(__dirname, "../output"), "review", params.project_path);
      await fs.mkdir(outputDir, { recursive: true });

      const slug = toSlug(params.feature_name) || "unnamed";
      const ts   = formatTimestamp(now);
      const mdPath   = path.join(outputDir, `review_${slug}_${ts}.md`);
      const jsonPath = path.join(outputDir, `review_${slug}_${ts}.json`);

      const mdContent = renderReview(params, issues, now);

      // for JSON output — renderReview already calls this internally
      const { critical: criticalCount, major: majorCount, minor: minorCount } = countBySeverity(issues);

      const jsonData = {
        project_name:   params.project_name,
        feature_name:   params.feature_name,
        reviewer:       params.reviewer,
        reviewee:       params.reviewee,
        stack:          params.stack,
        date:           formatDate(now),
        overall_result: params.overall_result,
        summary:        params.summary,
        good_points:    params.good_points.split("\n").filter((s) => s.trim() !== "").map((s) => s.trim()),
        issues,
        severity_overview: { critical: criticalCount, major: majorCount, minor: minorCount },
        recommendations: params.recommendations.split("\n").filter((s) => s.trim() !== "").map((s) => s.trim()),
        conclusion:      params.conclusion,
        checklist:       params.checklist.split("\n").filter((s) => s.trim() !== "").map((s) => s.trim()),
      };

      await Promise.all([
        fs.writeFile(mdPath,   mdContent, "utf-8"),
        fs.writeFile(jsonPath, JSON.stringify(jsonData, null, 2), "utf-8"),
      ]);

      return {
        content: [
          {
            type: "text",
            text: `Files saved:\n- ${mdPath}\n- ${jsonPath}\n\n---\n\n${mdContent}`,
          },
        ],
      };
    } catch (error) {
      console.error("[generate_review] Error:", error);
      const message = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{ type: "text", text: `Error generating review: ${message}` }],
      };
    }
  }

  return {
    isError: true,
    content: [{ type: "text", text: `Unknown tool: ${toolName}` }],
  };
});

async function main(): Promise<void> {
  // L3: Graceful exit on process signals
  process.on("SIGTERM", () => process.exit(0));
  process.on("SIGINT",  () => process.exit(0));
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
