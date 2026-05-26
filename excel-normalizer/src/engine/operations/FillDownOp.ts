/**
 * FillDownOp — 合并单元格展开（Fill Down）
 *
 * 导入 Excel 时，合并单元格区域只有左上角有值，其余为空。
 * 此操作将合并区域的值向下填充。
 *
 * 示例：
 *   A1=北京, A2=空, A3=空, A4=上海, A5=空
 *   → A1=北京, A2=北京, A3=北京, A4=上海, A5=上海
 *
 * 参数：
 *   - columnId: 要填充的列（必填）
 *   - keepOriginal: 是否保留原始行（true = 生成虚拟行，默认 false）
 */

import { BaseOperation } from "./Operation";
import type {
  NormalizedTable,
  SerializedOperation,
} from "../types";

/** FillDown 操作参数 */
interface FillDownParams {
  columnId: string;
  keepOriginal?: boolean;
}

export class FillDownOp extends BaseOperation {
  readonly type = "filldown";
  readonly label: string;
  readonly detail: string;

  private columnId: string;
  private keepOriginal: boolean;

  constructor(params: Record<string, unknown>) {
    super();
    const p = params as unknown as FillDownParams;
    this.columnId = p.columnId;
    this.keepOriginal = p.keepOriginal ?? false;
    this.label = `按列${this.columnId}填充`;
    this.detail = `合并单元格展开（列${this.columnId}）`;
  }

  /**
   * 执行 Fill Down
   *
   * 算法：
   *   1. 深拷贝原表
   *   2. 找到目标列的索引
   *   3. 遍历每一行：遇到非空值就记下来，遇到空值就用上次记的值填充
   *   4. 返回新表
   */
  execute(table: NormalizedTable): NormalizedTable {
    const result = this.cloneTable(table);
    const colIdx = parseInt(this.columnId, 10);

    if (isNaN(colIdx) || colIdx < 0 || colIdx >= result.columns.length) {
      throw new Error(`列索引 "${this.columnId}" 无效（共 ${result.columns.length} 列）`);
    }

    let lastValue: string | number | null = null;

    for (const row of result.rows) {
      const cell = row.cells[colIdx];
      if (cell === undefined) continue;

      if (cell.value !== null && cell.value !== "") {
        // 非空值：记录
        lastValue = cell.value;
      } else if (lastValue !== null) {
        // 空值且有上次记录：填充
        cell.value = lastValue;
        cell.isVirtual = true;
      }
    }

    return result;
  }

  /**
   * 撤销 Fill Down
   *
   * 将 isVirtual=true 的单元格设回 null。
   * 注意：这无法完全回到原始状态（无法区分"本来就是空"和"合并导致的空"），
   * 所以只有标记了 isVirtual 的单元格才被恢复。
   */
  undo(table: NormalizedTable): NormalizedTable {
    const result = this.cloneTable(table);
    const colIdx = parseInt(this.columnId, 10);

    for (const row of result.rows) {
      const cell = row.cells[colIdx];
      if (cell && cell.isVirtual) {
        cell.value = null;
        cell.isVirtual = false;
      }
    }

    return result;
  }

  serialize(): SerializedOperation {
    return {
      type: this.type,
      params: {
        columnId: this.columnId,
        keepOriginal: this.keepOriginal,
      },
    };
  }
}