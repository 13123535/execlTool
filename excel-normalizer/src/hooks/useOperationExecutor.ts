/**
 * 操作执行器 Hook — 方案C：基于 diff 链
 *
 * 执行流程：
 *   execute(type, params)
 *     → 1) 构建当前 HTMLTable snapshot（JSON 序列化）
 *     → 2) 在主线程直接执行 Operation（同步/微任务）
 *     → 3) compareTables(old, new) → 生成 PatchDiff + reverseDiff
 *     → 4) tableStore.updateCells(diffs) 或 updateTable(columns, diffs)
 *     → 5) historyStore.push({ diffs, reverseDiffs, label, detail, timestamp })
 *
 *   undo()
 *     → historyStore.popUndo() → reverseDiffs
 *     → tableStore.updateCells(reverseDiffs)
 *
 *   redo()
 *     → historyStore.popRedo() → diffs
 *     → tableStore.updateCells(diffs)
 *
 * 优势：
 *   - 不再持有 Operation 实例引用（零内存泄漏风险）
 *   - 全部 JSON 可序列化 → Worker 迁移时无需改动 history
 *   - undo/redo 只做 diff 应用，性能更好
 */

import { useCallback } from "react";
import { useTableStore } from "../stores/tableStore";
import { useHistoryStore } from "../stores/historyStore";
import { deserializeOperation } from "../engine/operations/registry";
import { compareTables } from "../engine/diff";
import type { NormalizedTable } from "../engine";

/** 自动导入所有操作类（触发注册） */
import "../engine/operations/index";

/**
 * 将 Operation 产出的 NormalizedTable 与旧表比较，
 * 根据列数是否变化选择 updateCells 或 updateTable。
 */
function applyDiffAndLog(
  oldTable: NormalizedTable,
  newTable: NormalizedTable,
  opLabel: string,
  opDetail: string,
) {
  const { diffs, reverseDiffs, stats } = compareTables(oldTable, newTable);

  // 列结构变化（插入/删除列）→ 需要整表重建
  if (stats.beforeColCount !== stats.afterColCount) {
    useTableStore.getState().updateTable(newTable.columns, diffs);
  } else {
    useTableStore.getState().updateCells(diffs);
  }

  // 记录历史
  useHistoryStore.getState().push({
    diffs,
    reverseDiffs,
    label: opLabel,
    detail: `${opDetail}（${stats.beforeRowCount}→${stats.afterRowCount} 行）`,
    timestamp: Date.now(),
  });
}

/**
 * 操作执行器 Hook
 *
 * @returns { execute, undo, redo } 操作执行函数集合
 */
export function useOperationExecutor() {
  const table = useTableStore((s) => s.table);

  /**
   * 执行操作
   * 
   * 注意：当前阶段在主线程同步执行（阻塞 UI），
   * 后续方案C第5阶段将切到 Worker 异步执行。
   */
  const execute = useCallback(
    async (type: string, params: Record<string, unknown>) => {
      if (!table) {
        throw new Error("没有加载数据");
      }

      // 1) 通过注册表反序列化为 Operation 实例
      const serializedOp = { type, params };
      const op = deserializeOperation(serializedOp);

      // 2) 拍摄操作前的快照
      const oldSnapshot = JSON.parse(JSON.stringify(table)) as NormalizedTable;

      // 3) 执行操作（在主线程）
      const newTable = op.execute(JSON.parse(JSON.stringify(oldSnapshot)));

      // 4) 比较 diff 并更新状态
      applyDiffAndLog(oldSnapshot, newTable, op.label, op.detail);
    },
    [table],
  );

  /**
   * 撤销：应用 reverseDiffs
   */
  const undo = useCallback(async () => {
    const historyState = useHistoryStore.getState();
    if (!historyState.canUndo) return;

    const item = historyState.popUndo();
    if (!item) return;

    // 发送 reverseDiffs 到 store
    useTableStore.getState().updateCells(item.reverseDiffs);
  }, []);

  /**
   * 重做：应用 diffs
   */
  const redo = useCallback(async () => {
    const historyState = useHistoryStore.getState();
    if (!historyState.canRedo) return;

    const item = historyState.popRedo();
    if (!item) return;

    // 发送 diffs 到 store
    useTableStore.getState().updateCells(item.diffs);
  }, []);

  return { execute, undo, redo };
}