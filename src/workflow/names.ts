import { TestPilotError } from "../core/errors.js";

export function normalizeChangeName(input: string): string {
  const normalized = input
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{Letter}\p{Number}._-]+/gu, "-")
    .replace(/[-_.]{2,}/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "");

  if (normalized.length === 0) {
    throw new TestPilotError("Change name must contain at least one letter or number.");
  }

  return normalized;
}
