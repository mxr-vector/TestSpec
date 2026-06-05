import { readFile, writeFile } from "node:fs/promises";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { TestCase } from "./testcases.js";

export const EXCEL_HEADERS = [
  "功能模块",
  "用例编号",
  "用例名称",
  "类型",
  "前置条件",
  "测试步骤",
  "预期结果",
  "优先级",
  "执行结果",
] as const;

export interface ExecutionRow {
  caseId: string;
  title: string;
  module: string;
  type: string;
  priority: string;
  executionResult: string;
}

export async function writeExcelWorkbook(path: string, cases: TestCase[]): Promise<void> {
  const rows = [
    [...EXCEL_HEADERS],
    ...cases.map((testCase) => [
      testCase.module,
      testCase.caseId,
      testCase.title,
      testCase.type,
      testCase.preconditions,
      testCase.steps.map((step, index) => `${index + 1}. ${step}`).join("\n"),
      testCase.expectedResult,
      testCase.priority,
      testCase.executionResult ?? "未执行",
    ]),
  ];

  const archive = zipSync({
    "[Content_Types].xml": strToU8(contentTypesXml()),
    "_rels/.rels": strToU8(rootRelationshipsXml()),
    "xl/workbook.xml": strToU8(workbookXml()),
    "xl/_rels/workbook.xml.rels": strToU8(workbookRelationshipsXml()),
    "xl/worksheets/sheet1.xml": strToU8(worksheetXml(rows)),
  });

  await writeFile(path, archive);
}

export async function readExecutionRows(path: string): Promise<ExecutionRow[]> {
  const archive = unzipSync(await readFile(path));
  const sheet = archive["xl/worksheets/sheet1.xml"];

  if (!sheet) {
    return [];
  }

  const rows = parseWorksheetRows(strFromU8(sheet));
  const [, ...dataRows] = rows;

  return dataRows.map((row) => ({
    caseId: row[1] ?? "",
    title: row[2] ?? "",
    module: row[0] ?? "",
    type: row[3] ?? "",
    priority: row[7] ?? "",
    executionResult: row[8] ?? "未执行",
  }));
}

function worksheetXml(rows: string[][]): string {
  const rowXml = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, columnIndex) => {
          const reference = `${columnName(columnIndex + 1)}${rowIndex + 1}`;
          return `<c r="${reference}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowXml}</sheetData></worksheet>`;
}

function parseWorksheetRows(xml: string): string[][] {
  const rows: string[][] = [];
  const rowMatches = xml.matchAll(/<row\b[^>]*>(.*?)<\/row>/gs);

  for (const rowMatch of rowMatches) {
    const rowContent = rowMatch[1] ?? "";
    const values: string[] = [];

    for (const cellMatch of rowContent.matchAll(/<c\b([^>]*)>(.*?)<\/c>/gs)) {
      const cellAttributes = cellMatch[1] ?? "";
      const cellContent = cellMatch[2] ?? "";
      const valueMatch = /<t[^>]*>(.*?)<\/t>/s.exec(cellContent);
      const referenceMatch = /\br="([A-Z]+)\d+"/i.exec(cellAttributes);
      const value = unescapeXml(valueMatch?.[1] ?? "");
      const columnName = referenceMatch?.[1];
      const columnIndex = columnName ? columnIndexFromName(columnName) : values.length;
      values[columnIndex] = value;
    }

    rows.push(values);
  }

  return rows;
}

function contentTypesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;
}

function rootRelationshipsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
}

function workbookXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="测试用例" sheetId="1" r:id="rId1"/></sheets></workbook>`;
}

function workbookRelationshipsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;
}

function columnName(index: number): string {
  let name = "";
  let current = index;

  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }

  return name;
}

function columnIndexFromName(name: string): number {
  let index = 0;

  for (const character of name.toUpperCase()) {
    index = index * 26 + (character.charCodeAt(0) - 64);
  }

  return index - 1;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function unescapeXml(value: string): string {
  return value
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}
