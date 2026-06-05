import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { archiveChange } from "../src/workflow/archive.js";
import { writeProposal, writeTestPoints } from "../src/workflow/artifacts.js";
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
import { createChangeWorkspace } from "../src/workflow/workspace.js";

let originalCwd: string;
let tempDir: string;

beforeEach(async () => {
  originalCwd = process.cwd();
  tempDir = await mkdtemp(join(tmpdir(), "testpilot-"));
  process.chdir(tempDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  vi.restoreAllMocks();
});

describe("structured cases and exports", () => {
  it("generates structured cases and an Excel workbook", async () => {
    const workspace = await createChangeWorkspace("login-v2");
    await writeTestPoints(workspace);

    const cases = await generateStructuredCases(workspace);
    const workbookPath = join(workspace.artifactsDir, "login-v2_cases.xlsx");
    await writeExcelWorkbook(workbookPath, cases);
    const rows = await readExecutionRows(workbookPath);

    expect(cases[0]).toMatchObject({ caseId: "TC-001", testPointIds: ["TP-001"] });
    expect(rows[0]).toMatchObject({ caseId: "TC-001", executionResult: "未执行" });
  });

  it("refreshes structured cases when test points change", async () => {
    const workspace = await createChangeWorkspace("login-v2");
    await writeTestPoints(workspace);
    await generateStructuredCases(workspace);
    await writeFile(
      join(workspace.specsDir, "testpoints.md"),
      ["# 测试点清单：login-v2", "", "## 核心流程", "", "- [TP-001] 新成功路径。"].join("\n")
    );

    const cases = await readOrGenerateStructuredCases(workspace);

    expect(cases[0]).toMatchObject({ title: "新成功路径。" });
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
    await writeExcelWorkbook(workbookPath, [
      {
        caseId: "TC-001",
        title: "正常登录",
        module: "登录",
        type: "正向",
        priority: "P0",
        requirementIds: ["REQ-001"],
        testPointIds: ["TP-001"],
        riskIds: [],
        preconditions: "已注册",
        steps: ["登录"],
        expectedResult: "登录成功",
        executionResult: "通过",
      },
    ]);

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
      archivePath.endsWith(join("testpilot", "changes", "archive", "2026-06-04-login-v2"))
    ).toBe(true);
    expect(manifest.name).toBe("login-v2");
    expect(manifest.requirement).toBe("docs/login.md");
    expect(manifest.artifacts).toContain("proposal.md");
  });
});
