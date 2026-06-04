import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["bin/run.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  outDir: "dist",
  sourcemap: true,
  clean: true,
  dts: false,
  splitting: false,
  shims: false,
});
