/**
 * @fileoverview TestSpec 包信息工具模块
 * 
 * 该模块提供了读取和解析 package.json 文件的功能，用于：
 * 1. 获取项目名称和版本号
 * 2. 在 CLI 启动时显示版本信息
 * 3. 支持包信息的类型安全访问
 * 
 * 该模块会自动查找项目根目录下的 package.json 文件，
 * 支持从当前文件位置向上查找最多 3 层目录。
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 包信息接口
 * 
 * @interface PackageInfo
 * @property {string} name - 包名称
 * @property {string} version - 包版本号（语义化版本格式）
 */
export interface PackageInfo {
  readonly name: string;
  readonly version: string;
}

/**
 * package.json 文件接口
 * 
 * @interface PackageJson
 * @property {string} name - 包名称
 * @property {string} version - 包版本号
 */
interface PackageJson {
  readonly name: string;
  readonly version: string;
}

/**
 * 获取包信息
 * 
 * 读取并返回项目的包信息（名称和版本号）。
 * 该函数会自动查找项目根目录下的 package.json 文件。
 * 
 * @returns {PackageInfo} 包含名称和版本号的包信息对象
 * @throws {Error} 如果无法找到 package.json 或文件格式错误
 * 
 * @example
 * ```typescript
 * const info = getPackageInfo();
 * console.log(`${info.name} v${info.version}`);
 * // 输出: @wangjh2001/testspec v1.0.0
 * ```
 */
export function getPackageInfo(): PackageInfo {
  const packageJson = readPackageJson();

  return {
    name: packageJson.name,
    version: packageJson.version,
  };
}

/**
 * 读取并解析 package.json 文件
 * 
 * 该函数负责：
 * 1. 查找项目根目录
 * 2. 读取 package.json 文件内容
 * 3. 解析 JSON 并验证必需字段
 * 
 * @returns {PackageJson} 解析后的 package.json 内容
 * @throws {Error} 如果文件不存在、无法读取或格式错误
 */
function readPackageJson(): PackageJson {
  const packageJsonPath = join(findPackageRoot(), "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as Partial<PackageJson>;

  // 验证必需字段是否存在且为字符串类型
  if (typeof packageJson.name !== "string" || typeof packageJson.version !== "string") {
    throw new Error("package.json must include string name and version fields");
  }

  return {
    name: packageJson.name,
    version: packageJson.version,
  };
}

/**
 * 查找项目根目录
 * 
 * 从当前文件位置开始，向上查找包含 package.json 的目录。
 * 最多查找 3 层目录，如果找不到则抛出错误。
 * 
 * @returns {string} 项目根目录的绝对路径
 * @throws {Error} 如果在 3 层目录内找不到 package.json
 */
function findPackageRoot(): string {
  // 从当前文件位置开始查找
  let currentDir = dirname(fileURLToPath(import.meta.url));

  // 向上查找最多 3 层目录
  for (let depth = 0; depth < 3; depth += 1) {
    try {
      // 尝试读取当前目录下的 package.json
      readFileSync(join(currentDir, "package.json"));
      return currentDir;
    } catch {
      // 如果当前目录没有 package.json，继续向上查找
      currentDir = dirname(currentDir);
    }
  }

  // 如果在 3 层目录内找不到 package.json，抛出错误
  throw new Error("Unable to locate package.json");
}
