/**
 * TrimOp — 去前后空格
 *
 * 对指定列（或所有列）的文本值去除首尾空白字符。
 *
 * 示例：
 *   "  张三  " → "张三"
 *   "  hello world  " → "hello world"
 *
 * 参数：
 *   - columnId: 目标列 ID（"*" 表示所有列，默认 "*"）
 *
 * undo 语义：
 *   execute 时保存 _beforeTable 原始表引用。
 *   undo 时直接返回原始表，零拷贝。
 */

import { BaseOperation } from "./Operation";
import type {
  NormalizedTable,
  SerializedOperation,
} from "../types";

/** Trim 操作参数 */
interface TrimParams {
  columnId?: string;
}

export class TrimOp extends BaseOperation {
  readonly type = "trim";
  readonly label: string;
  readonly detail: string;

  private columnId: string;
  /** 执行前的原始表引用，undo 时直接返回，避免二次 clone */
  private _beforeTable: NormalizedTable | null = null;

  constructor(params: Record<string, unknown>) {
    super();
    const p = params as unknown as TrimParams;
    this.columnId = p.columnId ?? "*";
    this.label = this.columnId === "*" ? "去所有列空格" : `去列${this.columnId}空格`;
    this.detail = this.columnId === "*"
      ? "去除所有文本列首尾空格"
      : `去除列${this.columnId}首尾空格`;
  }

  /**
   * 执行 Trim
   *
   * 算法：
   *   1. 保存原始表引用（用于 undo）
   *   2. 深拷贝原表
   *   3. 确定目标列范围（"*" = 所有列，否则单个列）
   *   4. 遍历目标列的所有行，字符串值 → trim()
   *   5. 返回新表
   */
  execute(table: NormalizedTable): NormalizedTable {
    // 保存原始表引用，undo 时直接返回，零拷贝
    this._beforeTable = table;

    const result = this.cloneTable(table);
    const targetCols = this.resolveColumnIndices(result);

    for (const colIdx of targetCols) {
      for (let ri = 0; ri < result.rows.length; ri++) {
        const cell = result.rows[ri].cells[colIdx];
        if (cell === undefined) continue;

        if (typeof cell.value === "string") {
          cell.value = cell.value.trim();
        }
      }
    }

    return result;
  }

  /**
   * 撤销 Trim
   *
   * 直接返回 execute 时保存的原始表引用（零拷贝）。
   */
  undo(_table: NormalizedTable): NormalizedTable {
    if (this._beforeTable) {
      return this._beforeTable;
    }
    // 兜底：如果没有保存原始表（极端情况），返回传入的表
    return _table;
  }

  serialize(): SerializedOperation {
    return {
      type: this.type,
      params: {
        columnId: this.columnId,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // 私有方法
  // ═══════════════════════════════════════════════════════════════

  /**
   * 解析目标列索引
   *
   * columnId="*" → 所有列索引
   * 其他 → 单列索引
   *
   * @throws 列索引无效时抛出
   */
  private resolveColumnIndices(table: NormalizedTable): number[] {
    if (this.columnId === "*") {
      return table.columns.map((_, i) => i);
    }

    const idx = parseInt(this.columnId, 10);
    if (isNaN(idx) || idx < 0 || idx >= table.columns.length) {
      throw new Error(
        `TrimOp: 列索引 "${this.columnId}" 无效（共 ${table.columns.length} 列）`,
      );
    }
    return [idx];
  }
}