# TestSpec

> [中文文档](./README-CN.md)

Requirement-driven test design CLI for AI-assisted QA workflows.

TestSpec is a CLI tool that helps QA teams create, manage, and track test artifacts through a structured workflow. It integrates with AI-powered agents like Claude Code, Qoder, and Codex to streamline the testing process.

## Features

- **Structured Workflow**: Follow a proven test design process from requirements to test cases
- **AI Integration**: Works with Claude Code, Qoder, Codex, and other AI agents
- **Excel Export**: Generate executable test cases with functional and performance worksheets
- **Mind Map Export**: Create visual test case maps for review and collaboration
- **Traceability**: Maintain links between requirements, test points, and test cases
- **Archive System**: Organize and preserve completed test cycles

## Installation

```bash
npm install -g @wangjh2001/test-spec
```

Or use npx without installation:

```bash
npx testspec init
npx testspec new <test-name>
```

## Quick Start

### 1. Initialize Your Project

```bash
testspec init
```

This sets up the TestSpec workspace and configures AI agent integrations. In interactive mode, use Space to select/deselect integrations and Enter to confirm.

Available integrations:

| Agent       | Output                                                       |
| ----------- | ------------------------------------------------------------ |
| Claude Code | `.claude/commands/test/*.md` for `/test:*` slash commands    |
| Qoder       | `.qoder/commands/test/*.md` for the same workflow labels     |
| Codex       | `AGENTS.md` guidance mapping `test:*` labels to CLI commands |
| Generic     | Tool-agnostic `AGENTS.md` workflow guidance                  |

For non-interactive setup:

```bash
testspec init --agents claude,qoder,codex
# or all integrations
testspec init --agents all
```

### 2. Create a Test Change

```bash
testspec new login-v2 --requirement docs/login-prd.md
```

This creates a new test change directory with a proposal template.

### 3. Run the Workflow

For requirement-grounded generation, run the `test:*` labels inside Claude Code, Codex, Qoder, or another configured coding agent. The agent reads the requirement document and writes semantic artifacts; the CLI remains provider-free and handles validation, export, reporting, and archive.

```text
/test:analysis login-v2
/test:points login-v2
/test:excel login-v2
```

CLI commands such as `testspec analysis` and `testspec points` remain deterministic fallback/template helpers when no agent is available.

```bash
# Fallback/template requirement analysis
testspec analysis login-v2

# Fallback/template test points
testspec points login-v2

# Validate generated artifacts before export
testspec validate login-v2

# Export test cases to Excel
testspec excel login-v2

# Export mind map for review
testspec mind login-v2

# Generate report (after filling execution results in Excel)
testspec report login-v2

# Archive completed test cycle
testspec archive login-v2
```

## Commands

| CLI command                                | Workflow label  | Slash command    | Description                                                      |
| ------------------------------------------ | --------------- | ---------------- | ---------------------------------------------------------------- |
| `testspec init`                            | —               | —                | Initialize project with AI agent integrations                    |
| `testspec new <name> --requirement <path>` | `test:new`      | `/test:new`      | Create a test proposal workspace from a requirement document     |
| `testspec analysis [name]`                 | `test:analysis` | `/test:analysis` | Decompose requirements into testable items, risks, and questions |
| `testspec points [name]`                   | `test:points`   | `/test:points`   | Generate fallback/template test points for a test change         |
| `testspec validate [name]`                 | `test:validate` | `/test:validate` | Validate generated artifacts for schema, traceability, and quality |
| `testspec excel [name]`                    | `test:excel`    | `/test:excel`    | Export executable Excel test cases                               |
| `testspec mind [name]`                     | `test:mind`     | `/test:mind`     | Export mind-map style test cases for review                      |
| `testspec report [name]`                   | `test:report`   | `/test:report`   | Generate execution statistics from Excel results                 |
| `testspec archive [name]`                  | `test:archive`  | `/test:archive`  | Archive the full test artifact chain for traceability            |
| `testspec list`                            | —               | —                | List active and archived changes                                 |
| `testspec --help`                          | —               | —                | Display help information                                         |
| `testspec --version`                       | —               | —                | Display version                                                  |

When a command accepts `[name]`, TestSpec uses the explicit name if provided. If omitted, it infers the only active change; when multiple exist, it prompts for an explicit name.

## Excel Export

`testspec excel [name]` exports `artifacts/<name>_cases.xlsx` with two worksheets:

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
└── testspec/
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

After `testspec init`, AI agents can use workflow labels directly:

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

**Codex / Generic Agents:**
Read `AGENTS.md` for the same provider-neutral prompt-pack rules. Semantic labels such as `test:analysis`, `test:points`, and `test:excel` should read requirement evidence and generate artifacts before running deterministic CLI validation/export commands.

The `test:*` labels are Agent workflow labels, not shell commands.

### Requirement-grounded generation rules

- The agent must read `proposal.md` and the referenced requirement document before semantic generation.
- If a requirement file is missing, remote, unreadable, or ambiguous, the agent must ask for readable content or explicit authorization instead of guessing.
- Generated requirements, test points, and cases should cite source evidence with document, section, and short quote when available.
- Unknown business rules, roles, state transitions, limits, and SLA values should be marked `待确认` or added as clarification questions.
- Run `testspec validate [name]` before export and fix blocking validation errors.

Good case steps are concrete and observable:

```text
1. Log in as user-a.
2. Open the login page.
3. Enter username=user-a and password=ValidPass123.
4. Click Login.
5. Verify the home page shows user-a as logged in.
```

Avoid generic template steps:

```text
1. Prepare test data.
2. Execute the operation.
3. Verify the system meets requirements.
```

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
