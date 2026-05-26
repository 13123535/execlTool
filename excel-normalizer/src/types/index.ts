/**
 * excel-normalizer 核心类型定义
 *
 * 数据流：
 *   File → (Import) → NormalizedTable → (Operations) → NormalizedTable → (Export) → File
 *
 * 注意：主链路已迁移至 engine/types.ts 中的 NormalizedTable。
 * 本文件仅保留旧 Worker 协议和导入/导出配置类型。
 *
 * 单元格坐标约定：
 *   - 列号 colIndex: 0-based，对应 Excel 列 A → 0, B → 1, ...
 *   - 行号 rowIndex: 0-based，对应导入后的数据行序号
 */

import type { NormalizedTable } from "../engine";

// ─── 单元格 / 行 / 工作表 / 工作簿（旧格式，已废弃） ────────────────

/** 单个单元格的值类型 */
export type CellValue = string | number | boolean | null;

/** 单个单元格数据 */
export interface CellData {
  value: CellValue;
  /** 原始显示值（导入时保留，用于格式参考） */
  raw?: string;
}

/** 一行数据，列索引 → 单元格 */
export type RowData = Record<number, CellData>;

/** 工作表元信息 */
export interface SheetMeta {
  name: string;
  rowCount: number;
  colCount: number;
}

/** 一个工作表的数据（旧格式） */
export interface SheetData {
  meta: SheetMeta;
  headers: Record<number, string>;
  headerLines?: Record<number, string[]>;
  rows: RowData[];
}

/** 整个工作簿数据（旧格式，已废弃） */
export interface WorkbookData {
  sheets: SheetData[];
  activeSheetIndex: number;
}

// ─── 文件与导出 ───────────────────────────────────────────────────

/** 支持的导入格式 */
export type ImportFormat = "xlsx" | "csv";

/** 支持的导出格式 */
export type ExportFormat = "xlsx" | "csv";

/** 导入配置 */
export interface ImportOptions {
  format: ImportFormat;
  /** CSV 专用：分隔符，默认逗号 */
  delimiter?: string;
  /** CSV/XLSX：是否有表头行，默认 true */
  hasHeader?: boolean;
  /** CSV/XLSX：表头占用的行数（支持多行表头），默认 1 */
  headerRowCount?: number;
  /** 编码，默认 utf-8 */
  encoding?: string;
  /** XLSX 专用：要导入的 sheet 名（不传则选第一个） */
  sheetName?: string;
}

/** 导出配置 */
export interface ExportOptions {
  format: ExportFormat;
  /** CSV 专用：分隔符，默认逗号 */
  delimiter?: string;
  /** CSV 专用：是否包含表头，默认 true */
  includeHeader?: boolean;
}

// ─── 行列范围 ──────────────────────────────────────────────────────

/** 列范围（0-based，含头含尾） */
export interface ColumnRange {
  start: number;
  end: number;
}

/** 行范围（0-based，含头含尾） */
export interface RowRange {
  start: number;
  end: number;
}

// ─── 操作(Operation) 类型 ─────────────────────────────────────────

/** 可执行的操作类型枚举 */
export enum OperationType {
  Expand = "expand",
  Collapse = "collapse",
  Column = "column",
  Row = "row",
  Clean = "clean",
  Transform = "transform",
  Cluster = "cluster",
}

/** 操作参数基类 */
export interface BaseOperationParams {
  columnRange?: ColumnRange;
  rowRange?: RowRange;
}

/** 展开操作参数 */
export interface ExpandParams extends BaseOperationParams {
  columnIndices: number[];
}

/** 操作定义 */
export interface Operation<P = BaseOperationParams> {
  type: OperationType;
  label?: string;
  params: P;
}

// ─── Worker 通信协议 ───────────────────────────────────────────────

export enum WorkerMessageType {
  Import = "import",
  ImportComplete = "importComplete",
  ImportError = "importError",
  ExecuteOperation = "executeOperation",
  OperationComplete = "operationComplete",
  OperationError = "operationError",
}

export interface WorkerRequest {
  id: string;
  type: WorkerMessageType;
  payload: unknown;
}

export interface WorkerResponse {
  id: string;
  type: WorkerMessageType;
  payload: unknown;
  error?: string;
}

export interface ImportPayload {
  filePath: string;
  fileName?: string;
  options: ImportOptions;
}

export interface ImportCompletePayload {
  workbook: NormalizedTable;
  fileName: string;
}

export interface ExecuteOperationPayload {
  workbook: NormalizedTable;
  operation: Operation;
}

export interface OperationCompletePayload {
  workbook: NormalizedTable;
  operation: Operation;
}