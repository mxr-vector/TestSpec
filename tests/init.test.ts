import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProgram } from "../src/cli.js";
import { registerInitCommand } from "../src/commands/init.js";
import {
  createAgentSelectionItems,
  initializeTestPilot,
  parseAgentSelection,
  selectedAgentIds,
  toggleAgentSelection,
  WORKFLOW_COMMANDS,
} from "../src/init/agent-init.js";

let originalCwd: string;
let tempDir: string;

beforeEach(async () => {
  originalCwd = process.cwd();
  tempDir = await mkdtemp(join(tmpdir(), "testpilot-init-"));
  process.chdir(tempDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  vi.restoreAllMocks();
});

describe("registerInitCommand", () => {
  it("registers the init command with its description and options", () => {
    const program = new Command();

    registerInitCommand(program);

    const initCommand = program.commands.find((command) => command.name() === "init");

    expect(initCommand).toBeDefined();
    expect(initCommand?.description()).toBe(
      "Initialize a TestPilot workspace in the current project"
    );
    expect(initCommand?.options.some((option) => option.long === "--agents")).toBe(true);
    expect(initCommand?.options.some((option) => option.long === "--force")).toBe(true);
  });

  it("runs the init action through the CLI program", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const program = createProgram();

    await program.parseAsync(["init", "--agents", "claude"], { from: "user" });

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Initialized TestPilot workspace.")
    );
    await expect(stat(join(tempDir, "testpilot", "changes", "archive"))).resolves.toMatchObject({});
  });
});

