/**
 * Worker 通信协议
 *
 * 定义主线程 ↔ Worker 之间所有消息类型。
 * 所有消息通过 postMessage 传递，必须是纯 JSON 可序列化。
 *
 * 使用方式：
 *   - 主线程：worker.postMessage(msg as MainMessage)
 *   - Worker：self.onmessage = (e: MessageEvent<MainMessage>) => { ... }
 *   - Worker 回复：postMessage(resp as WorkerMessage)
 */

import type {
  NormalizedTable,
  SerializedOperation,
  TableStats,
  PreviewResult,
  ImportConfig,
} from "./types";

// ═══════════════════════════════════════════════════════════════
// 主线程 → Worker
// ═══════════════════════════════════════════════════════════════

/** 加载文件 */
export interface LoadFileMessage {
  type: "LOAD_FILE";
  /** 文件二进制数据 */
  buffer: ArrayBuffer;
  /** 导入配置 */
  config: ImportConfig;
}

/** 执行操作 */
export interface ExecuteOpMessage {
  type: "EXECUTE_OP";
  /** 序列化后的操作 */
  op: SerializedOperation;
}

/** 撤销操作 */
export interface UndoMessage {
  type: "UNDO";
}

/** 重做操作 */
export interface RedoMessage {
  type: "REDO";
}

/** 导出请求 */
export interface ExportMessage {
  type: "EXPORT";
  /** 导出格式 */
  format: "xlsx" | "csv";
  /** 导出密码（xlsx） */
  password?: string;
  /** 清除元数据 */
  clearMetadata?: boolean;
}

/** 预览请求（展开/清洗等操作前预览效果） */
export interface PreviewMessage {
  type: "PREVIEW";
  /** 序列化后的操作 */
  op: SerializedOperation;
  /** 预览行数（默认 20） */
  maxRows?: number;
}

/** 计算变化预览（展开前预览行数变化，不做实际展开） */
export interface CalcPreviewMessage {
  type: "CALC_PREVIEW";
  /** 序列化后的操作 */
  op: SerializedOperation;
}

/** 主线程 → Worker 消息联合类型 */
export type MainMessage =
  | LoadFileMessage
  | ExecuteOpMessage
  | UndoMessage
  | RedoMessage
  | ExportMessage
  | PreviewMessage
  | CalcPreviewMessage;

// ═══════════════════════════════════════════════════════════════
// Worker → 主线程
// ═══════════════════════════════════════════════════════════════

/** 表格加载完成 */
export interface TableLoadedMessage {
  type: "TABLE_LOADED";
  /** 规范化后的表格 */
  table: NormalizedTable;
  /** 统计信息 */
  stats: TableStats;
}

/** 操作执行完成 */
export interface OpExecutedMessage {
  type: "OP_EXECUTED";
  /** 操作后的新表 */
  table: NormalizedTable;
  /** 操作统计（可选，用于统计栏更新） */
  stats?: TableStats;
}

/** 撤销完成 */
export interface OpUndoneMessage {
  type: "OP_UNDONE";
  /** 撤销后的表 */
  table: NormalizedTable;
  /** 统计信息 */
  stats?: TableStats;
}

/** 重做完成 */
export interface OpRedoneMessage {
  type: "OP_REDONE";
  /** 重做后的表 */
  table: NormalizedTable;
  /** 统计信息 */
  stats?: TableStats;
}

/** 预览结果 */
export interface PreviewResultMessage {
  type: "PREVIEW_RESULT";
  /** 预览结果 */
  result: PreviewResult;
}

/** 计算预览结果（仅行数变化） */
export interface CalcPreviewResultMessage {
  type: "CALC_PREVIEW_RESULT";
  /** 操作前总行数 */
  beforeRowCount: number;
  /** 操作后总行数 */
  afterRowCount: number;
  /** 变化描述，如 "15→187" */
  rowCountChange: string;
}

/** 导出数据准备完成 */
export interface ExportReadyMessage {
  type: "EXPORT_READY";
  /** 导出文件的二进制数据 */
  buffer: ArrayBuffer;
  /** 导出格式 */
  format: "xlsx" | "csv";
}

/** 进度通知 */
export interface ProgressMessage {
  type: "PROGRESS";
  /** 当前进度 */
  current: number;
  /** 总进度 */
  total: number;
  /** 描述文字 */
  label?: string;
}

/** 错误消息 */
export interface ErrorMessage {
  type: "ERROR";
  /** 错误描述 */
  message: string;
  /** 错误堆栈（可选） */
  stack?: string;
}

/** Worker → 主线程消息联合类型 */
export type WorkerMessage =
  | TableLoadedMessage
  | OpExecutedMessage
  | OpUndoneMessage
  | OpRedoneMessage
  | PreviewResultMessage
  | CalcPreviewResultMessage
  | ExportReadyMessage
  | ProgressMessage
  | ErrorMessage;