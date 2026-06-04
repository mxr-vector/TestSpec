import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { TestPilotError } from "../src/core/errors.js";
import { logError, logInfo, logSuccess } from "../src/core/logger.js";
import { resolveFromCwd } from "../src/core/paths.js";
import { getPackageInfo } from "../src/utils/package-info.js";

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

describe("resolveFromCwd", () => {
  it("resolves path segments from the current working directory", () => {
    expect(resolveFromCwd("demo", "requirements.md")).toBe(
      resolve(process.cwd(), "demo", "requirements.md")
    );
  });
});

describe("TestPilotError", () => {
  it("preserves the message and custom error name", () => {
    const error = new TestPilotError("Something failed");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("TestPilotError");
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