describe("initializeTestPilot", () => {
  it("creates workspace directories", async () => {
    await initializeTestPilot({ agents: "claude" });

    const changes = await stat(join(tempDir, "testpilot", "changes"));
    const archive = await stat(join(tempDir, "testpilot", "changes", "archive"));

    expect(changes.isDirectory()).toBe(true);
    expect(archive.isDirectory()).toBe(true);
  });

  it("generates only selected non-interactive agent integrations", async () => {
    await initializeTestPilot({ agents: "qoder" });

    await expect(
      readFile(join(tempDir, ".qoder", "commands", "test", "new.md"), "utf8")
    ).resolves.toContain("testpilot new <name> --requirement <path>");
    await expect(
      readFile(join(tempDir, ".claude", "commands", "test", "new.md"), "utf8")
    ).rejects.toThrow();
    await expect(readFile(join(tempDir, "AGENTS.md"), "utf8")).rejects.toThrow();
  });

  it("generates all Claude Code workflow command files", async () => {
    await initializeTestPilot({ agents: "claude" });

    for (const command of WORKFLOW_COMMANDS) {
      const content = await readFile(
        join(tempDir, ".claude", "commands", "test", `${command.id}.md`),
        "utf8"
      );

      expect(content).toContain(command.slashCommand);
      expect(content).toContain(command.label);
      expect(content).toContain(command.backingCommand);
    }
  });

  it("generates all Qoder workflow command files", async () => {
    await initializeTestPilot({ agents: "qoder" });

    for (const command of WORKFLOW_COMMANDS) {
      const content = await readFile(
        join(tempDir, ".qoder", "commands", "test", `${command.id}.md`),
        "utf8"
      );

      expect(content).toContain(command.slashCommand);
      expect(content).toContain(command.label);
      expect(content).toContain(command.backingCommand);
    }
  });

  it("creates AGENTS.md for Codex and preserves existing project guidance", async () => {
    await writeFile(join(tempDir, "AGENTS.md"), "# Existing Guidance\n\nKeep this.\n");

    await initializeTestPilot({ agents: "codex" });
    const content = await readFile(join(tempDir, "AGENTS.md"), "utf8");

    expect(content).toContain("# Existing Guidance");
    expect(content).toContain("Keep this.");
    expect(content).toContain("BEGIN TESTPILOT AGENT WORKFLOW");
    expect(content).toContain("test:new");
    expect(content).toContain("testpilot new <name> --requirement <path>");
  });

  it("creates AGENTS.md for generic agent guidance", async () => {
    await initializeTestPilot({ agents: "generic" });

    const content = await readFile(join(tempDir, "AGENTS.md"), "utf8");

    expect(content).toContain("BEGIN TESTPILOT AGENT WORKFLOW");
    expect(content).toContain("Generic Agent guidance");
    expect(content).toContain("testpilot new <name> --requirement <path>");
  });

  it("initializes all built-in agents", async () => {
    await initializeTestPilot({ agents: "all" });

    await expect(
      readFile(join(tempDir, ".claude", "commands", "test", "new.md"), "utf8")
    ).resolves.toContain("/test:new");
    await expect(
      readFile(join(tempDir, ".qoder", "commands", "test", "new.md"), "utf8")
    ).resolves.toContain("/test:new");
    await expect(readFile(join(tempDir, "AGENTS.md"), "utf8")).resolves.toContain(
      "Generic Agent guidance"
    );
  });

  it("preserves existing TestPilot AGENTS.md section unless force is provided", async () => {
    await initializeTestPilot({ agents: "codex" });
    await writeFile(
      join(tempDir, "AGENTS.md"),
      [
        "# Existing Guidance",
        "",
        "<!-- BEGIN TESTPILOT AGENT WORKFLOW -->",
        "custom TestPilot section",
        "<!-- END TESTPILOT AGENT WORKFLOW -->",
        "",
        "Keep this.",
      ].join("\n")
    );

    const first = await initializeTestPilot({ agents: "generic" });
    expect(first.preserved.some((path) => path.endsWith("AGENTS.md"))).toBe(true);
    await expect(readFile(join(tempDir, "AGENTS.md"), "utf8")).resolves.toContain(
      "custom TestPilot section"
    );

    await initializeTestPilot({ agents: "generic", force: true });
    const content = await readFile(join(tempDir, "AGENTS.md"), "utf8");
    expect(content).not.toContain("custom TestPilot section");
    expect(content).toContain("Generic Agent guidance");
    expect(content).toContain("Keep this.");
  });

  it("is idempotent and refreshes generated command files", async () => {
    await initializeTestPilot({ agents: "claude,codex" });
    const second = await initializeTestPilot({ agents: "claude,codex" });

    expect(second.refreshed.length).toBeGreaterThan(0);
    expect(second.preserved.some((path) => path.endsWith("AGENTS.md"))).toBe(true);
  });

  it("preserves custom command files unless force is provided", async () => {
    const customPath = join(tempDir, ".claude", "commands", "test", "new.md");
    await mkdir(join(tempDir, ".claude", "commands", "test"), { recursive: true });
    await writeFile(customPath, "custom command\n");

    const first = await initializeTestPilot({ agents: "claude" });
    expect(first.preserved.some((path) => path.endsWith(".claude/commands/test/new.md"))).toBe(
      true
    );
    await expect(readFile(customPath, "utf8")).resolves.toBe("custom command\n");

    await initializeTestPilot({ agents: "claude", force: true });
    await expect(readFile(customPath, "utf8")).resolves.toContain(
      "testpilot new <name> --requirement <path>"
    );
  });

  it("uses non-TTY defaults without hanging", async () => {
    const result = await initializeTestPilot();

    expect(result.selectedAgents).toEqual(["claude", "codex"]);
    await expect(
      readFile(join(tempDir, ".claude", "commands", "test", "new.md"), "utf8")
    ).resolves.toContain("/test:new");
    await expect(readFile(join(tempDir, "AGENTS.md"), "utf8")).resolves.toContain("Codex");
  });
});

describe("agent selection helpers", () => {
  it("parses non-interactive agent selections", () => {
    expect(parseAgentSelection("claude,qoder,codex")).toEqual(["claude", "qoder", "codex"]);
    expect(parseAgentSelection("all")).toEqual(["claude", "qoder", "codex", "generic"]);
    expect(() => parseAgentSelection("unknown")).toThrow("Unknown agent");
  });

  it("toggles interactive selection state", () => {
    const items = createAgentSelectionItems(["claude"]);

    expect(selectedAgentIds(items)).toEqual(["claude"]);
    expect(selectedAgentIds(toggleAgentSelection(items, 1))).toEqual(["claude", "qoder"]);
    expect(selectedAgentIds(toggleAgentSelection(items, 0))).toEqual([]);
  });
});
