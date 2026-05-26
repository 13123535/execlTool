/**
 * 表格状态管理 (Zustand)
 *
 * 管理当前加载的 NormalizedTable 及交互状态。
 *
 * 状态结构：
 *   - table: 当前表格数据（null = 未加载）
 *   - fileName: 原始文件名
 *   - isProcessing: 是否正在处理中
 *   - error: 错误信息
 */

import { create } from "zustand";
import type { NormalizedTable } from "../engine";

interface TableState {
  /** 当前表格数据 */
  table: NormalizedTable | null;
  /** 原始文件名 */
  fileName: string | null;
  /** 是否正在处理 */
  isProcessing: boolean;
  /** 错误信息 */
  error: string | null;

  // ═══════════════════════════════════════════════════════════
  // Actions
  // ═══════════════════════════════════════════════════════════

  /** 设置表格数据 */
  setTable: (table: NormalizedTable, fileName: string) => void;
  /** 替换表格数据（操作执行后） */
  updateTable: (table: NormalizedTable) => void;
  /** 设置处理状态 */
  setProcessing: (isProcessing: boolean) => void;
  /** 设置错误信息 */
  setError: (error: string | null) => void;
  /** 重置所有状态 */
  reset: () => void;
}

export const useTableStore = create<TableState>((set) => ({
  table: null,
  fileName: null,
  isProcessing: false,
  error: null,

  setTable: (table, fileName) =>
    set({
      table,
      fileName,
      isProcessing: false,
      error: null,
    }),

  updateTable: (table) => set({ table }),

  setProcessing: (isProcessing) => set({ isProcessing }),

  setError: (error) => set({ error, isProcessing: false }),

  reset: () =>
    set({
      table: null,
      fileName: null,
      isProcessing: false,
      error: null,
    }),
}));