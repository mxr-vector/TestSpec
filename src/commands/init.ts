import type { Command } from "commander";
import { logInfo, logSuccess } from "../core/logger.js";
import { initializeTestSpec } from "../init/agent-init.js";

interface InitCommandOptions {
  agents?: string;
  force?: boolean;
}

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Initialize a TestSpec workspace in the current project")
    .option(
      "--agents <agents>",
      "comma-separated agent integrations to initialize: claude,codex,qoder,trae,generic, or all"
    )
    .option("-f, --force", "overwrite existing TestSpec-generated agent command files")
    .action(async (options: InitCommandOptions) => {
      const initOptions = {
        force: options.force === true,
      };
      const result = await initializeTestSpec(
        options.agents === undefined ? initOptions : { ...initOptions, agents: options.agents }
      );

      logSuccess("Initialized TestSpec workspace.");
      logInfo(`Selected agents: ${result.selectedAgents.join(", ")}`);
      logInfo(`Workspace directories: ${result.directories.join(", ")}`);
      logInfo("Cleaned generated command files for selected command integrations.");
      logInfo(
        `Outputs: ${result.created.length} created, ${result.refreshed.length} refreshed, ${result.preserved.length} preserved, ${result.removed.length} removed.`
      );
    });
}
