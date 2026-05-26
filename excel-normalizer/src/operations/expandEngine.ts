/**
 * 展开操作引擎
 *
 * 功能：将合并单元格的展开——对于指定列，如果某行的值为空(null/undefined/'')，
 * 则用该列上一行的非空值填充。
 *
 * 典型场景：Excel 中合并单元格导出后只有首行有值，后续行为空，
 * 需要将首行的值向下"展开"填充到所有空行。
 *
 * 示例（对第0列展开）：
 *   输入：        输出：
 *   A  | 1        A  | 1
 *     (空) | 2    A  | 2
 *     (空) | 3    A  | 3
 *   B  | 4        B  | 4
 *     (空) | 5    B  | 5
 */

import {
  WorkbookData,
  Operation,
  OperationType,
  ExpandParams,
} from "../types";
import type { OperationEngine } from "./baseEngine";

export class ExpandEngine implements OperationEngine<ExpandParams> {
  readonly type = OperationType.Expand;

  execute(workbook: WorkbookData, operation: Operation<ExpandParams>): WorkbookData {
    const { columnIndices } = operation.params;

    if (!columnIndices || columnIndices.length === 0) {
      return workbook; // 没有指定列，不做任何操作
    }

    const activeSheet = workbook.sheets[workbook.activeSheetIndex];
    if (!activeSheet) return workbook;

    // 对每一行，检查指定列，如果为空则用上一行的值填充
    for (let ri = 0; ri < activeSheet.rows.length; ri++) {
      const row = activeSheet.rows[ri];
      const prevRow = ri > 0 ? activeSheet.rows[ri - 1] : null;

      for (const ci of columnIndices) {
        const cell = row[ci];
        // 仅当单元格不存在或值为空时填充
        const value = cell?.value;
        if (value === null || value === undefined || value === "") {
          if (prevRow && prevRow[ci] !== undefined) {
            // 复制上一行同列的值
            row[ci] = { ...prevRow[ci] };
          }
        }
      }
    }

    return workbook;
  }

  validate(operation: Operation<ExpandParams>): true | string {
    const { columnIndices } = operation.params;
    if (!columnIndices || !Array.isArray(columnIndices)) {
      return "expand 操作需要 columnIndices 数组参数";
    }
    if (columnIndices.length === 0) {
      return "columnIndices 不能为空数组";
    }
    for (const idx of columnIndices) {
      if (!Number.isInteger(idx) || idx < 0) {
        return `columnIndices 中的索引必须是非负整数，收到: ${idx}`;
      }
    }
    return true;
  }
}