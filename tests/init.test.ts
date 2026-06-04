import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";
import { registerInitCommand } from "../src/commands/init.js";

describe("registerInitCommand", () => {
  it("registers the init command with its description", () => {
    const program = new Command();

    registerInitCommand(program);

    const initCommand = program.commands.find((command) => command.name() === "init");

    expect(initCommand).toBeDefined();
    expect(initCommand?.description()).toBe(
      "Initialize a TestPilot workspace in the current project"
    );
  });

  it("runs the current placeholder action", async () => {
    const program = new Command();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    registerInitCommand(program);
    await program.parseAsync(["init"], { from: "user" });

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "TestPilot workspace initialization will be implemented in a future change."
      )
    );

    logSpy.mockRestore();
  });
});
