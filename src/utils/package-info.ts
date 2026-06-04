import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface PackageInfo {
  readonly name: string;
  readonly version: string;
}

interface PackageJson {
  readonly name: string;
  readonly version: string;
}

export function getPackageInfo(): PackageInfo {
  const packageJson = readPackageJson();

  return {
    name: packageJson.name,
    version: packageJson.version,
  };
}

function readPackageJson(): PackageJson {
  const packageJsonPath = join(findPackageRoot(), "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as Partial<PackageJson>;

  if (typeof packageJson.name !== "string" || typeof packageJson.version !== "string") {
    throw new Error("package.json must include string name and version fields");
  }

  return {
    name: packageJson.name,
    version: packageJson.version,
  };
}

function findPackageRoot(): string {
  let currentDir = dirname(fileURLToPath(import.meta.url));

  for (let depth = 0; depth < 3; depth += 1) {
    try {
      readFileSync(join(currentDir, "package.json"));
      return currentDir;
    } catch {
      currentDir = dirname(currentDir);
    }
  }

  throw new Error("Unable to locate package.json");
}
