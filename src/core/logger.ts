/**
 * @fileoverview TestSpec 日志工具模块
 * 
 * 该模块提供了统一的日志输出功能，使用 chalk 库为终端输出添加颜色。
 * 日志分为三个级别：
 * - info: 信息性消息（青色）
 * - success: 成功消息（绿色）
 * - error: 错误消息（红色）
 * 
 * 使用场景：
 * - 命令执行进度提示
 * - 操作结果反馈
 * - 错误信息输出
 */

import chalk from "chalk";

/**
 * 输出信息性日志（青色）
 * 
 * 用于显示一般性的信息提示，如：
 * - 命令执行进度
 * - 配置信息
 * - 统计数据
 * 
 * @param {string} message - 要输出的信息内容
 * 
 * @example
 * ```typescript
 * logInfo('正在处理文件...');
 * logInfo(`已选择代理: ${agents.join(', ')}`);
 * ```
 */
export function logInfo(message: string): void {
  console.log(chalk.cyan(message));
}

/**
 * 输出成功日志（绿色）
 * 
 * 用于显示操作成功的消息，如：
 * - 文件创建成功
 * - 命令执行完成
 * - 导出操作成功
 * 
 * @param {string} message - 要输出的成功信息
 * 
 * @example
 * ```typescript
 * logSuccess('初始化 TestSpec 工作区完成。');
 * logSuccess(`已导出 Excel 测试用例: ${outputPath}`);
 * ```
 */
export function logSuccess(message: string): void {
  console.log(chalk.green(message));
}

/**
 * 输出错误日志（红色）
 * 
 * 用于显示错误信息，如：
 * - 操作失败
 * - 验证错误
 * - 异常情况
 * 
 * @param {string} message - 要输出的错误信息
 * 
 * @example
 * ```typescript
 * logError('文件不存在: /path/to/file');
 * logError('验证失败: 缺少必需字段');
 * ```
 */
export function logError(message: string): void {
  console.error(chalk.red(message));
}
