# TestSpec

> [中文文档](./README-CN.md)

Requirement-driven test design CLI for AI-assisted QA workflows.

TestPilot is a CLI tool that helps QA teams create, manage, and track test artifacts through a structured workflow. It integrates with AI-powered agents like Claude Code, Qoder, and Codex to streamline the testing process.

## Features

- **Structured Workflow**: Follow a proven test design process from requirements to test cases
- **AI Integration**: Works with Claude Code, Qoder, Codex, and other AI agents
- **Excel Export**: Generate executable test cases with functional and performance worksheets
- **Mind Map Export**: Create visual test case maps for review and collaboration
- **Traceability**: Maintain links between requirements, test points, and test cases
- **Archive System**: Organize and preserve completed test cycles

## Installation

```bash
npm install -g testpilot
```

Or use npx without installation:

```bash
npx testpilot init
npx testpilot new <test-name>
```

## Quick Start

### 1. Initialize Your Project

```bash
testpilot init
```

This sets up the TestPilot workspace and configures AI agent integrations. In interactive mode, use Space to select/deselect integrations and Enter to confirm.

Available integrations:

| Agent       | Output                                                       |
| ----------- | ------------------------------------------------------------ |
| Claude Code | `.claude/commands/test/*.md` for `/test:*` slash commands    |
| Qoder       | `.qoder/commands/test/*.md` for the same workflow labels     |
| Codex       | `AGENTS.md` guidance mapping `test:*` labels to CLI commands |
| Generic     | Tool-agnostic `AGENTS.md` workflow guidance                  |

For non-interactive setup:

```bash
testpilot init --agents claude,qoder,codex
# or all integrations
testpilot init --agents all
```

### 2. Create a Test Change

```bash
testpilot new login-v2 --requirement docs/login-prd.md
```

This creates a new test change directory with a proposal template.

### 3. Run the Workflow

```bash
# Analyze requirements
testpilot analysis login-v2

# Generate test points
testpilot points login-v2

# Export test cases to Excel
testpilot excel login-v2

# Export mind map for review
testpilot mind login-v2

# Generate report (after filling execution results in Excel)
testpilot report login-v2

# Archive completed test cycle
testpilot archive login-v2
```

## Commands

| CLI command                                 | Workflow label  | Slash command    | Description                                                  |
| ------------------------------------------- | --------------- | ---------------- | ------------------------------------------------------------ |
| `testpilot init`                            | —               | —                | Initialize project with AI agent integrations                |
| `testpilot new <name> --requirement <path>` | `test:new`      | `/test:new`      | Create a test proposal workspace from a requirement document |
| `testpilot analysis [name]`                 | `test:analysis` | `/test:analysis` | Decompose requirements into testable items, risks, and questions |
| `testpilot points [name]`                   | `test:points`   | `/test:points`   | Generate core scenario test points for a test change         |
| `testpilot excel [name]`                    | `test:excel`    | `/test:excel`    | Export executable Excel test cases                           |
| `testpilot mind [name]`                     | `test:mind`     | `/test:mind`     | Export mind-map style test cases for review                  |
| `testpilot report [name]`                   | `test:report`   | `/test:report`   | Generate execution statistics from Excel results             |
| `testpilot archive [name]`                  | `test:archive`  | `/test:archive`  | Archive the full test artifact chain for traceability        |
| `testpilot list`                            | —               | —                | List active and archived changes                             |
| `testpilot --help`                          | —               | —                | Display help information                                     |
| `testpilot --version`                       | —               | —                | Display version                                              |

When a command accepts `[name]`, TestPilot uses the explicit name if provided. If omitted, it infers the only active change; when multiple exist, it prompts for an explicit name.

## Excel Export

`testpilot excel [name]` exports `artifacts/<name>_cases.xlsx` with two worksheets:

| Worksheet  | Purpose                                                                                                               |
| ---------- | --------------------------------------------------------------------------------------------------------------------- |
| `功能测试` | Functional test cases with requirement IDs, test point IDs, steps, expected results, priority, and execution tracking |
| `性能测试` | Performance scenarios derived from proposal and test points                                                           |

The performance worksheet is generated from deterministic rules:

- Core flows → load-test scenarios
- Query/search/list/report flows → query performance scenarios
- Submit/create/update/delete/order/payment flows → transaction or pressure-test scenarios
- Batch/import/export/upload/download flows → capacity or stability scenarios
- Dependency/callback/message/queue flows → stability scenarios

Unknown business targets (concurrency, target TPS/QPS) remain `待确认` until specified.

## Directory Structure

After initialization and creating test changes, your project will have:

```
your-project/
├── .claude/commands/test/    # Claude Code slash commands (if selected)
├── .qoder/commands/test/     # Qoder commands (if selected)
├── AGENTS.md                 # Generic agent guidance (if selected)
└── testpilot/
    ├── changes/
    │   ├── login-v2/         # Active test change
    │   │   ├── proposal.md              # Test proposal
    │   │   ├── requirements-analysis.md # Requirement decomposition
    │   │   ├── specs/
    │   │   │   └── testpoints.md        # Test points
    │   │   ├── artifacts/
    │   │   │   ├── testcases.json       # Generated test cases
    │   │   │   ├── performance-cases.json
    │   │   │   ├── login-v2_cases.xlsx  # Excel export
    │   │   │   └── login-v2_cases.xmind # Mind map export
    │   │   └── report.md                # Execution report
    │   └── archive/
    │       └── 2026-06-04-login-v2/     # Archived change
    │           ├── manifest.json
    │           └── ...archived artifacts...
    └── ...
```

## Using with AI Agents

After `testpilot init`, AI agents can use workflow labels directly:

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

**Codex / Generic Agents:**
Reads `AGENTS.md` and maps `test:*` labels to `testpilot` CLI commands.

The `test:*` labels are Agent workflow labels, not shell commands.

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev -- --help

# Build the CLI
npm run build

# Run checks
npm run typecheck
npm run test
npm run check
```

## License

MIT
