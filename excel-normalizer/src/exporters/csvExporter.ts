/**
 * CSV 导出器
 *
 * 将 NormalizedTable 直接转换为 CSV 字符串。
 * 使用 papaparse 的 unparse 功能。
 */

import Papa from "papaparse";
import type { NormalizedTable } from "../engine";

/** CSV 导出选项 */
export interface CsvExportOptions {
  /** 分隔符，默认逗号 */
  delimiter?: string;
  /** 是否包含表头，默认 true */
  includeHeader?: boolean;
}

/**
 * 将 NormalizedTable 导出为 CSV 字符串
 * @param table 规范化表格数据
 * @param options 导出选项
 * @returns CSV 文本字符串
 */
export function exportToCSV(
  table: NormalizedTable,
  options: CsvExportOptions
): string {
  if (table.rows.length === 0 && table.columns.length === 0) return "";

  const includeHeader = options.includeHeader ?? true;
  const delimiter = options.delimiter || ",";

  const rows: string[][] = [];

  // 表头
  if (includeHeader) {
    rows.push(table.columns.map((col) => col.name));
  }

  // 数据行
  for (const row of table.rows) {
    rows.push(
      row.cells.map((cell) =>
        cell.value != null ? String(cell.value) : ""
      )
    );
  }

  // 使用 papaparse 生成 CSV
  return Papa.unparse(rows, { delimiter });
}