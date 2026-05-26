/**
 * CollapseEngine — 合并操作引擎
 *
 * 按某列分组，将其他列的值合并为单行。
 * 支持：
 *   - 按 key 列分组
 *   - 多列合并（用指定分隔符拼接）
 *   - 去重
 *   - 聚合计算（求和/平均/计数/最大/最小）
 */

import type { WorkbookData, Operation, OperationType, RowData } from "../types";
import type { OperationEngine } from "./baseEngine";

export interface CollapseParams {
  /** 按哪列分组（key 列索引） */
  groupColumnIndex: number;
  /** 合并哪些列（列索引数组） */
  targetColumnIndices: number[];
  /** 合并分隔符 */
  separator: string;
  /** 是否去重 */
  deduplicate: boolean;
  /** 排序模式 */
  sortMode: "original" | "alpha";
  /** 聚合配置（可选） */
  aggregate?: {
    /** 聚合列索引 */
    columnIndex: number;
    /** 聚合函数 */
    func: "sum" | "avg" | "count" | "max" | "min";
  };
}

export class CollapseEngine implements OperationEngine<CollapseParams> {
  readonly type = "collapse" as OperationType;

  execute(workbook: WorkbookData, operation: Operation<CollapseParams>): WorkbookData {
    const { groupColumnIndex, targetColumnIndices, separator, deduplicate, sortMode, aggregate } = operation.params;
    const sheet = workbook.sheets[workbook.activeSheetIndex];
    if (!sheet || sheet.rows.length === 0) return workbook;

    // 按 groupColumn 分组
    const groups = new Map<string, RowData[]>();
    for (const row of sheet.rows) {
      const key = String(row[groupColumnIndex]?.value ?? "");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }

    const newRows: RowData[] = [];
    const sortedKeys = [...groups.keys()].sort(
      sortMode === "alpha" ? undefined : (a, b) => {
        // original order: find first occurrence
        const aIdx = sheet.rows.findIndex(r => String(r[groupColumnIndex]?.value ?? "") === a);
        const bIdx = sheet.rows.findIndex(r => String(r[groupColumnIndex]?.value ?? "") === b);
        return aIdx - bIdx;
      }
    );

    for (const key of sortedKeys) {
      const groupRows = groups.get(key)!;

      // 构建新行：先复制 key 列
      const newRow: RowData = { ...groupRows[0] };

      // 对每个目标列，合并值
      for (const colIdx of targetColumnIndices) {
        let values = groupRows.map(r => String(r[colIdx]?.value ?? ""));

        if (deduplicate) {
          values = [...new Set(values)];
        }

        const mergedValue = values.filter(v => v !== "").join(separator);
        newRow[colIdx] = { value: mergedValue };
      }

      // 聚合计算
      if (aggregate) {
        const { columnIndex, func } = aggregate;
        const nums = groupRows
          .map(r => Number(r[columnIndex]?.value))
          .filter(v => !isNaN(v));

        let result: number;
        switch (func) {
          case "sum": result = nums.reduce((a, b) => a + b, 0); break;
          case "avg": result = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0; break;
          case "count": result = nums.length; break;
          case "max": result = nums.length > 0 ? Math.max(...nums) : 0; break;
          case "min": result = nums.length > 0 ? Math.min(...nums) : 0; break;
        }
        newRow[columnIndex] = { value: result };
      }

      newRows.push(newRow);
    }

    return {
      ...workbook,
      sheets: workbook.sheets.map((s, i) =>
        i === workbook.activeSheetIndex
          ? { ...s, rows: newRows, meta: { ...s.meta, rowCount: newRows.length } }
          : s
      ),
    };
  }

  validate(operation: Operation<CollapseParams>): true | string {
    const { groupColumnIndex, targetColumnIndices, separator } = operation.params;
    if (groupColumnIndex == null || groupColumnIndex < 0) return "需要指定分组列索引";
    if (!targetColumnIndices || targetColumnIndices.length === 0) return "需要指定至少一个合并目标列";
    if (!separator) return "需要指定分隔符";
    return true;
  }
}