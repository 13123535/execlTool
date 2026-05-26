/**
 * Worker 消息分发入口
 *
 * 运行时动态生成 WebWorker 的入口脚本。
 * Vite 的 new Worker(new URL(...)) 只识别独立的 Worker 文件，
 * 所以此文件作为 Worker 的主入口，负责：
 *
 * 1. 接收主线程的 MainMessage
 * 2. 路由到对应处理函数
 * 3. 将执行结果作为 WorkerMessage 回传
 *
 * 此文件仅在 WebWorker 上下文中运行。
 */

import type { MainMessage, WorkerMessage } from "./protocol";
import type { NormalizedTable } from "./types";
import { deserializeOperation } from "./operations/registry";

// ═══════════════════════════════════════════════════════════════
// Worker 内部状态
// ═══════════════════════════════════════════════════════════════

/** 当前表格数据 */
let currentTable: NormalizedTable | null = null;

/** 执行历史（撤销栈） */
const undoStack: NormalizedTable[] = [];
/** 重做栈 */
const redoStack: NormalizedTable[] = [];

// ═══════════════════════════════════════════════════════════════
// 消息路由
// ═══════════════════════════════════════════════════════════════

self.onmessage = async (e: MessageEvent<MainMessage>) => {
  const msg = e.data;

  try {
    switch (msg.type) {
      case "LOAD_FILE":
        // Phase 1：文件加载由主线程的导入模块处理，
        // Worker 只负责存储表格引用
        break;

      case "EXECUTE_OP": {
        if (!currentTable) {
          postError("没有加载表格数据");
          break;
        }
        // 保存当前状态到撤销栈
        undoStack.push(structuredClone(currentTable));
        redoStack.length = 0;

        const op = deserializeOperation(msg.op);
        currentTable = op.execute(currentTable);

        const resp: WorkerMessage = {
          type: "OP_EXECUTED",
          table: currentTable,
        };
        self.postMessage(resp);
        break;
      }

      case "UNDO": {
        if (undoStack.length === 0) {
          postError("没有可撤销的操作");
          break;
        }
        redoStack.push(structuredClone(currentTable!));
        currentTable = undoStack.pop()!;

        const resp: WorkerMessage = {
          type: "OP_UNDONE",
          table: currentTable,
        };
        self.postMessage(resp);
        break;
      }

      case "REDO": {
        if (redoStack.length === 0) {
          postError("没有可重做的操作");
          break;
        }
        undoStack.push(structuredClone(currentTable!));
        currentTable = redoStack.pop()!;

        const resp: WorkerMessage = {
          type: "OP_REDONE",
          table: currentTable,
        };
        self.postMessage(resp);
        break;
      }

      case "EXPORT":
        // Phase 1：导出由主线程的导出模块处理
        break;

      case "PREVIEW": {
        if (!currentTable) break;
        const op = deserializeOperation(msg.op);
        const previewTable = op.execute(currentTable);
        const maxRows = msg.maxRows ?? 20;

        const resp: WorkerMessage = {
          type: "PREVIEW_RESULT",
          result: {
            previewRows: previewTable.rows.slice(0, maxRows),
            beforeRowCount: currentTable.rows.length,
            afterRowCount: previewTable.rows.length,
            rowCountChange: `${currentTable.rows.length} → ${previewTable.rows.length}`,
          },
        };
        self.postMessage(resp);
        break;
      }

      case "CALC_PREVIEW": {
        if (!currentTable) break;
        const op = deserializeOperation(msg.op);
        const previewTable = op.execute(currentTable);
        const resp: WorkerMessage = {
          type: "CALC_PREVIEW_RESULT",
          beforeRowCount: currentTable.rows.length,
          afterRowCount: previewTable.rows.length,
          rowCountChange: `${currentTable.rows.length} → ${previewTable.rows.length}`,
        };
        self.postMessage(resp);
        break;
      }

      default:
        postError(`未知消息类型: ${(msg as MainMessage).type}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    postError(message, stack);
  }
};

// ═══════════════════════════════════════════════════════════════
// 辅助函数
// ═══════════════════════════════════════════════════════════════

/**
 * 主动加载表格（由主线程的 LOAD_TABLE 触发）
 *
 * 主线程完成导入后，通过此函数将 NormalizedTable 送入 Worker。
 */
export function loadTable(table: NormalizedTable): void {
  currentTable = structuredClone(table);
  undoStack.length = 0;
  redoStack.length = 0;
}

/** 发送错误消息到主线程 */
function postError(message: string, stack?: string): void {
  const resp: WorkerMessage = { type: "ERROR", message, stack };
  self.postMessage(resp);
}