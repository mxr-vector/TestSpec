import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type ExecutionRow, readExecutionRows } from "./spreadsheet.js";
import type { ChangeWorkspace } from "./workspace.js";

export type ExecutionStatus = "通过" | "失败" | "阻塞" | "未执行" | "不适用";

export interface ReportStats {
  total: number;
  passed: number;
  failed: number;
  blocked: number;
  notRun: number;
  notApplicable: number;
  executed: number;
  completionRate: number;
  passRate: number;
  failureRate: number;
  blockedRate: number;
  byModule: Record<string, Record<ExecutionStatus, number>>;
}

export async function writeReport(workspace: ChangeWorkspace): Promise<string> {
  const rows = await readRowsFromDefaultWorkbook(workspace);
  const stats = computeReportStats(rows);
  const outputPath = join(workspace.changeDir, "report.md");

  await writeFile(outputPath, renderReport(workspace.name, stats));

  return outputPath;
}

export async function readRowsFromDefaultWorkbook(
  workspace: ChangeWorkspace
): Promise<ExecutionRow[]> {
  const workbookPath = join(workspace.artifactsDir, `${workspace.name}_cases.xlsx`);

  try {
    return await readExecutionRows(workbookPath);
  } catch {
    return [];
  }
}

export function normalizeExecutionStatus(input: string | undefined): ExecutionStatus {
  const value = input?.trim().toLowerCase() ?? "";

  if (["通过", "pass", "passed", "success", "ok", "成功"].includes(value)) {
    return "通过";
  }
  if (["失败", "fail", "failed", "failure", "ng", "不通过"].includes(value)) {
    return "失败";
  }
  if (["阻塞", "blocked", "block"].includes(value)) {
    return "阻塞";
  }
  if (["不适用", "na", "n/a", "not applicable", "skip", "skipped"].includes(value)) {
    return "不适用";
  }
  return "未执行";
}

export function computeReportStats(rows: ExecutionRow[]): ReportStats {
  const stats: ReportStats = {
    total: rows.length,
    passed: 0,
    failed: 0,
    blocked: 0,
    notRun: 0,
    notApplicable: 0,
    executed: 0,
    completionRate: 0,
    passRate: 0,
    failureRate: 0,
    blockedRate: 0,
    byModule: {},
  };

  for (const row of rows) {
    const status = normalizeExecutionStatus(row.executionResult);
    const moduleName = row.module || "未分类";
    stats.byModule[moduleName] ??= emptyStatusCounts();
    stats.byModule[moduleName][status] += 1;

    switch (status) {
      case "通过":
        stats.passed += 1;
        break;
      case "失败":
        stats.failed += 1;
        break;
      case "阻塞":
        stats.blocked += 1;
        break;
      case "不适用":
        stats.notApplicable += 1;
        break;
      case "未执行":
        stats.notRun += 1;
        break;
    }
  }

  stats.executed = stats.passed + stats.failed;
  stats.completionRate = ratio(stats.executed, stats.total);
  stats.passRate = ratio(stats.passed, stats.executed);
  stats.failureRate = ratio(stats.failed, stats.executed);
  stats.blockedRate = ratio(stats.blocked, stats.total);

  return stats;
}

export async function readReportSummary(workspaceDir: string): Promise<Partial<ReportStats>> {
  try {
    const content = await readFile(join(workspaceDir, "report.md"), "utf8");
    const total = Number(/\| 总用例数 \| (\d+) \|/.exec(content)?.[1] ?? 0);
    const passed = Number(/\| 通过 \| (\d+) \|/.exec(content)?.[1] ?? 0);
    const failed = Number(/\| 失败 \| (\d+) \|/.exec(content)?.[1] ?? 0);
    const blocked = Number(/\| 阻塞 \| (\d+) \|/.exec(content)?.[1] ?? 0);

    return { total, passed, failed, blocked };
  } catch {
    return {};
  }
}

function renderReport(name: string, stats: ReportStats): string {
  const moduleRows = Object.entries(stats.byModule)
    .map(([moduleName, counts]) =>
      [moduleName, counts.通过, counts.失败, counts.阻塞, counts.未执行, counts.不适用].join(" | ")
    )
    .map((row) => `| ${row} |`)
    .join("\n");

  return [
    `# 测试报告：${name}`,
    "",
    "## 执行摘要",
    "",
    "| 指标 | 数值 |",
    "|---|---|",
    `| 总用例数 | ${stats.total} |`,
    `| 通过 | ${stats.passed} |`,
    `| 失败 | ${stats.failed} |`,
    `| 阻塞 | ${stats.blocked} |`,
    `| 未执行 | ${stats.notRun} |`,
    `| 不适用 | ${stats.notApplicable} |`,
    `| 已执行 | ${stats.executed} |`,
    `| 完成率 | ${formatPercent(stats.completionRate)} |`,
    `| 通过率 | ${formatPercent(stats.passRate)} |`,
    `| 失败率 | ${formatPercent(stats.failureRate)} |`,
    `| 阻塞率 | ${formatPercent(stats.blockedRate)} |`,
    "",
    "## 统计口径",
    "",
    "- 总数 = 全部用例",
    "- 已执行 = 通过 + 失败",
    "- 完成率 = 已执行 / 总数",
    "- 通过率 = 通过 / 已执行",
    "- 失败率 = 失败 / 已执行",
    "- 阻塞率 = 阻塞 / 总数",
    "",
    "## 按模块统计",
    "",
    "| 模块 | 通过 | 失败 | 阻塞 | 未执行 | 不适用 |",
    "|---|---:|---:|---:|---:|---:|",
    moduleRows || "| 暂无数据 | 0 | 0 | 0 | 0 | 0 |",
    "",
    "## 缺陷分布",
    "",
    "- 默认精简 Excel 不再导出缺陷编号；如需缺陷明细，请在外部缺陷系统或专项记录中维护。",
    "",
    "## 风险与遗留问题",
    "",
    stats.failed > 0 || stats.blocked > 0 || stats.notRun > 0
      ? "- 存在失败、阻塞或未执行用例，建议完成原因分析后再发布。"
      : "- 当前执行结果未发现显著遗留风险。",
    "",
    "## 测试结论",
    "",
    stats.failed === 0 && stats.blocked === 0
      ? "本轮测试未发现失败或阻塞用例。"
      : "本轮测试存在失败或阻塞用例，需修复或确认风险后继续。",
    "",
  ].join("\n");
}

function emptyStatusCounts(): Record<ExecutionStatus, number> {
  return {
    通过: 0,
    失败: 0,
    阻塞: 0,
    未执行: 0,
    不适用: 0,
  };
}

function ratio(numerator: number, denominator: number): number {
  if (denominator === 0) {
    return 0;
  }
  return numerator / denominator;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
