import { readFile, writeFile } from "node:fs/promises";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { PerformanceCase } from "./performance.js";
import type { TestCase } from "./testcases.js";

export const FUNCTIONAL_EXCEL_HEADERS = [
  "功能模块",
  "需求编号",
  "测试点编号",
  "用例编号",
  "用例名称",
  "用例类型",
  "前置条件",
  "测试数据",
  "测试步骤",
  "预期结果",
  "优先级",
  "执行结果",
  "实际结果",
  "缺陷编号",
  "备注",
] as const;

export const PERFORMANCE_EXCEL_HEADERS = [
  "业务模块",
  "场景编号",
  "场景名称",
  "性能测试类型",
  "关联需求编号",
  "关联测试点编号",
  "测试目标",
  "前置条件",
  "测试数据",
  "并发用户数",
  "持续时间",
  "压测步骤",
  "目标 TPS/QPS",
  "实际 TPS/QPS",
  "平均响应时间(ms)",
  "P95响应时间(ms)",
  "P99响应时间(ms)",
  "错误率(%)",
  "CPU峰值(%)",
  "内存峰值(%)",
  "瓶颈分析",
  "执行结果",
  "备注",
] as const;

export interface ExecutionRow {
  caseId: string;
  title: string;
  module: string;
  type: string;
  priority: string;
  executionResult: string;
}

interface WorksheetDescriptor {
  name: string;
  sheetId: number;
  relationshipId: string;
  target: string;
  rows: string[][];
}

export async function writeExcelWorkbook(
  path: string,
  cases: TestCase[],
  performanceCases: PerformanceCase[] = []
): Promise<void> {
  const worksheets: WorksheetDescriptor[] = [
    {
      name: "功能测试",
      sheetId: 1,
      relationshipId: "rId1",
      target: "worksheets/sheet1.xml",
      rows: functionalRows(cases),
    },
  ];

  if (performanceCases.length > 0) {
    worksheets.push({
      name: "性能测试",
      sheetId: 2,
      relationshipId: "rId2",
      target: "worksheets/sheet2.xml",
      rows: performanceRows(performanceCases),
    });
  }
  const worksheetEntries = Object.fromEntries(
    worksheets.map((worksheet) => [`xl/${worksheet.target}`, strToU8(worksheetXml(worksheet.rows))])
  );

  const archive = zipSync({
    "[Content_Types].xml": strToU8(contentTypesXml(worksheets)),
    "_rels/.rels": strToU8(rootRelationshipsXml()),
    "xl/workbook.xml": strToU8(workbookXml(worksheets)),
    "xl/_rels/workbook.xml.rels": strToU8(workbookRelationshipsXml(worksheets)),
    ...worksheetEntries,
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
  const [headers, ...dataRows] = rows;
  if (!headers) {
    return [];
  }

  const columns = headerColumns(headers);
  const caseIdColumn = columns.get("用例编号");
  const titleColumn = columns.get("用例名称");
  const moduleColumn = columns.get("功能模块");
  const typeColumn = columns.get("用例类型");
  const priorityColumn = columns.get("优先级");
  const executionResultColumn = columns.get("执行结果");

  if (
    caseIdColumn === undefined ||
    titleColumn === undefined ||
    moduleColumn === undefined ||
    typeColumn === undefined ||
    priorityColumn === undefined ||
    executionResultColumn === undefined
  ) {
    return [];
  }

  return dataRows.map((row) => ({
    caseId: row[caseIdColumn] ?? "",
    title: row[titleColumn] ?? "",
    module: row[moduleColumn] ?? "",
    type: row[typeColumn] ?? "",
    priority: row[priorityColumn] ?? "",
    executionResult: row[executionResultColumn] ?? "未执行",
  }));
}

function functionalRows(cases: TestCase[]): string[][] {
  return [
    [...FUNCTIONAL_EXCEL_HEADERS],
    ...cases.map((testCase) => [
      testCase.module,
      testCase.requirementIds.join(", "),
      testCase.testPointIds.join(", "),
      testCase.caseId,
      testCase.title,
      testCase.type,
      testCase.preconditions,
      "",
      testCase.steps.map((step, index) => `${index + 1}. ${step}`).join("\n"),
      testCase.expectedResult,
      testCase.priority,
      testCase.executionResult ?? "未执行",
      "",
      "",
      "",
    ]),
  ];
}

function performanceRows(cases: PerformanceCase[]): string[][] {
  return [
    [...PERFORMANCE_EXCEL_HEADERS],
    ...cases.map((testCase) => [
      testCase.module,
      testCase.scenarioId,
      testCase.scenarioName,
      testCase.performanceType,
      testCase.requirementIds.join(", "),
      testCase.testPointIds.join(", "),
      testCase.objective,
      testCase.preconditions,
      testCase.testData,
      testCase.concurrentUsers,
      testCase.duration,
      testCase.steps.map((step, index) => `${index + 1}. ${step}`).join("\n"),
      testCase.targetThroughput,
      testCase.actualThroughput,
      testCase.avgResponseTime,
      testCase.p95ResponseTime,
      testCase.p99ResponseTime,
      testCase.errorRate,
      testCase.cpuPeak,
      testCase.memoryPeak,
      testCase.bottleneckAnalysis,
      testCase.executionResult,
      testCase.notes,
    ]),
  ];
}

function headerColumns(headers: string[]): Map<string, number> {
  return new Map(headers.map((header, index) => [header, index]));
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

function contentTypesXml(worksheets: WorksheetDescriptor[]): string {
  const worksheetOverrides = worksheets
    .map(
      (worksheet) =>
        `<Override PartName="/xl/${worksheet.target}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${worksheetOverrides}</Types>`;
}

function rootRelationshipsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
}

function workbookXml(worksheets: WorksheetDescriptor[]): string {
  const sheetXml = worksheets
    .map(
      (worksheet) =>
        `<sheet name="${escapeXml(worksheet.name)}" sheetId="${worksheet.sheetId}" r:id="${worksheet.relationshipId}"/>`
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetXml}</sheets></workbook>`;
}

function workbookRelationshipsXml(worksheets: WorksheetDescriptor[]): string {
  const relationships = worksheets
    .map(
      (worksheet) =>
        `<Relationship Id="${worksheet.relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="${escapeXml(worksheet.target)}"/>`
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}</Relationships>`;
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
