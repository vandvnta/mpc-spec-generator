import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
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
  .refine(
    (val) => !val.split(/[/\\]/).some(seg => seg === ".." || seg === "."),
    'project_path không được chứa ".." hoặc "."'
  )
  .optional();

const GenerateSpecSchema = z.object({
  project_name:      z.string().min(1).max(500),
  project_path:      projectPathField,
  feature_name:      z.string().min(1).max(500),
  feature_slug:      z.string().min(1).max(200).regex(/^[a-z0-9_-]+$/, 'feature_slug chỉ được chứa a-z, 0-9, _, -').optional(),
  author:            z.string().min(1).max(500),
  stack:             z.string().min(1).max(500),
  overview:          z.string().min(1).max(10_000),
  actors:            z.string().min(1).max(10_000),
  preconditions:     z.string().min(1).max(10_000),
  normal_flow:       z.string().min(1).max(10_000),
  alternative_flows: z.string().max(10_000).optional(),
  business_rules:    z.string().min(1).max(10_000),
  ui_flow:           z.string().max(10_000).optional(),
  non_functional:    z.string().max(10_000).optional(),
  open_questions:    z.string().max(10_000).optional(),
  feature_id:        z.string().max(200).optional(),
  reviewer:          z.string().max(500).optional(),
  scope:                 z.string().max(5_000).optional(),
  out_of_scope:          z.string().max(5_000).optional(),
  data_validation_rules: z.string().max(10_000).optional(),
  api_contract:          z.string().max(50_000).optional(),
  error_catalog:         z.string().max(50_000).optional(),
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
    .split(/\\n|\n/)
    .filter((item) => item.trim() !== "")
    .map((item) => `- ${item.trim()}`)
    .join("\n");
}

function toNumberedList(value: string | undefined): string {
  if (!value) return "N/A";
  return value
    .split(" | ")
    .filter((step) => step.trim() !== "")
    .map((step) => {
      const trimmed = step.trim();
      if (trimmed.startsWith("##")) {
        return `\n### ${trimmed.slice(2).trim()}`;
      }
      const text = trimmed.replace(/^\d+\.\s*/, "");
      return `- ${text}`;
    })
    .join("\n");
}

function resolveOutputDir(baseOutputDir: string, subDir: string, projectPath?: string): string {
  if (!projectPath) return path.join(baseOutputDir, subDir);
  const trimmed = projectPath.replace(/[/\\]+$/, "");
  if (path.isAbsolute(trimmed)) {
    const resolved = path.resolve(trimmed);
    const root = path.parse(resolved).root;
    const depth = path.relative(root, resolved).split(path.sep).filter(Boolean).length;
    if (depth < 1) {
      throw new Error(`project_path "${projectPath}" không hợp lệ — không được là root path`);
    }
    return path.resolve(resolved, "output", subDir);
  }
  const dirName = path.basename(trimmed);
  if (!dirName) {
    throw new Error(
      `project_path không hợp lệ: "${projectPath}" — không được là root path`
    );
  }
  return path.join(baseOutputDir, dirName, subDir);
}

async function resolveAndMkdirOutputDir(subDir: string, projectPath?: string): Promise<string> {
  const dir = resolveOutputDir(path.resolve(__dirname, "../output"), subDir, projectPath);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

function toCheckboxList(value: string | undefined): string {
  if (!value) return "N/A";
  return value
    .split(/\\n|\n/)
    .filter((item) => item.trim() !== "")
    .map((item) => `- [ ] ${item.trim()}`)
    .join("\n");
}

function safeParse(raw: string): unknown {
  if ((raw.match(/[[{]/g)?.length ?? 0) > 1000) {
    throw new Error("JSON quá phức tạp — từ chối parse");
  }
  return JSON.parse(raw);
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

function toolError(toolName: string, error: unknown): { isError: true; content: Array<{ type: "text"; text: string }> } {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[${toolName}] Error:`, message);
  return {
    isError: true,
    content: [{ type: "text", text: `Error ${toolName}: ${message}` }],
  };
}

async function getNextVersion(outputDir: string, featureSlug: string): Promise<number> {
  try {
    const files = await fs.readdir(outputDir);
    const count = files.filter((f: string) => f.startsWith(`spec_${featureSlug}_`) && f.endsWith(".md")).length;
    return count + 1;
  } catch (e) {
    if (!(e instanceof Error) || (e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    return 1;
  }
}

async function renderSpec(params: SpecParams, now: Date, version: number): Promise<string> {
  let template: string;
  try {
    template = await fs.readFile(SPEC_TEMPLATE_PATH, "utf-8");
  } catch {
    throw new Error(`Template spec-template.md không tìm thấy tại: ${SPEC_TEMPLATE_PATH}`);
  }

  const replacements: Record<string, string> = {
    feature_name:      params.feature_name,
    project_name:      params.project_name,
    author:            params.author,
    stack:             params.stack,
    date:              formatDate(now),
    version:           `${version}.0`,
    overview:          params.overview.replace(/\{\{/g, "{ {"),
    actors:            toBulletList(params.actors),
    preconditions:     toBulletList(params.preconditions),
    normal_flow:       toNumberedList(params.normal_flow),
    alternative_flows: toNumberedList(params.alternative_flows),
    business_rules:    toBulletList(params.business_rules),
    ui_flow:           (params.ui_flow ?? "_(Không có UI Flow cho chức năng này)_").replace(/\{\{/g, "{ {"),
    non_functional:    toBulletList(params.non_functional),
    open_questions:    toCheckboxList(params.open_questions),
    feature_id:        params.feature_id ?? "_(Chưa có — lấy từ header table trong requirements)_",
    reviewer:          params.reviewer ?? "_(Chưa có — lấy từ header table trong requirements)_",
    scope:                 (params.scope ?? "_(Chưa có — lấy từ header table trong requirements)_").replace(/\{\{/g, "{ {"),
    out_of_scope:          (params.out_of_scope ?? "_(Chưa có — lấy từ header table trong requirements)_").replace(/\{\{/g, "{ {"),
    data_validation_rules: (params.data_validation_rules ?? "_(Chưa có thông tin — bổ sung từ requirements)_").replace(/\{\{/g, "{ {"),
    api_contract:          (params.api_contract ?? "_(Chưa có thông tin — bổ sung từ requirements)_").replace(/\{\{/g, "{ {"),
    error_catalog:         (params.error_catalog ?? "_(Chưa có — bổ sung bảng Error Catalog nếu requirements có)_").replace(/\{\{/g, "{ {"),
  };

  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => replacements[key] ?? `{{${key}}}`);
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

const GenerateTestcaseSchema = z.object({
  project_path:  projectPathField,
  feature:       z.string().min(1).max(500).optional(),
  feature_slug:  z.string().min(1).max(200).regex(/^[a-z0-9_-]+$/, 'feature_slug chỉ được chứa a-z, 0-9, _, -').optional(),
  spec_file:    z.string().max(1000)
    .refine(
      val => !val.split(/[/\\]/).some(seg => seg === ".." || seg === "."),
      'spec_file không được chứa ".." hoặc "."'
    )
    .refine(val => val.toLowerCase().endsWith(".md"), 'spec_file phải có đuôi .md')
    .optional(),
  test_cases:   z.string().min(1).max(500_000).optional(),
}).refine(
  data => {
    if (data.spec_file || data.test_cases) return true;
    if (data.project_path) {
      const trimmed = data.project_path.replace(/[/\\]+$/, "");
      return path.isAbsolute(trimmed);
    }
    return false;
  },
  { message: "Phải cung cấp spec_file, test_cases, hoặc project_path tuyệt đối (để tự tìm spec trong output/spec/)" }
);

type TestCaseItem = z.infer<typeof TestCaseItemSchema>;

interface ValidationRule {
  field:         string;
  type:          string;
  required:      string;
  allowedValues: string;
  constraint:    string;
  errorCode:     string;
  errorMessage:  string;
}

interface ErrorEntry {
  errorCode:        string;
  httpStatus:       string;
  message:          string;
  triggerCondition: string;
}

interface SpecSection {
  title: string;
  items: string[];
}

interface ParsedSpec {
  featureName:      string;
  preconditions:    string[];
  normalFlowGroups: SpecSection[];
  altFlowGroups:    SpecSection[];
  businessRules:    string[];
  uiFlowGroups:     SpecSection[];
  validationRules:  ValidationRule[];
  errorCatalog:     ErrorEntry[];
}

function parseSpecMarkdown(content: string): ParsedSpec {
  function getSectionContent(patterns: RegExp[]): string {
    for (const pattern of patterns) {
      const m = content.match(pattern);
      if (!m) continue;
      const start = content.indexOf(m[0]) + m[0].length;
      const rest  = content.slice(start);
      const next  = rest.match(/^## /m);
      return next ? rest.slice(0, next.index) : rest;
    }
    return "";
  }

  function extractBullets(text: string): string[] {
    return text.split("\n")
      .filter(l => /^[ \t]*-[ \t]/.test(l))
      .map(l => l.replace(/^[ \t]*-[ \t]/, "").trim())
      .filter(Boolean);
  }

  function extractGroups(sectionContent: string): SpecSection[] {
    const parts = sectionContent.split(/^### /m).slice(1);
    if (parts.length === 0) {
      const items = extractBullets(sectionContent);
      return items.length > 0 ? [{ title: "Main Flow", items }] : [];
    }
    return parts.map(part => {
      const nl = part.indexOf("\n");
      return {
        title: nl >= 0 ? part.slice(0, nl).trim() : part.trim(),
        items: extractBullets(nl >= 0 ? part.slice(nl) : ""),
      };
    }).filter(g => g.items.length > 0);
  }

  function extractNumberedOrBullets(text: string): string[] {
    const bullets  = extractBullets(text);
    const numbered = text.split("\n")
      .filter(l => /^[ \t]*\d+\.[ \t]/.test(l))
      .map(l => l.replace(/^[ \t]*\d+\.[ \t]/, "").replace(/\*\*/g, "").trim())
      .filter(Boolean);
    return bullets.length > 0 ? bullets : numbered;
  }

  function extractUIGroups(sectionContent: string): SpecSection[] {
    const parts = sectionContent.split(/^### /m).slice(1);
    if (parts.length === 0) {
      const items = extractNumberedOrBullets(sectionContent);
      return items.length > 0 ? [{ title: "UI Flow", items }] : [];
    }
    return parts.map(part => {
      const nl = part.indexOf("\n");
      return {
        title: nl >= 0 ? part.slice(0, nl).trim() : part.trim(),
        items: extractNumberedOrBullets(nl >= 0 ? part.slice(nl) : ""),
      };
    }).filter(g => g.items.length > 0);
  }

  function parseTableRows(sectionContent: string): string[][] {
    const rows: string[][] = [];
    for (const line of sectionContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("|")) continue;
      const cells = trimmed.replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim());
      if (cells.every(c => /^[-: ]+$/.test(c) || c === "")) continue;
      rows.push(cells);
    }
    return rows;
  }

  function extractValidationRules(sectionContent: string): ValidationRule[] {
    const rows = parseTableRows(sectionContent);
    if (rows.length <= 1) return [];
    return rows.slice(1)
      .filter(cells => cells.length >= 4 && !/^\[.*\]$/.test((cells[0] ?? "").trim()))
      .map(cells => ({
        field:         cells[0] ?? "",
        type:          cells[1] ?? "",
        required:      cells[2] ?? "",
        allowedValues: cells[3] ?? "",
        constraint:    cells[4] ?? "",
        errorCode:     cells[5] ?? "",
        errorMessage:  cells[6] ?? "",
      }));
  }

  function extractErrorCatalog(sectionContent: string): ErrorEntry[] {
    const rows = parseTableRows(sectionContent);
    if (rows.length <= 1) return [];
    return rows.slice(1)
      .filter(cells => {
        if (cells.length < 4) return false;
        const trigger = (cells[3] ?? "").trim();
        return trigger !== "" && !/^\[.*\]$/.test(trigger);
      })
      .map(cells => ({
        errorCode:        cells[0] ?? "",
        httpStatus:       cells[1] ?? "",
        message:          cells[2] ?? "",
        triggerCondition: cells[3] ?? "",
      }));
  }

  // Handle both current template ("Chức năng") and old template ("Feature Name")
  let featureName = "";
  for (const line of content.split("\n")) {
    const m = line.match(/\|\s*(Chức năng|Feature Name)\s*\|\s*(.+?)\s*\|/);
    if (m) { featureName = m[2].trim(); break; }
  }
  if (!featureName) {
    const h1 = content.match(/^# Functional Specification:\s*(.+)/m);
    if (h1) featureName = h1[1].trim();
  }

  // Section 4: main flow
  // Current template: "## 4. Luồng xử lý chính" (main flow only)
  // Old template:     "## 4. Feature Breakdown"  (contains both main + alt flows as ### subsections)
  const section4 = getSectionContent([
    /^## 4\. Luồng xử lý chính/m,
    /^## 4\. Feature Breakdown/m,
  ]);

  // Section 5: alt flows (current template only)
  let altSection = getSectionContent([/^## 5\. Luồng xử lý thay thế/m]);

  // Old format: section 4 mixes main flow and alt flows, separated by
  // "### Alternative & Exception Flows" or "### Luồng thay thế" subheading
  let normalFlowContent = section4;
  const altMarkerMatch = section4.match(/^### (Alternative|Luồng thay thế)/m);
  if (altMarkerMatch && altMarkerMatch.index !== undefined) {
    normalFlowContent = section4.slice(0, altMarkerMatch.index);
    if (!altSection) {
      altSection = section4.slice(altMarkerMatch.index);
    }
  }

  return {
    featureName,
    preconditions:    extractBullets(getSectionContent([
      /^## 3\. Điều kiện tiên quyết/m,
      /^## 3\. Preconditions/m,
    ])),
    normalFlowGroups: extractGroups(normalFlowContent),
    altFlowGroups:    extractGroups(altSection),
    businessRules:    extractBullets(getSectionContent([
      /^## 6\. Business Rules/m,
    ])),
    uiFlowGroups:     extractUIGroups(getSectionContent([
      /^## 9\. UI Flow/m,
    ])),
    validationRules:  extractValidationRules(getSectionContent([/^## 7\. Data Validation Rules/m])),
    errorCatalog:     extractErrorCatalog(getSectionContent([/^## 10\. Error Catalog/m])),
  };
}

function inferTestType(text: string): "API" | "UI" | "DB" {
  const lower = text.toLowerCase();
  if (["database", "table ", "column", "query", "insert", "select", "schema", "sql"].some(k => lower.includes(k))) return "DB";
  if (["button", "nút", "click", "hiển thị", "màn hình", "input", "form", "toggle",
       "user nhập", "user chọn", "user nhấn", "frontend", "giao diện"].some(k => lower.includes(k))) return "UI";
  return "API";
}

function inferAltScenarioType(groupTitle: string): (typeof SCENARIO_TYPE_VALUES)[number] {
  const lower = groupTitle.toLowerCase();
  if (lower.includes("validation"))                           return "Invalid Data";
  if (lower.includes("system") || lower.includes("download")) return "Exception Scenario";
  if (lower.includes("api")    || lower.includes("error"))    return "Error Handling";
  if (lower.includes("edge"))                                 return "Edge Scenario";
  return "Negative Scenario";
}

function specToTestCases(spec: ParsedSpec): TestCaseItem[] {
  const preStr = spec.preconditions.length > 0
    ? spec.preconditions.map(p => `- ${p}`).join("\n")
    : "Không có điều kiện đặc biệt";
  const cases: TestCaseItem[] = [];

  for (const group of spec.normalFlowGroups) {
    cases.push({
      category:        group.title,
      test_title:      `Kiểm tra ${group.title} thành công`,
      test_purpose:    "System Testing",
      scenario_type:   "Positive Scenario",
      test_type:       inferTestType(group.items.join(" ")),
      preconditions:   preStr,
      steps:           group.items.length > 0 ? group.items.join(" | ") : `Thực hiện flow: ${group.title}`,
      test_data:       "",
      expected_result: `Hệ thống xử lý đúng flow "${group.title}" theo spec`,
      notes:           "",
    });
  }

  for (const group of spec.altFlowGroups) {
    const scenarioType = inferAltScenarioType(group.title);
    for (const item of group.items) {
      const arrowIdx = item.indexOf("→");
      const condition = (arrowIdx >= 0 ? item.slice(0, arrowIdx) : item).trim();
      const expected  = (arrowIdx >= 0 ? item.slice(arrowIdx + 1) : "Hệ thống trả về lỗi phù hợp").trim();
      cases.push({
        category:        group.title,
        test_title:      condition || `[${group.title}] case`,
        test_purpose:    "System Testing",
        scenario_type:   scenarioType,
        test_type:       "API",
        preconditions:   preStr,
        steps:           `Thực hiện request với điều kiện: ${condition}`,
        test_data:       "",
        expected_result: expected || "Hệ thống trả về lỗi phù hợp",
        notes:           "",
      });
    }
  }

  for (const rule of spec.businessRules) {
    const isLimit = /tối đa|giới hạn|không được|phải|regex|bắt buộc|chỉ được|rate limit|cap\b/i.test(rule);
    cases.push({
      category:        "Business Rules",
      test_title:      rule || "Business Rule test",
      test_purpose:    "System Testing",
      scenario_type:   isLimit ? "Boundary Scenario" : "Normal Scenario",
      test_type:       inferTestType(rule),
      preconditions:   preStr,
      steps:           `Kiểm tra business rule: ${rule}`,
      test_data:       "",
      expected_result: `Hệ thống tuân thủ: ${rule}`,
      notes:           "",
    });
  }

  for (const group of spec.uiFlowGroups) {
    const lower = group.title.toLowerCase();
    const scenarioType: (typeof SCENARIO_TYPE_VALUES)[number] =
      lower.includes("lỗi") || lower.includes("error") || lower.includes("fail")
        ? "Negative Scenario"
        : lower.includes("edge") || lower.includes("exception")
          ? "Exception Scenario"
          : "Positive Scenario";
    cases.push({
      category:        `UI - ${group.title}`,
      test_title:      `[UI] ${group.title}`,
      test_purpose:    "Acceptance Testing",
      scenario_type:   scenarioType,
      test_type:       "UI",
      preconditions:   preStr,
      steps:           group.items.length > 0
        ? group.items.join(" | ")
        : `Thực hiện UI flow: ${group.title}`,
      test_data:       "",
      expected_result: group.items.length > 0
        ? group.items[group.items.length - 1]
        : `Hệ thống xử lý đúng UI flow "${group.title}"`,
      notes:           "Section 9 - UI Flow",
    });
  }

  for (const rule of spec.validationRules) {
    const isRequired = /^(yes|có)$/i.test(rule.required.trim());
    cases.push({
      category:        "Data Validation",
      test_title:      `Validate ${rule.field}${rule.allowedValues && rule.allowedValues !== "—" ? ` — ${rule.allowedValues}` : ""}`,
      test_purpose:    "System Testing",
      scenario_type:   isRequired ? "Boundary Scenario" : "Normal Scenario",
      test_type:       inferTestType(rule.field + " " + rule.allowedValues),
      preconditions:   preStr,
      steps:           `Gửi request với field "${rule.field}" có giá trị không hợp lệ${rule.constraint && rule.constraint !== "—" ? ` (constraint: ${rule.constraint})` : ""}`,
      test_data:       rule.allowedValues && rule.allowedValues !== "—" ? rule.allowedValues : "",
      expected_result: rule.errorCode && rule.errorMessage && !/^\[.*\]$/.test(rule.errorMessage)
        ? `${rule.errorCode}: ${rule.errorMessage}`
        : `Hệ thống từ chối request và trả về lỗi validation cho field "${rule.field}"`,
      notes:           rule.type ? `Type: ${rule.type}` : "",
    });
  }

  for (const entry of spec.errorCatalog) {
    cases.push({
      category:        "Error Handling",
      test_title:      `${entry.errorCode} — ${entry.triggerCondition}`,
      test_purpose:    "System Testing",
      scenario_type:   "Error Handling",
      test_type:       "API",
      preconditions:   preStr,
      steps:           `Kích hoạt điều kiện: ${entry.triggerCondition}`,
      test_data:       "",
      expected_result: `HTTP ${entry.httpStatus}: ${entry.message}`,
      notes:           "",
    });
  }

  return cases;
}

const SPEC_TEMPLATE_PATH = path.resolve(__dirname, "../templates/spec-template.md");

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
  timestamp: string,
  featureSlug?: string
): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.readFile(TEMPLATE_PATH);
  } catch {
    throw new Error(`Template TESTCASE.xlsx không tìm thấy tại: ${TEMPLATE_PATH}`);
  }
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

  const safeFeature = (featureSlug || toSlug(feature)) || "unnamed";
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
  feature_slug:    z.string().min(1).max(200).regex(/^[a-z0-9_-]+$/, 'feature_slug chỉ được chứa a-z, 0-9, _, -').optional(),
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
    .split(/\\n|\n/)
    .filter((item) => item.trim() !== "")
    .map((item) => `- ${mark} ${item.trim().replace(/^\[.?\]\s*/, "")}`)
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
  counts: { critical: number; major: number; minor: number },
  now: Date
): string {
  const { critical: criticalCount, major: majorCount, minor: minorCount } = counts;
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

const WORKFLOW_GUIDE_PROMPT = `# Hướng dẫn làm việc với mcp-spec-generator

## Quy tắc bắt buộc khi tạo output

Khi nhận yêu cầu liên quan đến các loại output dưới đây, LUÔN LUÔN gọi MCP tool
tương ứng. Không tự tạo output theo cách khác dù prompt không nhắc đến MCP.

| Người dùng nhắc đến | Tool bắt buộc gọi |
|---|---|
| spec / đặc tả / tài liệu chức năng / functional | generate_spec |
| test case / testcase / test / kiểm thử | generate_testcase |
| review / review report / báo cáo review / code review | generate_review |

## Luồng chuẩn

requirements file → \`generate_spec\` → \`generate_testcase\` → \`generate_review\`

Khi yêu cầu nhiều loại output cùng lúc: thực hiện tuần tự theo thứ tự trên.
Thu thập tham số chung (project_name, project_path, author) 1 lần, tái sử dụng cho tất cả.

## Nguồn dữ liệu đầu vào theo tool

| Tool | Đọc từ đâu |
|---|---|
| generate_spec | Requirements file do user cung cấp |
| generate_testcase | Spec .md trong output/spec/ — tool tự tìm, không cần đọc thêm |
| generate_review | Source code của project đích |

---

## Hướng dẫn đọc requirements file cho \`generate_spec\`

### Xác định requirements file

User thường cung cấp qua một trong các cách:
- Đường dẫn file: \`requirements.md\`, \`PRD.md\`, \`SPEC.md\`, \`.txt\`, v.v.
- Nội dung paste trực tiếp vào chat
- Mô tả bằng lời

Nếu chưa rõ file requirements ở đâu → hỏi user trước khi tiến hành.

### Trích xuất \`feature_name\`, \`feature_slug\`, \`feature_id\`

Tìm trong requirements header table (bảng "Thông tin chung" đầu file):
- **\`feature_slug\`**: Lấy từ trường "Tên chức năng" → lowercase, khoảng trắng thay bằng underscore.
  VD: "Login" → \`"login"\`, "User Management" → \`"user_management"\`, "Quản lý danh mục" → \`"quan_ly_danh_muc"\`
  **LUÔN truyền field này** — để đảm bảo slug khớp với convention của project; tool tự derive được nhưng kết quả có thể khác dự kiến.
- **\`feature_name\`**: Lấy từ tiêu đề document (thường là phần tiếng Việt).
  VD: tiêu đề "# Đăng nhập (Login)" → \`feature_name = "Đăng nhập"\`
- **\`feature_id\`**: Lấy từ trường "Feature ID" trong header table. VD: "FT-001"
- **\`reviewer\`**: Lấy từ trường "Reviewer" trong header table. Nếu không có → để trống.
- **\`scope\`**: Lấy từ trường "Scope" trong header table. Nếu không có → để trống.
- **\`out_of_scope\`**: Lấy từ trường "Out of Scope" trong header table. Nếu không có → để trống.

### Trích xuất \`actors\`

Tìm trong requirements:
- Danh từ chỉ người dùng: "người dùng", "khách hàng", "admin", "nhân viên", "manager", "guest"
- User story format: "As a **[role]**..." → lấy [role]
- Bảng phân quyền / ma trận roles nếu có
- Nếu không đề cập rõ → ghi "User (chưa xác định trong requirements)"

### Trích xuất \`preconditions\`

Điều kiện phải thỏa trước khi flow bắt đầu. Tìm:
- Section "Điều kiện tiên quyết", "Prerequisites", "Yêu cầu trước khi thực hiện"
- Câu điều kiện: "Người dùng phải đăng nhập", "Phải có tài khoản", "Record phải tồn tại"
- Nếu không đề cập → suy luận từ context (feature cần xác thực → "User đã đăng nhập")

### Trích xuất \`normal_flow\`

Happy path — luồng xử lý thành công. Tìm:
- Section "Luồng chính", "Main flow", "Happy path", "Use case chính", "Mô tả chức năng"
- Numbered steps: 1. 2. 3...
- Acceptance criteria (positive case)
- Sequence diagram description nếu có

Format output: mỗi bước ngăn cách bằng \` | \`
VD: "1. User nhập thông tin đăng ký | 2. Hệ thống validate email chưa tồn tại | 3. Tạo account | 4. Gửi email xác nhận | 5. Trả về thông báo thành công"

PHẢI dùng \`##TÊN_NHÓM\` cho mỗi success scenario riêng biệt — mỗi group sinh 1 Positive test case trong XLSX.
Không dùng group → toàn bộ Section 4 chỉ sinh 1 case "Kiểm tra Main Flow thành công".
Ví dụ cho update endpoint: "##Update title/content | 1. Admin gửi PUT với title | 2. Validate | 3. Trả 200 | ##Update with image | 1. Admin gửi PUT kèm file | 2. Store ảnh mới | 3. Xóa ảnh cũ | 4. Trả 200"

**Khi requirements dùng \`### heading\` cho sub-flow:** PHẢI convert sang \`##heading\` (2 dấu #, không phải 3) rồi join steps bằng \` | \`.
VD requirements có:
\`\`\`
### Lấy danh sách
1. Client gửi GET /api/items
2. Server trả về danh sách
### Tạo mới
1. Client gửi POST /api/items
2. Server tạo bản ghi
\`\`\`
→ Truyền: \`"##Lấy danh sách | 1. Client gửi GET /api/items | 2. Server trả về danh sách | ##Tạo mới | 1. Client gửi POST /api/items | 2. Server tạo bản ghi"\`

### Trích xuất \`alternative_flows\`

Error paths, exception cases. Tìm:
- Section "Luồng thay thế", "Alternative flow", "Exception", "Error case", "Trường hợp ngoại lệ"
- Cấu trúc điều kiện: "Nếu ... thì ...", "Trường hợp ... → ...", "Khi ... → ..."
- Validation failures: "Email đã tồn tại → báo lỗi 409", "Token hết hạn → redirect login"
- Acceptance criteria (negative case)

Format output: dùng \`##TÊN_NHÓM\` để nhóm, mỗi item cách nhau bằng \` | \`:
VD: \`"##Validation thất bại | Email đã tồn tại → HTTP 409 | Token hết hạn → redirect login | ##Lỗi hệ thống | DB lỗi → HTTP 500 Internal Server Error"\`
→ Mỗi item dạng \`điều kiện → expected_result\` — phần sau \`→\` trở thành expected_result trong test case.
→ Nếu requirements dùng \`### heading\` cho nhóm alternative flow, convert sang \`##heading\` (chỉ 2 dấu #, không phải 3).

Nếu không có section rõ ràng → suy luận từ validation rules trong business_rules
(mỗi rule vi phạm → 1 alternative flow).

### Trích xuất \`business_rules\`

Rules kinh doanh, ràng buộc dữ liệu. Tìm:
- Section "Business rules", "Quy tắc nghiệp vụ", "Ràng buộc", "Constraints", "Điều kiện"
- Validation rules: "Email phải đúng format", "Mật khẩu tối thiểu 8 ký tự"
- Computed logic: "Tổng tiền = đơn giá × số lượng × (1 - % giảm giá)"
- State transitions: "Trạng thái chỉ được chuyển từ A → B, không được từ A → C"
- Limit / quota: "Tối đa 3 lần thử đăng nhập", "Rate limit 100 req/phút"

### Trích xuất \`data_validation_rules\`

Tìm trong requirements:
- Section "Data Validation Rules", "Validation Rules", "Ràng buộc dữ liệu", "Quy tắc kiểm tra dữ liệu"
- Bảng có columns: Field, Type, Required, Constraint, Error Code, Error Message (hoặc tương tự)
- Nếu có → copy nguyên vẹn Markdown (kể cả header row và separator row)
- Nếu có server-side và client-side riêng biệt → dùng \`### Server-side\` / \`### Client-side\` làm header, copy cả 2 bảng
- Nếu không có section rõ ràng → để trống (field optional)

### Trích xuất \`api_contract\`

Tìm trong requirements:
- Section "API Contract", "API Endpoints", "REST API", "Interface", "HTTP Contract"
- Mô tả: method + path, request body (JSON), response examples (các HTTP status codes)
- Nếu có → copy nguyên vẹn Markdown kể cả code blocks (\`\`\`json ... \`\`\`)
- Nếu không có → để trống (field optional)

### Trích xuất \`error_catalog\`

Tìm trong requirements:
- Section "Error Catalog", "Error Codes", "Danh sách lỗi", "Error List", "HTTP Error Responses"
- Bảng có columns tối thiểu 4 cột: Error Code, HTTP Status, Message, Trigger Condition (và tùy chọn Retry?)
- Nếu có → copy nguyên vẹn Markdown **kể cả header row và separator row** (\`|---|...|--- \`)
- Nếu không có → để trống (field optional)

VD output đúng (copy nguyên vẹn):
\`| Error Code | HTTP Status | Message | Trigger Condition | Retry? |\n|---|---|---|---|---|\n| ERR-V-001 | 422 | "Email không đúng định dạng" | email không match RFC 5321 | No |\`

Mỗi row đã điền → \`generate_testcase\` tự sinh 1 Error Handling test case.
Row placeholder dạng \`[...]\` bị bỏ qua tự động.

### Trích xuất \`ui_flow\`

Luồng UI/frontend. Tìm:
- Section "UI Flow", "UI/UX Flow", "Frontend Flow", "Màn hình", "Giao diện", "User Interface"
- Mô tả các màn hình, navigation, trạng thái loading/error/success, hành vi submit
- Nếu không có section UI → để trống (field optional)
- Giữ nguyên format markdown của requirements (### cho subsection, - cho bullet)

### Trích xuất \`non_functional\`

Yêu cầu phi chức năng. Tìm:
- Section "Non-functional requirements", "NFR", "Performance", "Security"
- "Response time < Xms", "Uptime 99.9%", "Hỗ trợ X concurrent users"
- Nếu không đề cập → để trống (field optional)

### Trích xuất \`overview\`

Viết 2-3 câu tóm tắt dựa trên:
- Tiêu đề của requirements document
- Section "Mục tiêu", "Mô tả", "Overview", "Summary", "Giới thiệu"
- Chỉ mô tả những gì requirements nêu rõ, không suy đoán thêm

### Thông tin không có trong requirements

Hỏi user **gộp 1 lần** cho tất cả thiếu sót:
- \`author\`: Tên kỹ sư phụ trách (không có trong requirements)
- \`stack\`: Tech stack (nếu requirements không đề cập)
- \`project_path\`: Đường dẫn tuyệt đối project đích (nếu chưa rõ)

---

## Hướng dẫn cho \`generate_testcase\`

**Không đọc requirements file, không đọc source code.**
Tool tự đọc spec .md từ \`{project_path}/output/spec/\`.

Chỉ cần truyền \`project_path\` — tool tự tìm spec .md mới nhất rồi parse:
- **Section 4** (Luồng xử lý chính): mỗi \`### GROUP\` → 1 Positive Scenario
- **Section 5** (Luồng thay thế): mỗi bullet \`điều kiện → kết quả\` → 1 Negative/Error
- **Section 6** (Business Rules): mỗi rule → 1 Boundary/Normal
- **Section 7** (Data Validation Rules): mỗi row đã điền → 1 Boundary/Normal Scenario
- **Section 10** (Error Catalog): mỗi row đã điền → 1 Error Handling Scenario

Dùng \`spec_file\` để chỉ định file cụ thể khi có nhiều spec trong thư mục.

Chế độ thủ công (không có spec file): truyền \`test_cases\` là JSON array với 10 fields mỗi phần tử:
\`category\`, \`test_title\`, \`test_purpose\`, \`scenario_type\`, \`test_type\`,
\`preconditions\`, \`steps\` (pipe-separated), \`test_data\`, \`expected_result\`, \`notes\`

---

## Hướng dẫn phân tích cho \`generate_review\`

### Bước 1: Thu thập context

**Source code:** Đọc toàn bộ files cần review.

**Spec / Docs (ưu tiên cao):**
- Nếu user cung cấp file spec/docs trực tiếp trong chat → đọc ngay, đây là nguồn sự thật về yêu cầu
- Nếu không có → kiểm tra \`{project_path}/output/spec/\` lấy file .md mới nhất
- Nếu có spec → dùng để đối chiếu code có implement đúng yêu cầu không

**Testcase:**
- Kiểm tra \`{project_path}/output/testcase/\` → đối chiếu 3 chiều nếu có:
  - Testcase vs Spec: TC cover đủ business rules chưa? Có TC nào test thứ spec không define không?
  - Testcase vs Code: code implement đúng expected result trong TC không? Có code path nào không có TC cover không?

**Knowledge base (tùy chọn — nâng cao chất lượng):**
- Tìm \`knowledge/INDEX.md\` trong workspace (đi lên từ project_path)
- Nếu thấy → đọc INDEX, mở file phù hợp với ngôn ngữ/chủ đề (php.md, api-design.md, database-design.md, ...)
- Nếu không thấy → bỏ qua, tiếp tục với kiến thức built-in

---

### Bước 2: Phân tích theo 5 trục

#### Trục 1 — Security (OWASP Top 10) | Critical / High / Medium

**A01 — Broken Access Control:**
- Endpoint thiếu authentication middleware / guard
- IDOR: \`find($request->id)\` không verify ownership → phải \`where('user_id', auth()->id())\`
- Missing authorization check (user A truy cập data user B)
- CORS quá rộng: \`origin: '*'\` trong production
- Directory traversal: \`../\` trong path từ user input

**A02 — Cryptographic Failures:**
- Password hash yếu: MD5, SHA1, plain text → phải bcrypt/argon2
- Hardcoded secrets, API keys, tokens trong source code
- Sensitive data (password, token, PII) trong log
- Token random yếu: \`rand()\`, \`Math.random()\` → phải \`random_bytes()\` / \`Str::random()\`

**A03 — Injection:**
- SQL injection: string concatenation trong query, \`\${}\` trong raw SQL → dùng prepared statement
- XSS: \`{!! $userInput !!}\` trong Blade (unescaped), \`innerHTML = userInput\` trong JS
- Command injection: \`exec("convert " . $filename)\` → \`escapeshellarg()\`
- Path traversal: user input trong file path không sanitize

**A04 — Insecure Design:**
- Missing rate limiting trên login/register/reset password
- Missing input validation: type, length, format, range
- Sensitive data trong URL query params (GET request)
- Business logic bypass: skip steps, negative amounts

**A05 — Security Misconfiguration:**
- \`APP_DEBUG=true\` có thể bật trong production
- Stack trace / error detail exposed trong response
- Security headers thiếu (X-Frame-Options, CSP, HSTS)
- Unnecessary HTTP methods enabled

**A07 — Authentication Failures:**
- Weak password policy (no length/complexity)
- JWT vulnerabilities: không verify signature, accept \`alg: none\`, secret quá yếu, không có expiry
- Session fixation: session ID không regenerate sau login

**A08 — Data Integrity:**
- \`unserialize()\` / \`ObjectInputStream\` với untrusted data → dùng \`json_decode()\`

**A09 — Logging Failures:**
- Login success/failure không được log
- Sensitive data trong log message
- Critical operations không có audit trail

**A10 — SSRF:**
- User-controlled URL được fetch server-side mà không validate whitelist

---

#### Trục 2 — Logic & Correctness | Critical / Major

- Null/undefined handling thiếu: \`find()\` không check null trước khi dùng
- Resource leak: DB connection, file handle không close
- Race condition: check-then-act không atomic (check stock → decrease stock)
- Missing transaction khi update nhiều bảng liên quan
- Wrong HTTP status code: 200 cho create (phải 201), 200 cho delete (phải 204)
- Missing error handling tại service/controller layer
- Type conversion không an toàn (int overflow, string→number)
- Off-by-one errors trong loop / pagination
- Infinite loop potential

---

#### Trục 3 — Code vs Spec | Major / Minor

*Chỉ áp dụng khi có spec/docs. Bỏ qua nếu không có.*

- Business rule trong spec có được implement đúng không?
- Response format có khớp spec không (fields, types, HTTP status)?
- Validation rules trong spec có được enforce không?
- Flow xử lý trong code có match với luồng mô tả trong spec không?
- Edge cases spec đề cập có được handle không?

---

#### Trục 4 — Performance | Major / Minor

- N+1 query: query trong vòng lặp (foreach + find, lazy load chưa eager load)
- Missing database index trên foreign key thường dùng trong WHERE/JOIN
- Missing pagination cho queries trả về list lớn
- Memory leak: unclosed resources, growing collections
- Blocking operations trong async context
- Unnecessary object creation trong loop

---

#### Trục 5 — Code Quality | Minor

- Naming không rõ ràng: biến 1 chữ, tên mập mờ
- Hàm quá dài (> 50 lines) → gợi ý tách
- Deep nesting (> 3 levels)
- Code duplication (> 10 dòng giống nhau ở nhiều nơi)
- Magic numbers/strings không có constant
- Unused imports/variables
- Không tuân theo conventions trong CLAUDE.md

---

### Quy tắc \`overall_result\`

- \`Approved\`: không có Critical, không có Major
- \`Approved with Changes\`: không có Critical, có ≥ 1 Major
- \`Rejected\`: có ≥ 1 Critical

### Quy tắc issue

- **Chỉ báo cáo issue CÓ BẰNG CHỨNG** (file:line) — không đoán
- \`title\`: ngắn gọn + file:line (ví dụ: "SQL injection tại UserController.php:42")
- \`description\`: giải thích tại sao là vấn đề, không chỉ mô tả
- \`suggestion\`: fix cụ thể kèm code example nếu có thể
- Không ghi issue chung chung kiểu "cần thêm validation"

---

## Bước 3 — Thu thập thông tin còn thiếu

Hỏi user **gộp 1 lần duy nhất** cho tất cả thiếu sót:
- \`author\` / \`reviewer\` / \`reviewee\`: Tên người
- \`project_path\`: Đường dẫn tuyệt đối project đích (nếu chưa rõ)
- \`stack\`: Tech stack (nếu không có trong requirements)

Sau khi đủ tham số → gọi MCP tool ngay, không hỏi thêm.

## Bước 4 — Báo cáo kết quả
- Thông báo tên file và đường dẫn đã tạo
- Tóm tắt nội dung chính (số test case, số issue, v.v.)
- Không hiển thị lại toàn bộ nội dung file trừ khi được yêu cầu`;

const server = new Server(
  { name: "mcp-spec-generator", version: "1.0.0" },
  { capabilities: { tools: {}, prompts: {} } }
);

const PROJECT_PATH_DESC =
  "(Tùy chọn) Đường dẫn tuyệt đối đến project đích — file lưu vào {project_path}/output/. Ví dụ: 'D:/vandv/my-project' → D:/vandv/my-project/output/spec/. Nếu chỉ truyền tên (không phải absolute path), file lưu vào output/{tên}/ trong thư mục mcp-spec-generator.";

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "generate_spec",
      description:
        "Sinh tài liệu Functional Specification dạng Markdown từ requirements file. WORKFLOW: Gọi tool này TRƯỚC generate_testcase và generate_review. Đọc requirements file (.md/.txt/PRD) do user cung cấp — trích xuất actors (ai sử dụng), preconditions (điều kiện tiên quyết), normal_flow (happy path, các bước ngăn cách bằng |), alternative_flows (error/exception cases), business_rules (ràng buộc, validation rules). Hỏi user về author, stack, project_path nếu không có trong requirements.",
      inputSchema: {
        type: "object",
        properties: {
          project_name:      { type: "string", description: "Tên dự án" },
          project_path:      { type: "string", description: PROJECT_PATH_DESC },
          feature_name:      { type: "string", description: "Tên chức năng đầy đủ dùng để hiển thị trong tài liệu (tiếng Việt hoặc tiếng Anh). Ví dụ: 'Đăng nhập', 'Quản lý người dùng', 'User Login'." },
          feature_slug:      { type: "string", description: "(Tùy chọn) Slug dùng cho tên file — chỉ gồm a-z, 0-9, _, - (không dấu, không khoảng trắng). Lấy từ trường 'Tên chức năng' trong requirements header table (lowercase, spaces → underscore). VD: 'Login' → 'login', 'User Management' → 'user_management'. LUÔN truyền field này khi đọc từ requirements file để tránh tạo slug tiếng Việt." },
          author:            { type: "string", description: "Tên kỹ sư phụ trách" },
          stack:             { type: "string", description: 'Tech stack, ví dụ: "Laravel 10 + React 18"' },
          overview:          { type: "string", description: "Mô tả ngắn chức năng (1-3 câu)" },
          actors:            { type: "string", description: "Danh sách actors, mỗi item một dòng (\\n)" },
          preconditions:     { type: "string", description: "Điều kiện tiên quyết, mỗi item một dòng (\\n)" },
          normal_flow:       { type: "string", description: 'Các bước luồng chính, cách nhau bằng " | ". PHẢI dùng "##TÊN_NHÓM" cho mỗi success scenario riêng biệt — mỗi group sinh 1 Positive test case trong XLSX. Không dùng group → toàn bộ Section 4 chỉ sinh 1 case "Kiểm tra Main Flow thành công". Ví dụ cho update endpoint: "##Update title/content | 1. Admin gửi PUT với title | 2. Validate | 3. Lưu DB | 4. Trả 200 | ##Update with image | 1. Admin gửi PUT kèm file | 2. Store ảnh mới | 3. Xóa ảnh cũ | 4. Trả 200 | ##Update categories | 1. Admin gửi PUT với category_ids | 2. Sync pivot | 3. Trả 200"' },
          alternative_flows: { type: "string", description: '(Tùy chọn) Luồng thay thế, cách nhau bằng " | ". Hỗ trợ "##TÊN_NHÓM" làm group header' },
          business_rules:    { type: "string", description: "Business rules, mỗi item một dòng (\\n)" },
          ui_flow:           { type: "string", description: "(Tùy chọn) Mô tả luồng UI/frontend: entry point, các màn hình, trạng thái loading/error, hành vi submit. Giữ nguyên format markdown (dùng ### cho subsection). Chỉ điền khi requirements có mô tả UI." },
          non_functional:    { type: "string", description: "(Tùy chọn) Yêu cầu phi chức năng, mỗi item một dòng (\\n)" },
          open_questions:    { type: "string", description: "(Tùy chọn) Câu hỏi còn mở, mỗi item một dòng (\\n)" },
          feature_id:        { type: "string", description: "(Tùy chọn) Feature ID, VD: FT-001 hoặc ticket ID từ Jira/Linear" },
          reviewer:          { type: "string", description: "(Tùy chọn) Tên người review tài liệu spec" },
          scope:                 { type: "string", description: "(Tùy chọn) Phạm vi spec bao phủ (1-2 câu)" },
          out_of_scope:          { type: "string", description: "(Tùy chọn) Các phần liên quan nhưng không thuộc spec này (1-2 câu)" },
          data_validation_rules: { type: "string", description: "(Tùy chọn) Data validation rules — copy nguyên vẹn Markdown từ requirements (bao gồm header row của table). Nếu có server-side và client-side, dùng ### để phân tách rồi copy cả 2 bảng. Nếu không có → bỏ qua." },
          api_contract:          { type: "string", description: "(Tùy chọn) API contract — copy nguyên vẹn Markdown từ requirements (endpoint, method, request/response với code blocks). Nếu không có → bỏ qua." },
          error_catalog:         { type: "string", description: "(Tùy chọn) Error catalog — copy nguyên vẹn Markdown từ requirements (bảng Error Code, HTTP Status, Message, Trigger Condition). Mỗi row → 1 Error Handling test case trong generate_testcase. Nếu không có → bỏ qua." },
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
        "Sinh file Test Case dạng XLSX từ spec file. BẮT BUỘC: phải truyền ít nhất một trong ba tham số sau — (1) spec_file: đường dẫn tuyệt đối đến file spec .md, (2) project_path: đường dẫn tuyệt đối đến project (tool tự tìm spec .md mới nhất trong {project_path}/output/spec/), hoặc (3) test_cases: JSON array thủ công khi không có spec. Gọi tool với object rỗng {} sẽ trả về lỗi. Gọi SAU generate_spec — không cần đọc source code. Tool tự parse spec tự động: Section 4 (luồng chính) → Positive Scenarios; Section 5 (luồng thay thế) → Negative/Error; Section 6 (business rules) → Boundary/Normal; Section 7 (data validation) → Boundary/Normal; Section 10 (error catalog) → Error Handling. Chỉ dùng test_cases JSON khi không có spec file.",
      inputSchema: {
        type: "object",
        properties: {
          project_path: { type: "string", description: PROJECT_PATH_DESC },
          feature: {
            type: "string",
            description: "(Tùy chọn) Tên chức năng. Tự động lấy từ spec nếu bỏ trống.",
          },
          feature_slug: {
            type: "string",
            description: "(Tùy chọn) Slug dùng cho tên file — chỉ gồm a-z, 0-9, _, - (không dấu, không khoảng trắng). Nếu không truyền, tool tự derive từ feature.",
          },
          spec_file: {
            type: "string",
            description: "(Override) Đường dẫn tuyệt đối đến file spec .md cụ thể. Bỏ trống để tool tự tìm file mới nhất trong {project_path}/output/spec/.",
          },
          test_cases: {
            type: "string",
            description:
              `(Thủ công — chỉ dùng khi không có spec) JSON array string (tối đa 500 items). Mỗi phần tử: {"category":"...","test_title":"...","test_purpose":"${TEST_PURPOSE_VALUES.join("|")}","scenario_type":"${SCENARIO_TYPE_VALUES.join("|")}","test_type":"${TEST_TYPE_VALUES.join("|")}","preconditions":"...","steps":"bước 1 | bước 2","test_data":"","expected_result":"...","notes":""}`,
          },
        },
        required: [],
      },
    },
    {
      name: "generate_review",
      description:
        "Sinh báo cáo Review dạng Markdown + JSON và lưu vào thư mục output/. Đọc source code để kiểm tra: Security (SQL injection, missing auth, exposed data) → Business Logic (missing transaction, race condition, wrong HTTP status) → Code Quality (magic numbers, N+1, function > 50 lines). Nếu có spec file trong {project_path}/output/spec/ → đọc thêm để đối chiếu logic code vs spec. Nếu có testcase file trong {project_path}/output/testcase/ → đọc thêm để đối chiếu 3 chiều: testcase vs spec (TC có cover đủ business rules không?), testcase vs code (code có implement đúng expected result không?). overall_result: Rejected (≥1 Critical) | Approved with Changes (≥1 Major) | Approved (no Critical/Major). Mỗi issue kèm file:line.",
      inputSchema: {
        type: "object",
        properties: {
          project_name:   { type: "string", description: "Tên dự án" },
          project_path:   { type: "string", description: PROJECT_PATH_DESC },
          feature_name:   { type: "string", description: "Tên chức năng đầy đủ dùng để hiển thị trong tài liệu (tiếng Việt hoặc tiếng Anh). Ví dụ: 'Đăng nhập', 'User Login'." },
          feature_slug:   { type: "string", description: "(Tùy chọn) Slug dùng cho tên file — chỉ gồm a-z, 0-9, _, - (không dấu, không khoảng trắng). Nếu không truyền, tool tự derive từ feature_name." },
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
      const outputDir = await resolveAndMkdirOutputDir("spec", params.project_path);

      const safeFeature = (params.feature_slug || toSlug(params.feature_name)) || "unnamed";
      const version = await getNextVersion(outputDir, safeFeature);
      const content = await renderSpec(params, now, version);
      const filename = `spec_${safeFeature}_v${version}_0_${formatTimestamp(now)}.md`;
      const filePath = path.join(outputDir, filename);

      await fs.writeFile(filePath, content, "utf-8");

      return {
        content: [
          { type: "text", text: `File saved: ${filePath}\n\n---\n\n${content}` },
        ],
      };
    } catch (error) {
      return toolError("generate_spec", error);
    }
  }

  if (toolName === "generate_testcase") {
    try {
      const parseResult = GenerateTestcaseSchema.safeParse(request.params.arguments);
      assertParsed(parseResult);
      const params = parseResult.data;

      let items: TestCaseItem[];
      let featureName = params.feature ?? "";
      let resolvedSpecFile: string | undefined;

      if (params.spec_file || (!params.test_cases && params.project_path)) {
        // Resolve spec file path: explicit override OR auto-discover from project_path/output/spec/
        if (params.spec_file) {
          resolvedSpecFile = path.resolve(params.spec_file);
          if (params.project_path) {
            const resolvedProject = path.resolve(params.project_path.replace(/[/\\]+$/, ""));
            if (!resolvedSpecFile.startsWith(resolvedProject + path.sep)) {
              throw new Error(`spec_file phải nằm trong project_path: "${resolvedProject}"`);
            }
          } else {
            const mcpOutputRoot = path.resolve(__dirname, "../output");
            if (!resolvedSpecFile.startsWith(mcpOutputRoot + path.sep)) {
              throw new Error(`spec_file khi không có project_path phải nằm trong output của mcp-spec-generator: "${mcpOutputRoot}"`);
            }
          }
        } else {
          if (!params.project_path) throw new Error("project_path là bắt buộc khi không cung cấp spec_file hoặc test_cases");
          const specDir = path.join(params.project_path.replace(/[/\\]+$/, ""), "output", "spec");
          let dirFiles: string[];
          try {
            dirFiles = await fs.readdir(specDir);
          } catch {
            throw new Error(`Không tìm thấy thư mục spec: "${specDir}" — chạy generate_spec trước`);
          }
          const mdFiles = dirFiles
            .filter(f => f.toLowerCase().endsWith(".md"))
            .sort()
            .reverse(); // desc → file mới nhất (timestamp trong tên file) lên đầu
          if (mdFiles.length === 0) {
            throw new Error(`Không có file spec .md nào trong "${specDir}" — chạy generate_spec trước`);
          }
          resolvedSpecFile = path.join(specDir, mdFiles[0]);
        }

        let specContent: string;
        try {
          specContent = await fs.readFile(resolvedSpecFile, "utf-8");
        } catch {
          throw new Error(`Không đọc được spec file: "${resolvedSpecFile}"`);
        }
        const parsed = parseSpecMarkdown(specContent);
        items = specToTestCases(parsed);
        if (!featureName && parsed.featureName) featureName = parsed.featureName;
        if (items.length === 0) {
          throw new Error("Không trích xuất được test case nào từ spec file — kiểm tra lại format spec");
        }
      } else {
        // Manual test_cases JSON mode
        let rawItems: unknown;
        try {
          rawItems = safeParse(params.test_cases!);
        } catch {
          throw new Error("test_cases không phải JSON hợp lệ");
        }
        if (!Array.isArray(rawItems) || rawItems.length === 0) {
          throw new Error("test_cases phải là JSON array không rỗng");
        }
        if (rawItems.length > 500) {
          throw new Error("test_cases tối đa 500 items — hãy chia nhỏ nếu cần");
        }
        items = rawItems.map((item, i) => {
          const result = TestCaseItemSchema.safeParse(item);
          if (!result.success) {
            throw new Error(`test_cases[${i}] không hợp lệ: ${result.error.message}`);
          }
          return result.data;
        });
      }

      if (!featureName) featureName = "unnamed";
      const now = new Date();
      const outputDir = await resolveAndMkdirOutputDir("testcase", params.project_path);
      const slugFromSpecFile = resolvedSpecFile
        ? (path.basename(resolvedSpecFile, ".md").match(/^spec_(.+?)_v\d+_\d+_\d{8}_\d{6}$/)?.[1] ?? undefined)
        : undefined;
      const effectiveSlug = params.feature_slug ?? slugFromSpecFile;
      const filePath = await generateXlsx(featureName, items, outputDir, formatTimestamp(now), effectiveSlug);
      const specInfo = resolvedSpecFile ? `Spec file: ${resolvedSpecFile}\n` : "";

      return {
        content: [
          {
            type: "text",
            text: `${specInfo}File saved: ${filePath}\nTest cases generated: ${items.length}`,
          },
        ],
      };
    } catch (error) {
      return toolError("generate_testcase", error);
    }
  }

  if (toolName === "generate_review") {
    try {
      const parseResult = GenerateReviewSchema.safeParse(request.params.arguments);
      assertParsed(parseResult);
      const params = parseResult.data;

      let rawIssues: unknown;
      try {
        rawIssues = safeParse(params.issues);
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
      const outputDir = await resolveAndMkdirOutputDir("review", params.project_path);

      const slug = (params.feature_slug || toSlug(params.feature_name)) || "unnamed";
      const ts   = formatTimestamp(now);
      const mdPath   = path.join(outputDir, `review_${slug}_${ts}.md`);
      const jsonPath = path.join(outputDir, `review_${slug}_${ts}.json`);

      const counts = countBySeverity(issues);
      const { critical: criticalCount, major: majorCount, minor: minorCount } = counts;
      const mdContent = renderReview(params, issues, counts, now);

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
      return toolError("generate_review", error);
    }
  }

  return {
    isError: true,
    content: [{ type: "text", text: `Unknown tool: ${toolName}` }],
  };
});

server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: [
    {
      name: "workflow_guide",
      description: "Hướng dẫn đầy đủ: thứ tự gọi tools, cách đọc source code để trích xuất tham số, cách parse spec thành test case, checklist review code",
    },
  ],
}));

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  if (request.params.name === "workflow_guide") {
    return {
      description: "Workflow guide for mcp-spec-generator tools",
      messages: [
        {
          role: "user",
          content: { type: "text", text: WORKFLOW_GUIDE_PROMPT },
        },
      ],
    };
  }
  throw new Error(`Prompt not found: ${request.params.name}`);
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
