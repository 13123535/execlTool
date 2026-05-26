/**
 * 操作执行器 Hook
 *
 * MVP 阶段在主线程直接执行操作，不通过 Worker。
 * Phase 2 时会切换为 Worker 通信模式。
 */

import { useCallback } from "react";
import { useTableStore } from "../stores/tableStore";
import { useHistoryStore } from "../stores/historyStore";
import { deserializeOperation } from "../engine/operations/registry";
import type { NormalizedTable } from "../engine";

/** 自动导入所有操作类（触发注册） */
import "../engine/operations/index";

/**
 * 操作执行器 Hook
 *
 * @returns { execute, undo, redo } 操作执行函数集合
 */
export function useOperationExecutor() {
  const table = useTableStore((s) => s.table);
  const setTable = useTableStore((s) => s.setTable);

  /** 执行操作 */
  const execute = useCallback(
    async (type: string, params: Record<string, unknown>) => {
      if (!table) {
        throw new Error("没有加载数据");
      }

      // 通过注册表反序列化为 Operation 实例
      const serializedOp = { type, params };
      const op = deserializeOperation(serializedOp);

      // 执行操作（深拷贝传入，保证不可变性）
      const sourceTable: NormalizedTable = JSON.parse(JSON.stringify(table));
      const newTable = op.execute(sourceTable);

      // 更新状态（只替换表格数据，保留 fileName）
      useTableStore.getState().updateTable(newTable);

      // 记录操作历史
      useHistoryStore.getState().push({
        op: serializedOp,
        label: op.label,
        detail: op.detail,
        timestamp: Date.now(),
      });
    },
    [table, setTable],
  );

  /** 撤销 */
  const undo = useCallback(async () => {
    const state = useHistoryStore.getState();
    if (!state.canUndo) return;

    const item = state.popUndo();
    if (!item) return;

    const currentTable = useTableStore.getState().table;
    if (!currentTable) return;

    const op = deserializeOperation(item.op);
    const newTable = op.undo(JSON.parse(JSON.stringify(currentTable)));
    useTableStore.getState().updateTable(newTable);
  }, []);

  /** 重做 */
  const redo = useCallback(async () => {
    const state = useHistoryStore.getState();
    if (!state.canRedo) return;

    const item = state.popRedo();
    if (!item) return;

    const currentTable = useTableStore.getState().table;
    if (!currentTable) return;

    const op = deserializeOperation(item.op);
    const newTable = op.execute(JSON.parse(JSON.stringify(currentTable)));
    useTableStore.getState().updateTable(newTable);
  }, []);

  return { execute, undo, redo };
}