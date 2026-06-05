import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProgram } from "../src/cli.js";
import { registerInitCommand } from "../src/commands/init.js";
import {
  createAgentSelectionItems,
  GENERATED_FILE_MARKER,
  initializeTestSpec,
  parseAgentSelection,
  promptAgentSelection,
  selectedAgentIds,
  toggleAgentSelection,
  WORKFLOW_COMMANDS,
} from "../src/init/agent-init.js";

let originalCwd: string;
let tempDir: string;

beforeEach(async () => {
  originalCwd = process.cwd();
  tempDir = await mkdtemp(join(tmpdir(), "testspec-init-"));
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
      "Initialize a TestSpec workspace in the current project"
    );
    expect(initCommand?.options.some((option) => option.long === "--agents")).toBe(true);
    expect(initCommand?.options.some((option) => option.long === "--force")).toBe(true);
  });

  it("runs the init action through the CLI program", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const program = createProgram();

    await program.parseAsync(["init", "--agents", "claude"], { from: "user" });

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Initialized TestSpec workspace."));
    await expect(stat(join(tempDir, "testspec", "changes", "archive"))).resolves.toMatchObject({});
  });
});

describe("initializeTestSpec", () => {
  it("creates workspace directories", async () => {
    await initializeTestSpec({ agents: "claude" });

    const changes = await stat(join(tempDir, "testspec", "changes"));
    const archive = await stat(join(tempDir, "testspec", "changes", "archive"));

    expect(changes.isDirectory()).toBe(true);
    expect(archive.isDirectory()).toBe(true);
  });

  it("generates only selected non-interactive agent integrations", async () => {
    await initializeTestSpec({ agents: "qoder" });

    await expect(
      readFile(join(tempDir, ".qoder", "commands", "test", "new.md"), "utf8")
    ).resolves.toContain("testspec new <name> --requirement <path>");
    await expect(
      readFile(join(tempDir, ".claude", "commands", "test", "new.md"), "utf8")
    ).rejects.toThrow();
    await expect(readFile(join(tempDir, "AGENTS.md"), "utf8")).rejects.toThrow();
  });

  it("generates all Claude Code workflow command files", async () => {
    await initializeTestSpec({ agents: "claude" });

    for (const command of WORKFLOW_COMMANDS) {
      const content = await readFile(
        join(tempDir, ".claude", "commands", "test", `${command.id}.md`),
        "utf8"
      );

      expect(content).toContain(command.slashCommand);
      expect(content).toContain(command.label);
      expect(content).toContain(command.backingCommand);
      expect(content).toContain("Provider-neutral generation rules");
    }
  });

  it("generates semantic workflow prompts for agent-grounded commands", async () => {
    await initializeTestSpec({ agents: "claude" });

    const analysis = await readFile(
      join(tempDir, ".claude", "commands", "test", "analysis.md"),
      "utf8"
    );
    const points = await readFile(
      join(tempDir, ".claude", "commands", "test", "points.md"),
      "utf8"
    );
    const excel = await readFile(join(tempDir, ".claude", "commands", "test", "excel.md"), "utf8");

    expect(analysis).toContain("Read the local requirement document");
    expect(analysis).toContain("Generate `requirements-analysis.md` with requirement IDs");
    expect(points).toContain("Generate `specs/testpoints.md` with stable `TP-xxx` IDs");
    expect(excel).toContain("Generate or update `artifacts/testcases.json`");
    expect(excel).toContain("Run `testspec validate [name]`");
  });

  it("generates all Qoder workflow command files", async () => {
    await initializeTestSpec({ agents: "qoder" });

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

    await initializeTestSpec({ agents: "codex" });
    const content = await readFile(join(tempDir, "AGENTS.md"), "utf8");

    expect(content).toContain("# Existing Guidance");
    expect(content).toContain("Keep this.");
    expect(content).toContain("BEGIN TESTSPEC AGENT WORKFLOW");
    expect(content).toContain("test:new");
    expect(content).toContain("testspec new <name> --requirement <path>");
    expect(content).toContain("agent-executed generation and CLI-managed validation/export");
    expect(content).toContain("testspec validate [name]");
  });

  it("creates AGENTS.md for generic agent guidance", async () => {
    await initializeTestSpec({ agents: "generic" });

    const content = await readFile(join(tempDir, "AGENTS.md"), "utf8");

    expect(content).toContain("BEGIN TESTSPEC AGENT WORKFLOW");
    expect(content).toContain("Generic Agent guidance");
    expect(content).toContain("testspec new <name> --requirement <path>");
  });

  it("initializes all built-in agents", async () => {
    await initializeTestSpec({ agents: "all" });

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

  it("preserves existing TestSpec AGENTS.md section unless force is provided", async () => {
    await initializeTestSpec({ agents: "codex" });
    await writeFile(
      join(tempDir, "AGENTS.md"),
      [
        "# Existing Guidance",
        "",
        "<!-- BEGIN TESTSPEC AGENT WORKFLOW -->",
        "custom TestSpec section",
        "<!-- END TESTSPEC AGENT WORKFLOW -->",
        "",
        "Keep this.",
      ].join("\n")
    );

    const first = await initializeTestSpec({ agents: "generic" });
    expect(first.preserved.some((path) => path.endsWith("AGENTS.md"))).toBe(true);
    await expect(readFile(join(tempDir, "AGENTS.md"), "utf8")).resolves.toContain(
      "custom TestSpec section"
    );

    await initializeTestSpec({ agents: "generic", force: true });
    const content = await readFile(join(tempDir, "AGENTS.md"), "utf8");
    expect(content).not.toContain("custom TestSpec section");
    expect(content).toContain("Generic Agent guidance");
    expect(content).toContain("Keep this.");
  });

  it("is idempotent and refreshes generated command files after cleanup", async () => {
    await initializeTestSpec({ agents: "claude,codex" });
    const second = await initializeTestSpec({ agents: "claude,codex" });

    expect(second.removed.length).toBe(WORKFLOW_COMMANDS.length);
    expect(second.created.length).toBe(0);
    expect(second.refreshed.length).toBe(WORKFLOW_COMMANDS.length);
    expect(second.preserved.some((path) => path.endsWith("AGENTS.md"))).toBe(true);
    await expect(
      readFile(join(tempDir, ".claude", "commands", "test", "new.md"), "utf8")
    ).resolves.toContain("/test:new");
  });

  it("removes stale generated command files before regenerating selected commands", async () => {
    const commandDir = join(tempDir, ".claude", "commands", "test");
    const stalePath = join(commandDir, "old.md");
    await mkdir(commandDir, { recursive: true });
    await writeFile(stalePath, `${GENERATED_FILE_MARKER}\n\n# /test:old\n`);

    const result = await initializeTestSpec({ agents: "claude" });

    expect(
      result.removed.some((path) => path.endsWith(join(".claude", "commands", "test", "old.md")))
    ).toBe(true);
    await expect(readFile(stalePath, "utf8")).rejects.toThrow();
    await expect(readFile(join(commandDir, "new.md"), "utf8")).resolves.toContain("/test:new");
  });

  it("preserves custom command files unless force is provided", async () => {
    const customPath = join(tempDir, ".claude", "commands", "test", "new.md");
    await mkdir(join(tempDir, ".claude", "commands", "test"), { recursive: true });
    await writeFile(customPath, "custom command\n");

    const first = await initializeTestSpec({ agents: "claude" });
    expect(first.removed).not.toContain(customPath);
    expect(first.preserved.some((path) => path.endsWith(".claude/commands/test/new.md"))).toBe(
      true
    );
    await expect(readFile(customPath, "utf8")).resolves.toBe("custom command\n");

    await initializeTestSpec({ agents: "claude", force: true });
    await expect(readFile(customPath, "utf8")).resolves.toContain(
      "testspec new <name> --requirement <path>"
    );
  });

  it("removes generated command files for integrations omitted from the current selection", async () => {
    const qoderCommandDir = join(tempDir, ".qoder", "commands", "test");
    const stalePath = join(qoderCommandDir, "excel.md");
    await mkdir(qoderCommandDir, { recursive: true });
    await writeFile(stalePath, `${GENERATED_FILE_MARKER}\n\n# /test:excel\n`);

    const result = await initializeTestSpec({ agents: "codex" });

    expect(
      result.removed.some((path) => path.endsWith(join(".qoder", "commands", "test", "excel.md")))
    ).toBe(true);
    await expect(readFile(stalePath, "utf8")).rejects.toThrow();
    await expect(readFile(join(qoderCommandDir, "new.md"), "utf8")).rejects.toThrow();
  });

  it("uses non-TTY defaults without hanging", async () => {
    const result = await initializeTestSpec();

    expect(result.selectedAgents).toEqual(["claude", "codex"]);
    await expect(
      readFile(join(tempDir, ".claude", "commands", "test", "new.md"), "utf8")
    ).resolves.toContain("/test:new");
    await expect(readFile(join(tempDir, "AGENTS.md"), "utf8")).resolves.toContain("Codex");
  });

  it("pauses interactive input again after confirming selection", async () => {
    type InteractiveInput = PassThrough & {
      isRaw: boolean;
      isTTY: boolean;
      setRawMode: (mode: boolean) => InteractiveInput;
    };
    const input = new PassThrough() as InteractiveInput;
    const output = new PassThrough() as unknown as NodeJS.WriteStream;
    input.isTTY = true;
    input.isRaw = false;
    input.setRawMode = (mode: boolean) => {
      input.isRaw = mode;
      return input;
    };
    input.pause();

    const selection = promptAgentSelection(input as unknown as NodeJS.ReadStream, output);
    input.write("\r");

    await expect(selection).resolves.toEqual(["claude", "codex"]);
    expect(input.isPaused()).toBe(true);
    expect(input.isRaw).toBe(false);
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
