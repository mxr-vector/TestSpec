# TestPilot

Requirement-driven test design CLI for AI-assisted QA workflows.

## Status

Early development. This project is currently establishing the TypeScript CLI foundation before implementing the test workflow commands.

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
