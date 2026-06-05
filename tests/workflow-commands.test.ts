import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProgram } from "../src/cli.js";

let originalCwd: string;
let tempDir: string;

beforeEach(async () => {
  originalCwd = process.cwd();
  tempDir = await mkdtemp(join(tmpdir(), "testpilot-"));
  process.chdir(tempDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  vi.restoreAllMocks();
});

describe("workflow command registration", () => {
  it("registers all workflow commands", () => {
    const program = createProgram();
    const names = program.commands.map((command) => command.name());

    expect(names).toContain("new");
    expect(names).toContain("analysis");
    expect(names).toContain("points");
    expect(names).toContain("excel");
    expect(names).toContain("mind");
    expect(names).toContain("report");
    expect(names).toContain("archive");
  });

  it("help output maps conceptual labels to CLI commands", () => {
    const help = createProgram().helpInformation();

    expect(help).toContain("test:new");
    expect(help).toContain("new");
    expect(help).toContain("analysis");
    expect(help).toContain("points");
    expect(help).toContain("excel");
    expect(help).toContain("mind");
    expect(help).toContain("report");
    expect(help).toContain("archive");
  });

  it("exposes force overwrite for the new command", () => {
    const command = createProgram().commands.find((entry) => entry.name() === "new");

    expect(command?.options.some((option) => option.long === "--force")).toBe(true);
  });
});

describe("workflow command actions", () => {
  it("creates planning artifacts through new, analysis, and points", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const program = createProgram();

    await mkdir(join(tempDir, "docs"));
    await writeFile(
      join(tempDir, "docs", "login.md"),
      ["# 登录需求", "", "- 用户可以使用密码登录。", "- 登录失败时展示错误提示。"].join("\n")
    );

    await program.parseAsync(["new", "login-v2", "--requirement", "docs/login.md"], {
      from: "user",
    });
    await program.parseAsync(["analysis", "login-v2"], { from: "user" });
    await program.parseAsync(["points", "login-v2"], { from: "user" });

    const proposal = await readFile(
      join(tempDir, "testpilot", "changes", "login-v2", "proposal.md"),
      "utf8"
    );
    const analysis = await readFile(
      join(tempDir, "testpilot", "changes", "login-v2", "requirements-analysis.md"),
      "utf8"
    );
    const points = await readFile(
      join(tempDir, "testpilot", "changes", "login-v2", "specs", "testpoints.md"),
      "utf8"
    );

    expect(proposal).toContain("## 被测对象");
    expect(proposal).toContain("docs/login.md");
    expect(analysis).toContain("已读取关联需求文档 `docs/login.md`");
    expect(analysis).toContain("用户可以使用密码登录");
    expect(points).toContain("覆盖 REQ-001 用户可以使用密码登录");
    expect(logSpy).toHaveBeenCalled();
  });
});
