/**
 * @fileoverview TestSpec 初始化命令模块
 * 
 * 该模块实现了 `testspec init` 命令，用于在当前项目中初始化 TestSpec 工作区。
 * 初始化过程包括：
 * 1. 创建必要的目录结构（testspec/changes/、testspec/changes/archive/）
 * 2. 根据用户选择生成 AI 代理集成文件（Claude Code、Qoder、Trae 等）
 * 3. 更新或创建 AGENTS.md 文件（用于 Codex 和通用代理）
 * 4. 清理已有的生成文件（如果指定了 --force 选项）
 * 
 * 支持的 AI 代理集成：
 * - claude: Claude Code（默认启用）
 * - qoder: Qoder（默认启用）
 * - codex: Codex
 * - trae: Trae
 * - generic: 通用代理指导
 */

import type { Command } from "commander";
import { logInfo, logSuccess } from "../core/logger.js";
import { initializeTestSpec } from "../init/agent-init.js";

/**
 * 初始化命令选项接口
 * 
 * @interface InitCommandOptions
 * @property {string} [agents] - 逗号分隔的代理 ID 列表，如 "claude,qoder" 或 "all"
 * @property {boolean} [force] - 是否强制覆盖已有的 TestSpec 生成文件
 */
interface InitCommandOptions {
  agents?: string;
  force?: boolean;
}

/**
 * 注册初始化命令到 Commander.js 程序实例
 * 
 * 该函数将 `init` 命令注册到 CLI 程序中，支持以下功能：
 * - 选择要初始化的 AI 代理集成（--agents 选项）
 * - 强制覆盖已有文件（--force 或 -f 选项）
 * 
 * @param {Command} program - Commander.js 程序实例
 * 
 * @example
 * ```bash
 * # 使用默认代理（claude 和 qoder）初始化
 * testspec init
 * 
 * # 指定代理初始化
 * testspec init --agents claude,codex,qoder
 * 
 * # 初始化所有代理
 * testspec init --agents all
 * 
 * # 强制覆盖已有文件
 * testspec init --force
 * ```
 */
export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Initialize a TestSpec workspace in the current project")
    .option(
      "--agents <agents>",
      "comma-separated agent integrations to initialize: claude,codex,qoder,trae,generic, or all"
    )
    .option("-f, --force", "overwrite existing TestSpec-generated agent command files")
    .action(async (options: InitCommandOptions) => {
      // 构建初始化选项对象
      const initOptions = {
        force: options.force === true,
      };

      // 调用初始化函数，如果指定了 agents 选项则传递给初始化函数
      const result = await initializeTestSpec(
        options.agents === undefined ? initOptions : { ...initOptions, agents: options.agents }
      );

      // 输出初始化结果信息
      logSuccess("Initialized TestSpec workspace.");
      logInfo(`Selected agents: ${result.selectedAgents.join(", ")}`);
      logInfo(`Workspace directories: ${result.directories.join(", ")}`);
      logInfo("Cleaned generated command files for selected command integrations.");
      logInfo(
        `Outputs: ${result.created.length} created, ${result.refreshed.length} refreshed, ${result.preserved.length} preserved, ${result.removed.length} removed.`
      );
    });
}
