/**
 * Engine 模块总入口
 *
 * 导出核心类型、通信协议、操作接口、注册表和工具函数。
 */

export type {
  ColumnType,
  SemanticTag,
  Column,
  Cell,
  Row,
  NormalizedTable,
  TableInfo,
  Workspace,
  SerializedOperation,
  Operation,
  OperationRecord,
  TableStats,
  MultiValueDetection,
  MergeRange,
  ImportFormat,
  ExportFormat,
  ImportConfig,
  ExportConfig,
  PreviewResult,
  // 方案C 新增 Type
  CellValue,
  CellDiff,
  PatchDiff,
  OperationStats,
  ExecuteDiffResult,
  ImportProgress,
} from "./types";

export type {
  MainMessage,
  WorkerMessage,
  LoadFileMessage,
  ExecuteOpMessage,
  UndoMessage,
  RedoMessage,
  ExportMessage,
  PreviewMessage,
  CalcPreviewMessage,
  TableLoadedMessage,
  OpExecutedMessage,
  OpUndoneMessage,
  OpRedoneMessage,
  PreviewResultMessage,
  CalcPreviewResultMessage,
  ExportReadyMessage,
  ProgressMessage,
  ErrorMessage,
} from "./protocol";

export { compareTables } from "./diff";

export { BaseOperation } from "./operations/Operation";
export {
  registerOperation,
  deserializeOperation,
  getRegisteredTypes,
} from "./operations/registry";