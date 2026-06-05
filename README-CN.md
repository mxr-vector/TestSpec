# TestSpec

> [English Documentation](./README.md)

需求驱动的测试设计 CLI，用于 AI 辅助 QA 工作流。

TestPilot 是一个 CLI 工具，帮助 QA 团队通过结构化的工作流创建、管理和跟踪测试产物。它集成了 Claude Code、Qoder 和 Codex 等 AI 代理，以简化测试流程。

## 功能特性

- **结构化工作流**：遵循从需求到测试用例的成熟测试设计流程
- **AI 集成**：支持 Claude Code、Qoder、Codex 等多种 AI 代理
- **Excel 导出**：生成包含功能测试和性能测试工作表的可执行测试用例
- **思维导图导出**：创建可视化测试用例图，便于评审和协作
- **可追溯性**：维护需求、测试点和测试用例之间的关联
- **归档系统**：组织和保存已完成的测试周期

## 安装

```bash
npm install -g testpilot
```

或使用 npx 免安装运行：

```bash
npx testpilot init
npx testpilot new <测试名称>
```

## 快速开始

### 1. 初始化项目

```bash
testpilot init
```

此命令会设置 TestPilot 工作区并配置 AI 代理集成。在交互模式下，使用空格键选择/取消选择集成，按 Enter 确认。

可用集成：

| 代理        | 输出                                                 |
| ----------- | ---------------------------------------------------- |
| Claude Code | `.claude/commands/test/*.md` 用于 `/test:*` 斜杠命令 |
| Qoder       | `.qoder/commands/test/*.md` 用于相同的工作流标签     |
| Codex       | `AGENTS.md` 指南，将 `test:*` 标签映射到 CLI 命令    |
| 通用        | 与工具无关的 `AGENTS.md` 工作流指南                  |

非交互式设置：

```bash
testpilot init --agents claude,qoder,codex
# 或所有集成
testpilot init --agents all
```

### 2. 创建测试变更

```bash
testpilot new login-v2 --requirement docs/login-prd.md
```

这会创建一个新的测试变更目录和提案模板。

### 3. 执行工作流

```bash
# 需求分析
testpilot analysis login-v2

# 生成测试点
testpilot points login-v2

# 导出测试用例到 Excel
testpilot excel login-v2

# 导出思维导图用于评审
testpilot mind login-v2

# 生成报告（在 Excel 中填写执行结果后）
testpilot report login-v2

# 归档已完成的测试周期
testpilot archive login-v2
```

## 命令列表

| CLI 命令                                    | 工作流标签      | 斜杠命令         | 说明                                               |
| ------------------------------------------- | --------------- | ---------------- | -------------------------------------------------- |
| `testpilot init`                            | —               | —                | 初始化项目并配置 AI 代理集成                       |
| `testpilot new <name> --requirement <path>` | `test:new`      | `/test:new`      | 从需求文档创建测试提案工作区                       |
| `testpilot analysis [name]`                 | `test:analysis` | `/test:analysis` | 将需求分解为可测试项、风险和待确认问题             |
| `testpilot points [name]`                   | `test:points`   | `/test:points`   | 为测试变更生成核心场景测试点                       |
| `testpilot excel [name]`                    | `test:excel`    | `/test:excel`    | 导出可执行的 Excel 测试用例                        |
| `testpilot mind [name]`                     | `test:mind`     | `/test:mind`     | 导出用于评审的思维导图样式测试用例                 |
| `testpilot report [name]`                   | `test:report`   | `/test:report`   | 从 Excel 执行结果生成执行统计信息                  |
| `testpilot archive [name]`                  | `test:archive`  | `/test:archive`  | 归档完整测试产物链以实现可追溯性                   |
| `testpilot list`                            | —               | —                | 列出活跃和已归档的变更                             |
| `testpilot --help`                          | —               | —                | 显示帮助信息                                       |
| `testpilot --version`                       | —               | —                | 显示版本                                           |

当命令接受 `[name]` 参数时，TestPilot 会使用提供的显式名称。如果省略，它会推断唯一的活跃变更；当存在多个变更时，会提示输入显式名称。

## Excel 导出

`testpilot excel [name]` 导出 `artifacts/<name>_cases.xlsx`，包含两个工作表：

| 工作表     | 用途                                                                   |
| ---------- | ---------------------------------------------------------------------- |
| `功能测试` | 功能测试用例，包含需求 ID、测试点 ID、步骤、预期结果、优先级和执行跟踪 |
| `性能测试` | 从提案和测试点派生的性能场景                                           |

性能工作表基于确定性规则生成：

- 核心流程 → 负载测试场景
- 查询/搜索/列表/报告流程 → 查询性能场景
- 提交/创建/更新/删除/订单/支付流程 → 事务或压力测试场景
- 批量/导入/导出/上传/下载流程 → 容量或稳定性场景
- 依赖/回调/消息/队列/网关流程 → 稳定性场景

未知的业务目标（并发数、目标 TPS/QPS）保持 `待确认` 状态，直到指定为止。

## 目录结构

初始化并创建测试变更后，项目结构如下：

```
your-project/
├── .claude/commands/test/    # Claude Code 斜杠命令（如果选择了此集成）
├── .qoder/commands/test/     # Qoder 命令（如果选择了此集成）
├── AGENTS.md                 # 通用代理指南（如果选择了此集成）
└── testpilot/
    ├── changes/
    │   ├── login-v2/         # 活跃的测试变更
    │   │   ├── proposal.md              # 测试提案
    │   │   ├── requirements-analysis.md # 需求分解
    │   │   ├── specs/
    │   │   │   └── testpoints.md        # 测试点
    │   │   ├── artifacts/
    │   │   │   ├── testcases.json       # 生成的测试用例
    │   │   │   ├── performance-cases.json
    │   │   │   ├── login-v2_cases.xlsx  # Excel 导出
    │   │   │   └── login-v2_cases.xmind # 思维导图导出
    │   │   └── report.md                # 执行报告
    │   └── archive/
    │       └── 2026-06-04-login-v2/     # 已归档的变更
    │           ├── manifest.json
    │           └── ...已归档的产物...
    └── ...
```

## 与 AI 代理配合使用

`testpilot init` 之后，AI 代理可以直接使用工作流标签：

**Claude Code:**

```
/test:new login-v2 --requirement docs/login-prd.md
/test:analysis login-v2
/test:points login-v2
/test:excel login-v2
/test:mind login-v2
/test:report login-v2
/test:archive login-v2
```

**Codex / 通用代理:**
读取 `AGENTS.md` 并将 `test:*` 标签映射到 `testpilot` CLI 命令。

`test:*` 标签是代理工作流标签，不是 shell 命令。

## 开发

```bash
# 安装依赖
npm install

# 以开发模式运行
npm run dev -- --help

# 构建 CLI
npm run build

# 运行检查
npm run typecheck
npm run test
npm run check
```

## 许可证

MIT
