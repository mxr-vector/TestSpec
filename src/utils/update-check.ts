/**
 * @fileoverview npm 包更新检查工具模块
 *
 * 该模块提供了轻量级 npm registry 最新版本检查能力，用于：
 * 1. 读取当前 CLI 包信息
 * 2. 查询 npm registry 的 latest 版本
 * 3. 比较当前版本与 latest 版本
 * 4. 在网络异常时保持静默，不影响主命令执行
 */

import { UPDATE_CHECK_CONFIG } from "../core/config.js";
import { getPackageInfo } from "./package-info.js";

/**
 * npm 更新检查结果。
 */
export interface NpmUpdateInfo {
  readonly packageName: string;
  readonly currentVersion: string;
  readonly latestVersion: string;
}

/**
 * npm 更新检查选项。
 */
export interface NpmUpdateCheckOptions {
  readonly registryUrl?: string;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
}

interface NpmLatestResponse {
  readonly version?: unknown;
}

interface ParsedVersion {
  readonly numbers: readonly number[];
  readonly prerelease: readonly string[];
}

/**
 * 检查当前 CLI 包是否存在 npm latest 新版本。
 *
 * 该函数是 best-effort：registry 超时、网络错误、响应异常或版本格式无法比较时，
 * 均返回 undefined，避免阻塞 `testspec init` 等主流程。
 */
export async function checkNpmUpdate(
  options: NpmUpdateCheckOptions = {}
): Promise<NpmUpdateInfo | undefined> {
  if (isUpdateCheckDisabled()) {
    return undefined;
  }

  const packageInfo = getPackageInfo();
  const latestVersion = await fetchLatestNpmVersion(packageInfo.name, options);

  if (latestVersion === undefined || !isNewerVersion(latestVersion, packageInfo.version)) {
    return undefined;
  }

  return {
    packageName: packageInfo.name,
    currentVersion: packageInfo.version,
    latestVersion,
  };
}

/**
 * 判断候选版本是否比当前版本更新。
 */
export function isNewerVersion(candidateVersion: string, currentVersion: string): boolean {
  const candidate = parseVersion(candidateVersion);
  const current = parseVersion(currentVersion);

  if (candidate === undefined || current === undefined) {
    return false;
  }

  return compareParsedVersions(candidate, current) > 0;
}

async function fetchLatestNpmVersion(
  packageName: string,
  options: NpmUpdateCheckOptions
): Promise<string | undefined> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  if (typeof fetchImpl !== "function") {
    return undefined;
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? UPDATE_CHECK_CONFIG.defaultTimeoutMs
  );

  try {
    const response = await fetchImpl(buildNpmLatestUrl(packageName, options.registryUrl), {
      signal: controller.signal,
    });

    if (!response.ok) {
      return undefined;
    }

    const data = (await response.json()) as NpmLatestResponse;
    return typeof data.version === "string" ? data.version : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

function buildNpmLatestUrl(
  packageName: string,
  registryUrl: string = UPDATE_CHECK_CONFIG.defaultNpmRegistryUrl
): string {
  const normalizedRegistryUrl = registryUrl.replace(/\/+$/, "");
  return `${normalizedRegistryUrl}/${encodeURIComponent(packageName)}/latest`;
}

function isUpdateCheckDisabled(): boolean {
  const value = process.env[UPDATE_CHECK_CONFIG.skipEnvVar];
  return value === "1" || value === "true";
}

function parseVersion(version: string): ParsedVersion | undefined {
  const withoutBuildMetadata = version.trim().replace(/^v/i, "").split("+")[0];

  if (withoutBuildMetadata === undefined || withoutBuildMetadata.length === 0) {
    return undefined;
  }

  const dashIndex = withoutBuildMetadata.indexOf("-");
  const coreVersion =
    dashIndex === -1 ? withoutBuildMetadata : withoutBuildMetadata.slice(0, dashIndex);
  const prereleaseVersion = dashIndex === -1 ? "" : withoutBuildMetadata.slice(dashIndex + 1);
  const numbers = coreVersion.split(".").map((part) => {
    if (!/^\d+$/.test(part)) {
      return Number.NaN;
    }

    return Number(part);
  });

  if (numbers.length !== 3 || numbers.some((part) => Number.isNaN(part))) {
    return undefined;
  }

  const prerelease = prereleaseVersion.length === 0 ? [] : prereleaseVersion.split(".");

  return {
    numbers,
    prerelease,
  };
}

function compareParsedVersions(left: ParsedVersion, right: ParsedVersion): number {
  for (let index = 0; index < left.numbers.length; index += 1) {
    const leftNumber = left.numbers[index] ?? 0;
    const rightNumber = right.numbers[index] ?? 0;

    if (leftNumber !== rightNumber) {
      return Math.sign(leftNumber - rightNumber);
    }
  }

  return comparePrereleaseVersions(left.prerelease, right.prerelease);
}

function comparePrereleaseVersions(left: readonly string[], right: readonly string[]): number {
  if (left.length === 0 && right.length === 0) {
    return 0;
  }

  if (left.length === 0) {
    return 1;
  }

  if (right.length === 0) {
    return -1;
  }

  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const leftPart = left[index];
    const rightPart = right[index];

    if (leftPart === undefined) {
      return -1;
    }

    if (rightPart === undefined) {
      return 1;
    }

    const comparison = comparePrereleasePart(leftPart, rightPart);

    if (comparison !== 0) {
      return comparison;
    }
  }

  return 0;
}

function comparePrereleasePart(left: string, right: string): number {
  const leftIsNumeric = /^\d+$/.test(left);
  const rightIsNumeric = /^\d+$/.test(right);

  if (leftIsNumeric && rightIsNumeric) {
    return Math.sign(Number(left) - Number(right));
  }

  if (leftIsNumeric) {
    return -1;
  }

  if (rightIsNumeric) {
    return 1;
  }

  return left.localeCompare(right);
}
