import type { Command } from "commander";
import { logInfo, logSuccess } from "../core/logger.js";
import { initializeTestPilot } from "../init/agent-init.js";

interface InitCommandOptions {
  agents?: string;
  force?: boolean;
}

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Initialize a TestPilot workspace in the current project")
    .option(
      "--agents <agents>",
      "comma-separated agent integrations to initialize: claude,qoder,codex,generic, or all"
    )
    .option("-f, --force", "overwrite existing TestPilot-generated agent command files")
    .action(async (options: InitCommandOptions) => {
      const initOptions = {
        force: options.force === true,
      };
      const result = await initializeTestPilot(
        options.agents === undefined ? initOptions : { ...initOptions, agents: options.agents }
      );

      logSuccess("Initialized TestPilot workspace.");
      logInfo(`Selected agents: ${result.selectedAgents.join(", ")}`);
      logInfo(`Workspace directories: ${result.directories.join(", ")}`);
      logInfo(
        `Outputs: ${result.created.length} created, ${result.refreshed.length} refreshed, ${result.preserved.length} preserved.`
      );
    });
}
