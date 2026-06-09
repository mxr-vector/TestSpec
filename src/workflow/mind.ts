/**
 * @fileoverview TestSpec XMind 思维导图生成模块
 * 
 * 该模块实现了 XMind 格式思维导图的生成功能，用于：
 * 1. 将结构化测试用例转换为思维导图格式
 * 2. 生成符合 XMind 8 格式的 .xmind 文件
 * 3. 支持测试用例的可视化展示和评审
 * 
 * 思维导图结构：
 * - 根节点：测试变更名称 + "测试用例"
 *   - 模块节点：按功能模块分组
 *     - 类型节点：按用例类型分组（正向、负向、边界、异常、安全）
 *       - 用例节点：具体测试用例（包含优先级和预期结果）
 * 
 * XMind 文件格式：
 * - content.xml: 思维导图内容
 * - META-INF/manifest.xml: 文件清单
 * - meta.xml: 元数据（创建者信息）
 * - styles.xml: 样式定义
 * 
 * 使用 fflate 库进行 ZIP 压缩，生成标准的 .xmind 文件。
 */

import { writeFile } from "node:fs/promises";
import { strToU8, zipSync } from "fflate";
import type { TestCase } from "./testcases.js";

/**
 * 生成 XMind 思维导图文件
 * 
 * 该函数负责：
 * 1. 将测试用例按模块和类型分组
 * 2. 生成 XMind 格式的 XML 内容
 * 3. 创建 ZIP 压缩包（.xmind 文件）
 * 4. 写入到指定路径
 * 
 * @param {string} path - 输出文件路径（.xmind 扩展名）
 * @param {string} title - 思维导图标题
 * @param {TestCase[]} cases - 测试用例数组
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
 * await writeXmind('./output.xmind', '用户登录测试用例', cases);
 * ```
 */
export async function writeXmind(path: string, title: string, cases: TestCase[]): Promise<void> {
  // 创建 ZIP 压缩包，包含 XMind 所需的 XML 文件
  const archive = zipSync({
    "content.xml": strToU8(contentXml(title, cases)),  // 思维导图内容
    "META-INF/manifest.xml": strToU8(manifestXml()),  // 文件清单
    "meta.xml": strToU8(metaXml()),  // 元数据
    "styles.xml": strToU8(stylesXml()),  // 样式
  });

  // 写入 .xmind 文件
  await writeFile(path, archive);
}

function contentXml(title: string, cases: TestCase[]): string {
  const grouped = groupCases(cases);
  const modules = [...Object.entries(grouped)]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([module, byType], moduleIndex) => {
      const typeTopics = Object.entries(byType)
        .map(([type, items]) => {
          const caseTopics = items
            .map((testCase, index) => {
              const compactId = `M${moduleIndex + 1}-${String(index + 1).padStart(2, "0")}`;
              const caseTitle = `${compactId} ${testCase.title}`;
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
