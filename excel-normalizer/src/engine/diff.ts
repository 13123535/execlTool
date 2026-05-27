/**
 * 表格 Diff 引擎
 *
 * 比较两个 NormalizedTable，生成 PatchDiff（单元格级差异）和反向 diff。
 * 用于 Worker 操作执行后，只传输变化的部分给主线程。
 *
 * 算法：
 *   逐行逐列比较 Cell.value，差异项生成 CellDiff。
 *   如果行数或列数变化，也生成对应的插入/删除 diff。
 */

import type { NormalizedTable, PatchDiff, CellDiff, OperationStats } from "./types";

/**
 * 比较两个表格，生成正向 diff 和反向 diff
 * @param oldTable 操作前的表格
 * @param newTable 操作后的表格
 * @returns { diffs, reverseDiffs, stats }
 */
export function compareTables(
  oldTable: NormalizedTable,
  newTable: NormalizedTable
): {
  diffs: PatchDiff;
  reverseDiffs: PatchDiff;
  stats: OperationStats;
} {
  const diffs: PatchDiff = [];
  const reverseDiffs: PatchDiff = [];

  const oldRowCount = oldTable.rows.length;
  const newRowCount = newTable.rows.length;
  const maxRows = Math.max(oldRowCount, newRowCount);

  const oldColCount = oldTable.columns.length;
  const newColCount = newTable.columns.length;
  const maxCols = Math.max(oldColCount, newColCount);

  for (let ri = 0; ri < maxRows; ri++) {
    for (let ci = 0; ci < maxCols; ci++) {
      const oldCell = oldTable.rows[ri]?.cells[ci];
      const newCell = newTable.rows[ri]?.cells[ci];

      const oldValue = oldCell?.value ?? null;
      const newValue = newCell?.value ?? null;

      // 跳过两个值都为 null/空的情形（性能和信号量优化）
      if (oldValue === newValue) continue;
      // NaN !== NaN，需要特殊处理
      if (
        typeof oldValue === "number" &&
        typeof newValue === "number" &&
        Number.isNaN(oldValue) &&
        Number.isNaN(newValue)
      ) {
        continue;
      }

      const diffEntry: CellDiff = {
        colIdx: ci,
        rowIdx: ri,
        oldValue,
        newValue,
      };

      diffs.push(diffEntry);
      reverseDiffs.push({
        colIdx: ci,
        rowIdx: ri,
        oldValue: newValue,
        newValue: oldValue,
      });
    }
  }

  const stats: OperationStats = {
    beforeRowCount: oldRowCount,
    afterRowCount: newRowCount,
    beforeColCount: oldColCount,
    afterColCount: newColCount,
  };

  return { diffs, reverseDiffs, stats };
}