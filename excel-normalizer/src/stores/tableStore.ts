/**
 * 表格状态管理 (Zustand) — 方案C 重写
 *
 * 核心变动：
 *   - 不再存全量 NormalizedTable，改为 columns + rows 平铺
 *   - 新增分片追加 appendRows（流式导入用）
 *   - 新增批量 diff 更新 updateCells（操作 undo/redo 用）
 *   - 新增 getCell / getRowSlice 按需取数据（Grid 用）
 *
 * 向后兼容：
 *   - table / setTable / isProcessing / setProcessing（旧组件平滑过渡）
 *
 * 状态结构：
 *   - columns: Column[]
 *   - rows: Row[]
 *   - totalRowCount / loadedRowCount / isImporting / importProgress / isTruncated
 *   - fileName / error
 *   - table / isProcessing（@deprecated 兼容属性）
 */

import { create } from "zustand";
import type { Column, Row, NormalizedTable } from "../engine";
import type { PatchDiff } from "../engine";

// ═══════════════════════════════════════════════════════════════
// State & Actions
// ═══════════════════════════════════════════════════════════════

interface TableState {
  /** 列定义（表头） */
  columns: Column[];
  /** 行数据（流式加载时逐步增长，大文件完整存储） */
  rows: Row[];
  /** 预估总行数（导入完成后确定） */
  totalRowCount: number;
  /** 当前已加载行数 */
  loadedRowCount: number;
  /** 是否正在导入 */
  isImporting: boolean;
  /** 导入进度 0-100 */
  importProgress: number;
  /** 是否超限截断 */
  isTruncated: boolean;
  /** 原始文件名 */
  fileName: string | null;
  /** 错误信息 */
  error: string | null;

  // ── 向后兼容属性 ───────────────────────────────────────────

  /** @deprecated 使用 columns + rows 代替 */
  table: NormalizedTable | null;
  /** @deprecated 使用 isImporting 代替 */
  isProcessing: boolean;

  // ═══════════════════════════════════════════════════════════
  // Actions
  // ═══════════════════════════════════════════════════════════

  /** 只设置列头（流式导入第一批时调用） */
  setColumns: (columns: Column[]) => void;
  /** 分片追加行数据（流式导入中期调用） */
  appendRows: (newRows: Row[]) => void;
  /** 全量替换表格（小文件、全量加载场景） */
  setTableFull: (columns: Column[], rows: Row[], fileName: string) => void;
  /** @deprecated 使用 setTableFull 代替 */
  setTable: (table: NormalizedTable, fileName: string) => void;
  /** @deprecated 使用 isImporting 代替 */
  setProcessing: (p: boolean) => void;
  /** 单个单元格更新 */
  updateCell: (colIdx: number, rowIdx: number, value: string | number | null) => void;
  /** 批量 diff 更新（操作 undo/redo 用） */
  updateCells: (diffs: PatchDiff) => void;
  /** 更新整表（含列定义变更，操作 undo/redo 用） */
  updateTable: (columns: Column[], diffs: PatchDiff) => void;
  /** 设置导入进度（百分比 0-100） */
  setImportProgress: (progress: number) => void;
  /** 标记导入完成 */
  finishImport: (fileName: string, totalRowCount: number, isTruncated: boolean) => void;
  /** 标记导入错误 */
  setImportError: (error: string) => void;
  /** 设置错误信息 */
  setError: (error: string | null) => void;
  /** 重置所有状态 */
  reset: () => void;

  // ── Selectors ──────────────────────────────────────────────

  /** 按坐标取单元格值 */
  getCell: (colIdx: number, rowIdx: number) => import("../engine/types").CellValue;
  /** 按行范围取行数据（Grid 按需渲染） */
  getRowSlice: (start: number, end: number) => Row[];
}

// ═══════════════════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════════════════

/** 从 columns + rows 重建 NormalizedTable */
function buildTable(columns: Column[], rows: Row[], fileName: string | null): NormalizedTable | null {
  if (columns.length === 0 && rows.length === 0) return null;
  return {
    columns,
    rows,
    originalFileName: fileName ?? "",
    sheetName: fileName?.replace(/\.[^.]+$/, "") ?? "Sheet1",
  };
}

/** 判断单元格值是否为空（用于 isVirtual 标记） */
function cellIsVirtual(value: unknown): boolean {
  return value === null || value === undefined;
}

// ═══════════════════════════════════════════════════════════════
// 初始状态
// ═══════════════════════════════════════════════════════════════

const initialState = {
  columns: [] as Column[],
  rows: [] as Row[],
  totalRowCount: 0,
  loadedRowCount: 0,
  isImporting: false,
  importProgress: 0,
  isTruncated: false,
  fileName: null as string | null,
  error: null as string | null,
  table: null as NormalizedTable | null,
  isProcessing: false,
};

