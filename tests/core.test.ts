import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { TestSpecError } from "../src/core/errors.js";
import { logError, logInfo, logSuccess } from "../src/core/logger.js";
import { resolveFromCwd } from "../src/core/paths.js";
import { getPackageInfo } from "../src/utils/package-info.js";
import { checkNpmUpdate, isNewerVersion } from "../src/utils/update-check.js";

interface PackageJson {
  readonly name: string;
  readonly version: string;
}

describe("getPackageInfo", () => {
  it("returns the package name and version", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as PackageJson;

    expect(getPackageInfo()).toEqual({
      name: packageJson.name,
      version: packageJson.version,
    });
  });
});

describe("npm update check", () => {
  it("detects newer semantic versions", () => {
    expect(isNewerVersion("0.2.7", "0.2.6")).toBe(true);
    expect(isNewerVersion("0.3.0", "0.2.6")).toBe(true);
    expect(isNewerVersion("1.0.0", "0.2.6")).toBe(true);
    expect(isNewerVersion("0.2.6", "0.2.6")).toBe(false);
    expect(isNewerVersion("0.2.5", "0.2.6")).toBe(false);
  });

  it("handles prerelease versions conservatively", () => {
    expect(isNewerVersion("1.0.0", "1.0.0-beta.1")).toBe(true);
    expect(isNewerVersion("1.0.0-beta.2", "1.0.0-beta.1")).toBe(true);
    expect(isNewerVersion("1.0.0-alpha-2", "1.0.0-alpha-1")).toBe(true);
    expect(isNewerVersion("1.0.0-rc-1", "1.0.0-beta-3")).toBe(true);
    expect(isNewerVersion("1.0.0-beta.1", "1.0.0")).toBe(false);
    expect(isNewerVersion("latest", "1.0.0")).toBe(false);
  });

  it("returns update info when npm latest is newer", async () => {
    const packageInfo = getPackageInfo();
    const fetchImpl = vi.fn(async () =>
      Response.json({
        version: "99.0.0",
      })
    );

    await expect(checkNpmUpdate({ fetchImpl })).resolves.toEqual({
      packageName: packageInfo.name,
      currentVersion: packageInfo.version,
      latestVersion: "99.0.0",
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://registry.npmjs.org/%40wangjh2001%2Ftestspec/latest",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("skips update info for equal versions and network failures", async () => {
    const equalFetch = vi.fn(async () => Response.json({ version: getPackageInfo().version }));
    const failedFetch = vi.fn(async () => {
      throw new Error("offline");
    });

    await expect(checkNpmUpdate({ fetchImpl: equalFetch })).resolves.toBeUndefined();
    await expect(checkNpmUpdate({ fetchImpl: failedFetch })).resolves.toBeUndefined();
  });

  it("skips npm requests when disabled by environment", async () => {
    const previousValue = process.env.TESTSPEC_SKIP_UPDATE_CHECK;
    const fetchImpl = vi.fn(async () => Response.json({ version: "99.0.0" }));
    process.env.TESTSPEC_SKIP_UPDATE_CHECK = "true";

    try {
      await expect(checkNpmUpdate({ fetchImpl })).resolves.toBeUndefined();
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      if (previousValue === undefined) {
        delete process.env.TESTSPEC_SKIP_UPDATE_CHECK;
      } else {
        process.env.TESTSPEC_SKIP_UPDATE_CHECK = previousValue;
      }
    }
  });
});

describe("resolveFromCwd", () => {
  it("resolves path segments from the current working directory", () => {
    expect(resolveFromCwd("demo", "requirements.md")).toBe(
      resolve(process.cwd(), "demo", "requirements.md")
    );
  });
});

describe("TestSpecError", () => {
  it("preserves the message and custom error name", () => {
    const error = new TestSpecError("Something failed");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("TestSpecError");
    expect(error.message).toBe("Something failed");
  });
});

describe("logger", () => {
  it("writes info and success messages to stdout", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    logInfo("Info message");
    logSuccess("Success message");

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Info message"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Success message"));

    logSpy.mockRestore();
  });

  it("writes error messages to stderr", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logError("Error message");

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Error message"));

    errorSpy.mockRestore();
  });
});
