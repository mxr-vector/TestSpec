import { readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { ChangeWorkspace } from "./workspace.js";

export interface ProposalOptions {
  requirement?: string;
  testedObject?: string;
}

interface RequirementReference {
  reference: string;
  content: string;
}

interface AnalysisContext {
  proposal: string;
  requirementReference: RequirementReference | undefined;
}

interface AnalysisFeature {
  id: string;
  name: string;
}

interface AnalysisRisk {
  id: string;
  title: string;
}

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
