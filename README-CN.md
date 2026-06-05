# TestSpec

> [English Documentation](./README.md)

需求驱动的测试设计 CLI，用于 AI 辅助 QA 工作流。

TestSpec 是一个 CLI 工具，帮助 QA 团队通过结构化的工作流创建、管理和跟踪测试产物。它集成了 Claude Code、Qoder 和 Codex 等 AI 代理，以简化测试流程。

## 功能特性

- **结构化工作流**：遵循从需求到测试用例的成熟测试设计流程
- **AI 集成**：支持 Claude Code、Qoder、Codex 等多种 AI 代理
- **Excel 导出**：生成包含功能测试和性能测试工作表的可执行测试用例
- **思维导图导出**：创建可视化测试用例图，便于评审和协作
- **可追溯性**：维护需求、测试点和测试用例之间的关联
- **归档系统**：组织和保存已完成的测试周期

## 安装

```bash
npm install -g @wangjh2001/testspec
```

或使用 npx 免安装运行：

```bash
npx @wangjh2001/testspec init
npx @wangjh2001/testspec new <测试名称> --requirement <path>
```

## 快速开始

### 1. 初始化项目

```bash
testspec init
```

此命令会设置 TestSpec 工作区并配置 AI 代理集成。交互式选择默认选中 Claude Code 和 Codex，可使用空格键选择/取消选择集成，按 Enter 确认。重新生成代理命令文件前，init 会移除仍包含生成标记的 TestSpec 旧 `.claude/commands/test/*.md` 和 `.qoder/commands/test/*.md` 文件；不含生成标记的自定义命令文件会被保留。带有生成标记的命令文件会被视为 TestSpec 托管文件，可能被 `testspec init` 删除并重建。

可用集成：

| 代理        | 输出                                                 |
| ----------- | ---------------------------------------------------- |
| Claude Code | `.claude/commands/test/*.md` 用于 `/test:*` 斜杠命令 |
| Qoder       | `.qoder/commands/test/*.md` 用于相同的工作流标签     |
| Codex       | `AGENTS.md` 指南，将 `test:*` 标签映射到 CLI 命令    |
| 通用        | 与工具无关的 `AGENTS.md` 工作流指南                  |

非交互式设置：

```bash
testspec init --agents claude,qoder,codex
# 或所有集成
testspec init --agents all
```

### 2. 创建测试变更

```bash
testspec new login-v2 --requirement docs/login-prd.md --object "登录服务"
```

这会创建一个新的测试变更目录和提案模板。`--requirement` 接受本地路径或 URL，`--object` 记录被测对象名称，`--force` 会覆盖已有工作区。

### 3. 执行工作流

要获得贴合需求的语义生成效果，请在 Claude Code、Codex、Qoder 或其他已配置的编码代理中运行 `test:*` 标签。代理负责读取需求文档并生成语义产物；CLI 保持无模型供应商依赖，只负责校验、导出、报告和归档。

```text
/test:analysis login-v2
/test:points login-v2
/test:excel login-v2
```

`testspec analysis` 和 `testspec points` 等 CLI 命令仍可作为无代理场景下的确定性 fallback/template 辅助。

```bash
# fallback/template 需求分析
testspec analysis login-v2

# fallback/template 测试点
testspec points login-v2

# 导出前校验生成产物
testspec validate login-v2

# 导出测试用例到 Excel
testspec excel login-v2

# 导出思维导图用于评审
testspec mind login-v2

# 生成报告（在 Excel 中填写执行结果后）
testspec report login-v2

# 归档已完成的测试周期
testspec archive login-v2
```

## 命令列表

