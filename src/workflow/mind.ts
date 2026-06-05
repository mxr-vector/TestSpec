import { writeFile } from "node:fs/promises";
import { strToU8, zipSync } from "fflate";
import type { TestCase } from "./testcases.js";

export async function writeXmind(path: string, title: string, cases: TestCase[]): Promise<void> {
  const archive = zipSync({
    "content.xml": strToU8(contentXml(title, cases)),
    "META-INF/manifest.xml": strToU8(manifestXml()),
    "meta.xml": strToU8(metaXml()),
    "styles.xml": strToU8(stylesXml()),
  });

  await writeFile(path, archive);
}

function contentXml(title: string, cases: TestCase[]): string {
  const grouped = groupCases(cases);
  const modules = Object.entries(grouped)
    .map(([module, byType], moduleIndex) => {
      const typeTopics = Object.entries(byType)
        .map(([type, items]) => {
          const caseTopics = items
            .map((testCase, index) => {
              const compactId = `M${moduleIndex + 1}-${String(index + 1).padStart(2, "0")}`;
              const caseTitle = `${testCase.caseId ?? compactId} ${testCase.title}`;
              return `<topic><title>${escapeXml(caseTitle)}</title><children><topics type="attached"><topic><title>${escapeXml(
                `优先级：${testCase.priority}`
              )}</title></topic><topic><title>${escapeXml(
                `预期：${testCase.expectedResult}`
              )}</title></topic></topics></children></topic>`;
            })
            .join("");
          return `<topic><title>${escapeXml(type)}</title><children><topics type="attached">${caseTopics}</topics></children></topic>`;
        })
        .join("");
      return `<topic><title>${escapeXml(module)}</title><children><topics type="attached">${typeTopics}</topics></children></topic>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?><xmap-content xmlns="urn:xmind:xmap:xmlns:content:2.0" version="2.0"><sheet id="sheet-1"><title>${escapeXml(
    title
  )}</title><topic id="root"><title>${escapeXml(title)}</title><children><topics type="attached">${modules}</topics></children></topic></sheet></xmap-content>`;
}

function groupCases(cases: TestCase[]): Record<string, Record<string, TestCase[]>> {
  const grouped: Record<string, Record<string, TestCase[]>> = {};

  for (const testCase of cases) {
    const moduleGroup = grouped[testCase.module] ?? {};
    const typeGroup = moduleGroup[testCase.type] ?? [];
    typeGroup.push(testCase);
    moduleGroup[testCase.type] = typeGroup;
    grouped[testCase.module] = moduleGroup;
  }

  return grouped;
}

function manifestXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?><manifest xmlns="urn:xmind:xmap:xmlns:manifest:1.0"><file-entry full-path="content.xml" media-type="text/xml"/><file-entry full-path="styles.xml" media-type="text/xml"/><file-entry full-path="meta.xml" media-type="text/xml"/></manifest>`;
}

function metaXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?><meta xmlns="urn:xmind:xmap:xmlns:meta:2.0"><Creator><Name>TestSpec</Name></Creator></meta>`;
}

function stylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?><xmap-styles xmlns="urn:xmind:xmap:xmlns:style:2.0"/>`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
