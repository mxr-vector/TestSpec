/**
 * @fileoverview TestSpec CLI 入口文件
 * 
 * 该文件是 TestSpec 命令行工具的主入口，负责：
 * 1. 创建和配置 Commander.js 命令行程序实例
 * 2. 注册所有子命令（init、workflow 等）
 * 3. 提供 CLI 运行入口函数
 * 
 * TestSpec 是一个需求驱动的测试设计 CLI 工具，专为 AI 辅助 QA 工作流设计。
 * 它支持从需求文档生成测试点、测试用例，并导出为 Excel 和思维导图格式。
 */

import { Command } from "commander";
import { registerInitCommand } from "./commands/init.js";
import { registerWorkflowCommands } from "./commands/workflow.js";
import { getPackageInfo } from "./utils/package-info.js";

/**
 * 创建并配置 TestSpec 命令行程序实例
 * 
 * 该函数负责：
 * 1. 从 package.json 读取项目信息（名称、版本）
 * 2. 创建 Commander.js 程序实例
 * 3. 设置程序名称、描述和版本号
 * 4. 注册初始化命令（init）
 * 5. 注册工作流命令（new、analysis、points、validate、excel、mind、report、archive）
 * 
 * @returns {Command} 配置完成的 Commander.js 命令行程序实例
 * 
 * @example
 * ```typescript
 * const program = createProgram();
 * await program.parseAsync(process.argv);
 * ```
 */
export function createProgram(): Command {
  // 从 package.json 获取项目信息（名称、版本）
  const packageInfo = getPackageInfo();

  // 创建 Commander.js 程序实例
  const program = new Command();

  // 配置程序基本信息
  program
    .name("testspec")  // 程序名称，用于帮助信息显示
    .description("Requirement-driven test design CLI for AI-assisted QA workflows.")  // 程序描述
    .version(packageInfo.version);  // 版本号，来自 package.json

  // 注册初始化命令（testspec init）
  registerInitCommand(program);

  // 注册工作流命令（testspec new、analysis、points、validate、excel、mind、report、archive）
  registerWorkflowCommands(program);

  return program;
}

/**
 * TestSpec CLI 运行入口函数
 * 
 * 该函数是 CLI 的主要执行入口，负责：
 * 1. 创建命令行程序实例
 * 2. 解析命令行参数
 * 3. 执行对应的命令处理逻辑
 * 
 * @param {string[]} argv - 命令行参数数组，默认为 process.argv
 *                           第一个元素通常是 node 可执行文件路径
 *                           第二个元素通常是脚本文件路径
 *                           后续元素是用户输入的命令和选项
 * @returns {Promise<void>} 异步执行，无返回值
 * 
 * @example
 * ```typescript
 * // 使用默认参数（process.argv）
 * await runCli();
 * 
 * // 或者传入自定义参数
 * await runCli(['node', 'testspec', 'init', '--agents', 'claude,qoder']);
 * ```
 */
export async function runCli(argv: string[] = process.argv): Promise<void> {
  // 创建命令行程序实例
  const program = createProgram();

  // 异步解析命令行参数并执行对应的命令
  await program.parseAsync(argv);
}
