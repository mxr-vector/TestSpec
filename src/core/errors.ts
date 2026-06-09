/**
 * @fileoverview TestSpec 自定义错误类模块
 * 
 * 该模块定义了 TestSpec 项目的专用错误类，用于：
 * 1. 统一错误处理和错误类型识别
 * 2. 提供清晰的错误堆栈跟踪
 * 3. 区分 TestSpec 内部错误和系统错误
 * 
 * 使用场景：
 * - 工作流前置条件验证失败
 * - 文件操作错误
 * - 配置验证错误
 * - 用户输入验证错误
 */

/**
 * TestSpec 专用错误类
 * 
 * 继承自 Error，提供 TestSpec 项目的专用错误处理。
 * 错误名称固定为 "TestSpecError"，便于错误类型识别和日志记录。
 * 
 * @extends Error
 * 
 * @example
 * ```typescript
 * // 抛出 TestSpec 错误
 * throw new TestSpecError('工作区不存在');
 * 
 * // 捕获并处理 TestSpec 错误
 * try {
 *   await someWorkflowOperation();
 * } catch (error) {
 *   if (error instanceof TestSpecError) {
 *     console.error('TestSpec 错误:', error.message);
 *   } else {
 *     console.error('系统错误:', error);
 *   }
 * }
 * ```
 */
export class TestSpecError extends Error {
  /**
   * 创建 TestSpec 错误实例
   * 
   * @param {string} message - 错误信息，描述具体的错误原因
   */
  constructor(message: string) {
    super(message);
    // 设置错误名称为 "TestSpecError"，便于 instanceof 检查和日志记录
    this.name = "TestSpecError";
  }
}
