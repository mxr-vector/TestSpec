import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChangeWorkspace } from "./workspace.js";

/** @legacy Kept for backward-compatible reading of traceability-rich artifacts. */
export interface SourceRef {
  document: string;
  section?: string;
  quote?: string;
}

export interface TestCase {
  title: string;
  module: string;
  type: string;
  priority: "P0" | "P1" | "P2";
  preconditions: string;
  steps: string[];
  expectedResult: string;
  caseId?: string;
  requirementIds?: string[];
  testPointIds?: string[];
  riskIds?: string[];
  sourceRefs?: SourceRef[];
  testData?: string;
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
  const type = inferType(point.section);

  return {
    title: point.title,
    module: point.section,
    type,
    priority: index === 0 ? "P0" : "P1",
    preconditions: "待根据需求补充执行前置条件。",
    steps: [
      "根据需求补充具体操作步骤。",
      "观察页面、接口或数据状态变化。",
      "核对可观察结果是否符合需求约束。",
    ],
    expectedResult: "结果可观察且符合需求约束。",
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
