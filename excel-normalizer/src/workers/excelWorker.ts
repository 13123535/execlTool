/**
 * excelWorker — Web Worker 入口
 *
 * 负责：
 *   1. 执行数据清洗操作（反序列化 → 执行 → diff → 返回 diff）
 *   2. CSV 文件导入（在 Worker 中解析，避免阻塞主线程）
 *
 * ⚠️ XLSX 导入无法在此 Worker 中执行（exceljs 依赖 Node.js Buffer），
 *   由主线程 xlsxImporter 处理后直接调 tableStore。
 *
 * 消息协议：
 *   遵循 src/types/index.ts 中的 WorkerRequest/WorkerResponse 结构。
 */

import { startWorker } from "./workerHandler";
import { deserializeOperation, compareTables } from "../engine";
import { WorkerMessageType } from "../types";
import type {
  ImportPayload,
  ExecuteOperationPayload,
} from "../types";
import type { NormalizedTable, ExecuteDiffResult } from "../engine";
import { parseCSV } from "../importers/csvImporter";

// ═══════════════════════════════════════════════════════════════
// 启动 Worker 消息循环
// ═══════════════════════════════════════════════════════════════

startWorker({
  // ── 导入 CSV 文件 ────────────────────────────────────────
  [WorkerMessageType.Import]: async (payload) => {
    const { data, fileName, options } = payload as ImportPayload;

    // Decoder for ArrayBuffer → string
    const buffer = data as ArrayBuffer;
    const decoder = new TextDecoder("utf-8");
    const csvText = decoder.decode(buffer);

    // 解析 CSV
    const table: NormalizedTable = parseCSV(
      csvText,
      fileName ?? "unknown.csv",
      options
    );

    return {
      type: WorkerMessageType.ImportComplete,
      payload: table,
    };
  },

  // ── 执行数据清洗操作 ─────────────────────────────────────
  [WorkerMessageType.ExecuteOperation]: async (payload) => {
    const { table, serializedOp } = payload as ExecuteOperationPayload;

    // 1. 深拷贝一份旧表（用于 diff 快照）
    const oldTable = cloneTable(table);

    // 2. 反序列化操作（操作参数已在 deserialize 时绑定到 Operation 实例）
    const op = deserializeOperation(serializedOp);
    if (!op) {
      return {
        type: WorkerMessageType.OperationError,
        payload: { message: `Unknown operation type: ${serializedOp.type}` },
      };
    }

    // 3. 执行操作（操作参数已内置于 op 实例，execute 只接受 table）
    const resultTable = op.execute(cloneTable(table));

    // 4. 生成 diff
    const { diffs, reverseDiffs, stats } = compareTables(oldTable, resultTable);

    const result: ExecuteDiffResult = {
      diffs,
      reverseDiffs,
      stats,
      columns: resultTable.columns,
    };

    return {
      type: WorkerMessageType.ExecuteDiff,
      payload: result,
    };
  },
});

// ═══════════════════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════════════════

/**
 * 深拷贝 NormalizedTable（用于操作前快照）
 *
 * 注意：在 Worker 线程中执行，深拷贝开销可控。
 * 大表格的操作本身是瓶颈，拷贝开销相对较小。
 */
function cloneTable(table: NormalizedTable): NormalizedTable {
  return {
    columns: table.columns.map((col) => ({ ...col })),
    rows: table.rows.map((row) => ({
      ...row,
      cells: row.cells.map((cell) => ({ ...cell })),
    })),
    originalFileName: table.originalFileName,
    sheetName: table.sheetName,
  };
}

// 确保 TypeScript 将本文件视为 module
export {};