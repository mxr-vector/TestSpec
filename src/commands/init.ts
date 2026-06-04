import type { Command } from "commander";
import { logInfo } from "../core/logger.js";

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Initialize a TestPilot workspace in the current project")
    .action(() => {
      logInfo("TestPilot workspace initialization will be implemented in a future change.");
    });
}
