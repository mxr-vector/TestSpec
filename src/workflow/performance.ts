/**
 * @fileoverview TestSpec 性能测试用例模块
 *
 * 该模块实现了性能测试用例的管理功能，包括：
 * 1. 读取 Agent 通过 Skill 语义生成的业务并发性能测试用例
 * 2. 内置 9 项固定全局非功能性性能测试模板（基线、泄漏、资源、安全等）
 * 3. 合并业务并发用例与全局非功能性用例
 * 4. 支持智能缓存策略，避免不必要的重复读取
 *
 * 性能测试用例来源：
 * - 业务并发用例：由 Agent 通过 `.agent/skills/testspec-performance/SKILL.md`
 *   引导语义生成，写入 `performance-cases.json`
 * - 全局非功能性用例：代码内置固定模板，CLI 在导出 Excel 时自动追加
 *
 * performanceType 值域：
 * - 业务并发类型（Agent 生成）：负载测试、压力测试、并发测试、容量测试、稳定性测试
 * - 全局非功能性类型（CLI 内置）：基线测试、慢查询检测、泄漏检测、启动耗时、资源监控、安全性能
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PERFORMANCE_CONFIG, WORKFLOW_FILES } from "../core/config.js";
import type { ChangeWorkspace } from "./workspace.js";

/**
 * 性能测试用例接口
 *
 * @interface PerformanceCase
 * @property {string} module - 业务模块名称
 * @property {string} scenarioName - 性能测试场景名称
 * @property {string} performanceType - 性能测试类型
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

/**
 * 生成性能测试用例（仅全局非功能性模板）
 *
 * 纯函数，仅返回 9 项固定全局非功能性性能测试用例，不写入文件。
 * 业务并发用例由 Agent 通过 Skill 语义生成，写入 performance-cases.json。
 *
 * @returns {PerformanceCase[]} 生成的性能测试用例数组（仅全局非功能性）
 */
export function generatePerformanceCases(): PerformanceCase[] {
  return createGlobalNonFunctionalCases();
}

/**
 * 读取或生成性能测试用例
 *
 * 合并策略：
 * 1. 从 performance-cases.json 读取 Agent 生成的业务并发用例（过滤旧版全局用例）
 * 2. 始终追加 9 项全局非功能性用例
 * 3. 合并后返回
 *
 * @param {ChangeWorkspace} workspace - 测试变更工作区对象
 * @returns {Promise<PerformanceCase[]>} 合并后的性能测试用例数组（业务并发 + 全局非功能性）
 */
export async function readOrGeneratePerformanceCases(
  workspace: ChangeWorkspace
): Promise<PerformanceCase[]> {
  const globalCases = createGlobalNonFunctionalCases();
  const businessCases = await readBusinessPerformanceCases(workspace);
  return [...businessCases, ...globalCases];
}

/**
 * 读取 Agent 生成的业务并发性能测试用例
 *
 * @param {ChangeWorkspace} workspace - 测试变更工作区对象
 * @returns {Promise<PerformanceCase[]>} Agent 生成的业务并发用例数组（可能为空）
 */
async function readBusinessPerformanceCases(
  workspace: ChangeWorkspace
): Promise<PerformanceCase[]> {
  const outputPath = join(workspace.artifactsDir, WORKFLOW_FILES.performanceCases);

  try {
    const content = await readFile(outputPath, "utf8");
    const parsed = JSON.parse(content) as PerformanceCase[];

    if (Array.isArray(parsed) && parsed.length > 0) {
      // 过滤掉可能混入的全局非功能性用例（如果 JSON 是旧版生成的）
      return parsed.filter(
        (c) => c.module !== PERFORMANCE_CONFIG.globalModule
      );
    }
  } catch (error) {
    // 文件不存在或格式错误，记录调试信息后返回空数组
    const reason = error instanceof Error ? error.message : String(error);
    console.debug(`[testspec] No business performance cases found: ${reason}`);
  }

  return [];
}

/**
 * 创建固定全局非功能性性能测试用例
 *
 * 返回 9 项固定的全局非功能性性能测试用例模板，包括：
 * 1. 接口响应时间基线（基线测试）
 * 2. 数据库慢查询检测（慢查询检测）
 * 3. 内存泄漏持续监测（泄漏检测）
 * 4. 连接池/句柄释放（泄漏检测）
 * 5. 服务冷启动耗时（启动耗时）
 * 6. CPU/内存资源水位（资源监控）
 * 7. DDoS 防护验证（安全性能）
 * 8. 接口限流策略验证（安全性能）
 * 9. 大报文传输耐受（安全性能）
 *
 * @returns {PerformanceCase[]} 9 项固定全局非功能性性能测试用例
 */
