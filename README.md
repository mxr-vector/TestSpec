# TestPilot

Requirement-driven test design CLI for AI-assisted QA workflows.

## Status

Early development. This project is currently establishing the TypeScript CLI foundation before implementing the test workflow commands.

## Initialize a Project

After installing or linking the CLI, initialize a target project once:

```bash
testpilot init
```

In an interactive terminal, `testpilot init` shows built-in Agent integrations and lets you choose them with an OpenSpec-style selector: use Space to select or deselect integrations, then press Enter to confirm.

Built-in choices include:

| Agent | Generated output |
|---|---|
| Claude Code | `.claude/commands/test/*.md` for `/test:new`, `/test:analysis`, and related slash commands |
| Qoder | `.qoder/commands/test/*.md` for the same `/test:*` workflow labels |
| Codex | `AGENTS.md` guidance mapping `test:*` labels to `testpilot` CLI commands |
| Generic Agent guidance | Tool-agnostic `AGENTS.md` workflow guidance |

For scripted or CI setup, pass the integrations explicitly:

```bash
testpilot init --agents claude,qoder,codex
# or initialize every built-in integration
testpilot init --agents all
```

When `testpilot init` runs outside an interactive terminal and `--agents` is omitted, it uses the default non-interactive selection: `claude,codex`.

By default, existing custom command files are preserved. To overwrite existing TestPilot-generated command files and refresh the TestPilot-managed `AGENTS.md` section:

```bash
testpilot init --agents claude --force
```

`testpilot init` also creates the project-local workspace root:

```text
testpilot/
  changes/
    archive/
```

## Workflow

TestPilot supports a requirement-driven QA workflow. The conceptual workflow labels map to `testpilot` CLI subcommands:

| Workflow label | CLI command | Purpose |
|---|---|---|
| `test:new` | `testpilot new <name> --requirement <path>` | Create a test proposal from a requirement document |
| `test:analysis` | `testpilot analysis [name]` | Decompose requirements into testable items and risks |
| `test:points` | `testpilot points [name]` | Generate core scenario test points |
| `test:excel` | `testpilot excel [name]` | Export executable Excel test cases |
| `test:mind` | `testpilot mind [name]` | Export mind-map style cases for review and visualization |
| `test:report` | `testpilot report [name]` | Read execution results and generate statistics |
| `test:archive` | `testpilot archive [name]` | Archive the full test artifact chain for traceability |

Example:

```bash
testpilot new login-v2 --requirement docs/login-prd.md
testpilot analysis login-v2
testpilot points login-v2
testpilot excel login-v2
testpilot mind login-v2
# Fill the Excel 执行结果 column, then:
testpilot report login-v2
testpilot archive login-v2
```

After `testpilot init`, Agent integrations can use the workflow labels directly. For example, Claude Code can use `/test:new login-v2 --requirement docs/login-prd.md`, while Codex can read `AGENTS.md` and map `test:new` to the backing `testpilot new` command. The `test:*` labels are Agent workflow labels, not shell commands.

## Artifact Layout

Active test changes are stored under `testpilot/changes/<name>/`:

```text
testpilot/
  changes/
    login-v2/
      proposal.md
      requirements-analysis.md
      specs/
        testpoints.md
      artifacts/
        testcases.json
        login-v2_cases.xlsx
        login-v2_cases.xmind
      report.md
    archive/
      2026-06-04-login-v2/
        manifest.json
        ...archived artifacts...
```

When a command accepts `[name]`, TestPilot uses the explicit change name when provided. If omitted, it infers the only active non-archived change; when multiple active changes exist, it asks for an explicit name.

## Development

Install dependencies:

```bash
npm install
```

Run the TypeScript CLI in development:

```bash
npm run dev -- --help
```

Build the CLI:

```bash
npm run build
```

Run checks:

```bash
npm run typecheck
npm run test
npm run check
```

Run the built CLI:

```bash
node dist/run.js --help
```

## CLI

After the package is built or installed, the command name is:

```bash
testpilot
```
