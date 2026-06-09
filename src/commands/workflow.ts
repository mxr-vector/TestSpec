/**
 * @fileoverview TestSpec 工作流命令模块
 * 
 * 该模块实现了 TestSpec 的核心工作流命令，包括：
 * - test:new: 创建测试提案工作区
 * - test:analysis: 生成需求分析文档
 * - test:points: 生成测试点清单
 * - test:validate: 验证工作流产物
 * - test:excel: 导出 Excel 测试用例
 * - test:mind: 导出思维导图测试用例
 * - test:report: 生成测试执行报告
 * - test:archive: 归档测试产物链
 * 
 * 这些命令按照推荐顺序执行，形成完整的测试设计工作流：
 * 需求文档 → 测试提案 → 需求分析 → 测试点 → 测试用例 → 导出/验证 → 报告 → 归档
 */

import { join } from "node:path";
import type { Command } from "commander";
import { TestSpecError } from "../core/errors.js";
import { logInfo, logSuccess } from "../core/logger.js";
import { archiveChange } from "../workflow/archive.js";
import {
  writeProposal,
  writeRequirementsAnalysis,
  writeTestPoints,
} from "../workflow/artifacts.js";
import { writeXmind } from "../workflow/mind.js";
import { readOrGeneratePerformanceCases } from "../workflow/performance.js";
import { writeReport } from "../workflow/report.js";
import { writeExcelWorkbook } from "../workflow/spreadsheet.js";
import { readOrGenerateStructuredCases } from "../workflow/testcases.js";
import { formatValidationResult, validateWorkflowArtifacts } from "../workflow/validation.js";
import { createChangeWorkspace, resolveChangeWorkspace } from "../workflow/workspace.js";

/**
 * 工作流描述常量，用于 CLI 帮助信息显示
 * 列出所有可用的工作流标签
 */
const WORKFLOW_DESCRIPTION =
  "Workflow labels: test:new, test:analysis, test:points, test:validate, test:excel, test:mind, test:report, test:archive.";

/**
 * 注册所有工作流命令到 Commander.js 程序实例
 * 
 * 该函数将以下命令注册到 CLI 程序中：
 * 1. new - 创建测试提案工作区（test:new）
 * 2. analysis - 生成需求分析文档（test:analysis）
 * 3. points - 生成测试点清单（test:points）
 * 4. validate - 验证工作流产物（test:validate）
 * 5. excel - 导出 Excel 测试用例（test:excel）
 * 6. mind - 导出思维导图测试用例（test:mind）
 * 7. report - 生成测试执行报告（test:report）
 * 8. archive - 归档测试产物链（test:archive）
 * 
 * @param {Command} program - Commander.js 程序实例
 * 
 * @example
 * ```bash
 * # 创建测试提案
 * testspec new my-feature --requirement ./docs/requirements.md
 * 
 * # 生成需求分析
 * testspec analysis my-feature
 * 
 * # 生成测试点
 * testspec points my-feature
 * 
 * # 验证产物
 * testspec validate my-feature
 * 
 * # 导出 Excel
 * testspec excel my-feature
 * 
 * # 导出思维导图
 * testspec mind my-feature
 * 
 * # 生成报告
 * testspec report my-feature
 * 
 * # 归档
 * testspec archive my-feature
 * ```
 */
