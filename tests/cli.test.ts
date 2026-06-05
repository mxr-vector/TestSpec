import { describe, expect, it } from "vitest";
import { createProgram } from "../src/cli.js";

describe("createProgram", () => {
  it("creates the testspec CLI program", () => {
    const program = createProgram();

    expect(program.name()).toBe("testspec");
    const commandNames = program.commands.map((command) => command.name());

    expect(commandNames).toContain("init");
    expect(commandNames).toContain("new");
    expect(commandNames).toContain("analysis");
    expect(commandNames).toContain("points");
    expect(commandNames).toContain("validate");
    expect(commandNames).toContain("excel");
    expect(commandNames).toContain("mind");
    expect(commandNames).toContain("report");
    expect(commandNames).toContain("archive");
  });
});
