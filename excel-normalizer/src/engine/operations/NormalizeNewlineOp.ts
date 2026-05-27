/**
 * NormalizeNewlineOp — 规范化换行符
 *
 * 将单元格内的所有换行符（\r\n、\r）统一为 \n。
 * 对指定列（或所有列）的文本值进行规范化。
 *
 * 示例：
 *   "第一行\r\n第二行" → "第一行\n第二行"
 *   "A\rB\r\nC"        → "A\nB\nC"
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

/** NormalizeNewline 操作参数 */
interface NormalizeNewlineParams {
  columnId?: string;
}

export class NormalizeNewlineOp extends BaseOperation {
  readonly type = "normalize_newline";
  readonly label: string;
  readonly detail: string;

  private columnId: string;
  /** 执行前的原始表引用，undo 时直接返回 */
  private _beforeTable: NormalizedTable | null = null;

  constructor(params: Record<string, unknown>) {
    super();
    const p = params as unknown as NormalizeNewlineParams;
    this.columnId = p.columnId ?? "*";
    this.label = this.columnId === "*"
      ? "规范化所有列换行符"
      : `规范化列${this.columnId}换行符`;
    this.detail = this.columnId === "*"
      ? "将所有 \\r\\n 和 \\r 统一为 \\n"
      : `将列${this.columnId}的 \\r\\n 和 \\r 统一为 \\n`;
  }

  /**
   * 执行换行符规范化
   *
   * 算法：
   *   1. 保存原始表引用（用于 undo）
   *   2. 深拷贝原表
   *   3. 解析目标列
   *   4. 遍历每一行：字符串值 → 先替换 \r\n 为 \n，再替换剩余 \r 为 \n
   *   5. 返回新表
   */
  execute(table: NormalizedTable): NormalizedTable {
    this._beforeTable = table;
    const result = this.cloneTable(table);
    const targetCols = this.resolveColumnIndices(result);

    for (const colIdx of targetCols) {
      for (let ri = 0; ri < result.rows.length; ri++) {
        const cell = result.rows[ri].cells[colIdx];
        if (cell === undefined) continue;

        if (typeof cell.value === "string") {
          // 先处理 \r\n（Windows风格），再处理单独的 \r（老Mac风格）
          cell.value = cell.value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        }
      }
    }

    return result;
  }

  /**
   * 撤销 NormalizeNewline
   *
   * 直接返回 execute 时保存的原始表引用（零拷贝）。
   */
  undo(_table: NormalizedTable): NormalizedTable {
    if (this._beforeTable) {
      return this._beforeTable;
    }
    return _table;
  }

  serialize(): SerializedOperation {
    return {
      type: this.type,
      params: { columnId: this.columnId },
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
        `NormalizeNewlineOp: 列索引 "${this.columnId}" 无效（共 ${table.columns.length} 列）`,
      );
    }
    return [idx];
  }
}