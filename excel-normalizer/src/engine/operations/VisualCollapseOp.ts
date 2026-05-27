/**
 * VisualCollapseOp — 视觉合并单元格（FillDown 逆操作）
 *
 * 将指定列中**连续相同值**的行合并为一个视觉单元格区域。
 * 组内第一行保留全部值，其余行的 key 列置空（实现「合并单元格」显示效果）。
 * 非 key 列的值保持不变。是 FillDownOp 的逆操作。
 *
 * 示例 (key col="0")：
 *   col0   | col1
 *   广东   | 深圳
 *   广东   | 广州
 *   江苏   | 南京
 *   →
 *   广东   | 深圳
 *   (空)   | 广州     ← 视觉合并单元格：rowSpan=2, value=null
 *   江苏   | 南京
 *
 * @module VisualCollapseOp
 */

import { BaseOperation } from "./Operation";
import type {
  NormalizedTable,
  SerializedOperation,
  Row,
  CellValue,
} from "../types";

interface VisualCollapseParams {
  /** 需要视觉合并的列 */
  columnId: string;
  /** 是否跳过虚拟行（默认 true） */
  skipVirtual?: boolean;
}

export class VisualCollapseOp extends BaseOperation {
  readonly type = "visual_collapse";
  readonly label: string;
  readonly detail: string;

  private columnId: string;
  private skipVirtual: boolean;
  private _originalRows: Row[] | null = null;

  constructor(params: Record<string, unknown>) {
    super();
    const p = params as unknown as VisualCollapseParams;
    this.columnId = p.columnId;
    this.skipVirtual = p.skipVirtual ?? true;
    this.label = "视觉合并";
    this.detail = `视觉合并「${this.columnId}」列连续相同值（FillDown 逆操作）`;
  }

  // ═══════════════════════════════════════════════════════════
  // execute
  // ═══════════════════════════════════════════════════════════

  execute(table: NormalizedTable): NormalizedTable {
    const colIdx = this.resolveColIndex(table);
    const result = this.cloneTable(table);

    // 保存深拷贝用于 undo
    this._originalRows = result.rows.map((row) => ({
      ...row,
      cells: row.cells.map((cell) => ({ ...cell })),
    }));

    if (result.rows.length < 2) return result;

    let groupStart = 0;
    let prevKey = this.getCellValue(result.rows[0]!, colIdx);

    for (let i = 1; i <= result.rows.length; i++) {
      const currentKey =
        i < result.rows.length
          ? this.getCellValue(result.rows[i]!, colIdx)
          : null;

      // 值变化 或 到达末尾 → 结束当前组
      if (currentKey === null || currentKey !== prevKey) {
        const groupSize = i - groupStart;
        if (groupSize >= 2) {
          this._collapseRange(result, colIdx, groupStart, i);
        }

        // 开始下一组
        if (i < result.rows.length) {
          groupStart = i;
          prevKey = currentKey!;
        }
      }
    }

    return result;
  }

  // ═══════════════════════════════════════════════════════════
  // undo
  // ═══════════════════════════════════════════════════════════

  undo(table: NormalizedTable): NormalizedTable {
    if (!this._originalRows) return this.cloneTable(table);
    return { ...table, rows: this._originalRows };
  }

  // ═══════════════════════════════════════════════════════════
  // serialize
  // ═══════════════════════════════════════════════════════════

  serialize(): SerializedOperation {
    return {
      type: this.type,
      params: {
        columnId: this.columnId,
        skipVirtual: this.skipVirtual,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════
  // 私有方法
  // ═══════════════════════════════════════════════════════════

  private resolveColIndex(table: NormalizedTable): number {
    const byName = table.columns.findIndex((c) => c.name === this.columnId);
    if (byName !== -1) return byName;
    const idx = parseInt(this.columnId, 10);
    if (isNaN(idx) || idx < 0 || idx >= table.columns.length) {
      throw new Error(
        `VisualCollapseOp: 列 "${this.columnId}" 无效（共 ${table.columns.length} 列）`,
      );
    }
    return idx;
  }

  private getCellValue(row: Row, colIdx: number): CellValue {
    const cell = row.cells[colIdx];
    return cell ? cell.value : null;
  }

  /** 将 [start, end) 范围内的连续相同值行合并为一个视觉单元格 */
  private _collapseRange(
    table: NormalizedTable,
    colIdx: number,
    start: number,
    end: number,
  ): void {
    const groupSize = end - start;

    // 第一行设置 rowSpan
    table.rows[start]!.cells[colIdx]!.rowSpan = groupSize;

    // 其余行：置空值，rowSpan = 0
    for (let ri = start + 1; ri < end; ri++) {
      const row = table.rows[ri]!;
      if (this.skipVirtual && row.isVirtual) continue;
      const keyCell = row.cells[colIdx];
      if (keyCell) {
        keyCell.value = null;
        keyCell.rowSpan = 0;
      }
    }
  }
}
