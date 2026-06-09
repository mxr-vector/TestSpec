/**
 * @fileoverview TestSpec 生成产物模块
 * 
 * 该模块实现了 TestSpec 工作流中的核心生成功能，包括：
 * 1. 生成测试提案（proposal.md）
 * 2. 生成需求分析文档（requirements-analysis.md）
 * 3. 生成测试点清单（specs/testpoints.md）
 * 
 * 生成流程：
 * - proposal.md: 包含被测对象、关联需求文档、测试目标、测试范围等
 * - requirements-analysis.md: 包含需求摘要、功能点拆解、业务规则、风险点等
 * - testpoints.md: 包含核心流程、负向场景、边界场景、异常场景、权限/安全场景
 * 
 * 所有生成的文档都支持追溯性，通过 REQ-xxx 和 TP-xxx 标识符关联。
 */

import { readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { ChangeWorkspace } from "./workspace.js";

/**
 * 测试提案选项接口
 * 
 * @interface ProposalOptions
 * @property {string} [requirement] - 关联需求文档路径或 URL
 * @property {string} [testedObject] - 被测对象名称，默认为测试变更名称
 */
export interface ProposalOptions {
  requirement?: string;
  testedObject?: string;
}

/**
 * 需求文档引用接口
 * 
 * @interface RequirementReference
 * @property {string} reference - 需求文档的原始引用路径
 * @property {string} content - 需求文档的内容
 */
interface RequirementReference {
  reference: string;
  content: string;
}

/**
 * 需求分析上下文接口
 * 
 * @interface AnalysisContext
 * @property {string} proposal - 测试提案内容
 * @property {RequirementReference | undefined} requirementReference - 需求文档引用（可选）
 */
interface AnalysisContext {
  proposal: string;
  requirementReference: RequirementReference | undefined;
}

/**
 * 分析功能点接口
 * 
 * @interface AnalysisFeature
 * @property {string} id - 功能点标识符（如 REQ-001）
 * @property {string} name - 功能点名称
 */
interface AnalysisFeature {
  id: string;
  name: string;
}

/**
 * 分析风险接口
 * 
 * @interface AnalysisRisk
 * @property {string} id - 风险标识符（如 RISK-001）
 * @property {string} title - 风险标题
 */
interface AnalysisRisk {
  id: string;
  title: string;
}

/**
 * 生成测试提案文件（proposal.md）
 * 
 * 该函数负责生成测试提案文档，包含以下内容：
 * - 被测对象：测试的目标系统或功能
 * - 关联需求文档：需求文档路径或 URL
 * - 测试目标：验证核心业务流程、识别风险
 * - 测试范围：范围内和范围外的功能
 * - 测试边界：以需求文档和提案范围为准
 * - 假设与依赖：测试环境、账号、数据等
 * - 风险预判：需求不完整、依赖不可用等
 * - 后续步骤：运行 analysis 和 points 命令
 * 
 * @param {ChangeWorkspace} workspace - 测试变更工作区对象
 * @param {ProposalOptions} [options] - 提案选项
 * @param {string} [options.requirement] - 关联需求文档路径或 URL
 * @param {string} [options.testedObject] - 被测对象名称
 * @returns {Promise<string>} 生成的 proposal.md 文件路径
 * 
 * @example
 * ```typescript
 * const proposalPath = await writeProposal(workspace, {
 *   requirement: './docs/requirements.md',
 *   testedObject: '用户登录功能'
 * });
 * console.log(`提案已生成: ${proposalPath}`);
 * ```
 */
export async function writeProposal(
  workspace: ChangeWorkspace,
  options: ProposalOptions = {}
): Promise<string> {
  const outputPath = join(workspace.changeDir, "proposal.md");
  const requirement = options.requirement ?? "待补充";
  const testedObject = options.testedObject ?? workspace.name;

  await writeFile(
    outputPath,
    [
      `# 测试提案：${testedObject}`,
      "",
      "## 被测对象",
      "",
      testedObject,
      "",
      "## 关联需求文档",
      "",
      requirement,
      "",
      "## 测试目标",
      "",
      "- 验证核心业务流程符合需求。",
      "- 识别边界、异常、权限、安全与数据一致性风险。",
      "",
      "## 测试范围",
      "",
      "### 范围内",
      "",
      "- 需求文档明确描述的功能行为。",
      "- 与核心流程相关的异常和边界场景。",
      "",
      "### 范围外",
      "",
      "- 需求未覆盖且未被确认为本轮目标的功能。",
      "",
      "## 测试边界",
      "",
      "- 以关联需求文档和本提案范围为准。",
      "",
      "## 假设与依赖",
      "",
      "- 测试环境、账号、数据和依赖系统可按需准备。",
      "",
      "## 风险预判",
      "",
      "- 需求描述不完整可能导致测试点遗漏。",
      "- 依赖系统不可用可能影响执行进度。",
      "",
      "## 后续步骤",
      "",
      "- 运行 `testspec analysis` 生成需求分析。",
      "- 运行 `testspec points` 生成测试点。",
    ].join("\n")
  );

  return outputPath;
}

/**
 * 生成需求分析文档（requirements-analysis.md）
 * 
 * 该函数负责生成结构化的需求分析文档，包含以下内容：
 * - 需求摘要：基于测试提案和需求文档的总结
 * - 需求参考文档：关联需求文档的路径和摘录
 * - 功能点拆解：以表格形式列出功能点、用户目标、输入、输出、规则、可测性
 * - 业务规则：待根据需求文档细化
 * - 状态流转：待根据需求文档细化
 * - 权限与角色：若需求涉及角色、权限或安全边界
 * - 数据约束：输入、输出、格式、唯一性和边界约束
 * - 异常与边界：输入为空、格式错误、超长、重复提交等
 * - 依赖系统：外部服务、接口、数据源或配置依赖
 * - 风险点：需求边界不清晰、依赖不可用等
 * - 待澄清问题：未在需求中明确的异常处理规则等
 * 
 * @param {ChangeWorkspace} workspace - 测试变更工作区对象
 * @returns {Promise<string>} 生成的 requirements-analysis.md 文件路径
 * 
 * @example
 * ```typescript
 * const analysisPath = await writeRequirementsAnalysis(workspace);
 * console.log(`需求分析已生成: ${analysisPath}`);
 * ```
 */
export async function writeRequirementsAnalysis(workspace: ChangeWorkspace): Promise<string> {
  const proposal = await readOptional(join(workspace.changeDir, "proposal.md"));
  const requirementReference = await readRequirementReference(workspace, proposal);
  const outputPath = join(workspace.changeDir, "requirements-analysis.md");

  await writeFile(
    outputPath,
    [
      `# 需求分析：${workspace.name}`,
      "",
      "## 需求摘要",
      "",
      summarizeSource({ proposal, requirementReference }),
      "",
      "## 需求参考文档",
      "",
      formatRequirementReference(requirementReference),
      "",
      "## 功能点拆解",
      "",
      "| 编号 | 功能点 | 用户目标 | 输入 | 输出 | 规则 | 可测性 |",
      "|---|---|---|---|---|---|---|",
      ...renderFeatureRows(proposal, requirementReference?.content ?? ""),
      "",
      "## 业务规则",
      "",
      "- 待根据需求文档细化。",
      "",
      "## 状态流转",
      "",
      "- 待根据需求文档细化。",
      "",
      "## 权限与角色",
      "",
      "- 若需求涉及角色、权限或安全边界，应在此列出。",
      "",
      "## 数据约束",
      "",
      "- 待补充输入、输出、格式、唯一性和边界约束。",
      "",
      "## 异常与边界",
      "",
      "- 输入为空、格式错误、超长、重复提交、依赖不可用等。",
      "",
      "## 依赖系统",
      "",
      "- 待补充外部服务、接口、数据源或配置依赖。",
      "",
      "## 风险点",
      "",
      "| 风险编号 | 风险 | 影响 | 建议测试策略 |",
      "|---|---|---|---|",
      "| RISK-001 | 需求边界不清晰 | 可能遗漏测试场景 | 通过评审确认边界并补充测试点 |",
      "",
      "## 待澄清问题",
      "",
      "- 是否存在未在需求中明确的异常处理规则？",
      "- 是否存在特定角色、权限、环境或兼容性要求？",
    ].join("\n")
  );

  return outputPath;
}

/**
 * 生成测试点清单（specs/testpoints.md）
 * 
 * 该函数负责生成可追溯的测试点清单，包含以下内容：
 * - 上下文来源：测试提案和需求分析文档的状态
 * - 核心流程：基于功能点拆解的主要成功路径测试点
 * - 负向场景：输入无效、缺失或不满足业务规则时的测试点
 * - 边界场景：输入长度、数量、金额、时间等边界值处理的测试点
 * - 异常场景：依赖服务不可用、网络异常或重复提交时的测试点
 * - 权限/安全场景：未授权、越权或敏感数据访问的测试点
 * - 风险覆盖映射：风险编号与测试点的对应关系
 * 
 * 测试点标识符格式：TP-xxx（如 TP-001、TP-101、TP-201 等）
 * 功能点标识符格式：REQ-xxx（如 REQ-001、REQ-002 等）
 * 风险标识符格式：RISK-xxx（如 RISK-001、RISK-002 等）
 * 
 * @param {ChangeWorkspace} workspace - 测试变更工作区对象
 * @returns {Promise<string>} 生成的 testpoints.md 文件路径
 * 
 * @example
 * ```typescript
 * const testpointsPath = await writeTestPoints(workspace);
 * console.log(`测试点清单已生成: ${testpointsPath}`);
 * ```
 */
export async function writeTestPoints(workspace: ChangeWorkspace): Promise<string> {
  const proposal = await readOptional(join(workspace.changeDir, "proposal.md"));
  const analysis = await readOptional(join(workspace.changeDir, "requirements-analysis.md"));
  const features = parseAnalysisFeatures(analysis);
  const contextFeatures =
    features.length > 0 ? features : extractCandidateFeatures(proposal).map(toAnalysisFeature);
  const risks = parseAnalysisRisks(analysis);
  const outputPath = join(workspace.specsDir, "testpoints.md");

  await writeFile(
    outputPath,
    [
      `# 测试点清单：${workspace.name}`,
      "",
      "## 上下文来源",
      "",
      `- 测试提案：${proposal.trim().length > 0 ? "proposal.md" : "未生成"}`,
      `- 需求分析：${analysis.trim().length > 0 ? "requirements-analysis.md" : "未生成"}`,
      "",
      "## 核心流程",
      "",
      ...renderCoreTestPoints(contextFeatures),
      "",
      "## 负向场景",
      "",
      "- [TP-101] 输入无效、缺失或不满足业务规则时系统给出正确反馈。",
      "",
      "## 边界场景",
      "",
      "- [TP-201] 输入长度、数量、金额、时间等边界值处理正确。",
      "",
      "## 异常场景",
      "",
      "- [TP-301] 依赖服务不可用、网络异常或重复提交时系统行为符合预期。",
      "",
      "## 权限/安全场景",
      "",
      "- [TP-401] 未授权、越权或敏感数据访问受到限制。",
      "",
      "## 风险覆盖映射",
      "",
      "| 风险编号 | 覆盖测试点 |",
      "|---|---|",
      ...renderRiskMappings(risks),
    ].join("\n")
  );

  return outputPath;
}

async function readOptional(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

async function readRequirementReference(
  workspace: ChangeWorkspace,
  proposal: string
): Promise<RequirementReference | undefined> {
  const reference = extractRequirementReference(proposal);
  if (!reference || isPlaceholderReference(reference) || isRemoteReference(reference)) {
    return undefined;
  }

  for (const path of requirementPathCandidates(workspace, reference)) {
    const content = await readOptional(path);
    if (content.trim().length > 0) {
      return { reference, content };
    }
  }

  return undefined;
}

function extractRequirementReference(proposal: string): string | undefined {
  const section = extractSection(proposal, "关联需求文档");
  const line = section
    .split(/\r?\n/)
    .map((value) => value.trim())
    .find((value) => value.length > 0);

  return line;
}

function requirementPathCandidates(workspace: ChangeWorkspace, reference: string): string[] {
  if (isAbsolute(reference)) {
    return [reference];
  }

  const projectRoot = dirname(dirname(workspace.rootDir));
  return [
    resolve(projectRoot, reference),
    resolve(process.cwd(), reference),
    resolve(workspace.changeDir, reference),
  ];
}

function isPlaceholderReference(reference: string): boolean {
  return reference === "待补充" || reference.toLowerCase() === "n/a";
}

function isRemoteReference(reference: string): boolean {
  return /^https?:\/\//i.test(reference);
}

function summarizeSource(context: AnalysisContext): string {
  if (context.requirementReference) {
    return `已读取关联需求文档 \`${context.requirementReference.reference}\`，并结合测试提案进行结构化拆解。`;
  }

  if (context.proposal.trim().length === 0) {
    return "待补充需求摘要。";
  }

  return "基于测试提案进行结构化拆解；未读取到可用的本地关联需求文档。";
}

function formatRequirementReference(reference: RequirementReference | undefined): string {
  if (!reference) {
    return "- 未读取到可用的本地关联需求文档；请确认 `proposal.md` 中的路径是否存在。";
  }

  return [
    `- 路径：${reference.reference}`,
    "",
    "> 摘录：",
    ...excerpt(reference.content).map((line) => `> ${line}`),
  ].join("\n");
}

function renderFeatureRows(proposal: string, requirementContent: string): string[] {
  const features = extractCandidateFeatures(requirementContent || proposal);
  if (features.length === 0) {
    return [
      "| REQ-001 | 核心流程 | 验证需求描述的主路径 | 待补充 | 待补充 | 参见需求文档 | 可测 |",
    ];
  }

  return features.map((feature, index) => {
    const id = `REQ-${String(index + 1).padStart(3, "0")}`;
    const escaped = escapeMarkdownTableCell(feature);
    return `| ${id} | ${escaped} | 验证${escaped}符合预期 | 待补充 | 待补充 | 参见需求文档 | 可测 |`;
  });
}

function extractCandidateFeatures(source: string): string[] {
  const features: string[] = [];

  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    const bullet = /^[-*]\s+(.+)$/.exec(trimmed);
    const heading = /^#{2,4}\s+(.+)$/.exec(trimmed);
    const candidate = bullet?.[1] ?? heading?.[1];

    if (candidate && !candidate.includes("待补充") && candidate.length <= 80) {
      features.push(candidate.replace(/^\[[^\]]+]\s*/, "").trim());
    }
  }

  return [...new Set(features)].slice(0, 5);
}

