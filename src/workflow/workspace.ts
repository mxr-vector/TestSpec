/**
 * @fileoverview TestSpec 工作区管理模块
 *
 * 该模块实现了 TestSpec 工作区的管理功能，包括：
 * 1. 工作区目录结构的定义和解析
 * 2. 测试变更工作区的创建和解析
 * 3. 活跃测试变更的列表和管理
 * 4. 目录存在性检查和断言
 *
 * 工作区目录结构：
 * testspec/
 *   ├── changes/
 *   │   ├── <name>/           # 测试变更目录
 *   │   │   ├── proposal.md   # 测试提案
 *   │   │   ├── requirements-analysis.md  # 需求分析
 *   │   │   ├── specs/
 *   │   │   │   └── testpoints.md  # 测试点清单
 *   │   │   ├── artifacts/
 *   │   │   │   ├── testcases.json  # 结构化测试用例
 *   │   │   │   ├── performance-cases.json  # 性能测试用例
 *   │   │   │   ├── <name>_cases.xlsx  # Excel 测试用例
 *   │   │   │   └── <name>_cases.xmind  # 思维导图测试用例
 *   │   │   └── report.md  # 测试报告
 *   │   └── archive/           # 归档目录
 *   │       └── <date>-<name>/  # 归档的测试变更
 *   │           ├── manifest.json
 *   │           └── ...
 *
 * 使用场景：
 * - 创建新的测试变更工作区
 * - 解析已有的测试变更工作区
 * - 列出所有活跃的测试变更
 * - 验证目录存在性
 */

