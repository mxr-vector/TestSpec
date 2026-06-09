/**
 * @fileoverview TestSpec 路径工具模块
 * 
 * 该模块提供了路径解析的工具函数，用于：
 * 1. 基于当前工作目录解析相对路径
 * 2. 统一路径处理逻辑
 * 3. 确保路径解析的一致性
 */

import { resolve } from "node:path";

/**
 * 从当前工作目录解析路径
 * 
 * 该函数将相对路径基于 process.cwd() 解析为绝对路径。
 * 用于确保所有文件操作都基于正确的基准目录。
 * 
 * @param {...string} segments - 路径片段，将被拼接并解析
 * @returns {string} 解析后的绝对路径
 * 
 * @example
 * ```typescript
 * // 假设当前工作目录是 /Users/test/project
 * const path = resolveFromCwd('testspec', 'changes');
 * // 返回: /Users/test/project/testspec/changes
 * 
 * const path2 = resolveFromCwd('docs', 'requirements.md');
 * // 返回: /Users/test/project/docs/requirements.md
 * ```
 */
export function resolveFromCwd(...segments: string[]): string {
  return resolve(process.cwd(), ...segments);
}
