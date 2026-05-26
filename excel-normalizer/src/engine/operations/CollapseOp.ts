/**
 * CollapseOp — 按列合并相邻行
 *
 * 将指定列中连续相同值的行合并为一个单元格区域。
 * 是 FillDownOp 的逆操作。
 *
 * 示例：
 *   A1=北京, A2=北京, A3=北京, A4=上海, A5=上海
 *   → A1=北京, A2=空, A3=空, A4=上海, A5=空
 *
 * 参数：
 *   - columnId: 按哪一列合并（必填）
 *   - separator: 合并其他列时使用的分隔符（默认 "、"）
 *   - skipVirtual: 是否跳过虚拟行（默认 true）
 *
 * undo 语义：
 *   恢复到 order=[0,1,2,3,4,...] 的原始排序。
 *   利用 execute 中的 _originalRows 快照执行精确回滚。
 */

import { BaseOperation } from "./Operation";
import type {
  NormalizedTable,
  SerializedOperation,
  Row,
} from "../types";

/** Collapse 操作参数 */
interface CollapseParams {
  columnId: string;
  separator?: string;
  skipVirtual?: boolean;
}

export class CollapseOp extends BaseOperation {
  readonly type = "collapse";
  readonly label: string;
  readonly detail: string;

  private columnId: string;
  private separator: string;
  private skipVirtual: boolean;
  private _originalRows: Row[] | null = null;

  constructor(params: Record<string, unknown>) {
    super();
    const p = params as unknown as CollapseParams;
    this.columnId = p.columnId;
    this.separator = p.separator ?? "、";
    this.skipVirtual = p.skipVirtual ?? true;
    this.label = `按列${this.columnId}合并`;
    this.detail = `合并相邻相同值的行（分隔符: "${this.separator}"）`;
  }

  /**
   * 执行 Collapse
   *
   * 算法（单列）：
   *   1. 深拷贝原表
   *   2. 按 colId 分组：连续相同值的行归为一组
   *   3. 每组保留第一行（完整），其余行：
   *      - colId 列 → 置空（合并单元格效果）
   *      - 其他列 → 拼接当前行值（非空值用 separator 连接）
   *   4. 返回新表（行数不变，但某些单元格被清空/拼接）
   */
  execute(table: NormalizedTable): NormalizedTable {
    const result = this.cloneTable(table);

    const colIdx = this.resolveColumnIndex(result);

    // 保存原始行用于 undo
    this._originalRows = structuredClone(result.rows);

    if (result.rows.length === 0) return result;

    // 分组遍历
    let groupStart = 0;
    let groupValue = getCellValue(result.rows[0]!, colIdx);

    for (let ri = 1; ri <= result.rows.length; ri++) {
      const currentRow = ri < result.rows.length ? result.rows[ri] : null;
      const currentVal = currentRow
        ? getCellValue(currentRow, colIdx)
        : null;

      // 值变了（或到末尾）→ 合并当前组
      if (currentVal !== groupValue || ri === result.rows.length) {
        const groupEnd = ri; // 当前组的结束位置（不含）

        if (groupEnd - groupStart > 1) {
          // 组内超过 1 行，执行合并
          this.collapseGroup(result, colIdx, groupStart, groupEnd);
        }

        // 开始下一组
        if (currentRow) {
          groupStart = ri;
          groupValue = currentVal;
        }
      }
    }

    return result;
  }

  /**
   * 撤销 Collapse
   *
   * 从 _originalRows 快照恢复原始行数据。
   */
  undo(table: NormalizedTable): NormalizedTable {
    if (!this._originalRows) {
      return this.cloneTable(table);
    }

    const result = this.cloneTable(table);
    result.rows = structuredClone(this._originalRows);
    return result;
  }

  serialize(): SerializedOperation {
    return {
      type: this.type,
      params: {
        columnId: this.columnId,
        separator: this.separator,
        skipVirtual: this.skipVirtual,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // 私有方法
  // ═══════════════════════════════════════════════════════════════

  private resolveColumnIndex(table: NormalizedTable): number {
    const idx = parseInt(this.columnId, 10);
    if (isNaN(idx) || idx < 0 || idx >= table.columns.length) {
      throw new Error(
        `CollapseOp: 列索引 "${this.columnId}" 无效（共 ${table.columns.length} 列）`,
      );
    }
    return idx;
  }

  /**
   * 合并一组相邻行
   *
   * @param table - 表格（会被原地修改）
   * @param colIdx - 主键列索引
   * @param start - 组起始行（包含）
   * @param end - 组结束行（不含）
   */
  private collapseGroup(
    table: NormalizedTable,
    colIdx: number,
    start: number,
    end: number,
  ): void {
    const keeper = table.rows[start]; // 保留第一行

    for (let ri = start + 1; ri < end; ri++) {
      const row = table.rows[ri];

      // 跳过虚拟行
      if (this.skipVirtual && row.isVirtual) continue;

      // 对每一列：如果是主键列 → 清空；否则 → 拼接
      for (let ci = 0; ci < table.columns.length; ci++) {
        const currentCell = row.cells[ci];
        const keeperCell = keeper.cells[ci];

        if (currentCell === undefined || keeperCell === undefined) continue;

        if (ci === colIdx) {
          // 主键列：清空
          currentCell.value = null;
        } else {
          // 其他列：拼接
          const currentVal = currentCell.value;
          if (currentVal !== null && currentVal !== "") {
            const keeperStr = keeperCell.value != null ? String(keeperCell.value) : "";
            const currentStr = String(currentVal);

            if (keeperStr === "") {
              keeperCell.value = currentVal;
            } else {
              keeperCell.value = keeperStr + this.separator + currentStr;
            }
          }
        }
      }
    }
  }
}

/**
 * 安全获取单元格值（处理 undefined）
 */
function getCellValue(row: Row, colIdx: number): string | number | null {
  const cell = row.cells[colIdx];
  return cell ? cell.value : null;
}