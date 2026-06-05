import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChangeWorkspace } from "./workspace.js";

export interface SourceRef {
  document: string;
  section?: string;
  quote?: string;
}

export interface TestCase {
  caseId: string;
  title: string;
  module: string;
  type: string;
  priority: "P0" | "P1" | "P2";
  requirementIds: string[];
  testPointIds: string[];
  riskIds: string[];
  sourceRefs?: SourceRef[];
  preconditions: string;
  testData?: string;
  steps: string[];
  expectedResult: string;
  executionResult?: string;
  actualResult?: string;
  defectId?: string;
  notes?: string;
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

  try {
    const content = await readFile(testcasesPath, "utf8");
    const parsed = JSON.parse(content) as TestCase[];
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch {
    // Regenerate below when the file is missing or invalid.
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
    sourceRefs: [
      {
        document: "specs/testpoints.md",
        section: point.section,
        quote: `[${point.id}] ${point.title}`,
      },
    ],
    preconditions: "待由 Agent 根据需求文档补充具体环境、账号、数据和依赖条件。",
    testData: "待由 Agent 根据需求文档补充具体测试数据。",
    steps: [
      `评审测试点 ${point.id}：${point.title}`,
      "根据关联需求文档补充可执行的具体操作步骤。",
      "根据需求原文补充可观察的结果断言。",
    ],
    expectedResult: "待由 Agent 根据需求文档补充具体、可观察的预期结果。",
    notes:
      "CLI fallback/template case; use an Agent workflow to generate requirement-grounded details.",
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
