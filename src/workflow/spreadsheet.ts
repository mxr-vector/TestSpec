/**
 * @fileoverview TestSpec Excel 工作簿生成模块
 *
 * 该模块实现了 Excel 工作簿的生成功能，包括：
 * 1. 生成符合 Office Open XML 格式的 .xlsx 文件
 * 2. 支持功能测试和性能测试两个工作表
 * 3. 提供样式定义（表头样式、边框样式）
 * 4. 支持从 Excel 文件读取执行结果
 *
 * Excel 工作簿结构：
 * - 功能测试表：包含功能测试用例的详细信息
 *   - 功能模块、用例名称、用例类型、前置条件、测试步骤、预期结果、优先级、执行结果
 * - 性能测试表：包含性能测试用例的详细信息
 *   - 场景编号、业务模块、场景名称、性能测试类型、关联测试点、测试目标、测试数据规模、负载模型、压测步骤、目标指标、实际指标、执行结果
 *
 * 使用 fflate 库进行 ZIP 压缩，生成标准的 .xlsx 文件。
 * 支持读取 Excel 文件中的执行结果，用于生成测试报告。
 */

import { readFile, writeFile } from "node:fs/promises";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { PerformanceCase } from "./performance.js";
import type { TestCase } from "./testcases.js";

/**
 * 工作簿测试用例类型（扩展 TestCase，添加执行结果字段）
 */
type WorkbookTestCase = TestCase & { executionResult?: string };

/**
 * 功能测试 Excel 表头常量
 *
 * 定义了功能测试工作表的列名，用于：
 * 1. 生成 Excel 文件时的表头行
 * 2. 读取 Excel 文件时的列映射
 */
export const FUNCTIONAL_EXCEL_HEADERS = [
  "功能模块",
  "用例名称",
  "用例类型",
  "前置条件",
  "测试步骤",
  "预期结果",
  "优先级",
  "执行结果",
] as const;

/**
 * 性能测试 Excel 表头常量
 *
 * 定义了性能测试工作表的列名，用于：
 * 1. 生成 Excel 文件时的表头行
 * 2. 读取 Excel 文件时的列映射
 */
export const PERFORMANCE_EXCEL_HEADERS = [
  "场景编号",
  "业务模块",
  "场景名称",
  "性能测试类型",
  "关联需求编号",
  "关联测试点编号",
  "测试目标",
  "业务占比/权重",
  "测试数据规模",
  "负载模型",
  "并发用户数",
  "持续时间",
  "阶梯加压策略",
  "前置条件",
  "压测步骤",
  "目标 TPS/QPS",
  "平均响应时间目标(ms)",
  "P95响应时间目标(ms)",
  "P99响应时间目标(ms)",
  "错误率目标(%)",
  "监控指标",
  "瓶颈观察点",
  "实际 TPS/QPS",
  "实际平均响应时间(ms)",
  "实际P95响应时间(ms)",
  "实际错误率(%)",
  "CPU峰值(%)",
  "内存峰值(MB)",
  "执行结果",
  "备注",
] as const;

/**
 * 执行行接口
 *
 * 用于从 Excel 文件读取执行结果时的数据结构
 *
 * @interface ExecutionRow
 * @property {string} caseId - 用例编号（如果没有则自动生成）
 * @property {string} title - 用例名称
 * @property {string} module - 功能模块
 * @property {string} type - 用例类型
 * @property {string} priority - 优先级
 * @property {string} executionResult - 执行结果（通过、失败、阻塞、未执行、不适用）
 */
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

/**
 * 生成 Excel 工作簿文件
 *
 * 该函数负责：
 * 1. 创建功能测试工作表
 * 2. 如果有性能测试用例，创建性能测试工作表
 * 3. 生成 Excel 所需的 XML 文件
 * 4. 创建 ZIP 压缩包（.xlsx 文件）
 * 5. 写入到指定路径
 *
 * @param {string} path - 输出文件路径（.xlsx 扩展名）
 * @param {TCase[]} cases - 功能测试用例数组
 * @param {PerformanceCase[]} [performanceCases] - 性能测试用例数组（可选）
 * @returns {Promise<void>} 异步执行，无返回值
 *
 * @example
 * ```typescript
 * const cases = [
 *   {
 *     title: '验证用户登录成功',
 *     module: '用户管理',
 *     type: '正向',
 *     priority: 'P0',
 *     preconditions: '用户已注册',
 *     steps: ['输入用户名', '输入密码', '点击登录'],
 *     expectedResult: '登录成功，跳转到首页'
 *   }
 * ];
 *
 * await writeExcelWorkbook('./output.xlsx', cases);
 * ```
 */
export async function writeExcelWorkbook<TCase extends WorkbookTestCase>(
  path: string,
  cases: TCase[],
  performanceCases: PerformanceCase[] = []
): Promise<void> {
  // 创建工作表描述符数组
  const worksheets: WorksheetDescriptor[] = [
    {
      name: "功能测试",
      sheetId: 1,
      relationshipId: "rId1",
      target: "worksheets/sheet1.xml",
      rows: functionalRows(cases),
    },
  ];

  // 如果有性能测试用例，添加性能测试工作表
  if (performanceCases.length > 0) {
    worksheets.push({
      name: "性能测试",
      sheetId: 2,
      relationshipId: "rId2",
      target: "worksheets/sheet2.xml",
      rows: performanceRows(performanceCases),
    });
  }

  // 生成工作表 XML 内容
  const worksheetEntries = Object.fromEntries(
    worksheets.map((worksheet) => [`xl/${worksheet.target}`, strToU8(worksheetXml(worksheet.rows))])
  );

  // 创建 ZIP 压缩包，包含 Excel 所需的所有 XML 文件
  const archive = zipSync({
    "[Content_Types].xml": strToU8(contentTypesXml(worksheets)), // 内容类型
    "_rels/.rels": strToU8(rootRelationshipsXml()), // 根关系
    "xl/workbook.xml": strToU8(workbookXml(worksheets)), // 工作簿
    "xl/styles.xml": strToU8(stylesXml()), // 样式
    "xl/_rels/workbook.xml.rels": strToU8(workbookRelationshipsXml(worksheets)), // 工作簿关系
    ...worksheetEntries, // 工作表内容
  });

  // 写入 .xlsx 文件
  await writeFile(path, archive);
}

