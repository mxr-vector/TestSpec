/**
 * @fileoverview TestSpec 归档模块
 * 
 * 该模块实现了测试变更的归档功能，包括：
 * 1. 生成 manifest.json 清单文件
 * 2. 将测试变更目录移动到归档目录
 * 3. 支持跨文件系统的复制+删除操作
 * 4. 记录归档时间、关联需求文档、产物列表和报告摘要
 * 
 * 归档目录结构：
 * testspec/changes/archive/
 *   └── <date>-<name>/
 *       ├── manifest.json
 *       ├── proposal.md
 *       ├── requirements-analysis.md
 *       ├── specs/
 *       │   └── testpoints.md
 *       ├── artifacts/
 *       │   ├── testcases.json
 *       │   ├── performance-cases.json
 *       │   ├── <name>_cases.xlsx
 *       │   └── <name>_cases.xmind
 *       └── report.md
 * 
 * manifest.json 包含：
 * - name: 测试变更名称
 * - archivedAt: 归档日期（YYYY-MM-DD 格式）
 * - requirement: 关联需求文档路径（可选）
 * - artifacts: 所有产物文件的相对路径列表
 * - reportSummary: 测试报告摘要统计
 */

import { cp, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { TestSpecError } from "../core/errors.js";
import { readReportSummary } from "./report.js";
import type { ChangeWorkspace } from "./workspace.js";
import { getArchiveRoot, pathExists } from "./workspace.js";

/**
 * 归档清单接口
 * 
 * @interface ArchiveManifest
 * @property {string} name - 测试变更名称
 * @property {string} archivedAt - 归档日期（YYYY-MM-DD 格式）
 * @property {string} [requirement] - 关联需求文档路径（可选）
 * @property {string[]} artifacts - 所有产物文件的相对路径列表
 * @property {Record<string, unknown>} reportSummary - 测试报告摘要统计
 */
export interface ArchiveManifest {
  name: string;
  archivedAt: string;
  requirement?: string;
  artifacts: string[];
  reportSummary: Record<string, unknown>;
}

/**
 * 归档测试变更
 * 
 * 该函数负责：
 * 1. 生成归档目录路径（格式：archive/<date>-<name>）
 * 2. 检查归档目录是否已存在（避免覆盖）
 * 3. 创建归档根目录（如果不存在）
 * 4. 生成 manifest.json 清单文件
 * 5. 移动测试变更目录到归档目录
 * 6. 如果移动失败（跨文件系统），使用复制+删除的方式
 * 
 * @param {ChangeWorkspace} workspace - 测试变更工作区对象
 * @param {Object} [options] - 可选配置
 * @param {Date} [options.date] - 归档日期，默认为当前日期
 * @param {string} [options.cwd] - 工作目录，默认为 process.cwd()
 * @returns {Promise<string>} 归档目录的绝对路径
 * @throws {TestSpecError} 如果归档目录已存在
 * 
 * @example
 * ```typescript
 * const archivePath = await archiveChange(workspace);
 * console.log(`已归档到: ${archivePath}`);
 * // 输出: 已归档到: /path/to/testspec/changes/archive/2026-06-09-my-feature
 * ```
 */
export async function archiveChange(
  workspace: ChangeWorkspace,
  options: { date?: Date; cwd?: string } = {}
): Promise<string> {
  // 格式化日期为 YYYY-MM-DD 格式
  const date = formatDate(options.date ?? new Date());

  // 获取归档根目录路径
  const archiveRoot = getArchiveRoot(options.cwd);

  // 构建目标归档目录路径
  const targetDir = join(archiveRoot, `${date}-${workspace.name}`);

  // 检查归档目录是否已存在
  if (await pathExists(targetDir)) {
    throw new TestSpecError(
      `Archive already exists: ${basename(targetDir)}. Refusing to overwrite.`
    );
  }

  // 创建归档根目录（如果不存在）
  await mkdir(archiveRoot, { recursive: true });

  // 生成 manifest.json 清单文件
  await writeManifest(workspace, workspace.changeDir, options.date ?? new Date());

  try {
    // 尝试直接移动目录（同一文件系统内）
    await rename(workspace.changeDir, targetDir);
  } catch {
    // 如果移动失败（跨文件系统），使用复制+删除的方式
    await cp(workspace.changeDir, targetDir, { recursive: true, errorOnExist: true });
    await rm(workspace.changeDir, { recursive: true, force: true });
  }

  return targetDir;
}

export async function writeManifest(
  workspace: ChangeWorkspace,
  directory: string,
  date: Date
): Promise<string> {
  const requirement = await readRequirementReference(directory);
  const manifest: ArchiveManifest = {
    name: workspace.name,
    archivedAt: formatDate(date),
    artifacts: await listArtifacts(directory),
    reportSummary: await readReportSummary(directory),
  };
  if (requirement) {
    manifest.requirement = requirement;
  }
  const manifestPath = join(directory, "manifest.json");

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return manifestPath;
}

async function readRequirementReference(directory: string): Promise<string | undefined> {
  try {
    const proposal = await readFile(join(directory, "proposal.md"), "utf8");
    const match = /## 关联需求文档\s+([^#]+)/.exec(proposal);
    return match?.[1]?.trim().split(/\r?\n/)[0]?.trim();
  } catch {
    return undefined;
  }
}

async function listArtifacts(directory: string): Promise<string[]> {
  const files: string[] = [];

  async function visit(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.name !== "manifest.json") {
        files.push(relative(directory, path));
      }
    }
  }

  await visit(directory);
  return files.sort();
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
