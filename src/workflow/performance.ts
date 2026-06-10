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
 * - 按性能类别保留候选场景，最多生成 12 个性能测试用例
 */

import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PERFORMANCE_CONFIG, WORKFLOW_FILES } from "../core/config.js";
import type { ChangeWorkspace } from "./workspace.js";

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
 * @property {string} [businessWeight] - 业务占比或优先级说明（可选）
 * @property {string} [testData] - 测试数据说明（可选）
 * @property {string} [loadModel] - 负载模型（可选）
 * @property {string} [rampUpStrategy] - 阶梯加压策略（可选）
 * @property {string} [avgResponseTimeTarget] - 平均响应时间目标（可选）
 * @property {string} [p95ResponseTimeTarget] - P95 响应时间目标（可选）
 * @property {string} [p99ResponseTimeTarget] - P99 响应时间目标（ms，可选）
 * @property {string} [errorRateTarget] - 错误率目标（可选）
 * @property {string} [monitoringMetrics] - 监控指标（可选）
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
  businessWeight?: string;
  testData?: string;
  loadModel?: string;
  rampUpStrategy?: string;
  avgResponseTimeTarget?: string;
  p95ResponseTimeTarget?: string;
  p99ResponseTimeTarget?: string;
  errorRateTarget?: string;
  monitoringMetrics?: string;
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

