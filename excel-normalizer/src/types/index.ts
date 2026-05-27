/**
 * excel-normalizer Worker 通信协议 & 配置类型
 *
 * 数据流：
 *   File → (Import) → NormalizedTable → (Operations) → NormalizedTable → (Export) → File
 *
 * 主数据模型见 engine/types.ts。
 *
 * 单元格坐标约定：
 *   - 列号 colIndex: 0-based，对应 Excel 列 A → 0, B → 1, ...
 *   - 行号 rowIndex: 0-based，对应数据行序号
 */

// ═══════════════════════════════════════════════════════════════
// 核心类型重导出（从 engine 层提升到顶层）
// ═══════════════════════════════════════════════════════════════

/** 单元格值类型（引擎层定义） */
export type { CellValue } from "../engine";

// ═══════════════════════════════════════════════════════════════
// 文件与导出配置
// ═══════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════
// Worker 通信协议
// ═══════════════════════════════════════════════════════════════

/** Worker 消息类型枚举 */
export enum WorkerMessageType {
  // 导入
  Import = "import",
  ImportProgress = "importProgress",  // Worker → 主线程：进度更新
  ImportComplete = "importComplete",
  ImportError = "importError",

  // 操作执行
  ExecuteOperation = "executeOperation",
  ExecuteDiff = "executeDiff",        // Worker → 主线程：返回 diff 结果
  OperationError = "operationError",
}

/** Worker 请求 */
export interface WorkerRequest {
  id: string;
  type: WorkerMessageType;
  payload: unknown;
}

/** Worker 响应 */
export interface WorkerResponse {
  id: string;
  type: WorkerMessageType;
  payload: unknown;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════
// 各消息 Payload 类型
// ═══════════════════════════════════════════════════════════════

/** 导入请求 payload */
export interface ImportPayload {
  /** 文件 buffer（Web）或文件路径（Tauri） */
  data: ArrayBuffer | string;
  /** 原始文件名 */
  fileName?: string;
  /** 导入选项 */
  options: ImportOptions;
}

/** 导入进度 payload（分片通知） */
export interface ImportProgressPayload {
  /** 当前阶段 */
  phase: "parsing" | "done" | "error";
  /** 已加载行数 */
  loadedRows: number;
  /** 预估总行数（未知时为 null） */
  estimatedTotal: number | null;
  /** 本次分片数据（parsing 阶段有效） */
  chunk?: {
    columns: { id: string; name: string }[];
    rows: Record<string, unknown>[][];
  };
  /** 错误信息（error 阶段有效） */
  error?: string;
}

/** 导入完成 payload */
export interface ImportCompletePayload {
  /** 文件名 */
  fileName: string;
  /** 总行数 */
  totalRowCount: number;
  /** 是否被截断（超大文件） */
  isTruncated: boolean;
}

/** 操作执行请求 payload */
export interface ExecuteOperationPayload {
  /** 当前表格数据 */
  table: import("../engine").NormalizedTable;
  /** 序列化后的操作 */
  serializedOp: { type: string; params: Record<string, unknown> };
}

/** 操作执行 diff 结果 payload */
export interface ExecuteDiffPayload {
  /** 单元格级差异 */
  diffs: import("../engine").PatchDiff;
  /** 行列统计 */
  stats: import("../engine").OperationStats;
  /** 反向 diff（用于 undo） */
  reverseDiffs: import("../engine").PatchDiff;
}

// ═══════════════════════════════════════════════════════════════
// 行列范围（UI 交互用）
// ═══════════════════════════════════════════════════════════════

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
