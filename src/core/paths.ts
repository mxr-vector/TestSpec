import { resolve } from "node:path";

export function resolveFromCwd(...segments: string[]): string {
  return resolve(process.cwd(), ...segments);
}
