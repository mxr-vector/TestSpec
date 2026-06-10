/**
 * @fileoverview TestSpec 测试报告生成模块
 *
 * 该模块实现了测试执行报告的生成功能，包括：
 * 1. 从 Excel 工作簿读取执行结果
 * 2. 统计各种执行状态（通过、失败、阻塞、未执行、不适用）
 * 3. 计算各种指标（完成率、通过率、失败率、阻塞率）
 * 4. 按模块统计执行情况
 * 5. 生成 Markdown 格式的测试报告
 *
 * 报告包含：
 * - 执行摘要：总数、通过、失败、阻塞、未执行、不适用、已执行
 * - 统计口径：各种指标的计算公式说明
 * - 按模块统计：每个模块的执行情况
 * - 缺陷分布：说明缺陷明细的维护方式
 * - 风险与遗留问题：根据执行结果判断是否存在遗留风险
 * - 测试结论：根据执行结果给出结论
 *
 * 执行状态类型：
 * - 通过：测试用例执行成功
 * - 失败：测试用例执行失败
 * - 阻塞：测试用例因依赖问题无法执行
 * - 未执行：测试用例尚未执行
 * - 不适用：测试用例不适用于当前版本
 */

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { EXPORT_FILE_SUFFIXES, WORKFLOW_FILES } from "../core/config.js";
import { type ExecutionRow, readExecutionRows } from "./spreadsheet.js";
import type { ChangeWorkspace } from "./workspace.js";

/**
 * 执行状态类型
 *
 * @type ExecutionStatus
 * - "通过": 测试用例执行成功
 * - "失败": 测试用例执行失败
 * - "阻塞": 测试用例因依赖问题无法执行
 * - "未执行": 测试用例尚未执行
 * - "不适用": 测试用例不适用于当前版本
 */
export type ExecutionStatus = "通过" | "失败" | "阻塞" | "未执行" | "不适用";

/**
 * 报告统计接口
 *
 * @interface ReportStats
 * @property {number} total - 总用例数
 * @property {number} passed - 通过用例数
 * @property {number} failed - 失败用例数
 * @property {number} blocked - 阻塞用例数
 * @property {number} notRun - 未执行用例数
 * @property {number} notApplicable - 不适用用例数
 * @property {number} executed - 已执行用例数（通过 + 失败）
 * @property {number} completionRate - 完成率（已执行 / 总数）
 * @property {number} passRate - 通过率（通过 / 已执行）
 * @property {number} failureRate - 失败率（失败 / 已执行）
 * @property {number} blockedRate - 阻塞率（阻塞 / 总数）
 * @property {Record<string, Record<ExecutionStatus, number>>} byModule - 按模块统计
 */
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

/**
 * 生成测试执行报告
 *
 * 该函数负责：
 * 1. 从 Excel 工作簿读取执行结果
 * 2. 计算报告统计数据
 * 3. 生成 Markdown 格式的测试报告
 * 4. 写入到 report.md 文件
 *
 * @param {ChangeWorkspace} workspace - 测试变更工作区对象
 * @returns {Promise<string>} 生成的 report.md 文件路径
 *
 * @example
 * ```typescript
 * const reportPath = await writeReport(workspace);
 * console.log(`测试报告已生成: ${reportPath}`);
 * ```
 */
export async function writeReport(workspace: ChangeWorkspace): Promise<string> {
  // 从 Excel 工作簿读取执行结果
  const rows = await readRowsFromDefaultWorkbook(workspace);

  // 计算报告统计数据
  const stats = computeReportStats(rows);

  // 生成报告文件路径
  const outputPath = join(workspace.changeDir, WORKFLOW_FILES.report);

  // 生成并写入报告
  await writeFile(outputPath, renderReport(workspace.name, stats));

  return outputPath;
}

export async function readRowsFromDefaultWorkbook(
  workspace: ChangeWorkspace
): Promise<ExecutionRow[]> {
  const workbookPath = join(
    workspace.artifactsDir,
    `${workspace.name}${EXPORT_FILE_SUFFIXES.excelCases}`
  );

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
    const content = await readFile(join(workspaceDir, WORKFLOW_FILES.report), "utf8");
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
  const moduleRows = [...Object.entries(stats.byModule)]
    .sort(([a], [b]) => a.localeCompare(b))
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
