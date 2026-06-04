import { describe, expect, it } from "vitest";
import { createProgram } from "../src/cli.js";

describe("createProgram", () => {
  it("creates the testpilot CLI program", () => {
    const program = createProgram();

    expect(program.name()).toBe("testpilot");
    expect(program.commands.some((command) => command.name() === "init")).toBe(true);
  });
});