// ═══════════════════════════════════════════════════════════════
// Store
// ═══════════════════════════════════════════════════════════════

export const useTableStore = create<TableState>((set, get) => ({
  ...initialState,

  // ── 兼容 setter ──────────────────────────────────────────

  setTable: (table, fileName) =>
    set({
      columns: table.columns,
      rows: table.rows,
      fileName,
      table,
      totalRowCount: table.rows.length,
      loadedRowCount: table.rows.length,
      isImporting: false,
      isProcessing: false,
      importProgress: 100,
      isTruncated: false,
      error: null,
    }),

  setProcessing: (p) =>
    set({ isProcessing: p, isImporting: p }),

  // ── 流式导入 ──────────────────────────────────────────────

  setColumns: (columns) =>
    set({
      columns,
      rows: [],
      loadedRowCount: 0,
      totalRowCount: 0,
      isImporting: true,
      isProcessing: true,
      importProgress: 0,
      isTruncated: false,
      error: null,
      table: null,
    }),

  appendRows: (newRows) =>
    set((state) => {
      const rows = [...state.rows, ...newRows];
      return {
        rows,
        loadedRowCount: state.loadedRowCount + newRows.length,
        table: buildTable(state.columns, rows, state.fileName),
      };
    }),

  setImportProgress: (progress) =>
    set({ importProgress: progress }),

  finishImport: (fileName, totalRowCount, isTruncated) =>
    set((state) => ({
      fileName,
      totalRowCount,
      loadedRowCount: totalRowCount,
      isImporting: false,
      isProcessing: false,
      importProgress: 100,
      isTruncated,
      table: buildTable(state.columns, state.rows, fileName),
    })),

  setImportError: (error) =>
    set({ error, isImporting: false, isProcessing: false }),

  // ── 全量加载（小文件快捷路径） ────────────────────────────

  setTableFull: (columns, rows, fileName) =>
    set({
      columns,
      rows,
      fileName,
      table: buildTable(columns, rows, fileName),
      totalRowCount: rows.length,
      loadedRowCount: rows.length,
      isImporting: false,
      isProcessing: false,
      importProgress: 100,
      isTruncated: false,
      error: null,
    }),

  // ── 单元格级更新 ──────────────────────────────────────────

  updateCell: (colIdx, rowIdx, value) =>
    set((state) => {
      if (rowIdx < 0 || rowIdx >= state.rows.length) return state;
      const newRows = [...state.rows];
      const row = { ...newRows[rowIdx] };
      const cells = [...row.cells];
      cells[colIdx] = {
        ...cells[colIdx],
        value,
        isVirtual: cellIsVirtual(value),
      };
      row.cells = cells;
      newRows[rowIdx] = row;
      return {
        rows: newRows,
        table: buildTable(state.columns, newRows, state.fileName),
      };
    }),

  updateCells: (diffs) =>
    set((state) => {
      const rowsCopy = [...state.rows];
      for (const d of diffs) {
        if (d.rowIdx < 0 || d.rowIdx >= rowsCopy.length) continue;
        const row = { ...rowsCopy[d.rowIdx] };
        const cells = [...row.cells];
        if (d.colIdx < cells.length) {
          cells[d.colIdx] = {
            ...cells[d.colIdx],
            value: d.newValue,
            isVirtual: cellIsVirtual(d.newValue),
          };
        }
        row.cells = cells;
        rowsCopy[d.rowIdx] = row;
      }
      return {
        rows: rowsCopy,
        table: buildTable(state.columns, rowsCopy, state.fileName),
      };
    }),

  updateTable: (columns, diffs) =>
    set((state) => {
      const rowsCopy = [...state.rows];
      for (const d of diffs) {
        if (d.rowIdx < 0 || d.rowIdx >= rowsCopy.length) continue;
        const row = { ...rowsCopy[d.rowIdx] };
        const cells = [...row.cells];
        if (d.colIdx < cells.length) {
          cells[d.colIdx] = {
            ...cells[d.colIdx],
            value: d.newValue,
            isVirtual: cellIsVirtual(d.newValue),
          };
        }
        row.cells = cells;
        rowsCopy[d.rowIdx] = row;
      }
      return {
        columns,
        rows: rowsCopy,
        table: buildTable(columns, rowsCopy, state.fileName),
      };
    }),

  // ── 错误处理 ──────────────────────────────────────────────

  setError: (error) => set({ error }),

  // ── 重置 ──────────────────────────────────────────────────

  reset: () => set(initialState),

  // ── Selectors（只读，不修改状态） ─────────────────────────

  getCell: (colIdx, rowIdx) => {
    const state = get();
    if (rowIdx < 0 || rowIdx >= state.rows.length) return null;
    const cell = state.rows[rowIdx]?.cells[colIdx];
    return cell?.value ?? null;
  },

  getRowSlice: (start, end) => {
    const state = get();
    return state.rows.slice(start, end);
  },
}));