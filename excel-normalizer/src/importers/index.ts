/**
 * 导入模块入口
 *
 * 统一导出导入相关功能
 */

export { parseCSV } from "./csvImporter";
export { parseXLSX } from "./xlsxImporter";

import type { NormalizedTable } from "../engine";
import type { ImportOptions } from "../types";
import { parseCSV } from "./csvImporter";
import { parseXLSX } from "./xlsxImporter";

/**
 * 根据选项自动选择导入方式
 * @param source CSV 文本 或 XLSX 的 ArrayBuffer
 * @param fileName 文件名（用于检测格式和默认表名）
 * @param options 导入选项
 */
export async function importFile(
  source: string | ArrayBuffer,
  fileName: string,
  options: ImportOptions
): Promise<NormalizedTable> {
  if (options.format === "csv") {
    return parseCSV(source as string, fileName, options);
  } else {
    return parseXLSX(source as ArrayBuffer, fileName, options);
  }
}