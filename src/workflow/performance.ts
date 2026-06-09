/**
 * @fileoverview TestSpec 性能测试用例生成模块
 * 
 * 该模块实现了性能测试用例的自动生成功能，包括：
 * 1. 从测试点中推断性能测试场景
 * 2. 根据场景类型生成对应的性能测试配置
 * 3. 支持多种性能测试类型：负载测试、压力测试、容量测试、稳定性测试
 * 4. 自动生成性能测试用例 JSON 文件
 * 
 * 性能测试类型：
 * - 负载测试（query/core）：验证查询和核心链路在目标并发下的响应时间、吞吐量和错误率
 * - 压力测试（transaction）：验证事务操作在逐步加压下的吞吐上限和事务成功率
 * - 容量测试（batch）：验证批量操作在指定数据规模下的处理耗时和资源消耗
 * - 稳定性测试（dependency）：验证依赖服务波动时的响应时间、失败率和降级行为
 * 
 * 推断规则：
 * - 基于测试点标题和章节关键词进行分类
 * - 核心流程测试点优先级最高
 * - 最多生成 5 个性能测试用例
 */

import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChangeWorkspace } from "./workspace.js";

/** 最大性能测试用例数量 */
const MAX_PERFORMANCE_CASES = 5;

/** 未知目标占位符 */
const UNKNOWN_TARGET = "待确认";

/** 待填写指标占位符 */
const PENDING_METRIC = "待执行后填写";

/**
 * 性能测试用例接口
 * 
 * @interface PerformanceCase
 * @property {string} module - 业务模块名称
 * @property {string} scenarioName - 性能测试场景名称
 * @property {string} performanceType - 性能测试类型（负载测试、压力测试、容量测试、稳定性测试）
 * @property {string} objective - 测试目标描述
 * @property {string} preconditions - 前置条件
 * @property {string} concurrentUsers - 并发用户数
 * @property {string} duration - 持续时间
 * @property {string[]} steps - 压测步骤
 * @property {string} targetThroughput - 目标 TPS/QPS
 * @property {string} actualThroughput - 实际 TPS/QPS
 * @property {string} avgResponseTime - 平均响应时间（ms）
 * @property {string} p95ResponseTime - P95 响应时间（ms）
 * @property {string} errorRate - 错误率（%）
 * @property {string} [scenarioId] - 场景 ID（可选）
 * @property {string[]} [requirementIds] - 关联需求 ID 列表（可选）
 * @property {string[]} [testPointIds] - 关联测试点 ID 列表（可选）
 * @property {string} [testData] - 测试数据说明（可选）
 * @property {string} [p99ResponseTime] - P99 响应时间（ms，可选）
 * @property {string} [cpuPeak] - CPU 峰值（%，可选）
 * @property {string} [memoryPeak] - 内存峰值（MB，可选）
 * @property {string} [bottleneckAnalysis] - 瓶颈分析（可选）
 * @property {string} [executionResult] - 执行结果（可选）
 * @property {string} [notes] - 备注（可选）
 */
export interface PerformanceCase {
  module: string;
  scenarioName: string;
  performanceType: string;
  objective: string;
  preconditions: string;
  concurrentUsers: string;
  duration: string;
  steps: string[];
  targetThroughput: string;
  actualThroughput: string;
  avgResponseTime: string;
  p95ResponseTime: string;
  errorRate: string;
  scenarioId?: string;
  requirementIds?: string[];
  testPointIds?: string[];
  testData?: string;
  p99ResponseTime?: string;
  cpuPeak?: string;
  memoryPeak?: string;
  bottleneckAnalysis?: string;
  executionResult?: string;
  notes?: string;
}

interface PerformanceCandidate {
  testPointId: string;
  title: string;
  section: string;
  requirementIds: string[];
  category: PerformanceCategory;
  rank: number;
}

interface TestPoint {
  id: string;
  title: string;
  section: string;
}

type PerformanceCategory = "query" | "transaction" | "batch" | "dependency" | "core";

const CATEGORY_KEYWORDS: Record<Exclude<PerformanceCategory, "core">, string[]> = {
  query: ["查询", "搜索", "筛选", "列表", "分页", "检索", "报表", "统计"],
  transaction: ["提交", "创建", "新增", "保存", "更新", "删除", "下单", "支付", "注册", "登录"],
  batch: ["批量", "导入", "导出", "上传", "下载", "同步", "迁移", "生成"],
  dependency: ["第三方", "接口", "依赖", "回调", "通知", "消息", "队列", "网关", "支付渠道"],
};