/**
 * 从 Excel 文件读取执行结果
 *
 * 该函数负责：
 * 1. 解压 .xlsx 文件（ZIP 格式）
 * 2. 读取功能测试工作表（sheet1.xml）
 * 3. 解析 XML 内容，提取表头和数据行
 * 4. 根据表头映射提取执行结果
 * 5. 返回执行行数组
 *
 * @param {string} path - Excel 文件路径（.xlsx 扩展名）
 * @returns {Promise<ExecutionRow[]>} 执行行数组
 *
 * @example
 * ```typescript
 * const rows = await readExecutionRows('./test-cases.xlsx');
 * console.log(`读取到 ${rows.length} 条执行记录`);
 * for (const row of rows) {
 *   console.log(`${row.title}: ${row.executionResult}`);
 * }
 * ```
 */
export async function readExecutionRows(path: string): Promise<ExecutionRow[]> {
  // 解压 .xlsx 文件
  const archive = unzipSync(await readFile(path));
  const sheet = archive["xl/worksheets/sheet1.xml"];

  // 如果没有功能测试工作表，返回空数组
  if (!sheet) {
    return [];
  }

  // 解析工作表 XML 内容
  const rows = parseWorksheetRows(strFromU8(sheet));
  const [headers, ...dataRows] = rows;
  if (!headers) {
    return [];
  }

  // 创建表头列映射
  const columns = headerColumns(headers);
  const caseIdColumn = columns.get("用例编号");
  const titleColumn = columns.get("用例名称");
  const moduleColumn = columns.get("功能模块");
  const typeColumn = columns.get("用例类型");
  const priorityColumn = columns.get("优先级");
  const executionResultColumn = columns.get("执行结果");

  // 验证必需列是否存在
  if (
    titleColumn === undefined ||
    moduleColumn === undefined ||
    typeColumn === undefined ||
    priorityColumn === undefined ||
    executionResultColumn === undefined
  ) {
    return [];
  }

  // 提取执行行数据
  return dataRows.map((row, index) => ({
    caseId:
      caseIdColumn === undefined ? `row-${index + 2}` : (row[caseIdColumn] ?? `row-${index + 2}`),
    title: row[titleColumn] ?? "",
    module: row[moduleColumn] ?? "",
    type: row[typeColumn] ?? "",
    priority: row[priorityColumn] ?? "",
    executionResult: row[executionResultColumn] ?? "未执行",
  }));
}

function functionalRows(cases: WorkbookTestCase[]): string[][] {
  const sorted = [...cases].sort((a, b) => a.module.localeCompare(b.module));
  return [
    [...FUNCTIONAL_EXCEL_HEADERS],
    ...sorted.map((testCase) => [
      testCase.module,
      testCase.title,
      testCase.type,
      testCase.preconditions,
      testCase.steps.map((step, index) => `${index + 1}. ${step}`).join("\n"),
      testCase.expectedResult,
      testCase.priority,
      testCase.executionResult ?? "未执行",
    ]),
  ];
}

function performanceRows(cases: PerformanceCase[]): string[][] {
  const sorted = [...cases].sort((a, b) => a.module.localeCompare(b.module));
  return [
    [...PERFORMANCE_EXCEL_HEADERS],
    ...sorted.map((testCase) => [
      testCase.scenarioId ?? "",
      testCase.module,
      testCase.scenarioName,
      testCase.performanceType,
      (testCase.requirementIds ?? []).join(", "),
      (testCase.testPointIds ?? []).join(", "),
      testCase.objective,
      testCase.businessWeight ?? "",
      testCase.testData ?? "",
      testCase.loadModel ?? "",
      testCase.concurrentUsers,
      testCase.duration,
      testCase.rampUpStrategy ?? "",
      testCase.preconditions,
      testCase.steps.map((step, index) => `${index + 1}. ${step}`).join("\n"),
      testCase.targetThroughput,
      testCase.avgResponseTimeTarget ?? "",
      testCase.p95ResponseTimeTarget ?? "",
      testCase.p99ResponseTimeTarget ?? "",
      testCase.errorRateTarget ?? "",
      testCase.monitoringMetrics ?? "",
      testCase.bottleneckAnalysis ?? "",
      testCase.actualThroughput,
      testCase.avgResponseTime,
      testCase.p95ResponseTime,
      testCase.errorRate,
      testCase.cpuPeak ?? "",
      testCase.memoryPeak ?? "",
      testCase.executionResult ?? "未执行",
      testCase.notes ?? "",
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
          const styleIndex = rowIndex === 0 ? 1 : 2;
          return `<c r="${reference}" s="${styleIndex}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowXml}</sheetData></worksheet>`;
}

function stylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right><top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
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

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${worksheetOverrides}</Types>`;
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

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
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
