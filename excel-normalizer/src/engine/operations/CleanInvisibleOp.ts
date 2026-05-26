/**
 * CleanInvisibleOp — 清除不可见字符
 *
 * 对指定列（或所有列）的文本值清除以下不可见字符：
 *   - 零宽空格 U+200B、U+200C、U+200D、U+FEFF（BOM）
 *   - 控制字符 U+0000~U+001F（保留换行 U+000A、回车 U+000D、制表符 U+0009）
 *   - 其他不可见空白（U+00A0 不间断空格、U+2028 行分隔符、U+2029 段分隔符）
 *
 * 示例：
 *   "张三\u200B" → "张三"
 *   "\x00hello"  → "hello"
 *
 * 参数：
 *   - columnId: 目标列 ID（"*" 表示所有列，默认 "*"）
 *
 * undo 语义：
 *   与 TrimOp 相同的快照机制。
 */

import { BaseOperation } from "./Operation";
import type {
  NormalizedTable,
  SerializedOperation,
} from "../types";

/** CleanInvisible 操作参数 */
interface CleanInvisibleParams {
  columnId?: string;
}

/** 记录被修改的单元格：rowIndex → colIndex → 原始值 */
type ValueSnapshot = Map<number, Map<number, string | number | null>>;

/** 需要清除的不可见字符（正则） */
const INVISIBLE_CHARS = /[\u200B-\u200D\uFEFF\u0000-\u0008\u000B-\u000C\u000E-\u001F\u00A0\u2028\u2029]/g;

export class CleanInvisibleOp extends BaseOperation {
  readonly type = "clean_invisible";
  readonly label: string;
  readonly detail: string;

  private columnId: string;
  private _originalValues: ValueSnapshot | null = null;

  constructor(params: Record<string, unknown>) {
    super();
    const p = params as unknown as CleanInvisibleParams;
    this.columnId = p.columnId ?? "*";
    this.label = this.columnId === "*"
      ? "清除所有列不可见字符"
      : `清除列${this.columnId}不可见字符`;
    this.detail = this.columnId === "*"
      ? "清除零宽字符与控制字符"
      : `清除列${this.columnId}的零宽字符与控制字符`;
  }

  /**
   * 执行清除不可见字符
   *
   * 算法：
   *   1. 深拷贝原表
   *   2. 解析目标列
   *   3. 遍历每一行：字符串值 → replace(INVISIBLE_CHARS, "")
   *   4. 记录快照用于 undo
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
          const cleaned = cell.value.replace(INVISIBLE_CHARS, "");
          if (cleaned !== cell.value) {
            if (!snapshot.has(ri)) snapshot.set(ri, new Map());
            snapshot.get(ri)!.set(colIdx, cell.value);

            cell.value = cleaned;
          }
        }
      }
    }

    this._originalValues = snapshot;
    return result;
  }

  /**
   * 撤销 CleanInvisible
   *
   * 从快照恢复原始值。
   */
  undo(table: NormalizedTable): NormalizedTable {
    if (!this._originalValues) {
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

  private resolveColumnIndices(table: NormalizedTable): number[] {
    if (this.columnId === "*") {
      return table.columns.map((_, i) => i);
    }

    const idx = parseInt(this.columnId, 10);
    if (isNaN(idx) || idx < 0 || idx >= table.columns.length) {
      throw new Error(
        `CleanInvisibleOp: 列索引 "${this.columnId}" 无效（共 ${table.columns.length} 列）`,
      );
    }
    return [idx];
  }
}