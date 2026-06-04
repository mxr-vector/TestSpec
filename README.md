# TestPilot

Requirement-driven test design CLI for AI-assisted QA workflows.

## Status

Early development. This project is currently establishing the TypeScript CLI foundation before implementing the test workflow commands.

## Planned Workflow

TestPilot is intended to support a requirement-driven QA workflow:

- `test:new` — create a test proposal from a requirement document
- `test:analysis` — decompose requirements into testable items and risks
- `test:points` — generate core scenario test points
- `test:excel` — export executable Excel test cases
- `test:mind` — export mind-map style cases for review and visualization
- `test:report` — read execution results and generate statistics
- `test:archive` — archive the full test artifact chain for traceability

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
