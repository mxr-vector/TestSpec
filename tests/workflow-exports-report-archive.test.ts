import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  it("generates traceable performance cases from keyword rules", async () => {
    const workspace = await createChangeWorkspace("checkout-v2");
    await writeFile(
      join(workspace.specsDir, "testpoints.md"),
      [
        "# 测试点清单：checkout-v2",
        "",
        "## 核心流程",
        "",
        "- [TP-001] 覆盖 REQ-001 商品搜索 的主要成功路径。",
        "- [TP-002] 覆盖 REQ-002 提交订单 的主要成功路径。",
        "- [TP-003] 覆盖 REQ-003 批量导出报表 的主要成功路径。",
        "- [TP-004] 覆盖 REQ-004 第三方支付渠道回调 的主要成功路径。",
        "- [TP-005] 覆盖 REQ-005 登录 的主要成功路径。",
        "- [TP-006] 覆盖 REQ-006 消息队列同步 的主要成功路径。",
      ].join("\n")
    );

    const cases = await generatePerformanceCases(workspace);
    const artifactPath = join(workspace.artifactsDir, "performance-cases.json");
    const persistedCases = JSON.parse(await readFile(artifactPath, "utf8")) as typeof cases;

    expect(cases).toHaveLength(5);
    expect(persistedCases).toHaveLength(5);
    expect(persistedCases[0]).toMatchObject({ scenarioId: "PT-001", testPointIds: ["TP-001"] });
    expect(cases[0]).toMatchObject({
      scenarioId: "PT-001",
      performanceType: "负载测试",
      requirementIds: ["REQ-001"],
      testPointIds: ["TP-001"],
      concurrentUsers: "待确认",
      actualThroughput: "待执行后填写",
      executionResult: "未执行",
    });
    expect(cases[0]?.performanceType).toBe("负载测试");
    expect(cases[1]?.performanceType).toBe("压力测试");
    expect(cases[2]?.performanceType).toBe("容量测试");
    expect(cases[3]?.performanceType).toBe("稳定性测试");
  });

  it("refreshes performance cases when source context changes", async () => {
    const workspace = await createChangeWorkspace("search-v2");
    await writeFile(
      join(workspace.specsDir, "testpoints.md"),
      [
        "# 测试点清单：search-v2",
        "",
        "## 核心流程",
        "",
        "- [TP-001] 覆盖 REQ-001 搜索 的主要成功路径。",
      ].join("\n")
    );
    await generatePerformanceCases(workspace);
    await writeFile(
      join(workspace.specsDir, "testpoints.md"),
      [
        "# 测试点清单：search-v2",
        "",
        "## 核心流程",
        "",
        "- [TP-001] 覆盖 REQ-001 批量导出 的主要成功路径。",
      ].join("\n")
    );

    const cases = await readOrGeneratePerformanceCases(workspace);

    expect(cases[0]?.scenarioName).toContain("容量稳定性测试");
  });
});

