import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChangeWorkspace } from "./workspace.js";

const MAX_PERFORMANCE_CASES = 5;
const UNKNOWN_TARGET = "待确认";
const PENDING_METRIC = "待执行后填写";

export interface PerformanceCase {
  scenarioId: string;
  module: string;
  scenarioName: string;
  performanceType: string;
  requirementIds: string[];
  testPointIds: string[];
  objective: string;
  preconditions: string;
  testData: string;
  concurrentUsers: string;
  duration: string;
  steps: string[];
  targetThroughput: string;
  actualThroughput: string;
  avgResponseTime: string;
  p95ResponseTime: string;
  p99ResponseTime: string;
  errorRate: string;
  cpuPeak: string;
  memoryPeak: string;
  bottleneckAnalysis: string;
  executionResult: string;
  notes: string;
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

export async function generatePerformanceCases(
  workspace: ChangeWorkspace
): Promise<PerformanceCase[]> {
  const context = await readPerformanceContext(workspace);
  const candidates = inferPerformanceCandidates(context.testpoints, context.combinedText);
  const cases = candidates
    .slice(0, MAX_PERFORMANCE_CASES)
    .map((candidate, index) => createPerformanceCase(candidate, index));
  const outputPath = join(workspace.artifactsDir, "performance-cases.json");

  await writeFile(outputPath, `${JSON.stringify(cases, null, 2)}\n`);

  return cases;
}

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
    const content = await readFile(outputPath, "utf8");
    const parsed = JSON.parse(content) as PerformanceCase[];
    if (Array.isArray(parsed) && parsed.length > 0) {
      const outputStat = await stat(outputPath);
      const sourceStats = await Promise.all(sourcePaths.map(readOptionalStat));
      const latestSourceMtime = Math.max(
        ...sourceStats.map((sourceStat) => sourceStat?.mtimeMs ?? 0)
      );
      if (latestSourceMtime <= outputStat.mtimeMs) {
        return parsed;
      }
    }
  } catch {
    // Regenerate below when the file is missing, stale, empty, or invalid.
  }

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

function createPerformanceCase(candidate: PerformanceCandidate, index: number): PerformanceCase {
  const scenarioNumber = String(index + 1).padStart(3, "0");
  const subject = scenarioSubject(candidate.title);
  const config = categoryConfig(candidate.category, subject);

  return {
    scenarioId: `PT-${scenarioNumber}`,
    module: candidate.section,
    scenarioName: config.scenarioName,
    performanceType: config.performanceType,
    requirementIds: candidate.requirementIds.length > 0 ? candidate.requirementIds : ["REQ-001"],
    testPointIds: [candidate.testPointId],
    objective: config.objective,
    preconditions: "测试环境、账号、数据、监控和依赖服务已准备。",
    testData: UNKNOWN_TARGET,
    concurrentUsers: UNKNOWN_TARGET,
    duration: "10min",
    steps: ["准备压测脚本和测试数据", "按目标负载执行压测", "记录吞吐、响应时间、错误率和资源指标"],
    targetThroughput: UNKNOWN_TARGET,
    actualThroughput: PENDING_METRIC,
    avgResponseTime: PENDING_METRIC,
    p95ResponseTime: PENDING_METRIC,
    p99ResponseTime: PENDING_METRIC,
    errorRate: PENDING_METRIC,
    cpuPeak: PENDING_METRIC,
    memoryPeak: PENDING_METRIC,
    bottleneckAnalysis: PENDING_METRIC,
    executionResult: "未执行",
    notes: "根据需求 SLA 和生产流量基线补充目标值。",
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