| CLI 命令                                                 | 工作流标签      | 斜杠命令         | 说明                                   |
| -------------------------------------------------------- | --------------- | ---------------- | -------------------------------------- |
| `testspec init [--agents <ids|all>] [--force]`           | —               | —                | 初始化项目并配置 AI 代理集成           |
| `testspec new <name> [--requirement <path>] [--object <name>] [--force]` | `test:new`      | `/test:new`      | 从需求文档创建测试提案工作区           |
| `testspec analysis [name]`                               | `test:analysis` | `/test:analysis` | 将需求分解为可测试项、风险和待确认问题 |
| `testspec points [name]`                                 | `test:points`   | `/test:points`   | 为测试变更生成 fallback/template 测试点 |
| `testspec validate [name]`                               | `test:validate` | `/test:validate` | 校验生成产物的 schema、可追溯性和质量  |
| `testspec excel [name]`                                  | `test:excel`    | `/test:excel`    | 导出可执行的 Excel 测试用例            |
| `testspec mind [name]`                                   | `test:mind`     | `/test:mind`     | 导出用于评审的思维导图样式测试用例     |
| `testspec report [name]`                                 | `test:report`   | `/test:report`   | 从 Excel 执行结果生成执行统计信息      |
| `testspec archive [name]`                                | `test:archive`  | `/test:archive`  | 归档完整测试产物链以实现可追溯性       |
| `testspec --help`                                        | —               | —                | 显示帮助信息                           |
| `testspec --version`                                     | —               | —                | 显示版本                               |

`--agents` 接受 `claude`、`qoder`、`codex`、`generic` 或 `all`；多个代理 ID 使用英文逗号分隔，例如 `--agents claude,qoder,codex`。对 `testspec init` 使用 `--force` 会刷新已有的 TestSpec 生成代理命令文件；对 `testspec new` 使用 `--force` 会覆盖已有测试变更工作区。

当命令接受 `[name]` 参数时，TestSpec 会使用提供的显式名称。如果省略，它会推断唯一的活跃变更；当存在多个变更时，会要求你指定变更名称。

## Excel 导出

`testspec excel [name]` 导出 `artifacts/<name>_cases.xlsx`，包含两个工作表：

| 工作表     | 用途                                             |
| ---------- | ------------------------------------------------ |
| `功能测试` | 最小化功能测试用例，包含步骤、预期结果、优先级和执行状态 |
| `性能测试` | 精简性能场景，包含基线目标、指标和执行状态       |

Excel 工作簿面向执行场景。紧凑版 `artifacts/testcases.json` 使用精确的可执行字段结构：`title`、`module`、`type`、`priority`、`preconditions`、`steps`、`expectedResult`；CLI 会在校验和导出前将生成的用例归一化为该结构。

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
└── testspec/
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

`testspec init` 之后，AI 代理可以直接使用工作流标签：

**Claude Code:**

```
/test:new login-v2 --requirement docs/login-prd.md
/test:analysis login-v2
/test:points login-v2
/test:validate login-v2
/test:excel login-v2
/test:mind login-v2
/test:report login-v2
/test:archive login-v2
```

**Codex / 通用代理:**
读取 `AGENTS.md` 中同一套与供应商无关的 prompt-pack 规则。`test:analysis`、`test:points`、`test:excel` 等语义标签应先读取需求证据并生成产物，再运行确定性的 CLI 校验/导出命令。

`test:*` 标签是代理工作流标签，不是 shell 命令。

### 需求贴合生成规则

- 代理必须先读取 `proposal.md` 和关联需求文档，再进行语义生成。
- 如果需求文件缺失、远程不可读、无法解析或存在歧义，代理必须向用户索要可读内容或明确授权，不能猜测生成。
- 生成的需求和测试点应尽量包含来源证据：文档、章节和短摘录；紧凑用例应保持可执行并使用文档中的紧凑字段结构。
- 需求未说明的业务规则、角色、状态流转、限制和 SLA 应标记为 `待确认` 或写入待澄清问题。
- 导出前运行 `testspec validate [name]`，并修复阻塞性校验错误。

好的测试步骤应具体、可执行、可观察：

```text
1. 使用 user-a 登录。
2. 打开登录页面。
3. 输入 username=user-a 和 password=ValidPass123。
4. 点击登录。
5. 验证首页展示 user-a 的登录态。
```

避免泛化模板步骤：

```text
1. 准备测试数据。
2. 执行业务操作。
3. 验证系统符合需求。
```

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