export function registerWorkflowCommands(program: Command): void {
  // 在帮助信息末尾添加工作流描述
  program.addHelpText("after", `\n${WORKFLOW_DESCRIPTION}\n`);

  /**
   * 创建测试提案工作区命令（test:new）
   * 
   * 该命令负责：
   * 1. 创建测试变更目录结构（testspec/changes/<name>/）
   * 2. 生成 proposal.md 测试提案文件
   * 3. 创建 specs/ 和 artifacts/ 子目录
   * 
   * @param {string} name - 测试变更名称，将被规范化为小写、连字符分隔的格式
   * @param {string} [options.requirement] - 需求文档路径或 URL
   * @param {string} [options.object] - 被测对象名称
   * @param {boolean} [options.force] - 是否强制覆盖已有工作区
   */
  program
    .command("new")
    .description("Create a test proposal workspace (test:new)")
    .argument("<name>", "test change name")
    .option("-r, --requirement <path>", "requirement document path or URL")
    .option("-o, --object <name>", "tested object name")
    .option("-f, --force", "overwrite existing workspace")
    .action(
      async (name: string, options: { requirement?: string; object?: string; force?: boolean }) => {
        // 创建测试变更工作区
        const workspace = await createChangeWorkspace(name, { force: options.force === true });

        // 构建提案选项
        const proposalOptions: { requirement?: string; testedObject?: string } = {};
        if (options.requirement) {
          proposalOptions.requirement = options.requirement;
        }
        if (options.object) {
          proposalOptions.testedObject = options.object;
        }

        // 生成 proposal.md 文件
        const proposalPath = await writeProposal(workspace, proposalOptions);
        logSuccess(`Created test change ${workspace.name}: ${proposalPath}`);
      }
    );

  /**
   * 生成需求分析文档命令（test:analysis）
   * 
   * 该命令负责：
   * 1. 读取测试提案（proposal.md）和关联的需求文档
   * 2. 生成结构化的需求分析文档（requirements-analysis.md）
   * 3. 包含需求摘要、功能点拆解、业务规则、风险点等
   * 
   * @param {string} [name] - 测试变更名称，如果不指定则自动检测唯一的工作区
   */
  program
    .command("analysis")
    .description("Create requirement analysis for a test change (test:analysis)")
    .argument("[name]", "test change name")
    .action(async (name?: string) => {
      // 解析工作区（如果未指定名称，自动检测唯一的工作区）
      const workspace = await resolveChangeWorkspace(name);

      // 生成需求分析文档
      const outputPath = await writeRequirementsAnalysis(workspace);
      logSuccess(`Created requirement analysis: ${outputPath}`);
    });

  /**
   * 生成测试点清单命令（test:points）
   * 
   * 该命令负责：
   * 1. 读取测试提案和需求分析文档
   * 2. 生成可追溯的测试点清单（specs/testpoints.md）
   * 3. 包含核心流程、负向场景、边界场景、异常场景、权限/安全场景
   * 4. 每个测试点都有稳定的 TP-xxx ID 和关联的 REQ-xxx ID
   * 
   * @param {string} [name] - 测试变更名称，如果不指定则自动检测唯一的工作区
   */
  program
    .command("points")
    .description("Create core scenario test points (test:points)")
    .argument("[name]", "test change name")
    .action(async (name?: string) => {
      // 解析工作区
      const workspace = await resolveChangeWorkspace(name);

      // 生成测试点清单
      const outputPath = await writeTestPoints(workspace);
      logSuccess(`Created test points: ${outputPath}`);
    });

  /**
   * 验证工作流产物命令（test:validate）
   * 
   * 该命令负责：
   * 1. 验证测试点清单（specs/testpoints.md）的可读性和格式
   * 2. 验证测试用例（artifacts/testcases.json）的 schema 和质量
   * 3. 检查必需字段是否存在且非空
   * 4. 检查步骤是否过于模板化
   * 5. 检查预期结果是否过于模糊
   * 6. 检查是否存在重复用例
   * 
   * 验证结果分为错误（阻塞）和警告（审查项）两类。
   * 如果存在错误，命令会抛出异常并阻止后续导出操作。
   * 
   * @param {string} [name] - 测试变更名称，如果不指定则自动检测唯一的工作区
   */
  program
    .command("validate")
    .description("Validate generated workflow artifacts (test:validate)")
    .argument("[name]", "test change name")
    .action(async (name?: string) => {
      // 解析工作区
      const workspace = await resolveChangeWorkspace(name);

      // 执行验证
      const result = await validateWorkflowArtifacts(workspace);
      logInfo(formatValidationResult(result));

      // 如果存在错误，抛出异常阻止后续操作
      if (result.errors.length > 0) {
        throw new TestSpecError(
          `Validation failed with ${result.errors.length} error(s) and ${result.warnings.length} warning(s).`
        );
      }

      logSuccess(
        `Validated workflow artifacts for ${workspace.name} with ${result.warnings.length} warning(s).`
      );
    });

  /**
   * 导出 Excel 测试用例命令（test:excel）
   * 
   * 该命令负责：
   * 1. 读取或生成结构化测试用例（artifacts/testcases.json）
   * 2. 验证工作流产物（如果有错误则阻止导出）
   * 3. 读取或生成性能测试用例（artifacts/performance-cases.json）
   * 4. 生成 Excel 工作簿（artifacts/<name>_cases.xlsx）
   * 5. 包含功能测试和性能测试两个工作表
   * 
   * Excel 工作簿格式：
   * - 功能测试表：功能模块、用例名称、用例类型、前置条件、测试步骤、预期结果、优先级、执行结果
   * - 性能测试表：业务模块、场景名称、性能测试类型、测试目标、前置条件、并发用户数、持续时间、压测步骤、目标TPS/QPS、实际TPS/QPS、平均响应时间、P95响应时间、错误率、执行结果
   * 
   * @param {string} [name] - 测试变更名称，如果不指定则自动检测唯一的工作区
   */
  program
    .command("excel")
    .description("Export executable Excel test cases (test:excel)")
    .argument("[name]", "test change name")
    .action(async (name?: string) => {
      // 解析工作区
      const workspace = await resolveChangeWorkspace(name);

      // 读取或生成结构化测试用例
      const cases = await readOrGenerateStructuredCases(workspace);

      // 验证工作流产物
      const validation = await validateWorkflowArtifacts(workspace);
      if (validation.errors.length > 0) {
        logInfo(formatValidationResult(validation));
        throw new TestSpecError("Cannot export Excel because workflow artifact validation failed.");
      }

      // 读取或生成性能测试用例
      const performanceCases = await readOrGeneratePerformanceCases(workspace);

      // 生成 Excel 工作簿
      const outputPath = join(workspace.artifactsDir, `${workspace.name}_cases.xlsx`);
      await writeExcelWorkbook(outputPath, cases, performanceCases);
      logSuccess(`Exported Excel test cases: ${outputPath}`);
    });

  /**
   * 导出思维导图测试用例命令（test:mind）
   * 
   * 该命令负责：
   * 1. 读取或生成结构化测试用例（artifacts/testcases.json）
   * 2. 验证工作流产物（如果有错误则阻止导出）
   * 3. 生成 XMind 格式的思维导图文件（artifacts/<name>_cases.xmind）
   * 4. 思维导图结构：模块 → 用例类型 → 具体用例（包含优先级和预期结果）
   * 
   * 思维导图可用于：
   * - 测试用例评审
   * - 测试覆盖范围可视化
   * - 与团队分享测试设计
   * 
   * @param {string} [name] - 测试变更名称，如果不指定则自动检测唯一的工作区
   */
  program
    .command("mind")
    .description("Export XMind-style test cases for review (test:mind)")
    .argument("[name]", "test change name")
    .action(async (name?: string) => {
      // 解析工作区
      const workspace = await resolveChangeWorkspace(name);

      // 读取或生成结构化测试用例
      const cases = await readOrGenerateStructuredCases(workspace);

      // 验证工作流产物
      const validation = await validateWorkflowArtifacts(workspace);
      if (validation.errors.length > 0) {
        logInfo(formatValidationResult(validation));
        throw new TestSpecError(
          "Cannot export mind map because workflow artifact validation failed."
        );
      }

      // 生成 XMind 思维导图文件
      const outputPath = join(workspace.artifactsDir, `${workspace.name}_cases.xmind`);
      await writeXmind(outputPath, `${workspace.name} 测试用例`, cases);
      logSuccess(`Exported mind-map test cases: ${outputPath}`);
    });

  /**
   * 生成测试执行报告命令（test:report）
   * 
   * 该命令负责：
   * 1. 读取 Excel 工作簿中的执行结果（artifacts/<name>_cases.xlsx）
   * 2. 统计执行状态（通过、失败、阻塞、未执行、不适用）
   * 3. 计算各种指标（完成率、通过率、失败率、阻塞率）
   * 4. 按模块统计执行情况
   * 5. 生成 Markdown 格式的测试报告（report.md）
   * 
   * 报告包含：
   * - 执行摘要（总数、通过、失败、阻塞等）
   * - 统计口径说明
   * - 按模块统计
   * - 缺陷分布说明
   * - 风险与遗留问题
   * - 测试结论
   * 
   * @param {string} [name] - 测试变更名称，如果不指定则自动检测唯一的工作区
   */
  program
    .command("report")
    .description("Generate a test execution report from Excel results (test:report)")
    .argument("[name]", "test change name")
    .action(async (name?: string) => {
      // 解析工作区
      const workspace = await resolveChangeWorkspace(name);

      // 生成测试报告
      const outputPath = await writeReport(workspace);
      logSuccess(`Generated test report: ${outputPath}`);
    });

  /**
   * 归档测试产物链命令（test:archive）
   * 
   * 该命令负责：
   * 1. 生成 manifest.json 清单文件，包含：
   *    - 测试变更名称
   *    - 归档时间
   *    - 关联需求文档
   *    - 所有产物文件列表
   *    - 报告摘要统计
   * 2. 将整个测试变更目录移动到归档目录（testspec/changes/archive/<date>-<name>/）
   * 3. 如果跨文件系统，使用复制+删除的方式
   * 
   * 归档后的目录结构：
   * testspec/changes/archive/
   *   └── 2026-06-09-my-feature/
   *       ├── manifest.json
   *       ├── proposal.md
   *       ├── requirements-analysis.md
   *       ├── specs/
   *       │   └── testpoints.md
   *       ├── artifacts/
   *       │   ├── testcases.json
   *       │   ├── performance-cases.json
   *       │   ├── my-feature_cases.xlsx
   *       │   └── my-feature_cases.xmind
   *       └── report.md
   * 
   * @param {string} [name] - 测试变更名称，如果不指定则自动检测唯一的工作区
   */
  program
    .command("archive")
    .description("Archive the full test artifact chain (test:archive)")
    .argument("[name]", "test change name")
    .action(async (name?: string) => {
      // 解析工作区
      const workspace = await resolveChangeWorkspace(name);

      // 执行归档操作
      const outputPath = await archiveChange(workspace);
      logSuccess(`Archived test change: ${outputPath}`);
    });
}

/**
 * 验证工作流前置条件
 * 
 * 该函数用于在执行工作流命令前验证前置条件是否满足。
 * 如果条件不满足，抛出 TestSpecError 异常。
 * 
 * @param {boolean} condition - 要验证的条件
 * @param {string} message - 条件不满足时的错误信息
 * @throws {TestSpecError} 当条件为 false 时抛出异常
 * 
 * @example
 * ```typescript
 * ensureWorkflowPreconditions(
 *   workspace !== null,
 *   '工作区不存在，请先运行 testspec new <name>'
 * );
 * ```
 */
export function ensureWorkflowPreconditions(condition: boolean, message: string): void {
  if (!condition) {
    throw new TestSpecError(message);
  }
}
