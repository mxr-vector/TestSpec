import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { TestCase } from "./testcases.js";
import type { ChangeWorkspace } from "./workspace.js";

export type ValidationLevel = "error" | "warning";

export interface ValidationIssue {
  level: ValidationLevel;
  code: string;
  message: string;
  caseId?: string;
}

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

export async function validateWorkflowArtifacts(
  workspace: ChangeWorkspace
): Promise<ValidationResult> {
  const issues: ValidationIssue[] = [];
  const testpoints = await readTestPoints(workspace, issues);
  const cases = await readTestCases(workspace, issues);

  if (cases.length > 0) {
    validateCaseSchema(cases, issues);
    validateTraceability(cases, testpoints, issues);
    validateQuality(cases, testpoints, issues);
  }

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
  const testcasesPath = join(workspace.artifactsDir, "testcases.json");

  try {
    const content = await readFile(testcasesPath, "utf8");
    const parsed = JSON.parse(content) as unknown;
    if (!Array.isArray(parsed)) {
      issues.push(error("TESTCASES_NOT_ARRAY", "artifacts/testcases.json must be a JSON array."));
      return [];
    }
    return parsed as TestCase[];
  } catch (errorValue) {
    issues.push(
      error(
        "TESTCASES_UNREADABLE",
        `Unable to read or parse artifacts/testcases.json: ${errorMessage(errorValue)}`
      )
    );
    return [];
  }
}

async function readTestPoints(
  workspace: ChangeWorkspace,
  issues: ValidationIssue[]
): Promise<ParsedTestPoint[]> {
  const testpointsPath = join(workspace.specsDir, "testpoints.md");

  try {
    return parseTestPointTraceability(await readFile(testpointsPath, "utf8"));
  } catch (errorValue) {
    issues.push(
      error(
        "TESTPOINTS_UNREADABLE",
        `Unable to read specs/testpoints.md: ${errorMessage(errorValue)}`
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
    const fallbackId = `case[${index}]`;
    const caseId = stringValue(testCase.caseId) || fallbackId;

    requireString(testCase.caseId, "caseId", caseId, issues);
    requireString(testCase.title, "title", caseId, issues);
    requireString(testCase.module, "module", caseId, issues);
    requireString(testCase.type, "type", caseId, issues);
    requireString(testCase.priority, "priority", caseId, issues);
    requireString(testCase.preconditions, "preconditions", caseId, issues);
    requireString(testCase.expectedResult, "expectedResult", caseId, issues);
    requireNonEmptyArray(testCase.requirementIds, "requirementIds", caseId, issues);
    requireNonEmptyArray(testCase.testPointIds, "testPointIds", caseId, issues);
    requireNonEmptyArray(testCase.steps, "steps", caseId, issues);
    if (!Array.isArray(testCase.sourceRefs) || testCase.sourceRefs.length === 0) {
      issues.push(
        warning(
          "MISSING_SOURCE_REFS",
          "Field 'sourceRefs' is missing or empty; consider adding source evidence.",
          caseId
        )
      );
    }
  }
}

function validateTraceability(
  cases: TestCase[],
  testpoints: ParsedTestPoint[],
  issues: ValidationIssue[]
): void {
  if (testpoints.length === 0) {
    return;
  }

  const knownTestPointIds = new Set(testpoints.map((point) => point.id));
  const knownRequirementIds = new Set(testpoints.flatMap((point) => point.requirementIds));

  for (const testCase of cases) {
    for (const testPointId of testCase.testPointIds ?? []) {
      if (!knownTestPointIds.has(testPointId)) {
        issues.push(
          error(
            "UNKNOWN_TEST_POINT",
            `Referenced test point ${testPointId} does not exist in specs/testpoints.md.`,
            testCase.caseId
          )
        );
      }
    }

    for (const requirementId of testCase.requirementIds ?? []) {
      if (knownRequirementIds.size > 0 && !knownRequirementIds.has(requirementId)) {
        issues.push(
          warning(
            "UNKNOWN_REQUIREMENT",
            `Requirement ${requirementId} not found in test points.`,
            testCase.caseId
          )
        );
      }
    }
  }
}

function validateQuality(
  cases: TestCase[],
  testpoints: ParsedTestPoint[],
  issues: ValidationIssue[]
): void {
  for (const testCase of cases) {
    if (isGenericStepSet(testCase.steps ?? [])) {
      issues.push(
        warning(
          "GENERIC_STEPS",
          "Steps look like a generic template instead of concrete user/system actions.",
          testCase.caseId
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
          testCase.caseId
        )
      );
    }
  }

  const knownRequirementIds = new Set(testpoints.flatMap((point) => point.requirementIds));
  if (knownRequirementIds.size > 1 && cases.length > 1) {
    const allReq001 = cases.every(
      (testCase) =>
        (testCase.requirementIds ?? []).length === 1 && testCase.requirementIds?.[0] === "REQ-001"
    );
    if (allReq001) {
      issues.push(
        warning(
          "SUSPICIOUS_REQ001_ONLY",
          "All cases link only to REQ-001 even though multiple requirements appear in test points."
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

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
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
