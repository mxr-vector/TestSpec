#!/usr/bin/env node

import { runCli } from "../src/cli.js";

try {
  await runCli(process.argv);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exit(1);
}
