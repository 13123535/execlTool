/**
 * 工作簿状态管理 (Zustand)
 *
 * 全局状态：
 *   - workbook: 当前工作簿数据
 *   - fileName: 当前文件名
 *   - selectedColumns: 用户选中的列索引
 *   - activeSheetIndex: 当前激活的工作表索引
 *   - isProcessing: 是否正在处理（导入/操作执行中）
 *   - error: 错误信息
 */

import { create } from "zustand";
import type {
  WorkbookData,
  SheetData,
} from "../types";

interface WorkbookState {
  // 数据
  workbook: WorkbookData | null;
  fileName: string | null;

  // 交互状态
  selectedColumns: number[];
  activeSheetIndex: number;
  isProcessing: boolean;
  error: string | null;

  // Actions
  setWorkbook: (workbook: WorkbookData, fileName: string) => void;
  setActiveSheet: (index: number) => void;
  setSelectedColumns: (columns: number[]) => void;
  setProcessing: (processing: boolean) => void;
  setError: (error: string | null) => void;
  updateSheet: (sheetIndex: number, sheet: SheetData) => void;
  reset: () => void;
}

export const useWorkbookStore = create<WorkbookState>((set) => ({
  workbook: null,
  fileName: null,
  selectedColumns: [],
  activeSheetIndex: 0,
  isProcessing: false,
  error: null,

  setWorkbook: (workbook, fileName) =>
    set({ workbook, fileName, activeSheetIndex: 0, selectedColumns: [], error: null }),

  setActiveSheet: (index) => set({ activeSheetIndex: index }),

  setSelectedColumns: (columns) => set({ selectedColumns: columns }),

  setProcessing: (processing) => set({ isProcessing: processing }),

  setError: (error) => set({ error }),

  updateSheet: (sheetIndex, sheet) =>
    set((state) => {
      if (!state.workbook) return state;
      const sheets = [...state.workbook.sheets];
      sheets[sheetIndex] = sheet;
      return {
        workbook: {
          ...state.workbook,
          sheets,
        },
      };
    }),

  reset: () =>
    set({
      workbook: null,
      fileName: null,
      selectedColumns: [],
      activeSheetIndex: 0,
      isProcessing: false,
      error: null,
    }),
}));