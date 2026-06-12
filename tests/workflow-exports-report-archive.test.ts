import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXPORT_FILE_SUFFIXES, WORKFLOW_FILES, WORKSPACE_CONFIG } from "../src/core/config.js";
import { archiveChange } from "../src/workflow/archive.js";
import { writeProposal, writeTestPoints } from "../src/workflow/artifacts.js";
import {
  generatePerformanceCases,
  readOrGeneratePerformanceCases,
} from "../src/workflow/performance.js";
import {
  computeReportStats,
  normalizeExecutionStatus,
  writeReport,
} from "../src/workflow/report.js";
import { readExecutionRows, writeExcelWorkbook } from "../src/workflow/spreadsheet.js";
import {
  generateStructuredCases,
  readOrGenerateStructuredCases,
} from "../src/workflow/testcases.js";
import { formatValidationResult, validateWorkflowArtifacts } from "../src/workflow/validation.js";
import { createChangeWorkspace } from "../src/workflow/workspace.js";

let originalCwd: string;
let tempDir: string;

beforeEach(async () => {
  originalCwd = process.cwd();
  tempDir = await mkdtemp(join(tmpdir(), "testspec-"));
  process.chdir(tempDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  vi.restoreAllMocks();
});

function workbookEntry(workbook: Record<string, Uint8Array>, path: string): Uint8Array {
  const entry = workbook[path];
  if (!entry) {
    throw new Error(`Workbook entry not found: ${path}`);
  }
  return entry;
}

describe("performance cases", () => {
  it("generates global non-functional performance cases", async () => {
    const workspace = await createChangeWorkspace("checkout-v2");

    const cases = generatePerformanceCases();

    expect(cases).toHaveLength(9);
    expect(cases[0]).not.toHaveProperty("scenarioId");
    expect(cases[0]).not.toHaveProperty("testPointIds");
    expect(cases[0]).not.toHaveProperty("testData");
    expect(cases[0]).not.toHaveProperty("notes");
    expect(cases[0]).toMatchObject({
      module: "全局非功能性",
      performanceType: "基线测试",
      actualThroughput: "待执行后填写",
    });
    expect(cases[0]).not.toHaveProperty("requirementIds");
    expect(cases[0]).not.toHaveProperty("executionResult");
    expect(cases[0]?.scenarioName).toBe("接口响应时间基线");
    expect(cases[0]?.steps.length).toBeGreaterThanOrEqual(3);

    const types = cases.map((c) => c.performanceType);
    expect(types).toContain("基线测试");
    expect(types).toContain("慢查询检测");
    expect(types).toContain("泄漏检测");
    expect(types).toContain("启动耗时");
    expect(types).toContain("资源监控");
    expect(types).toContain("安全性能");
  });

  it("merges agent-generated business cases with global non-functional cases", async () => {
    const workspace = await createChangeWorkspace("search-v2");
    await writeFile(
      join(workspace.specsDir, WORKFLOW_FILES.testpoints),
      [
        "# 测试点清单：search-v2",
        "",
        "## 核心流程",
        "",
        "- [TP-001] 覆盖 REQ-001 搜索 的主要成功路径。",
      ].join("\n")
    );
    // Simulate Agent-generated business performance cases
    await writeFile(
      join(workspace.artifactsDir, WORKFLOW_FILES.performanceCases),
      `${JSON.stringify(
        [
          {
            module: "搜索模块",
            scenarioName: "搜索查询负载测试",
            performanceType: "负载测试",
            objective: "验证搜索查询在高并发下的响应时间。",
            preconditions: "测试环境已部署。",
            concurrentUsers: "100",
            duration: "10min",
            steps: ["准备搜索关键词集", "以 100 并发执行搜索", "记录 P95 响应时间"],
            targetThroughput: "≥ 500 QPS",
            actualThroughput: "待执行后填写",
            avgResponseTime: "待执行后填写",
            p95ResponseTime: "待执行后填写",
            errorRate: "待执行后填写",
          },
        ],
        null,
        2
      )}\n`
    );

    const cases = await readOrGeneratePerformanceCases(workspace);

    // 1 business case + 9 global cases = 10
    expect(cases).toHaveLength(10);
    expect(cases[0]?.scenarioName).toBe("搜索查询负载测试");
    expect(cases[0]?.module).toBe("搜索模块");
    expect(cases[9]?.module).toBe("全局非功能性");
  });

  it("sorts business cases before global cases in Excel output", async () => {
    const workspace = await createChangeWorkspace("sort-test");
    const businessCase: import("../src/workflow/performance.js").PerformanceCase = {
      module: "搜索模块",
      scenarioName: "搜索查询负载测试",
      performanceType: "负载测试",
      objective: "验证搜索查询在高并发下的响应时间。",
      preconditions: "测试环境已部署。",
      concurrentUsers: "100",
      duration: "10min",
      steps: ["准备搜索关键词集", "以 100 并发执行搜索", "记录 P95 响应时间"],
      targetThroughput: "≥ 500 QPS",
      actualThroughput: "待执行后填写",
      avgResponseTime: "待执行后填写",
      p95ResponseTime: "待执行后填写",
      errorRate: "待执行后填写",
    };
    // Business case with a global performanceType name to test unified criteria
    const edgeCaseBusinessWithGlobalType: import("../src/workflow/performance.js").PerformanceCase = {
      module: "支付模块",
      scenarioName: "支付安全性能验证",
      performanceType: "安全性能",
      objective: "验证支付接口的安全性能。",
      preconditions: "测试环境已部署。",
      concurrentUsers: "50",
      duration: "5min",
      steps: ["发送支付请求", "验证安全机制"],
      targetThroughput: "待确认",
      actualThroughput: "待执行后填写",
      avgResponseTime: "待执行后填写",
      p95ResponseTime: "待执行后填写",
      errorRate: "待执行后填写",
    };
    const globalCases = generatePerformanceCases();
    // Mix: global first, then business, to verify sorting reorders correctly
    const mixedCases = [...globalCases, businessCase, edgeCaseBusinessWithGlobalType];

    const workbookPath = join(workspace.artifactsDir, `sort-test_cases.xlsx`);
    await writeExcelWorkbook(workbookPath, [], mixedCases);

    const workbook = unzipSync(await readFile(workbookPath));
    const performanceSheetXml = strFromU8(workbookEntry(workbook, "xl/worksheets/sheet2.xml"));

    // Extract all row values for column A (module) from data rows (skip header row 1)
    const moduleMatches = [...performanceSheetXml.matchAll(/<c r="A(\d+)"[^>]*><is><t>([^<]*)<\/t><\/is><\/c>/g)];
    const dataModules = moduleMatches
      .filter((m) => Number(m[1]) > 1)
      .sort((a, b) => Number(a[1]) - Number(b[1]))
      .map((m) => m[2]);

    // Business cases should come first, global cases last
    const firstGlobalIndex = dataModules.findIndex((m) => m === "全局非功能性");
    const businessModules = dataModules.slice(0, firstGlobalIndex);
    const globalModules = dataModules.slice(firstGlobalIndex);

    expect(businessModules.length).toBe(2);
    expect(businessModules).toContain("搜索模块");
    // Edge case: business case with performanceType "安全性能" should NOT be sorted to global area
    expect(businessModules).toContain("支付模块");
    expect(globalModules.length).toBe(9);
    expect(globalModules.every((m) => m === "全局非功能性")).toBe(true);
  });
});

describe("structured cases and exports", () => {
  it("generates structured cases and an Excel workbook", async () => {
    const workspace = await createChangeWorkspace("login-v2");
    await writeTestPoints(workspace);

    const cases = await generateStructuredCases(workspace);
    const performanceCases = generatePerformanceCases();
    const workbookPath = join(workspace.artifactsDir, `login-v2${EXPORT_FILE_SUFFIXES.excelCases}`);
    await writeExcelWorkbook(workbookPath, cases, performanceCases);
    const rows = await readExecutionRows(workbookPath);
    const workbook = unzipSync(await readFile(workbookPath));
    const workbookXml = strFromU8(workbookEntry(workbook, "xl/workbook.xml"));
    const relationshipsXml = strFromU8(workbookEntry(workbook, "xl/_rels/workbook.xml.rels"));
    const contentTypesXml = strFromU8(workbookEntry(workbook, "[Content_Types].xml"));
    const stylesXml = strFromU8(workbookEntry(workbook, "xl/styles.xml"));
    const functionalSheetXml = strFromU8(workbookEntry(workbook, "xl/worksheets/sheet1.xml"));
    const performanceSheetXml = strFromU8(workbookEntry(workbook, "xl/worksheets/sheet2.xml"));

    expect(cases[0]).not.toHaveProperty("caseId");
    expect(cases[0]).not.toHaveProperty("testPointIds");
    expect(rows[0]).toMatchObject({ caseId: "row-2", executionResult: "未执行" });
    expect(workbookXml).toContain('name="功能测试"');
    expect(workbookXml).toContain('name="性能测试"');
    expect(relationshipsXml).toContain('Target="worksheets/sheet1.xml"');
    expect(relationshipsXml).toContain('Target="worksheets/sheet2.xml"');
    expect(relationshipsXml).toContain(
      'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles"'
    );
    expect(relationshipsXml).toContain('Target="styles.xml"');
    expect(contentTypesXml).toContain("/xl/styles.xml");
    expect(contentTypesXml).toContain("/xl/worksheets/sheet2.xml");
    expect(stylesXml).toContain('rgb="FFFFFFFF"');
    expect(stylesXml).toContain('rgb="FF1F4E78"');
    expect(stylesXml).toContain('<alignment horizontal="center" vertical="center"/>');
    expect(stylesXml).toContain('<left style="thin">');
    expect(functionalSheetXml).toContain('<c r="A1" s="1" t="inlineStr">');
    expect(functionalSheetXml).toContain('<c r="A2" s="2" t="inlineStr">');
    expect(performanceSheetXml).toContain('<c r="A1" s="1" t="inlineStr">');
    expect(performanceSheetXml).toContain('<c r="A2" s="2" t="inlineStr">');
    expect(functionalSheetXml).not.toContain("需求编号");
    expect(functionalSheetXml).not.toContain("用例编号");
    expect(functionalSheetXml).not.toContain("测试点编号");
    expect(functionalSheetXml).not.toContain("<t>测试数据</t>");
    expect(functionalSheetXml).not.toContain("备注");
    expect(functionalSheetXml).not.toContain("REQ-001");
    expect(functionalSheetXml).not.toContain("实际结果");
    expect(functionalSheetXml).not.toContain("缺陷编号");
    expect(functionalSheetXml).toContain("执行结果");
    expect(performanceSheetXml).not.toContain("场景编号");
    expect(performanceSheetXml).toContain("P95响应时间(ms)");
    expect(performanceSheetXml).not.toContain("关联测试点编号");
    expect(performanceSheetXml).not.toContain("<t>测试数据</t>");
    expect(performanceSheetXml).not.toContain("备注");
    expect(performanceSheetXml).not.toContain("P99响应时间(ms)");
    expect(performanceSheetXml).not.toContain("CPU峰值(%)");
    expect(performanceSheetXml).not.toContain("内存峰值(%)");
    expect(performanceSheetXml).not.toContain("瓶颈分析");
  });

  it("omits the performance sheet when there are no performance cases", async () => {
    const workspace = await createChangeWorkspace("functional-only");
    const workbookPath = join(
      workspace.artifactsDir,
      `functional-only${EXPORT_FILE_SUFFIXES.excelCases}`
    );
    await writeExcelWorkbook(
      workbookPath,
      [
        {
          caseId: "TC-001",
          title: "正常登录",
          module: "登录",
          type: "正向",
          priority: "P0",
          requirementIds: ["REQ-001"],
          testPointIds: ["TP-001"],
          riskIds: [],
          sourceRefs: [{ document: "docs/login.md", section: "登录", quote: "用户可以登录" }],
          preconditions: "已注册",
          testData: "username=user-a",
          steps: ["登录"],
          expectedResult: "登录成功",
          executionResult: "未执行",
        },
      ],
      []
    );

    const workbook = unzipSync(await readFile(workbookPath));
    const workbookXml = strFromU8(workbookEntry(workbook, "xl/workbook.xml"));
    const relationshipsXml = strFromU8(workbookEntry(workbook, "xl/_rels/workbook.xml.rels"));
    const contentTypesXml = strFromU8(workbookEntry(workbook, "[Content_Types].xml"));

    expect(workbookXml).toContain('name="功能测试"');
    expect(workbookXml).not.toContain('name="性能测试"');
    expect(relationshipsXml).not.toContain('Target="worksheets/sheet2.xml"');
    expect(contentTypesXml).not.toContain("/xl/worksheets/sheet2.xml");
    expect(workbook["xl/worksheets/sheet2.xml"]).toBeUndefined();
  });

  it("preserves and normalizes existing structured cases when test points change", async () => {
    const workspace = await createChangeWorkspace("login-v2");
    await writeTestPoints(workspace);
    await generateStructuredCases(workspace);
    await writeFile(
      join(workspace.artifactsDir, WORKFLOW_FILES.testcases),
      `${JSON.stringify(
        [
          {
            caseId: "TC-001",
            title: "已有成功路径",
            module: "登录",
            type: "正向",
            priority: "P0",
            preconditions: "用户已注册。",
            testData: "username=user-a",
            steps: ["打开登录页", "输入有效账号密码", "点击登录"],
            expectedResult: "系统跳转到首页并展示登录态。",
            notes: "legacy note",
          },
        ],
        null,
        2
      )}\n`
    );
    await writeFile(
      join(workspace.specsDir, WORKFLOW_FILES.testpoints),
      ["# 测试点清单：login-v2", "", "## 核心流程", "", "- [TP-001] 新成功路径。"].join("\n")
    );

    const cases = await readOrGenerateStructuredCases(workspace);
    const persisted = JSON.parse(
      await readFile(join(workspace.artifactsDir, WORKFLOW_FILES.testcases), "utf8")
    ) as Record<string, unknown>[];

    expect(cases[0]).toMatchObject({ title: "已有成功路径" });
    expect(persisted[0]).toEqual({
      title: "已有成功路径",
      module: "登录",
      type: "正向",
      priority: "P0",
      preconditions: "用户已注册。",
      steps: ["打开登录页", "输入有效账号密码", "点击登录"],
      expectedResult: "系统跳转到首页并展示登录态。",
    });
  });
});

describe("validation", () => {
  it("passes valid agent-generated cases and preserves them for exports", async () => {
    const workspace = await createChangeWorkspace("agent-login");
    await writeFile(
      join(workspace.specsDir, WORKFLOW_FILES.testpoints),
      [
        "# 测试点清单：agent-login",
        "",
        "## 核心流程",
        "",
        "- [TP-001] 覆盖 REQ-001 用户密码登录 的主要成功路径。 来源：docs/login.md §2.1",
      ].join("\n")
    );
    await writeFile(
      join(workspace.artifactsDir, WORKFLOW_FILES.testcases),
      `${JSON.stringify(
        [
          {
            caseId: "TC-001",
            title: "有效账号密码登录成功",
            module: "登录",
            type: "正向",
            priority: "P0",
            requirementIds: ["REQ-001"],
            testPointIds: ["TP-001"],
            riskIds: [],
            sourceRefs: [
              {
                document: "docs/login.md",
                section: "2.1 密码登录",
                quote: "用户可以使用有效账号和密码登录系统。",
              },
            ],
            preconditions: "用户 user-a 已注册且账号状态正常。",
            testData: "username=user-a; password=ValidPass123",
            steps: ["打开登录页", "输入 user-a 和 ValidPass123", "点击登录按钮"],
            expectedResult: "系统跳转到首页并显示 user-a 的登录态。",
            executionResult: "未执行",
            notes: "source checked",
          },
        ],
        null,
        2
      )}\n`
    );

    const validation = await validateWorkflowArtifacts(workspace);
    const cases = await readOrGenerateStructuredCases(workspace);
    const workbookPath = join(
      workspace.artifactsDir,
      `agent-login${EXPORT_FILE_SUFFIXES.excelCases}`
    );
    await writeExcelWorkbook(workbookPath, cases, []);
    const workbook = unzipSync(await readFile(workbookPath));
    const functionalSheetXml = strFromU8(workbookEntry(workbook, "xl/worksheets/sheet1.xml"));

    expect(validation.errors).toHaveLength(0);
    expect(formatValidationResult(validation)).toContain("Validation errors: 0");
    expect(cases[0]?.title).toBe("有效账号密码登录成功");
    expect(cases[0]).not.toHaveProperty("testData");
    expect(cases[0]).not.toHaveProperty("notes");
    expect(functionalSheetXml).not.toContain("username=user-a; password=ValidPass123");
    expect(functionalSheetXml).not.toContain("source checked");
  });

  it("reports schema and quality validation issues after compact normalization", async () => {
    const workspace = await createChangeWorkspace("bad-cases");
    await writeFile(
      join(workspace.specsDir, WORKFLOW_FILES.testpoints),
      [
        "# 测试点清单：bad-cases",
        "",
        "## 核心流程",
        "",
        "- [TP-001] 覆盖 REQ-001 登录 的主要成功路径。",
        "- [TP-002] 覆盖 REQ-002 注册 的主要成功路径。",
      ].join("\n")
    );
    await writeFile(
      join(workspace.artifactsDir, WORKFLOW_FILES.testcases),
      `${JSON.stringify(
        [
          {
            caseId: "TC-001",
            title: "模板用例 1",
            module: "登录",
            type: "正向",
            priority: "P0",
            requirementIds: ["REQ-999"],
            testPointIds: ["TP-999"],
            riskIds: [],
            preconditions: "已准备",
            steps: ["准备测试数据", "执行对应业务操作", "观察系统响应和数据结果"],
            expectedResult: "符合需求",
          },
          {
            title: "模板用例 2",
            module: "注册",
            type: "正向",
            priority: "P1",
            requirementIds: ["REQ-001"],
            testPointIds: ["TP-001"],
            riskIds: [],
            preconditions: "已准备",
            steps: ["准备测试数据", "执行对应业务操作", "观察系统响应和数据结果"],
            expectedResult: "系统行为符合需求、测试点和风险覆盖预期。",
          },
        ],
        null,
        2
      )}\n`
    );

    const validation = await validateWorkflowArtifacts(workspace);
    const output = formatValidationResult(validation);

    const persistedAfterValidation = JSON.parse(
      await readFile(join(workspace.artifactsDir, WORKFLOW_FILES.testcases), "utf8")
    ) as Record<string, unknown>[];

    expect(validation.errors.some((issue) => issue.code === "MISSING_FIELD")).toBe(false);
    expect(validation.errors.some((issue) => issue.code === "UNKNOWN_TEST_POINT")).toBe(false);
    expect(validation.warnings.some((issue) => issue.code === "MISSING_SOURCE_REFS")).toBe(false);
    expect(validation.warnings.some((issue) => issue.code === "VERBOSE_COMPACT_FIELD")).toBe(false);
    expect(validation.warnings.some((issue) => issue.code === "UNKNOWN_REQUIREMENT")).toBe(false);
    expect(validation.warnings.some((issue) => issue.code === "GENERIC_STEPS")).toBe(true);
    expect(validation.warnings.some((issue) => issue.code === "VAGUE_EXPECTED_RESULT")).toBe(true);
    expect(persistedAfterValidation[0]).toHaveProperty("caseId", "TC-001");

    await readOrGenerateStructuredCases(workspace);
    const persistedAfterNormalization = JSON.parse(
      await readFile(join(workspace.artifactsDir, WORKFLOW_FILES.testcases), "utf8")
    ) as Record<string, unknown>[];
    expect(persistedAfterNormalization[0]).not.toHaveProperty("caseId");

    expect(output).toContain("[WARN] GENERIC_STEPS case[1]");
    expect(output).toContain("Validation errors:");
    expect(output).toContain("Validation warnings:");
  });

  it("does not cascade unknown test point errors when testpoints are unreadable", async () => {
    const workspace = await createChangeWorkspace("missing-testpoints");
    await writeFile(
      join(workspace.artifactsDir, WORKFLOW_FILES.testcases),
      `${JSON.stringify(
        [
          {
            caseId: "TC-001",
            title: "有效账号密码登录成功",
            module: "登录",
            type: "正向",
            priority: "P0",
            requirementIds: ["REQ-001"],
            testPointIds: ["TP-001"],
            riskIds: [],
            sourceRefs: [{ document: "docs/login.md" }],
            preconditions: "用户已注册。",
            steps: ["打开登录页", "输入有效账号密码", "点击登录"],
            expectedResult: "系统跳转到首页并展示登录态。",
          },
        ],
        null,
        2
      )}\n`
    );

    const validation = await validateWorkflowArtifacts(workspace);

    expect(validation.errors.some((issue) => issue.code === "TESTPOINTS_UNREADABLE")).toBe(true);
    expect(validation.errors.some((issue) => issue.code === "UNKNOWN_TEST_POINT")).toBe(false);
  });

  it("warns when many cases have near-identical steps", async () => {
    const workspace = await createChangeWorkspace("duplicate-cases");
    await writeFile(
      join(workspace.specsDir, WORKFLOW_FILES.testpoints),
      [
        "# 测试点清单：duplicate-cases",
        "",
        "## 核心流程",
        "",
        "- [TP-001] 覆盖 REQ-001 登录 的主要成功路径。",
        "- [TP-002] 覆盖 REQ-002 注册 的主要成功路径。",
        "- [TP-003] 覆盖 REQ-003 退出 的主要成功路径。",
      ].join("\n")
    );
    await writeFile(
      join(workspace.artifactsDir, WORKFLOW_FILES.testcases),
      `${JSON.stringify(
        ["001", "002", "003"].map((id, index) => ({
          caseId: `TC-${id}`,
          title: `重复步骤用例 ${id}`,
          module: "账号",
          type: "正向",
          priority: "P1",
          requirementIds: [`REQ-${id}`],
          testPointIds: [`TP-${id}`],
          riskIds: [],
          sourceRefs: [{ document: "docs/account.md", section: `REQ-${id}` }],
          preconditions: "用户账号可用。",
          steps: ["打开账号页面", "输入有效数据", "点击提交"],
          expectedResult: `完成账号场景 ${index + 1} 并展示成功结果。`,
        })),
        null,
        2
      )}\n`
    );

    const validation = await validateWorkflowArtifacts(workspace);

    expect(validation.errors).toHaveLength(0);
    expect(validation.warnings.some((issue) => issue.code === "NEAR_DUPLICATE_CASES")).toBe(true);
  });
});

describe("reporting", () => {
  it("normalizes statuses and computes explicit metrics", () => {
    expect(normalizeExecutionStatus("pass")).toBe("通过");
    expect(normalizeExecutionStatus("failed")).toBe("失败");
    expect(normalizeExecutionStatus("blocked")).toBe("阻塞");
    expect(normalizeExecutionStatus("n/a")).toBe("不适用");
    expect(normalizeExecutionStatus("")).toBe("未执行");

    const stats = computeReportStats([
      {
        caseId: "1",
        title: "a",
        module: "登录",
        type: "正向",
        priority: "P0",
        executionResult: "通过",
      },
      {
        caseId: "2",
        title: "b",
        module: "登录",
        type: "负向",
        priority: "P1",
        executionResult: "失败",
      },
      {
        caseId: "3",
        title: "c",
        module: "支付",
        type: "异常",
        priority: "P1",
        executionResult: "阻塞",
      },
    ]);

    expect(stats.total).toBe(3);
    expect(stats.executed).toBe(2);
    expect(stats.passRate).toBe(0.5);
    expect(stats.blockedRate).toBe(1 / 3);
  });

  it("writes a report from Excel execution rows", async () => {
    const workspace = await createChangeWorkspace("login-v2");
    const workbookPath = join(workspace.artifactsDir, `login-v2${EXPORT_FILE_SUFFIXES.excelCases}`);
    await writeExcelWorkbook(
      workbookPath,
      [
        {
          caseId: "TC-001",
          title: "正常登录",
          module: "登录",
          type: "正向",
          priority: "P0",
          requirementIds: ["REQ-001"],
          testPointIds: ["TP-001"],
          riskIds: [],
          sourceRefs: [{ document: "docs/login.md", section: "登录", quote: "用户可以登录" }],
          preconditions: "已注册",
          testData: "username=user-a",
          steps: ["登录"],
          expectedResult: "登录成功",
          executionResult: "通过",
        },
      ],
      [
        {
          scenarioId: "PT-001",
          module: "登录",
          scenarioName: "登录性能测试",
          performanceType: "压力测试",
          requirementIds: ["REQ-001"],
          testPointIds: ["TP-001"],
          objective: "验证登录性能。",
          preconditions: "环境已准备。",
          testData: "待确认",
          concurrentUsers: "待确认",
          duration: "10min",
          steps: ["执行压测"],
          targetThroughput: "待确认",
          actualThroughput: "待执行后填写",
          avgResponseTime: "待执行后填写",
          p95ResponseTime: "待执行后填写",
          p99ResponseTime: "待执行后填写",
          errorRate: "待执行后填写",
          cpuPeak: "待执行后填写",
          memoryPeak: "待执行后填写",
          bottleneckAnalysis: "待执行后填写",
          executionResult: "失败",
          notes: "性能结果不计入功能报告。",
        },
      ]
    );

    const reportPath = await writeReport(workspace);
    const report = await readFile(reportPath, "utf8");

    expect(report).toContain("完成率 = 已执行 / 总数");
    expect(report).toContain("| 通过 | 1 |");
  });
});

describe("archive", () => {
  it("moves the change and writes a manifest", async () => {
    const workspace = await createChangeWorkspace("login-v2");
    await writeProposal(workspace, { requirement: "docs/login.md" });
    await writeFile(
      join(workspace.changeDir, WORKFLOW_FILES.report),
      "| 总用例数 | 1 |\n| 通过 | 1 |\n"
    );

    const archivePath = await archiveChange(workspace, { date: new Date("2026-06-04T00:00:00Z") });
    const manifest = JSON.parse(
      await readFile(join(archivePath, WORKFLOW_FILES.manifest), "utf8")
    ) as {
      name: string;
      requirement: string;
      artifacts: string[];
    };

    expect(
      archivePath.endsWith(
        join(
          WORKSPACE_CONFIG.root,
          WORKSPACE_CONFIG.changesDir,
          WORKSPACE_CONFIG.archiveDir,
          "2026-06-04-login-v2"
        )
      )
    ).toBe(true);
    expect(manifest.name).toBe("login-v2");
    expect(manifest.requirement).toBe("docs/login.md");
    expect(manifest.artifacts).toContain(WORKFLOW_FILES.proposal);
  });
});
