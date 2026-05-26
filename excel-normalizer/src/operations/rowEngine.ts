/**
 * RowEngine — 行操作引擎
 *
 * 支持：
 *   - filter: 按条件筛选行（包含/等于/正则/不等于）
 *   - sort: 按列排序
 *   - dedup: 按指定列去重
 *   - deleteEmpty: 删除空行
 *   - fill: 填充空白单元格
 */

import type { WorkbookData, Operation, OperationType, RowData } from "../types";
import type { OperationEngine } from "./baseEngine";

type FilterOp = "contains" | "equals" | "regex" | "notEquals";

type RowAction =
  | { action: "filter"; columnIndex: number; operator: FilterOp; value: string }
  | { action: "sort"; columnIndex: number; direction: "asc" | "desc" }
  | { action: "dedup"; columnIndices: number[]; keep: "first" | "last" }
  | { action: "deleteEmpty"; columns?: number[] }
  | { action: "fill"; columnIndex: number; method: "up" | "down" | "value"; fillValue?: string };

export interface RowParams {
  action: RowAction;
}

export class RowEngine implements OperationEngine<RowParams> {
  readonly type = "row" as OperationType;

  execute(workbook: WorkbookData, operation: Operation<RowParams>): WorkbookData {
    const { action } = operation.params;
    const sheet = workbook.sheets[workbook.activeSheetIndex];
    if (!sheet) return workbook;

    let rows = [...sheet.rows];

    switch (action.action) {
      case "filter": {
        const { columnIndex, operator, value } = action;
        rows = rows.filter(row => {
          const cellValue = String(row[columnIndex]?.value ?? "");
          switch (operator) {
            case "contains": return cellValue.includes(value);
            case "equals": return cellValue === value;
            case "regex": {
              try { return new RegExp(value).test(cellValue); }
              catch { return false; }
            }
            case "notEquals": return cellValue !== value;
            default: return true;
          }
        });
        break;
      }

      case "sort": {
        const { columnIndex, direction } = action;
        rows.sort((a, b) => {
          const va = a[columnIndex]?.value;
          const vb = b[columnIndex]?.value;
          if (va == null && vb == null) return 0;
          if (va == null) return 1;
          if (vb == null) return -1;

          // Try numeric sort first
          const na = Number(va);
          const nb = Number(vb);
          if (!isNaN(na) && !isNaN(nb)) {
            return direction === "asc" ? na - nb : nb - na;
          }

          // String sort
          const cmp = String(va).localeCompare(String(vb));
          return direction === "asc" ? cmp : -cmp;
        });
        break;
      }

      case "dedup": {
        const { columnIndices, keep } = action;
        const seen = new Set<string>();
        const deduped: RowData[] = [];

        const iterable = keep === "first" ? rows : [...rows].reverse();
        for (const row of iterable) {
          const key = columnIndices.map(ci => String(row[ci]?.value ?? "")).join("||");
          if (!seen.has(key)) {
            seen.add(key);
            deduped.push(row);
          }
        }
        rows = keep === "first" ? deduped : deduped.reverse();
        break;
      }

      case "deleteEmpty": {
        const { columns } = action;
        rows = rows.filter(row => {
          if (columns) {
            return columns.some(ci => {
              const v = row[ci]?.value;
              return v != null && v !== "";
            });
          }
          // 全部列为空则删除
          return Object.values(row).some(cell => cell?.value != null && cell.value !== "");
        });
        break;
      }

      case "fill": {
        const { columnIndex, method, fillValue } = action;
        let lastValue: string | number | boolean | null = null;
        for (let ri = 0; ri < rows.length; ri++) {
          const cell = rows[ri][columnIndex];
          const isEmpty = cell?.value == null || cell.value === "";

          if (isEmpty) {
            if (method === "up") {
              // 从下面找值
              for (let rj = ri + 1; rj < rows.length; rj++) {
                const nextCell = rows[rj][columnIndex];
                if (nextCell?.value != null && nextCell.value !== "") {
                  rows[ri][columnIndex] = { value: nextCell.value };
                  break;
                }
              }
            } else if (method === "down") {
              if (lastValue != null) {
                rows[ri][columnIndex] = { value: lastValue };
              }
            } else if (method === "value" && fillValue != null) {
              rows[ri][columnIndex] = { value: fillValue };
            }
          } else {
            lastValue = cell?.value ?? null;
          }
        }
        break;
      }
    }

    return {
      ...workbook,
      sheets: workbook.sheets.map((s, i) =>
        i === workbook.activeSheetIndex
          ? { ...s, rows, meta: { ...s.meta, rowCount: rows.length } }
          : s
      ),
    };
  }

  validate(operation: Operation<RowParams>): true | string {
    if (!operation.params.action) return "需要指定行操作动作";
    return true;
  }
}