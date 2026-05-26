/**
 * 核心类型定义
 *
 * 数据模型：NormalizedTable
 * 操作模式：Command Pattern（Operation 接口）
 * 跨表预留：Workspace（Phase 2）
 *
 * 所有类型必须 JSON 可序列化（Worker postMessage 要求）。
 * 不允许函数、类实例、Map、Set 等不可序列化类型。
 */

// ═══════════════════════════════════════════════════════════════
// 列类型
// ═══════════════════════════════════════════════════════════════

/** 列的数据类型 */
export type ColumnType =
  | "text"
  | "integer"
  | "float"
  | "currency"
  | "percentage"
  | "date"
  | "time"
  | "datetime";

/** 语义标签（用于脱敏和校验） */
export type SemanticTag = "phone" | "email" | "idcard" | "bankcard";

/** 列定义 */
export interface Column {
  /** 唯一标识符（0-based 列索引的字符串形式，如 "0", "1"） */
  id: string;
  /** 列名（表头） */
  name: string;
  /** 数据类型 */
  dtype: ColumnType;
  /** 语义标签（可选） */
  semanticTag?: SemanticTag;
  /** 是否为主键列 */
  isKey: boolean;
  /**
   * 原始多行表头（可选）
   *
   * 当 headerRowCount > 1 时，保留每一行表头的原始值。
   * 例如 headerLines = ["人员", "姓名"] 表示第1行表头为"人员"、第2行为"姓名"。
   * 单行表头时为单元素数组，无表头时为 undefined。
   */
  headerLines?: string[];
}

// ═══════════════════════════════════════════════════════════════
// 单元格 / 行 / 表
// ═══════════════════════════════════════════════════════════════

/** 单个单元格数据 */
export interface Cell {
  /** 单元格值（null = 空） */
  value: string | number | null;
  /** 是否为展开生成的虚拟行（灰色标记） */
  isVirtual: boolean;
  /** 来源引用，如 "A3"（展开操作后标记来源） */
  sourceRef: string | null;
}

/** 一行数据 */
export interface Row {
  /** 行 ID（0-based 序号） */
  id: number;
  /** 是否为展开生成的虚拟行 */
  isVirtual: boolean;
  /** 单元格数组，索引对应 Column.id */
  cells: Cell[];
}

/** 规范化后的表格数据 */
export interface NormalizedTable {
  /** 列定义 */
  columns: Column[];
  /** 行数据 */
  rows: Row[];
  /** 原始文件名（不含路径） */
  originalFileName: string;
  /** 工作表名 */
  sheetName: string;
}

// ═══════════════════════════════════════════════════════════════
// 工作区（Phase 2 预留）
// ═══════════════════════════════════════════════════════════════

/** 表信息（用于标签页显示） */
export interface TableInfo {
  id: string;
  name: string;
  rowCount: number;
  colCount: number;
}

/** 工作区（Phase 1 只存单表，类型已到位） */
export interface Workspace {
  /** 所有表，key = 表 ID */
  tables: Record<string, NormalizedTable>;
  /** 当前激活的表 ID */
  activeTableId: string;
  /** 表信息列表 */
  tableInfos: TableInfo[];
}

// ═══════════════════════════════════════════════════════════════
// 操作（Command Pattern）
// ═══════════════════════════════════════════════════════════════

/** 序列化后的操作（通过 postMessage 传递） */
export interface SerializedOperation {
  /** 操作类型标识 */
  type: string;
  /** 操作参数（纯 JSON） */
  params: Record<string, unknown>;
}

/** 操作接口（WebWorker 中实现） */
export interface Operation {
  /** 操作类型标识 */
  readonly type: string;
  /** 界面显示文字，如 "按列B展开" */
  readonly label: string;
  /** 详细描述，如 "逗号分隔 → 15行→187行" */
  readonly detail: string;

  /** 执行操作，返回新表 */
  execute(table: NormalizedTable): NormalizedTable;
  /** 撤销操作，恢复到执行前状态 */
  undo(table: NormalizedTable): NormalizedTable;
  /** 序列化为可传输的纯 JSON 对象 */
  serialize(): SerializedOperation;
}

/** 操作记录（存储于 historyStore） */
export interface OperationRecord {
  /** 序列化后的操作 */
  op: SerializedOperation;
  /** 界面显示标签 */
  label: string;
  /** 详细描述 */
  detail: string;
  /** 执行时间戳 */
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════════
// 统计信息
// ═══════════════════════════════════════════════════════════════

/** 表格统计信息 */
export interface TableStats {
  /** 总行数 */
  rowCount: number;
  /** 总列数 */
  colCount: number;
  /** 虚拟行数 */
  virtualRowCount: number;
  /** 空值计数（按列） */
  nullCounts: Record<string, number>;
  /** 选中行数 */
  selectedRowCount: number;
  /** 选中列数 */
  selectedColCount: number;
}

// ═══════════════════════════════════════════════════════════════
// 智能检测结果
// ═══════════════════════════════════════════════════════════════

/** 多值列检测结果 */
export interface MultiValueDetection {
  /** 列 ID */
  columnId: string;
  /** 是否为多值列 */
  isMultiValue: boolean;
  /** 最可能的分隔符 */
  likelySeparator: string;
  /** 采样行数 */
  sampleCount: number;
}

/** 合并单元格范围 */
export interface MergeRange {
  /** 起始行（0-based） */
  startRow: number;
  /** 结束行（0-based） */
  endRow: number;
  /** 起始列（0-based） */
  startCol: number;
  /** 结束列（0-based） */
  endCol: number;
}

// ═══════════════════════════════════════════════════════════════
// 导入/导出相关
// ═══════════════════════════════════════════════════════════════

/** 支持的导入格式 */
export type ImportFormat = "xlsx" | "csv";

/** 支持的导出格式 */
export type ExportFormat = "xlsx" | "csv";

/** 导入配置 */
export interface ImportConfig {
  /** 文件路径（Tauri 环境）/ File 对象名（Web 环境） */
  fileName: string;
  /** 文件格式 */
  format: ImportFormat;
  /** CSV 专用：分隔符 */
  delimiter?: string;
  /** CSV 专用：是否有表头 */
  hasHeader?: boolean;
  /** 编码 */
  encoding?: string;
  /** 要导入的 sheet 名（xlsx 专用，不传则选第一个） */
  sheetName?: string;
}

/** 导出配置 */
export interface ExportConfig {
  /** 导出格式 */
  format: ExportFormat;
  /** CSV 专用：分隔符 */
  delimiter?: string;
  /** CSV 专用：是否包含表头 */
  includeHeader?: boolean;
  /** 密码保护（xlsx 专用） */
  password?: string;
  /** 清除文档元数据 */
  clearMetadata?: boolean;
}

/** 展开预览结果 */
export interface PreviewResult {
  /** 预览行（前 20 行） */
  previewRows: Row[];
  /** 操作前总行数 */
  beforeRowCount: number;
  /** 操作后总行数 */
  afterRowCount: number;
  /** 变化描述，如 "15 → 187" */
  rowCountChange: string;
}