/**
 * 生成性能测试用例
 * 
 * 该函数负责：
 * 1. 读取性能测试上下文（测试点、需求分析、测试提案）
 * 2. 从测试点中推断性能测试候选场景
 * 3. 根据优先级选择最多 5 个场景
 * 4. 为每个场景生成性能测试用例配置
 * 5. 将结果写入 performance-cases.json 文件
 * 
 * 推断逻辑：
 * - 核心流程测试点优先级最高
 * - 查询类场景（查询、搜索、筛选等）优先级次之
 * - 事务类场景（提交、创建、保存等）再次之
 * - 批量类场景（批量、导入、导出等）再次之
 * - 依赖类场景（第三方、接口、回调等）优先级最低
 * 
 * @param {ChangeWorkspace} workspace - 测试变更工作区对象
 * @returns {Promise<PerformanceCase[]>} 生成的性能测试用例数组
 * 
 * @example
 * ```typescript
 * const performanceCases = await generatePerformanceCases(workspace);
 * console.log(`已生成 ${performanceCases.length} 个性能测试用例`);
 * ```
 */
export async function generatePerformanceCases(
  workspace: ChangeWorkspace
): Promise<PerformanceCase[]> {
  // 读取性能测试上下文
  const context = await readPerformanceContext(workspace);

  // 推断性能测试候选场景
  const candidates = inferPerformanceCandidates(context.testpoints, context.combinedText);

  // 选择优先级最高的场景（最多 5 个）
  const cases = candidates.slice(0, MAX_PERFORMANCE_CASES).map(createPerformanceCase);

  // 写入 JSON 文件
  const outputPath = join(workspace.artifactsDir, "performance-cases.json");
  await writeFile(outputPath, `${JSON.stringify(cases, null, 2)}\n`);

  return cases;
}

/**
 * 读取或生成性能测试用例
 * 
 * 该函数实现了智能的缓存策略：
 * 1. 首先尝试读取已有的 performance-cases.json 文件
 * 2. 如果文件存在且非空，检查是否需要重新生成：
 *    - 比较源文件（proposal.md、requirements-analysis.md、testpoints.md）的修改时间
 *    - 如果源文件比性能测试用例文件更新，则重新生成
 *    - 否则返回缓存的用例
 * 3. 如果文件不存在、为空或格式错误，则重新生成
 * 
 * 这种策略确保：
 * - 性能测试用例始终与最新的测试点保持同步
 * - 避免不必要的重复生成
 * - 支持增量更新
 * 
 * @param {ChangeWorkspace} workspace - 测试变更工作区对象
 * @returns {Promise<PerformanceCase[]>} 性能测试用例数组
 * 
 * @example
 * ```typescript
 * const performanceCases = await readOrGeneratePerformanceCases(workspace);
 * console.log(`已获取 ${performanceCases.length} 个性能测试用例`);
 * ```
 */
export async function readOrGeneratePerformanceCases(
  workspace: ChangeWorkspace
): Promise<PerformanceCase[]> {
  const outputPath = join(workspace.artifactsDir, "performance-cases.json");
  const sourcePaths = [
    join(workspace.changeDir, "proposal.md"),
    join(workspace.changeDir, "requirements-analysis.md"),
    join(workspace.specsDir, "testpoints.md"),
  ];

  try {
    // 尝试读取已有的性能测试用例文件
    const content = await readFile(outputPath, "utf8");
    const parsed = JSON.parse(content) as PerformanceCase[];

    if (Array.isArray(parsed) && parsed.length > 0) {
      // 获取性能测试用例文件的修改时间
      const outputStat = await stat(outputPath);

      // 获取所有源文件的修改时间
      const sourceStats = await Promise.all(sourcePaths.map(readOptionalStat));
      const latestSourceMtime = Math.max(
        ...sourceStats.map((sourceStat) => sourceStat?.mtimeMs ?? 0)
      );

      // 如果源文件比性能测试用例文件更新，则需要重新生成
      if (latestSourceMtime <= outputStat.mtimeMs) {
        return parsed;
      }
    }
  } catch {
    // 文件不存在、为空或格式错误，需要重新生成
  }

  // 重新生成性能测试用例
  return generatePerformanceCases(workspace);
}

async function readPerformanceContext(workspace: ChangeWorkspace): Promise<{
  testpoints: TestPoint[];
  combinedText: string;
}> {
  const proposal = await readOptional(join(workspace.changeDir, "proposal.md"));
  const analysis = await readOptional(join(workspace.changeDir, "requirements-analysis.md"));
  const testpointsContent = await readOptional(join(workspace.specsDir, "testpoints.md"));
  const testpoints = parseTestPoints(testpointsContent);

  return {
    testpoints,
    combinedText: [proposal, analysis, testpointsContent].join("\n"),
  };
}

function inferPerformanceCandidates(
  testpoints: TestPoint[],
  _combinedText: string
): PerformanceCandidate[] {
  const candidates = testpoints.map((testpoint) => {
    const text = `${testpoint.section} ${testpoint.title}`;
    const category = inferCategory(text, testpoint.section, testpoint.title);
    return {
      testPointId: testpoint.id,
      title: testpoint.title,
      section: testpoint.section,
      requirementIds: extractRequirementIds(testpoint.title),
      category,
      rank: categoryRank(category, testpoint.section, testpoint.title),
    };
  });

  const rankedCandidates = candidates.sort((left, right) => {
    if (left.rank !== right.rank) {
      return left.rank - right.rank;
    }
    return (
      Number.parseInt(left.testPointId.replace(/\D/g, "") || "0", 10) -
      Number.parseInt(right.testPointId.replace(/\D/g, "") || "0", 10)
    );
  });

  if (rankedCandidates.length > 0) {
    return rankedCandidates;
  }

  return [
    {
      testPointId: "TP-001",
      title: "覆盖核心业务流程的主要成功路径。",
      section: "核心流程",
      requirementIds: ["REQ-001"],
      category: "core",
      rank: 1,
    },
  ];
}

