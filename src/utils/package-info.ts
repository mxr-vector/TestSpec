import packageJson from "../../package.json" with { type: "json" };

export interface PackageInfo {
  readonly name: string;
  readonly version: string;
}

export function getPackageInfo(): PackageInfo {
  return {
    name: packageJson.name,
    version: packageJson.version,
  };
}
