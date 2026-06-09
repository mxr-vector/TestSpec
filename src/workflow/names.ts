/**
 * @fileoverview TestSpec 变更名称规范化模块
 * 
 * 该模块提供了测试变更名称的规范化功能，用于：
 * 1. 将用户输入的名称转换为文件系统友好的格式
 * 2. 确保名称符合目录命名规范
 * 3. 支持国际化字符（Unicode）
 * 
 * 规范化规则：
 * - 转换为小写
 * - 使用 NFKD 标准化（兼容分解）
 * - 移除重音符号（变音符号）
 * - 将非字母数字字符（除 . _ -）替换为连字符
 * - 合并连续的分隔符（- _ .）
 * - 移除首尾的分隔符
 * - 确保结果非空且包含至少一个字母或数字
 * 
 * 示例：
 * - "My Feature" → "my-feature"
 * - "用户登录功能" → "用户登录功能"
 * - "test_feature_v2" → "test-feature-v2"
 * - "  Hello World  " → "hello-world"
 */

import { TestSpecError } from "../core/errors.js";

/**
 * 规范化测试变更名称
 * 
 * 将用户输入的名称转换为文件系统友好的格式。
 * 该函数用于确保测试变更目录名称符合规范，避免路径问题。
 * 
 * @param {string} input - 用户输入的原始名称
 * @returns {string} 规范化后的名称
 * @throws {TestSpecError} 如果规范化后的名称为空或不包含字母数字
 * 
 * @example
 * ```typescript
 * const name = normalizeChangeName("My Feature");
 * // 返回: "my-feature"
 * 
 * const name2 = normalizeChangeName("用户登录功能");
 * // 返回: "用户登录功能"
 * 
 * const name3 = normalizeChangeName("test_feature_v2");
 * // 返回: "test-feature-v2"
 * 
 * // 以下会抛出异常
 * normalizeChangeName("---...___"); // 抛出 TestSpecError
 * ```
 */
export function normalizeChangeName(input: string): string {
  // 规范化处理流程
  const normalized = input
    .trim()  // 移除首尾空白
    .toLowerCase()  // 转换为小写
    .normalize("NFKD")  // NFKD 标准化（兼容分解）
    .replace(/[̀-ͯ]/g, "")  // 移除重音符号（变音符号）
    .replace(/[^\p{Letter}\p{Number}._-]+/gu, "-")  // 将非字母数字字符替换为连字符
    .replace(/[-_.]{2,}/g, "-")  // 合并连续的分隔符
    .replace(/^[-_.]+|[-_.]+$/g, "");  // 移除首尾的分隔符

  // 验证结果非空且包含至少一个字母或数字
  if (normalized.length === 0) {
    throw new TestSpecError("Change name must contain at least one letter or number.");
  }

  return normalized;
}
