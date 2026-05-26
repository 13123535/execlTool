/**
 * Operation 抽象接口
 *
 * 命令模式的核心接口。所有操作必须实现此接口。
 * - execute：执行操作，返回新表（纯函数，不修改入参）
 * - undo：撤销操作，恢复到执行前状态
 * - serialize：序列化为纯 JSON，跨 Worker 传输
 *
 * 注意：Operation 类实例不能直接通过 postMessage 传递，
 * 必须通过 serialize() 转为 SerializedOperation。
 */

import type {
  NormalizedTable,
  Operation,
  SerializedOperation,
} from "../types";

/**
 * 操作抽象类
 *
 * 所有具体操作（FillDownOp, ExplodeOp 等）继承此类。
 * 提供深拷贝工具方法和统一的接口签名。
 */
export abstract class BaseOperation implements Operation {
  /** 操作类型标识 */
  abstract readonly type: string;
  /** 界面显示文字 */
  abstract readonly label: string;
  /** 详细描述 */
  abstract readonly detail: string;

  /** 执行操作 */
  abstract execute(table: NormalizedTable): NormalizedTable;
  /** 撤销操作 */
  abstract undo(table: NormalizedTable): NormalizedTable;

  /** 序列化为纯 JSON */
  abstract serialize(): SerializedOperation;

  // ═══════════════════════════════════════════════════════════════
  // 工具方法：深拷贝 NormalizedTable
  // ═══════════════════════════════════════════════════════════════

  /**
   * 深拷贝表格数据
   *
   * 使用 structuredClone 进行深拷贝（比 JSON.parse(JSON.stringify()) 快）。
   * 支持 undefined 值，在 Worker 中可用。
   */
  protected cloneTable(table: NormalizedTable): NormalizedTable {
    return structuredClone(table);
  }
}