import { access, mkdir, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { WORKSPACE_CONFIG } from "../core/config.js";
import { TestSpecError } from "../core/errors.js";
import { normalizeChangeName } from "./names.js";

/** 工作区根目录名称 */
export const WORKSPACE_ROOT = WORKSPACE_CONFIG.root;

/** 变更目录名称 */
export const CHANGES_DIR = WORKSPACE_CONFIG.changesDir;

/** 归档目录名称 */
export const ARCHIVE_DIR = WORKSPACE_CONFIG.archiveDir;

/**
 * 测试变更工作区接口
 *
 * @interface ChangeWorkspace
 * @property {string} name - 测试变更名称（已规范化）
 * @property {string} rootDir - 变更根目录路径（testspec/changes/）
 * @property {string} changeDir - 测试变更目录路径（testspec/changes/<name>/）
 * @property {string} specsDir - 规格目录路径（testspec/changes/<name>/specs/）
 * @property {string} artifactsDir - 产物目录路径（testspec/changes/<name>/artifacts/）
 */
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

/**
 * 构建测试变更工作区对象
 *
 * 该函数负责：
 * 1. 规范化测试变更名称
 * 2. 计算各种目录路径
 * 3. 返回工作区对象
 *
 * @param {string} name - 测试变更名称（将被规范化）
 * @param {string} [cwd] - 工作目录，默认为 process.cwd()
 * @returns {ChangeWorkspace} 测试变更工作区对象
 *
 * @example
 * ```typescript
 * const workspace = buildChangeWorkspace('My Feature');
 * console.log(workspace.name);  // 输出: "my-feature"
 * console.log(workspace.changeDir);  // 输出: "/path/to/testspec/changes/my-feature"
 * console.log(workspace.specsDir);  // 输出: "/path/to/testspec/changes/my-feature/specs"
 * console.log(workspace.artifactsDir);  // 输出: "/path/to/testspec/changes/my-feature/artifacts"
 * ```
 */
export function buildChangeWorkspace(name: string, cwd = process.cwd()): ChangeWorkspace {
  // 规范化测试变更名称
  const normalizedName = normalizeChangeName(name);

  // 计算变更根目录路径
  const rootDir = getChangesRoot(cwd);

  // 计算测试变更目录路径
  const changeDir = join(rootDir, normalizedName);

  return {
    name: normalizedName,
    rootDir,
    changeDir,
    specsDir: join(changeDir, WORKSPACE_CONFIG.specsDir),
    artifactsDir: join(changeDir, WORKSPACE_CONFIG.artifactsDir),
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

/**
 * 解析测试变更工作区
 *
 * 该函数负责：
 * 1. 如果指定了名称，构建并验证工作区
 * 2. 如果未指定名称，自动检测唯一的工作区
 * 3. 如果有多个活跃工作区，要求用户指定名称
 * 4. 如果没有活跃工作区，抛出错误
 *
 * @param {string} [name] - 测试变更名称（可选）
 * @param {string} [cwd] - 工作目录，默认为 process.cwd()
 * @returns {Promise<ChangeWorkspace>} 测试变更工作区对象
 * @throws {TestSpecError} 如果工作区不存在、有多个工作区或没有工作区
 *
 * @example
 * ```typescript
 * // 指定名称
 * const workspace = await resolveChangeWorkspace('my-feature');
 *
 * // 自动检测唯一的工作区
 * const workspace = await resolveChangeWorkspace();
 *
 * // 如果有多个工作区，会抛出错误
 * // Error: Multiple active test changes found: feature-a, feature-b. Specify a change name.
 * ```
 */
export async function resolveChangeWorkspace(
  name?: string,
  cwd = process.cwd()
): Promise<ChangeWorkspace> {
  // 如果指定了名称，构建并验证工作区
  if (name && name.trim().length > 0) {
    const workspace = buildChangeWorkspace(name, cwd);

    // 验证工作区目录是否存在
    if (!(await pathExists(workspace.changeDir))) {
      throw new TestSpecError(`Test change not found: ${workspace.name}`);
    }

    return workspace;
  }

  // 如果未指定名称，自动检测唯一的工作区
  const activeChanges = await listActiveChanges(cwd);

  // 如果没有活跃工作区，抛出错误
  if (activeChanges.length === 0) {
    throw new TestSpecError("No active test changes found. Create one with `testspec new <name>`.");
  }

  // 如果有多个活跃工作区，要求用户指定名称
  if (activeChanges.length > 1) {
    throw new TestSpecError(
      `Multiple active test changes found: ${activeChanges.join(", ")}. Specify a change name.`
    );
  }

  // 使用唯一的工作区名称
  const inferredName = activeChanges[0];
  if (!inferredName) {
    throw new TestSpecError("No active test changes found. Create one with `testspec new <name>`.");
  }

  return buildChangeWorkspace(inferredName, cwd);
}

/**
 * 创建测试变更工作区
 *
 * 该函数负责：
 * 1. 构建工作区对象
 * 2. 检查工作区是否已存在（除非 force 为 true）
 * 3. 创建 specs/ 和 artifacts/ 子目录
 * 4. 返回工作区对象
 *
 * @param {string} name - 测试变更名称（将被规范化）
 * @param {Object} [options] - 可选配置
 * @param {string} [options.cwd] - 工作目录，默认为 process.cwd()
 * @param {boolean} [options.force] - 是否强制覆盖已有工作区，默认为 false
 * @returns {Promise<ChangeWorkspace>} 测试变更工作区对象
 * @throws {TestSpecError} 如果工作区已存在且 force 为 false
 *
 * @example
 * ```typescript
 * // 创建新工作区
 * const workspace = await createChangeWorkspace('my-feature');
 *
 * // 强制覆盖已有工作区
 * const workspace = await createChangeWorkspace('my-feature', { force: true });
 *
 * // 指定工作目录
 * const workspace = await createChangeWorkspace('my-feature', { cwd: '/path/to/project' });
 * ```
 */
export async function createChangeWorkspace(
  name: string,
  options: { cwd?: string; force?: boolean } = {}
): Promise<ChangeWorkspace> {
  // 构建工作区对象
  const workspace = buildChangeWorkspace(name, options.cwd);

  // 检查工作区是否已存在（除非 force 为 true）
  if ((await pathExists(workspace.changeDir)) && !options.force) {
    throw new TestSpecError(
      `Test change already exists: ${workspace.name}. Refusing to overwrite existing artifacts.`
    );
  }

  // 创建 specs/ 和 artifacts/ 子目录
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
