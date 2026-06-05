import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChangeWorkspace } from "./workspace.js";

export interface TestCase {
  caseId: string;
  title: string;
  module: string;
  type: string;
  priority: "P0" | "P1" | "P2";
  requirementIds: string[];
  testPointIds: string[];
  riskIds: string[];
  preconditions: string;
  steps: string[];
  expectedResult: string;
  executionResult?: string;
}

interface TestPoint {
  id: string;
  title: string;
  section: string;
}

export async function generateStructuredCases(workspace: ChangeWorkspace): Promise<TestCase[]> {
  const testpointsPath = join(workspace.specsDir, "testpoints.md");
  const content = await readFile(testpointsPath, "utf8");
  const points = parseTestPoints(content);
  const cases = points.map((point, index) => createCaseFromPoint(point, index));
  const outputPath = join(workspace.artifactsDir, "testcases.json");

  await writeFile(outputPath, `${JSON.stringify(cases, null, 2)}\n`);

  return cases;
}

export async function readOrGenerateStructuredCases(
  workspace: ChangeWorkspace
): Promise<TestCase[]> {
  const testcasesPath = join(workspace.artifactsDir, "testcases.json");
  const testpointsPath = join(workspace.specsDir, "testpoints.md");

  try {
    const content = await readFile(testcasesPath, "utf8");
    const parsed = JSON.parse(content) as TestCase[];
    if (Array.isArray(parsed) && parsed.length > 0) {
      const casesStat = await stat(testcasesPath);
      const pointsStat = await stat(testpointsPath);
      if (pointsStat.mtimeMs <= casesStat.mtimeMs) {
        return parsed;
      }
    }
  } catch {
    // Regenerate below when the file is missing, stale, or invalid.
  }

  return generateStructuredCases(workspace);
}

export function parseTestPoints(content: string): TestPoint[] {
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

  if (points.length === 0) {
    points.push({ id: "TP-001", title: "覆盖核心需求场景", section: "核心流程" });
  }

  return points;
}

function createCaseFromPoint(point: TestPoint, index: number): TestCase {
  const caseNumber = String(index + 1).padStart(3, "0");
  const type = inferType(point.section);

  return {
    caseId: `TC-${caseNumber}`,
    title: point.title,
    module: point.section,
    type,
    priority: index === 0 ? "P0" : "P1",
    requirementIds: ["REQ-001"],
    testPointIds: [point.id],
    riskIds: point.section.includes("风险") ? ["RISK-001"] : [],
    preconditions: "测试环境、账号、数据和依赖服务已准备。",
    steps: ["根据测试点准备输入和前置数据", "执行对应业务操作", "观察系统响应和数据结果"],
    expectedResult: "系统行为符合需求、测试点和风险覆盖预期。",
  };
}

function inferType(section: string): string {
  if (section.includes("负向")) {
    return "负向";
  }
  if (section.includes("边界")) {
    return "边界";
  }
  if (section.includes("异常")) {
    return "异常";
  }
  if (section.includes("权限") || section.includes("安全")) {
    return "安全";
  }
  return "正向";
}
