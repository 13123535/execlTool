/**
 * 导出模块入口
 */

export { exportToCSV } from "./csvExporter";
export type { CsvExportOptions } from "./csvExporter";
export { exportToXLSX } from "./xlsxExporter";

import type { NormalizedTable } from "../engine";
import { exportToCSV } from "./csvExporter";
import { exportToXLSX } from "./xlsxExporter";
import type { CsvExportOptions } from "./csvExporter";

/** 导出选项 */
export interface ExportOptions extends CsvExportOptions {
  /** 导出格式 */
  format: "xlsx" | "csv";
}

/**
 * 根据选项自动选择导出方式
 */
export async function exportFile(
  table: NormalizedTable,
  options: ExportOptions
): Promise<string | ArrayBuffer> {
  if (options.format === "csv") {
    return exportToCSV(table, options);
  } else {
    return exportToXLSX(table);
  }
}