function parseTestPoints(content: string): TestPoint[] {
  const points: TestPoint[] = [];
  let currentSection = "未分类";

  for (const line of content.split(/\r?\n/)) {
    const heading = /^##\s+(.+)$/.exec(line);
    if (heading?.[1]) {
      currentSection = heading[1].trim();
      continue;
    }

    const point = /^-\s+\[(TP-\d+)]\s+(.+)$/.exec(line.trim());
    if (point?.[1] && point[2]) {
      points.push({ id: point[1], title: point[2].trim(), section: currentSection });
    }
  }

  return points;
}

function inferCategory(text: string, section: string, title: string): PerformanceCategory {
  if (containsAny(text, CATEGORY_KEYWORDS.dependency)) {
    return "dependency";
  }
  if (containsAny(text, CATEGORY_KEYWORDS.batch)) {
    return "batch";
  }
  if (containsAny(text, CATEGORY_KEYWORDS.query)) {
    return "query";
  }
  if (containsAny(text, CATEGORY_KEYWORDS.transaction)) {
    return "transaction";
  }
  if (section.includes("核心") || title.includes("主要成功路径")) {
    return "core";
  }
  return "core";
}

function categoryRank(category: PerformanceCategory, section: string, title: string): number {
  if (section.includes("核心") || title.includes("主要成功路径")) {
    return 1;
  }
  const ranks: Record<PerformanceCategory, number> = {
    query: 2,
    transaction: 3,
    batch: 4,
    dependency: 5,
    core: 6,
  };
  return ranks[category];
}

function createPerformanceCase(candidate: PerformanceCandidate): PerformanceCase {
  const subject = scenarioSubject(candidate.title);
  const config = categoryConfig(candidate.category, subject);

  return {
    module: candidate.section,
    scenarioName: config.scenarioName,
    performanceType: config.performanceType,
    objective: config.objective,
    preconditions: "测试环境、账号、监控和依赖服务已准备。",
    concurrentUsers: UNKNOWN_TARGET,
    duration: "10min",
    steps: ["准备压测脚本", "按目标负载执行压测", "记录吞吐、响应时间和错误率"],
    targetThroughput: UNKNOWN_TARGET,
    actualThroughput: PENDING_METRIC,
    avgResponseTime: PENDING_METRIC,
    p95ResponseTime: PENDING_METRIC,
    errorRate: PENDING_METRIC,
  };
}

function categoryConfig(
  category: PerformanceCategory,
  subject: string
): { scenarioName: string; performanceType: string; objective: string } {
  switch (category) {
    case "query":
      return {
        scenarioName: `${subject}查询性能测试`,
        performanceType: "负载测试",
        objective: `验证${subject}在目标数据量和预期并发下响应时间、吞吐量和错误率符合要求。`,
      };
    case "transaction":
      return {
        scenarioName: `${subject}事务压力测试`,
        performanceType: "压力测试",
        objective: `验证${subject}在逐步加压下的吞吐上限、错误率和事务成功率符合要求。`,
      };
    case "batch":
      return {
        scenarioName: `${subject}容量稳定性测试`,
        performanceType: "容量测试",
        objective: `验证${subject}在指定数据规模下处理耗时和资源消耗符合要求。`,
      };
    case "dependency":
      return {
        scenarioName: `${subject}依赖稳定性测试`,
        performanceType: "稳定性测试",
        objective: `验证${subject}在依赖服务波动时响应时间、失败率、超时、重试和降级行为符合要求。`,
      };
    case "core":
      return {
        scenarioName: `${subject}核心链路负载测试`,
        performanceType: "负载测试",
        objective: `验证${subject}在预期并发下响应时间、吞吐量和错误率符合要求。`,
      };
  }
}

function scenarioSubject(title: string): string {
  const withoutIds = title.replace(/\b(?:REQ|TP|RISK)-\d+\b/g, "");
  const withoutTemplateWords = withoutIds
    .replace(/^覆盖\s*/, "")
    .replace(/的主要成功路径。?$/, "")
    .replace(/主要成功路径。?$/, "")
    .replace(/系统给出正确反馈。?$/, "")
    .trim();

  return withoutTemplateWords || "核心业务流程";
}

function extractRequirementIds(text: string): string[] {
  return [...new Set([...text.matchAll(/\bREQ-\d+\b/g)].map((match) => match[0]))];
}

function containsAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

async function readOptional(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

async function readOptionalStat(path: string): Promise<{ mtimeMs: number } | undefined> {
  try {
    return await stat(path);
  } catch {
    return undefined;
  }
}