function toAnalysisFeature(name: string, index: number): AnalysisFeature {
  return { id: `REQ-${String(index + 1).padStart(3, "0")}`, name };
}

function parseAnalysisFeatures(analysis: string): AnalysisFeature[] {
  const features: AnalysisFeature[] = [];

  for (const line of analysis.split(/\r?\n/)) {
    const match = /^\|\s*(REQ-\d+)\s*\|\s*([^|]+?)\s*\|/.exec(line);
    const id = match?.[1];
    const name = match?.[2]?.trim();
    if (id && name && name !== "功能点") {
      features.push({ id, name });
    }
  }

  return features;
}

function parseAnalysisRisks(analysis: string): AnalysisRisk[] {
  const risks: AnalysisRisk[] = [];

  for (const line of analysis.split(/\r?\n/)) {
    const match = /^\|\s*(RISK-\d+)\s*\|\s*([^|]+?)\s*\|/.exec(line);
    const id = match?.[1];
    const title = match?.[2]?.trim();
    if (id && title && title !== "风险") {
      risks.push({ id, title });
    }
  }

  return risks;
}

function renderCoreTestPoints(features: AnalysisFeature[]): string[] {
  if (features.length === 0) {
    return ["- [TP-001] 覆盖需求描述的主要成功路径。"];
  }

  return features.map((feature, index) => {
    const id = `TP-${String(index + 1).padStart(3, "0")}`;
    return `- [${id}] 覆盖 ${feature.id} ${feature.name} 的主要成功路径。`;
  });
}

function renderRiskMappings(risks: AnalysisRisk[]): string[] {
  if (risks.length === 0) {
    return ["| RISK-001 | TP-001, TP-101, TP-201, TP-301, TP-401 |"];
  }

  return risks.map((risk) => `| ${risk.id} | TP-001, TP-101, TP-201, TP-301, TP-401 |`);
}

function extractSection(content: string, heading: string): string {
  const lines: string[] = [];
  let isCollecting = false;

  for (const line of content.split(/\r?\n/)) {
    const headingMatch = /^##\s+(.+)$/.exec(line);
    if (headingMatch?.[1]) {
      if (isCollecting) {
        break;
      }
      isCollecting = headingMatch[1].trim() === heading;
      continue;
    }

    if (isCollecting) {
      lines.push(line);
    }
  }

  return lines.join("\n").trim();
}

function excerpt(content: string): string[] {
  const lines = content
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 8);

  return lines.length > 0 ? lines : ["（空文档）"];
}

function escapeMarkdownTableCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}
