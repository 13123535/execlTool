/**
 * XLSX 导入器
 *
 * 使用 exceljs 解析 .xlsx/.xls 文件，直接构建 NormalizedTable。
 * 注意：exceljs 无法在 Web Worker 中直接运行（依赖 Node.js Buffer），
 * 因此此模块在主线程中使用。
 *
 * 支持多行表头（headerRowCount），通过 ImportOptions 传入。
 */

import ExcelJS from "exceljs";
import type { CellValue, ImportOptions } from "../types";
import type { NormalizedTable, Column, Row, Cell } from "../engine";

/**
 * 从 ArrayBuffer 解析 XLSX 文件，直接返回 NormalizedTable
 * @param buffer 文件内容的 ArrayBuffer
 * @param fileName 文件名（用于工作表默认名称）
 * @param options 导入选项（含 headerRowCount）
 */
export async function parseXLSX(
  buffer: ArrayBuffer,
  fileName: string,
  options?: ImportOptions
): Promise<NormalizedTable> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const headerRowCount = options?.headerRowCount ?? 1;

  // 取第一个 sheet
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return {
      columns: [],
      rows: [],
      originalFileName: fileName,
      sheetName: "Sheet1",
    };
  }

  const sheetName = worksheet.name || "Sheet1";
  const allRows: Array<Record<number, CellValue>> = [];

  // 先收集所有行数据，同时确定最大列数
  let maxColCount = 0;

  worksheet.eachRow({ includeEmpty: true }, (row) => {
    const rowCells: Record<number, CellValue> = {};
    let rowColCount = 0;

    row.eachCell({ includeEmpty: true }, (cell) => {
      const colIndex = (cell.col as unknown as number) - 1; // 0-based
      const cellValue = convertExcelCellValue(cell);

      rowCells[colIndex] = cellValue;
      rowColCount = Math.max(rowColCount, colIndex + 1);
    });

    allRows.push(rowCells);
    maxColCount = Math.max(maxColCount, rowColCount);
  });

  // —— 构建表头（支持多行表头）——
  const columns: Column[] = [];

  if (allRows.length > 0 && headerRowCount > 0) {
    const headerRows = allRows.slice(0, headerRowCount);

    // 收集所有表头行中出现的最大列索引
    let headerMaxCol = 0;
    for (const hr of headerRows) {
      for (const ciStr of Object.keys(hr)) {
        headerMaxCol = Math.max(headerMaxCol, Number(ciStr) + 1);
      }
    }
    const effectiveCols = Math.max(headerMaxCol, maxColCount);

    for (let ci = 0; ci < effectiveCols; ci++) {
      const lines: string[] = [];
      const parts: string[] = [];
      for (const hr of headerRows) {
        const text = hr[ci] != null ? String(hr[ci]).trim() : "";
        lines.push(text);
        if (text) parts.push(text);
      }
      columns.push({
        id: String(ci),
        name: parts.join(" → ") || `列 ${ci + 1}`,
        dtype: "text",
        isKey: false,
        headerLines: headerRowCount > 1 ? lines : undefined,
      });
    }
    maxColCount = effectiveCols;
  } else {
    // 无表头：生成默认列名
    for (let ci = 0; ci < maxColCount; ci++) {
      columns.push({
        id: String(ci),
        name: `列 ${ci + 1}`,
        dtype: "text",
        isKey: false,
      });
    }
  }

  // —— 数据行（从 headerRowCount 之后开始）——
  const dataRows = allRows.slice(headerRowCount);
  const rows: Row[] = dataRows.map((rowCells, ri) => {
    const cells: Cell[] = [];
    for (let ci = 0; ci < maxColCount; ci++) {
      const rawValue = rowCells[ci] ?? null;
      // 确保 Cell.value 是 string | number | null
      let value: string | number | null = null;
      if (typeof rawValue === "string" || typeof rawValue === "number") {
        value = rawValue;
      } else if (typeof rawValue === "boolean") {
        value = String(rawValue);
      }
      cells.push({
        value,
        isVirtual: false,
        sourceRef: null,
      });
    }
    return {
      id: ri,
      isVirtual: false,
      cells,
    };
  });

  return {
    columns,
    rows,
    originalFileName: fileName,
    sheetName,
  };
}

/**
 * 将 exceljs 的 CellValue 转换为内部可序列化值
 */
function convertExcelCellValue(cell: ExcelJS.Cell): CellValue {
  if (cell.type === ExcelJS.ValueType.Null || cell.type === ExcelJS.ValueType.Error) {
    return null;
  }

  if (cell.type === ExcelJS.ValueType.Number) {
    return cell.value as number;
  }

  if (cell.type === ExcelJS.ValueType.Boolean) {
    return cell.value as boolean;
  }

  if (cell.type === ExcelJS.ValueType.String || cell.type === ExcelJS.ValueType.RichText) {
    return cell.text;
  }

  if (cell.type === ExcelJS.ValueType.Date) {
    const date = cell.value as Date;
    return date.toISOString();
  }

  if (cell.type === ExcelJS.ValueType.Formula) {
    const formula = cell.value as { result?: CellValue };
    if (formula.result !== undefined && formula.result !== null) {
      return formula.result;
    }
    return cell.text || null;
  }

  return cell.text || null;
}