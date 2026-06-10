import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WORKSPACE_CONFIG } from "../src/core/config.js";
import { TestSpecError } from "../src/core/errors.js";
import { normalizeChangeName } from "../src/workflow/names.js";
import {
  buildChangeWorkspace,
  createChangeWorkspace,
  resolveChangeWorkspace,
} from "../src/workflow/workspace.js";

let originalCwd: string;
let tempDir: string;

beforeEach(async () => {
  originalCwd = process.cwd();
  tempDir = await mkdtemp(join(tmpdir(), "testspec-"));
  process.chdir(tempDir);
});

afterEach(() => {
  process.chdir(originalCwd);
});

describe("normalizeChangeName", () => {
  it("normalizes names to kebab-case-compatible slugs", () => {
    expect(normalizeChangeName(" Login V2!! ")).toBe("login-v2");
    expect(normalizeChangeName("release_2.0")).toBe("release_2.0");
  });

  it("rejects empty names", () => {
    expect(() => normalizeChangeName("!!!")).toThrow(TestSpecError);
  });
});

describe("change workspace", () => {
  it("creates specs and artifacts directories without overwriting existing workspaces", async () => {
    const workspace = await createChangeWorkspace("Login V2");

    expect(workspace.name).toBe("login-v2");
    await expect(mkdir(workspace.specsDir)).rejects.toThrow();
    await expect(createChangeWorkspace("login-v2")).rejects.toThrow(TestSpecError);
  });

  it("resolves explicit and single active changes", async () => {
    await createChangeWorkspace("login-v2");

    await expect(resolveChangeWorkspace("login-v2")).resolves.toMatchObject({ name: "login-v2" });
    await expect(resolveChangeWorkspace()).resolves.toMatchObject({ name: "login-v2" });
  });

  it("rejects ambiguous active changes", async () => {
    await createChangeWorkspace("login-v2");
    await createChangeWorkspace("checkout-v2");

    await expect(resolveChangeWorkspace()).rejects.toThrow(/Multiple active test changes/);
  });

  it("builds paths under testspec changes", () => {
    const workspace = buildChangeWorkspace("login-v2");

    expect(
      workspace.changeDir.endsWith(
        join(WORKSPACE_CONFIG.root, WORKSPACE_CONFIG.changesDir, "login-v2")
      )
    ).toBe(true);
  });
});
