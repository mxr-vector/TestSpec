import { access, mkdir, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { TestSpecError } from "../core/errors.js";
import { normalizeChangeName } from "./names.js";

export const WORKSPACE_ROOT = "testspec";
export const CHANGES_DIR = "changes";
export const ARCHIVE_DIR = "archive";

export interface ChangeWorkspace {
  name: string;
  rootDir: string;
  changeDir: string;
  specsDir: string;
  artifactsDir: string;
}

export function getWorkspaceRoot(cwd = process.cwd()): string {
  return resolveFromCwdFrom(cwd, WORKSPACE_ROOT);
}

export function getChangesRoot(cwd = process.cwd()): string {
  return resolveFromCwdFrom(cwd, WORKSPACE_ROOT, CHANGES_DIR);
}

export function getArchiveRoot(cwd = process.cwd()): string {
  return resolveFromCwdFrom(cwd, WORKSPACE_ROOT, CHANGES_DIR, ARCHIVE_DIR);
}

export function buildChangeWorkspace(name: string, cwd = process.cwd()): ChangeWorkspace {
  const normalizedName = normalizeChangeName(name);
  const rootDir = getChangesRoot(cwd);
  const changeDir = join(rootDir, normalizedName);

  return {
    name: normalizedName,
    rootDir,
    changeDir,
    specsDir: join(changeDir, "specs"),
    artifactsDir: join(changeDir, "artifacts"),
  };
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function listActiveChanges(cwd = process.cwd()): Promise<string[]> {
  const changesRoot = getChangesRoot(cwd);

  if (!(await pathExists(changesRoot))) {
    return [];
  }

  const entries = await readdir(changesRoot, { withFileTypes: true });
  const active = entries
    .filter((entry) => entry.isDirectory() && entry.name !== ARCHIVE_DIR)
    .map((entry) => entry.name)
    .sort();

  return active;
}

export async function resolveChangeWorkspace(
  name?: string,
  cwd = process.cwd()
): Promise<ChangeWorkspace> {
  if (name && name.trim().length > 0) {
    const workspace = buildChangeWorkspace(name, cwd);

    if (!(await pathExists(workspace.changeDir))) {
      throw new TestSpecError(`Test change not found: ${workspace.name}`);
    }

    return workspace;
  }

  const activeChanges = await listActiveChanges(cwd);

  if (activeChanges.length === 0) {
    throw new TestSpecError("No active test changes found. Create one with `testspec new <name>`.");
  }

  if (activeChanges.length > 1) {
    throw new TestSpecError(
      `Multiple active test changes found: ${activeChanges.join(", ")}. Specify a change name.`
    );
  }

  const inferredName = activeChanges[0];
  if (!inferredName) {
    throw new TestSpecError("No active test changes found. Create one with `testspec new <name>`.");
  }

  return buildChangeWorkspace(inferredName, cwd);
}

export async function createChangeWorkspace(
  name: string,
  options: { cwd?: string; force?: boolean } = {}
): Promise<ChangeWorkspace> {
  const workspace = buildChangeWorkspace(name, options.cwd);

  if ((await pathExists(workspace.changeDir)) && !options.force) {
    throw new TestSpecError(
      `Test change already exists: ${workspace.name}. Refusing to overwrite existing artifacts.`
    );
  }

  await mkdir(workspace.specsDir, { recursive: true });
  await mkdir(workspace.artifactsDir, { recursive: true });

  return workspace;
}

export async function assertDirectory(path: string, message: string): Promise<void> {
  try {
    const info = await stat(path);
    if (!info.isDirectory()) {
      throw new TestSpecError(message);
    }
  } catch (error) {
    if (error instanceof TestSpecError) {
      throw error;
    }
    throw new TestSpecError(message);
  }
}

function resolveFromCwdFrom(cwd: string, ...segments: string[]): string {
  return resolve(cwd, ...segments);
}
