/**
 * @fileoverview TestSpec 工作流验证模块
 *
 * 该模块实现了工作流产物的验证功能，包括：
 * 1. 验证测试点清单（specs/testpoints.md）的可读性和格式
 * 2. 验证测试用例（artifacts/testcases.json）的 schema 和质量
 * 3. 检查必需字段是否存在且非空
 * 4. 检查步骤是否过于模板化
 * 5. 检查预期结果是否过于模糊
 * 6. 检查是否存在重复用例
 *
 * 验证结果分为两类：
 * - error: 阻塞错误，必须修复后才能继续
 * - warning: 审查警告，建议修复但不阻塞
 *
 * 验证规则：
 * - schema 验证：检查 7 个必需字段是否存在且格式正确
 * - 质量验证：检查步骤和预期结果是否过于模板化
 * - 重复检测：检查是否存在大量步骤相同的用例
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { WORKFLOW_FILES, WORKSPACE_CONFIG } from "../core/config.js";
import { readCompactStructuredCases, type TestCase, TestCaseFormatError } from "./testcases.js";
import type { ChangeWorkspace } from "./workspace.js";

/**
 * 验证级别类型
 *
 * @type ValidationLevel
 * - "error": 阻塞错误，必须修复后才能继续
 * - "warning": 审查警告，建议修复但不阻塞
 */
export type ValidationLevel = "error" | "warning";

/**
 * 验证问题接口
 *
 * @interface ValidationIssue
 * @property {ValidationLevel} level - 验证级别（error 或 warning）
 * @property {string} code - 问题代码（如 MISSING_FIELD、GENERIC_STEPS 等）
 * @property {string} message - 问题描述信息
 * @property {string} [caseId] - 关联的用例 ID（可选，格式如 case[0]、case[1] 等）
 */
export interface ValidationIssue {
  level: ValidationLevel;
  code: string;
  message: string;
  caseId?: string;
}

/**
 * 验证结果接口
 *
 * @interface ValidationResult
 * @property {ValidationIssue[]} errors - 阻塞错误列表
 * @property {ValidationIssue[]} warnings - 审查警告列表
 */