export function createGlobalNonFunctionalCases(): PerformanceCase[] {
  const module = PERFORMANCE_CONFIG.globalModule;
  const unknown = PERFORMANCE_CONFIG.unknownTarget;
  const pending = PERFORMANCE_CONFIG.pendingMetric;

  return [
    {
      module,
      scenarioName: "接口响应时间基线",
      performanceType: "基线测试",
      objective: "空载或低负载下核心接口 P95 响应时间 ≤ 目标值。",
      preconditions: "测试环境已部署，数据库已初始化基础数据集，无其他负载干扰。",
      concurrentUsers: "1-5",
      duration: "5min",
      steps: [
        "梳理核心接口清单（登录、列表查询、详情查看、提交等）。",
        "使用压测工具以 1-5 并发逐一请求每个接口。",
        "记录每个接口的 P50、P95、P99 响应时间和错误率。",
        "对比各接口响应时间与预设基线阈值。",
        "标记超出阈值的接口并输出基线报告。",
      ],
      targetThroughput: unknown,
      actualThroughput: pending,
      avgResponseTime: pending,
      p95ResponseTime: pending,
      errorRate: pending,
    },
    {
      module,
      scenarioName: "数据库慢查询检测",
      performanceType: "慢查询检测",
      objective: "核心查询无全表扫描，执行耗时 ≤ 阈值。",
      preconditions: "数据库已加载生产级别数据量，慢查询日志或 APM 监控已开启。",
      concurrentUsers: "1",
      duration: "10min",
      steps: [
        "开启数据库慢查询日志，设置阈值（如 200ms）。",
        "依次执行核心业务场景覆盖的数据库查询。",
        "收集慢查询日志，提取耗时 ≥ 阈值的 SQL。",
        "对慢查询 SQL 执行 EXPLAIN 分析执行计划。",
        "确认无全表扫描、无缺失索引，记录优化建议。",
      ],
      targetThroughput: "N/A",
      actualThroughput: pending,
      avgResponseTime: pending,
      p95ResponseTime: pending,
      errorRate: pending,
    },
    {
      module,
      scenarioName: "内存泄漏持续监测",
      performanceType: "泄漏检测",
      objective: "持续运行 N 小时后堆内存无持续增长趋势。",
      preconditions: "测试环境已部署，APM 或进程级内存监控已开启。",
      concurrentUsers: "10-50",
      duration: "2h",
      steps: [
        "记录服务启动后的初始堆内存使用量。",
        "以中等并发（10-50 用户）持续执行混合业务场景。",
        "每 10 分钟采样一次堆内存、GC 次数和 GC 耗时。",
        "绘制内存使用时间曲线，分析是否存在持续上升趋势。",
        "若内存持续增长超过初始值 30%，标记为泄漏疑似并记录堆转储。",
      ],
      targetThroughput: unknown,
      actualThroughput: pending,
      avgResponseTime: pending,
      p95ResponseTime: pending,
      errorRate: pending,
    },
    {
      module,
      scenarioName: "连接池/句柄释放",
      performanceType: "泄漏检测",
      objective: "高并发后数据库连接数和文件句柄恢复到基线水位。",
      preconditions: "测试环境已部署，数据库连接池监控和 OS 文件句柄监控已开启。",
      concurrentUsers: "100-200",
      duration: "15min",
      steps: [
        "记录空闲状态下的数据库活跃连接数和进程文件句柄数。",
        "以 100-200 并发执行高频数据库操作场景（查询+写入）。",
        "持续 10 分钟后停止所有压力。",
        "等待 5 分钟冷却期，再次记录连接数和句柄数。",
        "对比冷却后数据与基线，确认连接和句柄已回收到基线水位 ±10%。",
      ],
      targetThroughput: unknown,
      actualThroughput: pending,
      avgResponseTime: pending,
      p95ResponseTime: pending,
      errorRate: pending,
    },
    {
      module,
      scenarioName: "服务冷启动耗时",
      performanceType: "启动耗时",
      objective: "服务从冷启动到首次可用响应 ≤ 目标值。",
      preconditions: "服务已停止，依赖服务（数据库、缓存、消息队列）已就绪。",
      concurrentUsers: "1",
      duration: "5min",
      steps: [
        "完全停止目标服务进程。",
        "记录启动命令执行的时间戳。",
        "循环发送健康检查请求（如 /health 或 /ping），间隔 500ms。",
        "记录首次收到 HTTP 200 响应的时间戳。",
        "计算冷启动耗时（首次可用时间 - 启动命令时间），对比目标值。",
      ],
      targetThroughput: "N/A",
      actualThroughput: pending,
      avgResponseTime: pending,
      p95ResponseTime: pending,
      errorRate: pending,
    },
    {
      module,
      scenarioName: "CPU/内存资源水位",
      performanceType: "资源监控",
      objective: "峰值负载下 CPU 使用率 ≤ 80%，内存使用率 ≤ 75%。",
      preconditions: "测试环境已部署，系统级 CPU/内存监控已开启（如 Prometheus + Grafana）。",
      concurrentUsers: unknown,
      duration: "15min",
      steps: [
        "记录空闲状态下的 CPU 和内存使用率基线。",
        "以目标峰值并发执行混合业务场景。",
        "每 30 秒采样一次 CPU 使用率、内存使用率、系统负载。",
        "持续 15 分钟后停止压力，记录峰值 CPU 和峰值内存。",
        "验证峰值 CPU ≤ 80%、峰值内存 ≤ 75%，超出则标记告警。",
      ],
      targetThroughput: unknown,
      actualThroughput: pending,
      avgResponseTime: pending,
      p95ResponseTime: pending,
      errorRate: pending,
    },
    {
      module,
      scenarioName: "DDoS 防护验证",
      performanceType: "安全性能",
      objective: "突发大量恶意请求下限流/熔断机制正确触发，正常流量不受影响。",
      preconditions: "测试环境已部署限流/熔断组件（如网关限流、WAF），监控已开启。",
      concurrentUsers: "500-1000",
      duration: "10min",
      steps: [
        "以正常并发（如 50 用户）发送合法请求，记录基线响应时间和成功率。",
        "同时从另一来源以 500-1000 并发发送大量恶意请求（高频重复、无效参数）。",
        "验证限流/熔断机制在阈值触发后拒绝恶意流量（返回 429 或 503）。",
        "验证正常流量的响应时间和成功率未显著恶化（偏差 ≤ 20%）。",
        "停止恶意流量后验证服务在 1 分钟内恢复到基线水平。",
      ],
      targetThroughput: unknown,
      actualThroughput: pending,
      avgResponseTime: pending,
      p95ResponseTime: pending,
      errorRate: pending,
    },
    {
      module,
      scenarioName: "接口限流策略验证",
      performanceType: "安全性能",
      objective: "超过限流阈值时返回 429 状态码，正常流量不受影响。",
      preconditions: "测试环境已配置接口级限流策略（如令牌桶或滑动窗口），限流阈值已知。",
      concurrentUsers: unknown,
      duration: "10min",
      steps: [
        "确认目标接口的限流阈值（如 100 QPS/用户）。",
        "以低于阈值的速率发送请求，验证全部返回 200。",
        "逐步提升请求速率至阈值的 150%-200%。",
        "验证超出阈值的请求返回 HTTP 429，响应体包含 Retry-After 或限流提示。",
        "验证未超限的请求仍正常返回 200，不受限流影响。",
      ],
      targetThroughput: unknown,
      actualThroughput: pending,
      avgResponseTime: pending,
      p95ResponseTime: pending,
      errorRate: pending,
    },
    {
      module,
      scenarioName: "大报文传输耐受",
      performanceType: "安全性能",
      objective: "超大请求体或响应体不导致 OOM 或请求超时。",
      preconditions: "测试环境已部署，已确认接口对请求体大小的限制配置。",
      concurrentUsers: "1-5",
      duration: "10min",
      steps: [
        "构造接近服务端请求体上限的合法请求（如 10MB JSON/文件上传）。",
        "发送请求并验证服务端正常处理或返回 413（Payload Too Large）。",
        "构造超出上限的请求，验证服务端拒绝且不崩溃。",
        "监控服务端进程内存，确认无 OOM 或内存突增。",
        "对返回大响应体的接口（如导出），验证客户端可正常接收且不超时。",
      ],
      targetThroughput: "N/A",
      actualThroughput: pending,
      avgResponseTime: pending,
      p95ResponseTime: pending,
      errorRate: pending,
    },
  ];
}
