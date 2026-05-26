/**
 * ColumnEngine — 列操作引擎
 *
 * 一次性实现所有列操作：
 *   - add: 添加列
 *   - delete: 删除列
 *   - rename: 重命名列
 *   - reorder: 重新排序列
 *   - split: 拆分为多列
 *   - concat: 合并为单列
 *   - cast: 类型转换
 */

import type { WorkbookData, Operation, OperationType } from "../types";
import type { OperationEngine } from "./baseEngine";

type ColumnAction =
  | { action: "add"; name: string; afterColumn?: number }
  | { action: "delete"; columnIndex: number }
  | { action: "rename"; columnIndex: number; newName: string }
  | { action: "reorder"; columnIndex: number; newIndex: number }
  | { action: "split"; columnIndex: number; separator: string; newNames: string[] }
  | { action: "concat"; columnIndices: number[]; separator: string; newName: string }
  | { action: "cast"; columnIndex: number; newType: "string" | "number" | "boolean" };

export interface ColumnParams {
  action: ColumnAction;
}

export class ColumnEngine implements OperationEngine<ColumnParams> {
  readonly type = "column" as OperationType;

  execute(workbook: WorkbookData, operation: Operation<ColumnParams>): WorkbookData {
    const { action } = operation.params;
    const sheet = workbook.sheets[workbook.activeSheetIndex];
    if (!sheet) return workbook;

    const headers = { ...sheet.headers };
    const rows = sheet.rows.map(r => ({ ...r }));
    let colCount = sheet.meta.colCount;

    switch (action.action) {
      case "add": {
        const afterIdx = action.afterColumn ?? colCount - 1;
        const insertIdx = afterIdx + 1;
        // 更新所有行
        for (const row of rows) {
          const entries = Object.entries(row).sort(([a], [b]) => Number(a) - Number(b));
          for (const [k] of entries) {
            const ci = Number(k);
            if (ci >= insertIdx) {
              row[ci + 1] = row[ci];
            }
          }
          row[insertIdx] = { value: null };
        }
        // 更新表头
        const headerEntries = Object.entries(headers).sort(([a], [b]) => Number(a) - Number(b));
        for (const [k, v] of headerEntries) {
          const ci = Number(k);
          if (ci >= insertIdx) {
            headers[ci + 1] = v;
          }
        }
        headers[insertIdx] = action.name;
        colCount++;
        break;
      }

      case "delete": {
        const delIdx = action.columnIndex;
        for (const row of rows) {
          delete row[delIdx];
          // 左移
          const entries = Object.entries(row).sort(([a], [b]) => Number(a) - Number(b));
          for (const [k, v] of entries) {
            const ci = Number(k);
            if (ci > delIdx) {
              row[ci - 1] = v;
              delete row[ci];
            }
          }
        }
        delete headers[delIdx];
        const headerEntries = Object.entries(headers).sort(([a], [b]) => Number(a) - Number(b));
        for (const [k, v] of headerEntries) {
          const ci = Number(k);
          if (ci > delIdx) {
            headers[ci - 1] = v;
          }
        }
        delete headers[colCount - 1];
        colCount--;
        break;
      }

      case "rename": {
        headers[action.columnIndex] = action.newName;
        break;
      }

      case "reorder": {
        const { columnIndex, newIndex } = action;
        for (const row of rows) {
          const temp = row[columnIndex];
          if (columnIndex < newIndex) {
            for (let ci = columnIndex; ci < newIndex; ci++) {
              row[ci] = row[ci + 1];
            }
          } else {
            for (let ci = columnIndex; ci > newIndex; ci--) {
              row[ci] = row[ci - 1];
            }
          }
          row[newIndex] = temp;
        }
        const tempHeader = headers[columnIndex];
        if (columnIndex < newIndex) {
          for (let ci = columnIndex; ci < newIndex; ci++) {
            headers[ci] = headers[ci + 1];
          }
        } else {
          for (let ci = columnIndex; ci > newIndex; ci--) {
            headers[ci] = headers[ci - 1];
          }
        }
        headers[newIndex] = tempHeader;
        break;
      }

      case "split": {
        const { columnIndex, separator, newNames } = action;
        const newCols = newNames.length;
        for (const row of rows) {
          const value = String(row[columnIndex]?.value ?? "");
          const parts = value.split(separator);
          for (let ni = 0; ni < newCols; ni++) {
            row[columnIndex + ni + 1] = { value: parts[ni] ?? null };
          }
        }
        // Shift headers and existing data right
        const entries = Object.entries(headers).sort(([a], [b]) => Number(a) - Number(b));
        for (const [k, v] of entries) {
          const ci = Number(k);
          if (ci > columnIndex) {
            headers[ci + newCols] = v;
            delete headers[ci];
          }
        }
        for (let ni = 0; ni < newCols; ni++) {
          headers[columnIndex + 1 + ni] = newNames[ni] ?? `col_${columnIndex + 1 + ni}`;
        }
        colCount += newCols;
        break;
      }

      case "concat": {
        const { columnIndices, separator: concatSep, newName } = action;
        const sortedIndices = [...columnIndices].sort((a, b) => a - b);
        for (const row of rows) {
          const parts = sortedIndices.map(ci => String(row[ci]?.value ?? ""));
          row[sortedIndices[0]] = { value: parts.join(concatSep) };
          // 删除其他列
          for (let i = sortedIndices.length - 1; i > 0; i--) {
            delete row[sortedIndices[i]];
          }
        }
        headers[sortedIndices[0]] = newName;
        // 左移补位
        for (let ci = sortedIndices[0] + 1; ci < colCount; ci++) {
          if (!headers[ci] && headers[ci + 1] !== undefined) {
            headers[ci] = headers[ci + 1];
            delete headers[ci + 1];
          }
        }
        colCount -= (sortedIndices.length - 1);
        break;
      }

      case "cast": {
        const { columnIndex, newType } = action;
        for (const row of rows) {
          const cell = row[columnIndex];
          if (!cell) continue;
          switch (newType) {
            case "number": {
              const n = Number(cell.value);
              cell.value = isNaN(n) ? null : n;
              break;
            }
            case "boolean": {
              const v = String(cell.value).toLowerCase();
              cell.value = v === "true" || v === "1" || v === "yes";
              break;
            }
            case "string":
            default:
              cell.value = String(cell.value);
              break;
          }
        }
        break;
      }
    }

    return {
      ...workbook,
      sheets: workbook.sheets.map((s, i) =>
        i === workbook.activeSheetIndex
          ? { ...s, headers, rows, meta: { ...s.meta, colCount } }
          : s
      ),
    };
  }

  validate(operation: Operation<ColumnParams>): true | string {
    if (!operation.params.action) return "需要指定列操作动作";
    return true;
  }
}