export interface ValidationResult {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

interface ParsedTestPoint {
  id: string;
  requirementIds: string[];
}

const GENERIC_STEP_PATTERNS = [
  /准备.*测试数据/,
  /执行.*业务操作/,
  /执行.*测试操作/,
  /观察.*系统响应/,
  /验证.*符合需求/,
  /prepare test data/i,
  /execute (the )?(operation|test)/i,
  /verify.*requirements?/i,
];

const VAGUE_EXPECTED_RESULT_PATTERNS = [
  /^符合需求[。.]?$/,
  /^按预期显示[。.]?$/,
  /^系统行为符合需求.*$/,
  /^system behaves as expected[.]?$/i,
];

/**
 * 验证工作流产物
 *
 * 该函数负责验证工作流中的所有产物，包括：
 * 1. 读取测试点清单（specs/testpoints.md）
 * 2. 读取测试用例（artifacts/testcases.json）
 * 3. 验证测试用例的 schema（7 个必需字段）
 * 4. 验证测试用例的质量（步骤、预期结果）
 * 5. 将问题分为错误和警告两类
 *
 * 验证级别：
 * - error: 阻塞错误，如缺少必需字段、文件不可读等
 * - warning: 审查警告，如步骤过于模板化、预期结果过于模糊等
 *
 * @param {ChangeWorkspace} workspace - 测试变更工作区对象
 * @returns {Promise<ValidationResult>} 验证结果，包含错误和警告列表
 *
 * @example
 * ```typescript
 * const result = await validateWorkflowArtifacts(workspace);
 * if (result.errors.length > 0) {
 *   console.error(`发现 ${result.errors.length} 个阻塞错误`);
 *   for (const error of result.errors) {
 *     console.error(`[${error.code}] ${error.message}`);
 *   }
 * }
 * if (result.warnings.length > 0) {
 *   console.warn(`发现 ${result.warnings.length} 个审查警告`);
 * }
 * ```
 */
export async function validateWorkflowArtifacts(
  workspace: ChangeWorkspace
): Promise<ValidationResult> {
  const issues: ValidationIssue[] = [];

  // 读取测试点清单（即使紧凑格式不再携带追溯链接，仍需报告缺失或不可读的工作流产物）
  await readTestPoints(workspace, issues);

  // 读取测试用例
  const cases = await readTestCases(workspace, issues);

  // 如果有测试用例，进行 schema 和质量验证
  if (cases.length > 0) {
    validateCaseSchema(cases, issues);
    validateQuality(cases, issues);
  }

  // 将问题分为错误和警告两类
  return splitIssues(issues);
}

export function formatValidationResult(result: ValidationResult): string {
  const lines = [
    `Validation errors: ${result.errors.length}`,
    `Validation warnings: ${result.warnings.length}`,
  ];

  for (const issue of [...result.errors, ...result.warnings]) {
    const prefix = issue.level === "error" ? "ERROR" : "WARN";
    const caseLabel = issue.caseId ? ` ${issue.caseId}` : "";
    lines.push(`[${prefix}] ${issue.code}${caseLabel}: ${issue.message}`);
  }

  return lines.join("\n");
}

async function readTestCases(
  workspace: ChangeWorkspace,
  issues: ValidationIssue[]
): Promise<TestCase[]> {
  try {
    return await readCompactStructuredCases(workspace);
  } catch (errorValue) {
    const message = errorMessage(errorValue);
    const code =
      errorValue instanceof TestCaseFormatError ? errorValue.code : "TESTCASES_UNREADABLE";
    issues.push(
      error(
        code,
        `Unable to read or parse ${WORKSPACE_CONFIG.artifactsDir}/${WORKFLOW_FILES.testcases}: ${message}`
      )
    );
    return [];
  }
}

async function readTestPoints(
  workspace: ChangeWorkspace,
  issues: ValidationIssue[]
): Promise<ParsedTestPoint[]> {
  const testpointsPath = join(workspace.specsDir, WORKFLOW_FILES.testpoints);

  try {
    return parseTestPointTraceability(await readFile(testpointsPath, "utf8"));
  } catch (errorValue) {
    issues.push(
      error(
        "TESTPOINTS_UNREADABLE",
        `Unable to read ${WORKSPACE_CONFIG.specsDir}/${WORKFLOW_FILES.testpoints}: ${errorMessage(errorValue)}`
      )
    );
    return [];
  }
}

export function parseTestPointTraceability(content: string): ParsedTestPoint[] {
  const points: ParsedTestPoint[] = [];

  for (const line of content.split(/\r?\n/)) {
    const idMatch = /\[(TP-\d+)]/.exec(line);
    if (!idMatch?.[1]) {
      continue;
    }
    points.push({ id: idMatch[1], requirementIds: extractRequirementIds(line) });
  }

  return points;
}

function validateCaseSchema(cases: TestCase[], issues: ValidationIssue[]): void {
  for (const [index, testCase] of cases.entries()) {
    const caseId = caseLabel(index);

    requireString(testCase.title, "title", caseId, issues);
    requireString(testCase.module, "module", caseId, issues);
    requireString(testCase.type, "type", caseId, issues);
    requireString(testCase.priority, "priority", caseId, issues);
    requireString(testCase.preconditions, "preconditions", caseId, issues);
    requireString(testCase.expectedResult, "expectedResult", caseId, issues);
    requireNonEmptyArray(testCase.steps, "steps", caseId, issues);
  }
}

function validateQuality(cases: TestCase[], issues: ValidationIssue[]): void {
  for (const [index, testCase] of cases.entries()) {
    const caseId = caseLabel(index);
    if (isGenericStepSet(testCase.steps ?? [])) {
      issues.push(
        warning(
          "GENERIC_STEPS",
          "Steps look like a generic template instead of concrete user/system actions.",
          caseId
        )
      );
    }

    if (
      VAGUE_EXPECTED_RESULT_PATTERNS.some((pattern) => pattern.test(testCase.expectedResult ?? ""))
    ) {
      issues.push(
        warning(
          "VAGUE_EXPECTED_RESULT",
          "Expected result is too vague to be executable or reviewable.",
          caseId
        )
      );
    }
  }

  const normalizedSteps = cases.map((testCase) => normalizeSteps(testCase.steps ?? []));
  const duplicateCount = normalizedSteps.filter(
    (steps, index) => steps.length > 0 && normalizedSteps.indexOf(steps) !== index
  ).length;
  if (cases.length >= 3 && duplicateCount >= Math.ceil(cases.length / 2)) {
    issues.push(
      warning(
        "NEAR_DUPLICATE_CASES",
        "Many cases have identical or near-identical steps; review whether they are template output."
      )
    );
  }
}

function requireString(
  value: unknown,
  field: string,
  caseId: string,
  issues: ValidationIssue[]
): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push(error("MISSING_FIELD", `Missing required string field '${field}'.`, caseId));
  }
}

function requireNonEmptyArray(
  value: unknown,
  field: string,
  caseId: string,
  issues: ValidationIssue[]
): void {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push(
      error("MISSING_FIELD_ARRAY", `Missing required non-empty array field '${field}'.`, caseId)
    );
  }
}

function isGenericStepSet(steps: string[]): boolean {
  if (steps.length === 0) {
    return false;
  }

  const genericCount = steps.filter((step) =>
    GENERIC_STEP_PATTERNS.some((pattern) => pattern.test(step))
  ).length;

  return genericCount === steps.length || (steps.length <= 3 && genericCount >= 2);
}

function normalizeSteps(steps: string[]): string {
  return steps.map((step) => step.trim().toLowerCase().replace(/\s+/g, " ")).join("|");
}

function extractRequirementIds(value: string): string[] {
  return [...value.matchAll(/REQ-\d+/g)].map((match) => match[0]);
}

function splitIssues(issues: ValidationIssue[]): ValidationResult {
  return {
    errors: issues.filter((issue) => issue.level === "error"),
    warnings: issues.filter((issue) => issue.level === "warning"),
  };
}

function caseLabel(index: number): string {
  return `case[${index}]`;
}

function error(code: string, message: string, caseId?: string): ValidationIssue {
  return issue("error", code, message, caseId);
}

function warning(code: string, message: string, caseId?: string): ValidationIssue {
  return issue("warning", code, message, caseId);
}

function issue(
  level: ValidationLevel,
  code: string,
  message: string,
  caseId: string | undefined
): ValidationIssue {
  return caseId ? { level, code, message, caseId } : { level, code, message };
}

function errorMessage(errorValue: unknown): string {
  return errorValue instanceof Error ? errorValue.message : String(errorValue);
}
