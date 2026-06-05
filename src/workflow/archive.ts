import { cp, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { TestPilotError } from "../core/errors.js";
import { readReportSummary } from "./report.js";
import type { ChangeWorkspace } from "./workspace.js";
import { getArchiveRoot, pathExists } from "./workspace.js";

export interface ArchiveManifest {
  name: string;
  archivedAt: string;
  requirement?: string;
  artifacts: string[];
  reportSummary: Record<string, unknown>;
}

export async function archiveChange(
  workspace: ChangeWorkspace,
  options: { date?: Date; cwd?: string } = {}
): Promise<string> {
  const date = formatDate(options.date ?? new Date());
  const archiveRoot = getArchiveRoot(options.cwd);
  const targetDir = join(archiveRoot, `${date}-${workspace.name}`);

  if (await pathExists(targetDir)) {
    throw new TestPilotError(
      `Archive already exists: ${basename(targetDir)}. Refusing to overwrite.`
    );
  }

  await mkdir(archiveRoot, { recursive: true });
  await writeManifest(workspace, workspace.changeDir, options.date ?? new Date());

  try {
    await rename(workspace.changeDir, targetDir);
  } catch {
    await cp(workspace.changeDir, targetDir, { recursive: true, errorOnExist: true });
    await rm(workspace.changeDir, { recursive: true, force: true });
  }

  return targetDir;
}

export async function writeManifest(
  workspace: ChangeWorkspace,
  directory: string,
  date: Date
): Promise<string> {
  const requirement = await readRequirementReference(directory);
  const manifest: ArchiveManifest = {
    name: workspace.name,
    archivedAt: formatDate(date),
    artifacts: await listArtifacts(directory),
    reportSummary: await readReportSummary(directory),
  };
  if (requirement) {
    manifest.requirement = requirement;
  }
  const manifestPath = join(directory, "manifest.json");

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return manifestPath;
}

async function readRequirementReference(directory: string): Promise<string | undefined> {
  try {
    const proposal = await readFile(join(directory, "proposal.md"), "utf8");
    const match = /## 关联需求文档\s+([^#]+)/.exec(proposal);
    return match?.[1]?.trim().split(/\r?\n/)[0]?.trim();
  } catch {
    return undefined;
  }
}

async function listArtifacts(directory: string): Promise<string[]> {
  const files: string[] = [];

  async function visit(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.name !== "manifest.json") {
        files.push(relative(directory, path));
      }
    }
  }

  await visit(directory);
  return files.sort();
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
