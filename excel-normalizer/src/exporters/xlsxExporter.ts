/**
 * XLSX 导出器
 *
 * 将 NormalizedTable 直接转换为 ExcelJS Workbook 并导出为 ArrayBuffer。
 */

import ExcelJS from "exceljs";
import type { NormalizedTable } from "../engine";

/**
 * 将 NormalizedTable 导出为 XLSX ArrayBuffer
 * @param table 规范化表格数据
 * @returns XLSX 文件的 ArrayBuffer
 */
export async function exportToXLSX(
  table: NormalizedTable
): Promise<ArrayBuffer> {
  const xlsxWorkbook = new ExcelJS.Workbook();
  const ws = xlsxWorkbook.addWorksheet(table.sheetName || "Sheet1");

  // 表头行
  const headerValues: string[] = table.columns.map((col) => col.name);
  ws.addRow(headerValues);

  // 数据行
  for (const row of table.rows) {
    const rowValues: (string | number | null)[] = row.cells.map((cell) => cell.value);
    ws.addRow(rowValues);
  }

  // 导出为 buffer
  const buffer = await xlsxWorkbook.xlsx.writeBuffer();
  return buffer;
}