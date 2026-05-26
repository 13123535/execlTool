/**
 * CSV 导入器
 *
 * 使用 papaparse 解析 CSV 文本，直接构建 NormalizedTable。
 */

import Papa from "papaparse";
import type { CellValue, ImportOptions } from "../types";
import type { NormalizedTable, Column, Row, Cell } from "../engine";

/**
 * 解析 CSV 字符串，直接返回 NormalizedTable
 */
export function parseCSV(
  csvText: string,
  fileName: string,
  options: ImportOptions
): NormalizedTable {
  const result = Papa.parse<string[]>(csvText, {
    delimiter: options.delimiter || ",",
    skipEmptyLines: true,
  });

  if (result.errors.length > 0) {
    const criticalError = result.errors.find((e) => e.type === "FieldMismatch");
    if (criticalError) {
      console.warn("[CSV] parse warnings:", result.errors);
    }
  }

  const data = result.data;
  const sheetName = fileName.replace(/\.[^.]+$/, "");

  if (data.length === 0) {
    return {
      columns: [],
      rows: [],
      originalFileName: fileName,
      sheetName,
    };
  }

  const hasHeader = options.hasHeader ?? true;
  const headerRowCount = options.headerRowCount ?? 1;

  let columns: Column[];
  let dataRows: string[][];

  if (hasHeader) {
    // 多行表头
    const headerRows = data.slice(0, headerRowCount);
    const maxCols = Math.max(...headerRows.map((r) => r.length));
    columns = Array.from({ length: maxCols }, (_, ci) => {
      const lines: string[] = headerRows.map((r) => (r[ci] ?? "").trim());
      const parts = lines.filter(Boolean);
      return {
        id: String(ci),
        name: parts.join(" → ") || `列 ${ci + 1}`,
        dtype: "text" as const,
        isKey: false,
        headerLines: headerRowCount > 1 ? lines : undefined,
      };
    });
    dataRows = data.slice(headerRowCount);
  } else {
    const maxCols = Math.max(...data.map((r) => r.length));
    columns = Array.from({ length: maxCols }, (_, ci) => ({
      id: String(ci),
      name: `列 ${ci + 1}`,
      dtype: "text" as const,
      isKey: false,
    }));
    dataRows = data;
  }

  // 列数取所有行的最大值
  const maxDataCols =
    dataRows.length > 0 ? Math.max(...dataRows.map((r) => r.length)) : 0;
  const colCount = Math.max(columns.length, maxDataCols);

  // 补齐 columns 长度
  while (columns.length < colCount) {
    columns.push({
      id: String(columns.length),
      name: `列 ${columns.length + 1}`,
      dtype: "text",
      isKey: false,
    });
  }

  // 构建行数据
  const rows: Row[] = dataRows.map((rawRow, ri) => {
    const cells: Cell[] = [];
    for (let ci = 0; ci < colCount; ci++) {
      const rawValue = rawRow[ci] ?? "";
      cells.push({
        value: coerceCellValue(tryParseValue(rawValue)),
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
 * 将字符串值尝试解析为 number / boolean，否则返回原字符串或 null
 */
function tryParseValue(value: string): CellValue {
  if (value === "" || value === null || value === undefined) return null;

  // boolean
  if (value.toLowerCase() === "true") return true;
  if (value.toLowerCase() === "false") return false;

  // number
  const num = Number(value);
  if (!Number.isNaN(num) && value.trim() !== "") {
    return num;
  }

  return value;
}

/** 将 CellValue 转为 Cell 所需的 string | number | null */
function coerceCellValue(v: CellValue): string | number | null {
  if (typeof v === "string" || typeof v === "number") return v;
  if (typeof v === "boolean") return String(v);
  return null;
}
