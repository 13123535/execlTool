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
 *   记录每个修改过的单元格的原始值，撤销时恢复。
 *   使用 _originalValues 快照确保精确回滚。
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

/** 记录被修改的单元格：rowIndex → colIndex → 原始值 */
type ValueSnapshot = Map<number, Map<number, string | number | null>>;

export class TrimOp extends BaseOperation {
  readonly type = "trim";
  readonly label: string;
  readonly detail: string;

  private columnId: string;
  private _originalValues: ValueSnapshot | null = null;

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
   *   1. 深拷贝原表
   *   2. 确定目标列范围（"*" = 所有列，否则单个列）
   *   3. 遍历目标列的所有行
   *   4. 字符串值 → trim()，记录快照
   *   5. 返回新表
   */
  execute(table: NormalizedTable): NormalizedTable {
    const result = this.cloneTable(table);
    const snapshot: ValueSnapshot = new Map();

    const targetCols = this.resolveColumnIndices(result);

    for (const colIdx of targetCols) {
      for (let ri = 0; ri < result.rows.length; ri++) {
        const cell = result.rows[ri].cells[colIdx];
        if (cell === undefined) continue;

        if (typeof cell.value === "string") {
          const trimmed = cell.value.trim();
          if (trimmed !== cell.value) {
            // 记录原始值
            if (!snapshot.has(ri)) snapshot.set(ri, new Map());
            snapshot.get(ri)!.set(colIdx, cell.value);

            cell.value = trimmed;
          }
        }
      }
    }

    this._originalValues = snapshot;
    return result;
  }

  /**
   * 撤销 Trim
   *
   * 从快照恢复原始值。
   */
  undo(table: NormalizedTable): NormalizedTable {
    if (!this._originalValues) {
      // 无记录 = 没有修改过 → 直接返回
      return this.cloneTable(table);
    }

    const result = this.cloneTable(table);

    for (const [ri, colMap] of this._originalValues) {
      for (const [ci, original] of colMap) {
        if (ri < result.rows.length) {
          const cell = result.rows[ri].cells[ci];
          if (cell) {
            cell.value = original;
          }
        }
      }
    }

    return result;
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