describe("structured cases and exports", () => {
  it("generates structured cases and an Excel workbook", async () => {
    const workspace = await createChangeWorkspace("login-v2");
    await writeTestPoints(workspace);

    const cases = await generateStructuredCases(workspace);
    const performanceCases = await generatePerformanceCases(workspace);
    const workbookPath = join(workspace.artifactsDir, "login-v2_cases.xlsx");
    await writeExcelWorkbook(workbookPath, cases, performanceCases);
    const rows = await readExecutionRows(workbookPath);
    const workbook = unzipSync(await readFile(workbookPath));
    const workbookXml = strFromU8(workbookEntry(workbook, "xl/workbook.xml"));
    const relationshipsXml = strFromU8(workbookEntry(workbook, "xl/_rels/workbook.xml.rels"));
    const contentTypesXml = strFromU8(workbookEntry(workbook, "[Content_Types].xml"));
    const functionalSheetXml = strFromU8(workbookEntry(workbook, "xl/worksheets/sheet1.xml"));
    const performanceSheetXml = strFromU8(workbookEntry(workbook, "xl/worksheets/sheet2.xml"));

    expect(cases[0]).toMatchObject({ caseId: "TC-001", testPointIds: ["TP-001"] });
    expect(rows[0]).toMatchObject({ caseId: "TC-001", executionResult: "未执行" });
    expect(workbookXml).toContain('name="功能测试"');
    expect(workbookXml).toContain('name="性能测试"');
    expect(relationshipsXml).toContain('Target="worksheets/sheet1.xml"');
    expect(relationshipsXml).toContain('Target="worksheets/sheet2.xml"');
    expect(contentTypesXml).toContain("/xl/worksheets/sheet2.xml");
    expect(functionalSheetXml).toContain("需求编号");
    expect(functionalSheetXml).toContain("测试点编号");
    expect(functionalSheetXml).toContain("REQ-001");
    expect(functionalSheetXml).toContain("TP-001");
    expect(functionalSheetXml).toContain("实际结果");
    expect(performanceSheetXml).toContain("场景编号");
    expect(performanceSheetXml).toContain("P95响应时间(ms)");
  });

  it("omits the performance sheet when there are no performance cases", async () => {
    const workspace = await createChangeWorkspace("functional-only");
    const workbookPath = join(workspace.artifactsDir, "functional-only_cases.xlsx");
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

  it("preserves existing structured cases when test points change", async () => {
    const workspace = await createChangeWorkspace("login-v2");
    await writeTestPoints(workspace);
    await generateStructuredCases(workspace);
    await writeFile(
      join(workspace.specsDir, "testpoints.md"),
      ["# 测试点清单：login-v2", "", "## 核心流程", "", "- [TP-001] 新成功路径。"].join("\n")
    );

    const cases = await readOrGenerateStructuredCases(workspace);

    expect(cases[0]).not.toMatchObject({ title: "新成功路径。" });
    expect(cases[0]?.notes).toContain("CLI fallback/template case");
  });
});

describe("validation", () => {
  it("passes valid agent-generated cases and preserves them for exports", async () => {
    const workspace = await createChangeWorkspace("agent-login");
    await writeFile(
      join(workspace.specsDir, "testpoints.md"),
      [
        "# 测试点清单：agent-login",
        "",
        "## 核心流程",
        "",
        "- [TP-001] 覆盖 REQ-001 用户密码登录 的主要成功路径。 来源：docs/login.md §2.1",
      ].join("\n")
    );
    await writeFile(
      join(workspace.artifactsDir, "testcases.json"),
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
    const workbookPath = join(workspace.artifactsDir, "agent-login_cases.xlsx");
    await writeExcelWorkbook(workbookPath, cases, []);
    const workbook = unzipSync(await readFile(workbookPath));
    const functionalSheetXml = strFromU8(workbookEntry(workbook, "xl/worksheets/sheet1.xml"));

    expect(validation.errors).toHaveLength(0);
    expect(formatValidationResult(validation)).toContain("Validation errors: 0");
    expect(cases[0]?.title).toBe("有效账号密码登录成功");
    expect(functionalSheetXml).toContain("username=user-a; password=ValidPass123");
    expect(functionalSheetXml).toContain("source checked");
  });

  it("reports schema, traceability, and quality validation issues", async () => {
    const workspace = await createChangeWorkspace("bad-cases");
    await writeFile(
      join(workspace.specsDir, "testpoints.md"),
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
      join(workspace.artifactsDir, "testcases.json"),
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
            caseId: "TC-002",
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

    expect(validation.errors.some((issue) => issue.code === "MISSING_FIELD")).toBe(false);
    expect(validation.errors.some((issue) => issue.code === "UNKNOWN_TEST_POINT")).toBe(true);
    expect(validation.warnings.some((issue) => issue.code === "MISSING_SOURCE_REFS")).toBe(true);
    expect(validation.warnings.some((issue) => issue.code === "UNKNOWN_REQUIREMENT")).toBe(true);
    expect(validation.warnings.some((issue) => issue.code === "GENERIC_STEPS")).toBe(true);
    expect(validation.warnings.some((issue) => issue.code === "VAGUE_EXPECTED_RESULT")).toBe(true);
    expect(output).toContain("Validation errors:");
    expect(output).toContain("Validation warnings:");
  });

  it("warns when all cases link only to REQ-001 despite multiple requirements", async () => {
    const workspace = await createChangeWorkspace("req001-only");
    await writeFile(
      join(workspace.specsDir, "testpoints.md"),
      [
        "# 测试点清单：req001-only",
        "",
        "## 核心流程",
        "",
        "- [TP-001] 覆盖 REQ-001 登录 的主要成功路径。",
        "- [TP-002] 覆盖 REQ-002 注册 的主要成功路径。",
      ].join("\n")
    );
    await writeFile(
      join(workspace.artifactsDir, "testcases.json"),
      `${JSON.stringify(
        ["001", "002"].map((id) => ({
          caseId: `TC-${id}`,
          title: `账号用例 ${id}`,
          module: "账号",
          type: "正向",
          priority: "P1",
          requirementIds: ["REQ-001"],
          testPointIds: [`TP-${id}`],
          riskIds: [],
          sourceRefs: [{ document: "docs/account.md", section: `TP-${id}` }],
          preconditions: "用户账号可用。",
          steps: ["打开账号页面", "输入有效数据", `点击提交 ${id}`],
          expectedResult: `完成账号场景 ${id} 并展示成功结果。`,
        })),
        null,
        2
      )}\n`
    );

    const validation = await validateWorkflowArtifacts(workspace);

    expect(validation.errors).toHaveLength(0);
    expect(validation.warnings.some((issue) => issue.code === "SUSPICIOUS_REQ001_ONLY")).toBe(true);
  });

  it("does not cascade unknown test point errors when testpoints are unreadable", async () => {
    const workspace = await createChangeWorkspace("missing-testpoints");
    await writeFile(
      join(workspace.artifactsDir, "testcases.json"),
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
      join(workspace.specsDir, "testpoints.md"),
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
      join(workspace.artifactsDir, "testcases.json"),
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
    const workbookPath = join(workspace.artifactsDir, "login-v2_cases.xlsx");
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
    await writeFile(join(workspace.changeDir, "report.md"), "| 总用例数 | 1 |\n| 通过 | 1 |\n");

    const archivePath = await archiveChange(workspace, { date: new Date("2026-06-04T00:00:00Z") });
    const manifest = JSON.parse(await readFile(join(archivePath, "manifest.json"), "utf8")) as {
      name: string;
      requirement: string;
      artifacts: string[];
    };

    expect(
      archivePath.endsWith(join("testspec", "changes", "archive", "2026-06-04-login-v2"))
    ).toBe(true);
    expect(manifest.name).toBe("login-v2");
    expect(manifest.requirement).toBe("docs/login.md");
    expect(manifest.artifacts).toContain("proposal.md");
  });
});
