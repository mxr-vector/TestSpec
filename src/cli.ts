import { Command } from "commander";
import { registerInitCommand } from "./commands/init.js";
import { getPackageInfo } from "./utils/package-info.js";

export function createProgram(): Command {
  const packageInfo = getPackageInfo();
  const program = new Command();

  program
    .name("testpilot")
    .description("Requirement-driven test design CLI for AI-assisted QA workflows.")
    .version(packageInfo.version);

  registerInitCommand(program);

  return program;
}

export async function runCli(argv: string[] = process.argv): Promise<void> {
  const program = createProgram();
  await program.parseAsync(argv);
}
