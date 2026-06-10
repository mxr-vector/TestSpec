/**
 * @fileoverview TestSpec 全局配置常量
 *
 * 该模块集中维护跨模块复用的稳定常量，避免目录名、产物文件名和默认配置散落在各文件中。
 */

/** 工作区目录配置 */
export const WORKSPACE_CONFIG = {
  root: "testspec",
  changesDir: "changes",
  archiveDir: "archive",
  specsDir: "specs",
  artifactsDir: "artifacts",
} as const;

/** 工作流产物文件名配置 */
export const WORKFLOW_FILES = {
  proposal: "proposal.md",
  requirementsAnalysis: "requirements-analysis.md",
  testpoints: "testpoints.md",
  testcases: "testcases.json",
  performanceCases: "performance-cases.json",
  report: "report.md",
  manifest: "manifest.json",
} as const;

/** 导出文件名后缀配置 */
export const EXPORT_FILE_SUFFIXES = {
  excelCases: "_cases.xlsx",
  xmindCases: "_cases.xmind",
} as const;

/** npm 更新检查配置 */
export const UPDATE_CHECK_CONFIG = {
  defaultNpmRegistryUrl: "https://registry.npmjs.org",
  defaultTimeoutMs: 1500,
  skipEnvVar: "TESTSPEC_SKIP_UPDATE_CHECK",
} as const;

/** 结构化测试用例字段配置 */
export const COMPACT_TEST_CASE_FIELDS = [
  "title",
  "module",
  "type",
  "priority",
  "preconditions",
  "steps",
  "expectedResult",
] as const;

/** 性能测试默认配置 */
export const PERFORMANCE_CONFIG = {
  maxCases: 5,
  unknownTarget: "待确认",
  pendingMetric: "待执行后填写",
} as const;
