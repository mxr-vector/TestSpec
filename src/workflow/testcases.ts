/**
 * @fileoverview TestSpec 结构化测试用例生成模块
 * 
 * 该模块实现了结构化测试用例的生成功能，包括：
 * 1. 从测试点生成结构化测试用例
 * 2. 支持紧凑格式（compact）的测试用例 schema
 * 3. 提供测试用例的读取、生成、规范化和持久化功能
 * 4. 支持智能缓存策略，避免不必要的重复生成
 * 
 * 紧凑测试用例 schema（7 个必需字段）：
 * - title: 用例名称
 * - module: 功能模块
 * - type: 用例类型（正向、负向、边界、异常、安全）
 * - priority: 优先级（P0、P1、P2、P3）
 * - preconditions: 前置条件
 * - steps: 测试步骤（字符串数组）
 * - expectedResult: 预期结果
 * 
 * 测试用例类型推断规则：
 * - 包含"负向"的章节 → 负向
 * - 包含"边界"的章节 → 边界
 * - 包含"异常"的章节 → 异常
 * - 包含"权限"或"安全"的章节 → 安全
 * - 其他 → 正向
 */

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChangeWorkspace } from "./workspace.js";

/**
 * 紧凑测试用例字段常量
 * 
 * 定义了紧凑格式测试用例的 7 个必需字段，用于：
 * 1. 验证测试用例 schema 的完整性
 * 2. 规范化测试用例格式
 * 3. 生成模板化的测试用例
 */
export const COMPACT_TEST_CASE_FIELDS = [
  "title",
  "module",
  "type",
  "priority",
  "preconditions",
  "steps",
  "expectedResult",
] as const;

/**
 * 测试用例接口
 * 
 * @interface TestCase
 * @property {string} title - 用例名称，描述测试场景
 * @property {string} module - 功能模块，用于分类和统计
 * @property {string} type - 用例类型（正向、负向、边界、异常、安全）
 * @property {string} priority - 优先级（P0、P1、P2、P3）
 * @property {string} preconditions - 前置条件，执行测试前需要满足的条件
 * @property {string[]} steps - 测试步骤，具体的操作步骤列表
 * @property {string} expectedResult - 预期结果，测试通过的判断标准
 */
export interface TestCase {
  title: string;
  module: string;
  type: string;
  priority: string;
  preconditions: string;
  steps: string[];
  expectedResult: string;
}

interface TestPoint {
  id: string;
  title: string;
  section: string;
}

/**
 * 生成结构化测试用例
 * 
 * 该函数负责：
 * 1. 读取测试点清单（specs/testpoints.md）
 * 2. 解析测试点，提取 ID、标题和章节
 * 3. 为每个测试点生成对应的测试用例
 * 4. 将结果写入 testcases.json 文件
 * 
 * 测试用例生成规则：
 * - 用例名称：使用测试点标题
 * - 功能模块：使用测试点所属章节
 * - 用例类型：根据章节名称推断（正向、负向、边界、异常、安全）
 * - 优先级：第一个测试点为 P0，其他为 P1
 * - 前置条件：模板化文本，待根据需求补充
 * - 测试步骤：模板化步骤，待根据需求补充
 * - 预期结果：模板化文本，待根据需求补充
 * 
 * @param {ChangeWorkspace} workspace - 测试变更工作区对象
 * @returns {Promise<TestCase[]>} 生成的测试用例数组
 * 
 * @example
 * ```typescript
 * const cases = await generateStructuredCases(workspace);
 * console.log(`已生成 ${cases.length} 个测试用例`);
 * ```
 */
export async function generateStructuredCases(workspace: ChangeWorkspace): Promise<TestCase[]> {
  // 读取测试点清单
  const testpointsPath = join(workspace.specsDir, "testpoints.md");
  const content = await readFile(testpointsPath, "utf8");

  // 解析测试点
  const points = parseTestPoints(content);

  // 为每个测试点生成对应的测试用例
  const cases = points.map((point, index) => createCaseFromPoint(point, index));

  // 写入 JSON 文件
  const outputPath = join(workspace.artifactsDir, "testcases.json");
  await writeFile(outputPath, `${JSON.stringify(cases, null, 2)}\n`);

  return cases;
}

export async function readCompactStructuredCases(workspace: ChangeWorkspace): Promise<TestCase[]> {
  return compactParsedCases(await readStructuredCaseArray(workspace));
}

export async function normalizeAndPersistCompactCases(
  workspace: ChangeWorkspace
): Promise<TestCase[]> {
  const testcasesPath = join(workspace.artifactsDir, "testcases.json");
  const parsed = await readStructuredCaseArray(workspace);
  const cases = compactParsedCases(parsed);

  if (!hasExactCompactCaseArrayShape(parsed)) {
    await writeFile(testcasesPath, `${JSON.stringify(cases, null, 2)}\n`);
  }

  return cases;
}

export async function readOrGenerateStructuredCases(
  workspace: ChangeWorkspace
): Promise<TestCase[]> {
  try {
    const cases = await normalizeAndPersistCompactCases(workspace);
    if (cases.length > 0) {
      return cases;
    }
  } catch {
    // Regenerate below when the file is missing or invalid.
  }

  return generateStructuredCases(workspace);
}

async function readStructuredCaseArray(workspace: ChangeWorkspace): Promise<unknown[]> {
  const testcasesPath = join(workspace.artifactsDir, "testcases.json");
  const parsed = JSON.parse(await readFile(testcasesPath, "utf8")) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error("artifacts/testcases.json must be a JSON array.");
  }

  return parsed;
}

function compactParsedCases(values: unknown[]): TestCase[] {
  return values.map(compactTestCase);
}

export function compactTestCase(value: unknown): TestCase {
  const record = isRecord(value) ? value : {};

  return {
    title: stringValue(record.title),
    module: stringValue(record.module),
    type: stringValue(record.type),
    priority: stringValue(record.priority),
    preconditions: stringValue(record.preconditions),
    steps: stringArray(record.steps),
    expectedResult: stringValue(record.expectedResult),
  };
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

function hasExactCompactCaseArrayShape(values: unknown[]): boolean {
  return values.every(hasExactCompactCaseShape);
}

function hasExactCompactCaseShape(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  const keys = Object.keys(value);
  return (
    keys.length === COMPACT_TEST_CASE_FIELDS.length &&
    COMPACT_TEST_CASE_FIELDS.every((field) => Object.hasOwn(value, field))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(stringValue);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
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
