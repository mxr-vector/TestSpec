import { join } from "node:path";
import type { Command } from "commander";
import { TestPilotError } from "../core/errors.js";
import { logSuccess } from "../core/logger.js";
import { archiveChange } from "../workflow/archive.js";
import {
  writeProposal,
  writeRequirementsAnalysis,
  writeTestPoints,
} from "../workflow/artifacts.js";
import { writeXmind } from "../workflow/mind.js";
import { readOrGeneratePerformanceCases } from "../workflow/performance.js";
import { writeReport } from "../workflow/report.js";
import { writeExcelWorkbook } from "../workflow/spreadsheet.js";
import { readOrGenerateStructuredCases } from "../workflow/testcases.js";
import { createChangeWorkspace, resolveChangeWorkspace } from "../workflow/workspace.js";

const WORKFLOW_DESCRIPTION =
  "Workflow labels: test:new, test:analysis, test:points, test:excel, test:mind, test:report, test:archive.";

export function registerWorkflowCommands(program: Command): void {
  program.addHelpText("after", `\n${WORKFLOW_DESCRIPTION}\n`);

  program
    .command("new")
    .description("Create a test proposal workspace (test:new)")
    .argument("<name>", "test change name")
    .option("-r, --requirement <path>", "requirement document path or URL")
    .option("-o, --object <name>", "tested object name")
    .option("-f, --force", "overwrite existing workspace")
    .action(
      async (name: string, options: { requirement?: string; object?: string; force?: boolean }) => {
        const workspace = await createChangeWorkspace(name, { force: options.force === true });
        const proposalOptions: { requirement?: string; testedObject?: string } = {};
        if (options.requirement) {
          proposalOptions.requirement = options.requirement;
        }
        if (options.object) {
          proposalOptions.testedObject = options.object;
        }
        const proposalPath = await writeProposal(workspace, proposalOptions);
        logSuccess(`Created test change ${workspace.name}: ${proposalPath}`);
      }
    );

  program
    .command("analysis")
    .description("Create requirement analysis for a test change (test:analysis)")
    .argument("[name]", "test change name")
    .action(async (name?: string) => {
      const workspace = await resolveChangeWorkspace(name);
      const outputPath = await writeRequirementsAnalysis(workspace);
      logSuccess(`Created requirement analysis: ${outputPath}`);
    });

  program
    .command("points")
    .description("Create core scenario test points (test:points)")
    .argument("[name]", "test change name")
    .action(async (name?: string) => {
      const workspace = await resolveChangeWorkspace(name);
      const outputPath = await writeTestPoints(workspace);
      logSuccess(`Created test points: ${outputPath}`);
    });

  program
    .command("excel")
    .description("Export executable Excel test cases (test:excel)")
    .argument("[name]", "test change name")
    .action(async (name?: string) => {
      const workspace = await resolveChangeWorkspace(name);
      const cases = await readOrGenerateStructuredCases(workspace);
      const performanceCases = await readOrGeneratePerformanceCases(workspace);
      const outputPath = join(workspace.artifactsDir, `${workspace.name}_cases.xlsx`);
      await writeExcelWorkbook(outputPath, cases, performanceCases);
      logSuccess(`Exported Excel test cases: ${outputPath}`);
    });

  program
    .command("mind")
    .description("Export XMind-style test cases for review (test:mind)")
    .argument("[name]", "test change name")
    .action(async (name?: string) => {
      const workspace = await resolveChangeWorkspace(name);
      const cases = await readOrGenerateStructuredCases(workspace);
      const outputPath = join(workspace.artifactsDir, `${workspace.name}_cases.xmind`);
      await writeXmind(outputPath, `${workspace.name} 测试用例`, cases);
      logSuccess(`Exported mind-map test cases: ${outputPath}`);
    });

  program
    .command("report")
    .description("Generate a test execution report from Excel results (test:report)")
    .argument("[name]", "test change name")
    .action(async (name?: string) => {
      const workspace = await resolveChangeWorkspace(name);
      const outputPath = await writeReport(workspace);
      logSuccess(`Generated test report: ${outputPath}`);
    });

  program
    .command("archive")
    .description("Archive the full test artifact chain (test:archive)")
    .argument("[name]", "test change name")
    .action(async (name?: string) => {
      const workspace = await resolveChangeWorkspace(name);
      const outputPath = await archiveChange(workspace);
      logSuccess(`Archived test change: ${outputPath}`);
    });
}

export function ensureWorkflowPreconditions(condition: boolean, message: string): void {
  if (!condition) {
    throw new TestPilotError(message);
  }
}
