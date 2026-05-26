/**
 * 操作引擎基类
 *
 * 定义操作引擎的抽象接口。
 * 每种操作类型（Expand、SplitColumn 等）均实现此接口。
 */

import type {
  WorkbookData,
  Operation,
  OperationType,
} from "../types";

/**
 * 操作引擎接口
 *
 * T — 该操作对应的参数类型
 */
export interface OperationEngine<T = unknown> {
  /** 支持的操作类型 */
  type: OperationType;

  /**
   * 执行操作
   * @param workbook 当前工作簿数据（会被直接修改，也可返回新对象）
   * @param operation 操作定义
   * @returns 修改后的 WorkbookData（与入参可能是同一引用）
   */
  execute(workbook: WorkbookData, operation: Operation<T>): WorkbookData;

  /**
   * 验证操作参数是否合法
   * @param operation 操作定义
   * @returns true 表示合法，string 表示不合法原因
   */
  validate(operation: Operation<T>): true | string;
}

/**
 * 操作引擎注册表
 * 管理所有已注册的操作引擎
 */
export class OperationRegistry {
  private engines = new Map<OperationType, OperationEngine>();

  register(engine: OperationEngine): void {
    if (this.engines.has(engine.type)) {
      console.warn(`[OperationRegistry] 引擎已存在，将被覆盖: ${engine.type}`);
    }
    this.engines.set(engine.type, engine);
  }

  get(type: OperationType): OperationEngine | undefined {
    return this.engines.get(type);
  }

  /**
   * 执行操作（自动查找对应引擎）
   */
  execute(workbook: WorkbookData, operation: Operation): WorkbookData {
    const engine = this.engines.get(operation.type);
    if (!engine) {
      throw new Error(`未知操作类型: ${operation.type}`);
    }

    const validation = engine.validate(operation);
    if (validation !== true) {
      throw new Error(`操作参数验证失败: ${validation}`);
    }

    return engine.execute(workbook, operation as never);
  }
}

/** 全局操作引擎注册表单例 */
export const operationRegistry = new OperationRegistry();