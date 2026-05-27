/**
 * XLSX 导出器
 *
 * 将 NormalizedTable 直接转换为 ExcelJS Workbook 并导出为 ArrayBuffer。
 */

import ExcelJS from "exceljs";
import type { NormalizedTable, CellValue } from "../engine";

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

  // 表头行（行 1）
  const headerValues: string[] = table.columns.map((col) => col.name);
  ws.addRow(headerValues);

  // 数据行（从行 2 开始）
  for (const row of table.rows) {
    const rowValues: CellValue[] = row.cells.map(
      (cell) => cell.value,
    );
    ws.addRow(rowValues);
  }

  // 检测 rowSpan 元数据并生成合并单元格
  // rowIndex = 数据行号（1-based，行 1 是表头）
  for (let rowIdx = 0; rowIdx < table.rows.length; rowIdx++) {
    const row = table.rows[rowIdx]!;
    const excelRow = rowIdx + 2; // 表头占行 1

    for (let colIdx = 0; colIdx < row.cells.length; colIdx++) {
      const cell = row.cells[colIdx]!;
      const rowSpan = cell.rowSpan;

      if (rowSpan && rowSpan > 1) {
        // mergeCells 参数是 1-based：topRow, leftCol, bottomRow, rightCol
        ws.mergeCells(
          excelRow, // topRow
          colIdx + 1, // leftCol
          excelRow + rowSpan - 1, // bottomRow
          colIdx + 1, // rightCol
        );
      }
    }
  }

  // 导出为 buffer
  const buffer = await xlsxWorkbook.xlsx.writeBuffer();
  return buffer;
}