interface PerformanceHints {
  concurrentUsers?: string;
  duration?: string;
  targetThroughput?: string;
  avgResponseTimeTarget?: string;
  p95ResponseTimeTarget?: string;
  p99ResponseTimeTarget?: string;
  errorRateTarget?: string;
  dataVolume?: string;
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

const CATEGORY_ORDER: PerformanceCategory[] = [
  "core",
  "query",
  "transaction",
  "batch",
  "dependency",
];

/**
 * 生成性能测试用例
 *
 * 该函数负责：
 * 1. 读取性能测试上下文（测试点、需求分析、测试提案）
 * 2. 从测试点中推断性能测试候选场景
 * 3. 按类别保留代表性场景并补齐到上限
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
  const candidates = selectPerformanceCandidates(
    inferPerformanceCandidates(context.testpoints, context.combinedText)
  );

  // 生成带编号和场景化细节的性能测试用例
  const cases = candidates.map((candidate, index) =>
    createPerformanceCase(candidate, index, context.hints)
  );

  // 写入 JSON 文件
  const outputPath = join(workspace.artifactsDir, WORKFLOW_FILES.performanceCases);
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
  const outputPath = join(workspace.artifactsDir, WORKFLOW_FILES.performanceCases);
  const sourcePaths = [
    join(workspace.changeDir, WORKFLOW_FILES.proposal),
    join(workspace.changeDir, WORKFLOW_FILES.requirementsAnalysis),
    join(workspace.specsDir, WORKFLOW_FILES.testpoints),
  ];

  try {
    // 尝试读取已有的性能测试用例文件
    const content = await readFile(outputPath, "utf8");
    const parsed = JSON.parse(content) as PerformanceCase[];

    if (Array.isArray(parsed) && parsed.length > 0) {
      if (!hasCurrentPerformanceCaseSchema(parsed)) {
        return generatePerformanceCases(workspace);
      }

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
  hints: PerformanceHints;
}> {
  const proposal = await readOptional(join(workspace.changeDir, WORKFLOW_FILES.proposal));
  const analysis = await readOptional(
    join(workspace.changeDir, WORKFLOW_FILES.requirementsAnalysis)
  );
  const testpointsContent = await readOptional(join(workspace.specsDir, WORKFLOW_FILES.testpoints));
  const testpoints = parseTestPoints(testpointsContent);
  const combinedText = [proposal, analysis, testpointsContent].join("\n");

  return {
    testpoints,
    combinedText,
    hints: extractPerformanceHints(combinedText),
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

  const rankedCandidates = candidates.sort(compareCandidates);

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

function selectPerformanceCandidates(candidates: PerformanceCandidate[]): PerformanceCandidate[] {
  const selected: PerformanceCandidate[] = [];

  for (const category of CATEGORY_ORDER) {
    const categoryCandidates = candidates
      .filter((candidate) => candidate.category === category)
      .slice(0, PERFORMANCE_CONFIG.maxCasesPerCategory);

    for (const candidate of categoryCandidates) {
      if (selected.length >= PERFORMANCE_CONFIG.maxCases) {
        return selected.sort(compareCandidates);
      }
      selected.push(candidate);
    }
  }

  return selected.sort(compareCandidates);
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

function compareCandidates(left: PerformanceCandidate, right: PerformanceCandidate): number {
  if (left.rank !== right.rank) {
    return left.rank - right.rank;
  }
  return testPointNumber(left.testPointId) - testPointNumber(right.testPointId);
}

function createPerformanceCase(
  candidate: PerformanceCandidate,
  index: number,
  hints: PerformanceHints
): PerformanceCase {
  const subject = scenarioSubject(candidate.title);
  const config = categoryConfig(candidate.category, subject, hints);
  const requirementFields =
    candidate.requirementIds.length > 0 ? { requirementIds: candidate.requirementIds } : {};

  return {
    scenarioId: `PT-${String(index + 1).padStart(3, "0")}`,
    module: candidate.section,
    scenarioName: config.scenarioName,
    performanceType: config.performanceType,
    ...requirementFields,
    testPointIds: [candidate.testPointId],
    objective: config.objective,
    businessWeight: config.businessWeight,
    preconditions: config.preconditions,
    testData: config.testData,
    loadModel: config.loadModel,
    concurrentUsers: config.concurrentUsers,
    duration: config.duration,
    rampUpStrategy: config.rampUpStrategy,
    steps: config.steps,
    targetThroughput: config.targetThroughput,
    avgResponseTimeTarget: config.avgResponseTimeTarget,
    p95ResponseTimeTarget: config.p95ResponseTimeTarget,
    p99ResponseTimeTarget: config.p99ResponseTimeTarget,
    errorRateTarget: config.errorRateTarget,
    monitoringMetrics: config.monitoringMetrics,
    bottleneckAnalysis: config.bottleneckAnalysis,
    actualThroughput: PERFORMANCE_CONFIG.pendingMetric,
    avgResponseTime: PERFORMANCE_CONFIG.pendingMetric,
    p95ResponseTime: PERFORMANCE_CONFIG.pendingMetric,
    errorRate: PERFORMANCE_CONFIG.pendingMetric,
    cpuPeak: PERFORMANCE_CONFIG.pendingMetric,
    memoryPeak: PERFORMANCE_CONFIG.pendingMetric,
    executionResult: "未执行",
    notes: config.notes,
  };
}

function categoryConfig(
  category: PerformanceCategory,
  subject: string,
  hints: PerformanceHints
): {
  scenarioName: string;
  performanceType: string;
  objective: string;
  businessWeight: string;
  preconditions: string;
  testData: string;
  loadModel: string;
  concurrentUsers: string;
  duration: string;
  rampUpStrategy: string;
  steps: string[];
  targetThroughput: string;
  avgResponseTimeTarget: string;
  p95ResponseTimeTarget: string;
  p99ResponseTimeTarget: string;
  errorRateTarget: string;
  monitoringMetrics: string;
  bottleneckAnalysis: string;
  notes: string;
} {
  const concurrentUsers = hints.concurrentUsers ?? "50/100/200 阶梯并发，按业务峰值调整";
  const duration = hints.duration ?? "预热 5min + 稳定 10min + 压力 10min";
  const targetThroughput = hints.targetThroughput ?? "待根据线上基线或容量目标确认";
  const avgResponseTimeTarget = hints.avgResponseTimeTarget ?? "核心操作建议 <= 1000ms";
  const p95ResponseTimeTarget = hints.p95ResponseTimeTarget ?? "核心操作建议 <= 2000ms";
  const p99ResponseTimeTarget = hints.p99ResponseTimeTarget ?? "核心操作建议 <= 3000ms";
  const errorRateTarget = hints.errorRateTarget ?? "<= 0.1%";
  const dataVolume = hints.dataVolume ?? "不少于 1 万条业务数据，覆盖正常、边界和历史数据";

  switch (category) {
    case "query":
      return {
        scenarioName: `${subject}查询性能测试`,
        performanceType: "负载测试",
        objective: `验证${subject}在目标数据量和预期并发下响应时间、吞吐量、分页稳定性和错误率符合要求。`,
        businessWeight: "高频读取场景，建议纳入日常性能基线回归。",
        preconditions: "查询索引、缓存、账号权限、监控面板和压测脚本已准备，测试数据已完成预热。",
        testData: `${dataVolume}；覆盖关键词、筛选条件、分页、排序和空结果组合。`,
        loadModel: "恒定并发 + 热点查询混合模型，包含 80% 常规查询和 20% 复杂筛选。",
        concurrentUsers,
        duration,
        rampUpStrategy: "按 25% → 50% → 100% 目标并发逐级加压，每级至少观察 5 分钟。",
        steps: [
          "准备覆盖常用筛选条件、分页、排序和空结果的数据集。",
          "执行低并发预热，确认缓存、索引和监控数据正常。",
          "按阶梯并发执行查询、搜索、筛选、分页和排序组合。",
          "记录 QPS、平均响应时间、P95、P99、慢查询比例和错误率。",
          "观察数据库 CPU、索引命中率、慢 SQL、缓存命中率和网关 5xx。",
        ],
        targetThroughput,
        avgResponseTimeTarget,
        p95ResponseTimeTarget,
        p99ResponseTimeTarget,
        errorRateTarget,
        monitoringMetrics:
          "QPS、平均响应时间、P95/P99、慢 SQL、数据库 CPU、缓存命中率、网关 4xx/5xx。",
        bottleneckAnalysis: "重点观察索引缺失、深分页、复杂筛选、缓存穿透和热点数据竞争。",
        notes: "如需求未给出明确 SLA，先使用当前版本或生产峰值数据作为基线。",
      };
    case "transaction":
      return {
        scenarioName: `${subject}事务压力测试`,
        performanceType: "压力测试",
        objective: `验证${subject}在逐步加压下的吞吐上限、响应时间、错误率、幂等性和数据一致性符合要求。`,
        businessWeight: "核心写入链路，建议覆盖峰值流量、重复提交和事务一致性风险。",
        preconditions: "测试账号、业务单据、数据库回滚方案、幂等校验和链路追踪已准备。",
        testData: `${dataVolume}；准备可重复执行的账号、订单、支付或提交类数据，避免数据互相污染。`,
        loadModel: "阶梯加压模型，逐级提升并发直到达到目标负载或出现瓶颈。",
        concurrentUsers,
        duration,
        rampUpStrategy: "从 20 并发开始，每 5 分钟提升一档，观察错误率和事务成功率后继续加压。",
        steps: [
          "初始化账号池、业务单据和可回滚的事务测试数据。",
          "执行低并发冒烟压测，确认事务链路、幂等校验和监控埋点正常。",
          "按阶梯模型逐步提升并发，持续执行创建、提交、保存或支付等关键事务。",
          "记录 TPS、事务成功率、平均响应时间、P95、P99、错误率和重试次数。",
          "检查重复提交、库存或余额一致性、数据库锁等待、回滚和异步消息积压。",
        ],
        targetThroughput,
        avgResponseTimeTarget,
        p95ResponseTimeTarget,
        p99ResponseTimeTarget,
        errorRateTarget,
        monitoringMetrics:
          "TPS、事务成功率、P95/P99、数据库连接池、锁等待、消息队列积压、错误码分布。",
        bottleneckAnalysis:
          "重点观察事务锁竞争、外部依赖耗时、重复提交、异步补偿和数据库连接池耗尽。",
        notes: "压测后需要执行数据一致性校验，避免仅以接口成功率判断通过。",
      };
    case "batch":
      return {
        scenarioName: `${subject}容量稳定性测试`,
        performanceType: "容量测试",
        objective: `验证${subject}在指定数据规模下的处理耗时、吞吐量、资源峰值、失败重试和结果完整性符合要求。`,
        businessWeight: "批处理或文件处理场景，建议覆盖常规规模、峰值规模和异常数据。",
        preconditions: "批处理任务、文件模板、存储空间、任务队列、失败重试策略和资源监控已准备。",
        testData: `${dataVolume}；至少准备小批量、常规批量和峰值批量三档数据。`,
        loadModel: "容量递增模型，按数据规模逐档提升，观察总耗时和资源峰值。",
        concurrentUsers: hints.concurrentUsers ?? "1/5/10 个批处理任务并行，按业务调度策略调整",
        duration: hints.duration ?? "单轮任务执行至完成，稳定性轮次不少于 3 轮",
        rampUpStrategy: "按 1 千 → 1 万 → 10 万数据量递增，每档校验完成时间和失败记录。",
        steps: [
          "准备小批量、常规批量和峰值批量数据文件或任务。",
          "分别执行导入、导出、同步、迁移或批量生成任务。",
          "记录总耗时、处理吞吐、失败记录数、CPU 峰值、内存峰值和 I/O 使用率。",
          "校验处理结果完整性、重复执行影响、失败重试和断点续处理能力。",
          "观察任务队列堆积、数据库写入压力、文件 I/O、对象存储和临时空间占用。",
        ],
        targetThroughput,
        avgResponseTimeTarget: hints.avgResponseTimeTarget ?? "单批处理耗时需符合业务窗口要求",
        p95ResponseTimeTarget: hints.p95ResponseTimeTarget ?? "任务耗时 P95 不超过基线 20%",
        p99ResponseTimeTarget: hints.p99ResponseTimeTarget ?? "任务耗时 P99 不超过基线 30%",
        errorRateTarget,
        monitoringMetrics:
          "处理吞吐、总耗时、失败记录数、CPU/内存峰值、磁盘 I/O、任务队列长度、重试次数。",
        bottleneckAnalysis: "重点观察大文件解析、批量写入、事务提交频率、队列堆积和临时文件清理。",
        notes: "容量测试应记录数据规模与耗时曲线，用于评估后续扩容阈值。",
      };
    case "dependency":
      return {
        scenarioName: `${subject}依赖稳定性测试`,
        performanceType: "稳定性测试",
        objective: `验证${subject}在依赖服务正常、延迟、超时和失败时的响应时间、失败率、重试、熔断和降级行为符合要求。`,
        businessWeight: "跨系统依赖场景，建议覆盖核心链路对外部服务波动的韧性。",
        preconditions: "依赖服务模拟器、超时配置、熔断限流策略、降级开关和链路监控已准备。",
        testData: `${dataVolume}；覆盖依赖正常、延迟、超时、失败、限流和异常返回。`,
        loadModel: "稳定负载 + 故障注入模型，在目标并发下切换依赖状态。",
        concurrentUsers,
        duration: hints.duration ?? "稳定负载 30min，故障注入窗口每类不少于 5min",
        rampUpStrategy: "先达到目标并发并稳定运行，再依次注入延迟、超时、失败和恢复。",
        steps: [
          "准备依赖服务正常、延迟、超时、失败和恢复五类模拟条件。",
          "在目标并发下执行包含外部接口、回调、消息、队列或网关的业务链路。",
          "按故障注入计划切换依赖状态，记录响应时间、失败率、重试次数和降级触发情况。",
          "验证超时控制、熔断、限流、兜底返回和恢复后的自动重试是否符合预期。",
          "观察依赖波动是否造成核心链路雪崩、线程池耗尽、消息堆积或错误率放大。",
        ],
        targetThroughput,
        avgResponseTimeTarget,
        p95ResponseTimeTarget,
        p99ResponseTimeTarget,
        errorRateTarget,
        monitoringMetrics:
          "依赖耗时、超时率、重试次数、熔断状态、线程池使用率、队列堆积、核心链路错误率。",
        bottleneckAnalysis: "重点观察超时设置过长、重试风暴、熔断阈值不合理和降级兜底缺失。",
        notes: "稳定性测试需要同时记录故障注入时间线和业务侧可见影响。",
      };
    case "core":
      return {
        scenarioName: `${subject}核心链路负载测试`,
        performanceType: "负载测试",
        objective: `验证${subject}在预期并发下的端到端响应时间、吞吐量、错误率和资源使用符合核心链路 SLA。`,
        businessWeight: "核心成功路径，建议作为版本发布前的性能准入场景。",
        preconditions: "核心链路账号、基础数据、依赖服务、压测环境、监控告警和回滚方案已准备。",
        testData: `${dataVolume}；覆盖核心成功路径、关键分支和高频业务参数。`,
        loadModel: "基准负载 + 峰值负载模型，先建立基线再验证峰值容量。",
        concurrentUsers,
        duration,
        rampUpStrategy: "预热后按 50% → 100% → 峰值并发逐级加压，峰值阶段至少稳定 10 分钟。",
        steps: [
          "准备核心链路账号、业务数据、依赖服务和压测脚本。",
          "执行预热压测，确认应用实例、数据库、缓存、队列和网关监控正常。",
          "按基准负载和峰值负载执行端到端业务流量。",
          "记录 TPS/QPS、平均响应时间、P95、P99、错误率、CPU、内存和数据库连接池使用率。",
          "对比历史基线和目标 SLA，定位接口、数据库、缓存、队列或外部依赖瓶颈。",
        ],
        targetThroughput,
        avgResponseTimeTarget,
        p95ResponseTimeTarget,
        p99ResponseTimeTarget,
        errorRateTarget,
        monitoringMetrics:
          "TPS/QPS、平均响应时间、P95/P99、错误率、CPU、内存、GC、数据库连接池、缓存命中率。",
        bottleneckAnalysis:
          "重点观察核心接口耗时、数据库慢查询、缓存命中率、线程池耗尽和依赖服务抖动。",
        notes: "核心链路建议保留历史基线，后续版本以性能回归趋势判断风险。",
      };
  }
}

function extractPerformanceHints(content: string): PerformanceHints {
  const hints: PerformanceHints = {};
  setHint(
    hints,
    "concurrentUsers",
    firstMatch(content, [
      /(?:并发用户数?|并发|用户并发)[:：]?\s*([^，。；;\n]+(?:用户|人|并发)?)/,
      /(\d+\s*(?:个)?并发(?:用户)?)/,
    ])
  );
  setHint(
    hints,
    "duration",
    firstMatch(content, [
      /(?:持续时间|压测时长|运行时长)[:：]?\s*([^，。；;\n]+)/,
      /(\d+\s*(?:分钟|小时|min|h))/i,
    ])
  );
  setHint(
    hints,
    "targetThroughput",
    firstMatch(content, [
      /(?:TPS|QPS|吞吐量|吞吐)[:：]?\s*([^，。；;\n]+)/i,
      /(\d+\s*(?:TPS|QPS|tps|qps))/,
    ])
  );
  setHint(
    hints,
    "avgResponseTimeTarget",
    firstMatch(content, [
      /(?:平均响应时间|平均耗时)[:：]?\s*([^，。；;\n]+)/,
      /avg(?: response time)?[:：]?\s*([^，。；;\n]+)/i,
    ])
  );
  setHint(
    hints,
    "p95ResponseTimeTarget",
    firstMatch(content, [/P95\s*(?:响应时间|耗时)?[:：]?\s*([^，。；;\n]+)/i])
  );
  setHint(
    hints,
    "p99ResponseTimeTarget",
    firstMatch(content, [/P99\s*(?:响应时间|耗时)?[:：]?\s*([^，。；;\n]+)/i])
  );
  setHint(
    hints,
    "errorRateTarget",
    firstMatch(content, [
      /(?:错误率|失败率)[:：]?\s*([^，。；;\n]+)/,
      /error rate[:：]?\s*([^，。；;\n]+)/i,
    ])
  );
  setHint(
    hints,
    "dataVolume",
    firstMatch(content, [
      /(?:数据量|数据规模|记录数)[:：]?\s*([^，。；;\n]+)/,
      /(\d+\s*(?:万|千)?\s*(?:条|笔|个)\s*(?:数据|记录|订单|账号)?)/,
    ])
  );
  return hints;
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

function hasCurrentPerformanceCaseSchema(values: unknown[]): values is PerformanceCase[] {
  return values.every((value) => {
    if (!isRecord(value)) {
      return false;
    }
    return (
      typeof value.scenarioId === "string" &&
      Array.isArray(value.testPointIds) &&
      typeof value.businessWeight === "string" &&
      typeof value.testData === "string" &&
      typeof value.loadModel === "string" &&
      typeof value.rampUpStrategy === "string" &&
      typeof value.p99ResponseTimeTarget === "string" &&
      !Object.hasOwn(value, "p99ResponseTime")
    );
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function setHint<TKey extends keyof PerformanceHints>(
  hints: PerformanceHints,
  key: TKey,
  value: PerformanceHints[TKey] | undefined
): void {
  if (value) {
    hints[key] = value;
  }
}

function testPointNumber(testPointId: string): number {
  return Number.parseInt(testPointId.replace(/\D/g, "") || "0", 10);
}

function firstMatch(content: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = pattern.exec(content);
    const value = match?.[1]?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
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
