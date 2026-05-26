/**
 * 历史记录管理 (Zustand)
 *
 * 命令模式 Undo/Redo。
 *
 * 设计原则：
 *   - 不保存全量表格快照（大数据下不可行）
 *   - 只保存 SequenceizedOperation（序列化后的操作参数，< 1KB）
 *   - undo = 从头将 undoStack 中除最后一步外的所有操作重新执行
 *   - redo = 在当前位置基础上执行 redoStack 顶部的操作
 *
 * 为什么 Worker 有自己的 undo/redo 栈，Store 还要再存一份？
 *   - Worker 栈用于快速执行（操作数据在 Worker 上下文）
 *   - Store 栈用于 UI 历史面板显示和时间旅行
 *   - 两者通过 message 同步：Worker 执行完 → 回传 → Store 记录
 */

import { create } from "zustand";
import type { SerializedOperation } from "../engine";

/** 操作项目（展示在历史面板中） */
export interface HistoryItem {
  /** 序列化操作 */
  op: SerializedOperation;
  /** 界面显示标签 */
  label: string;
  /** 详细描述 */
  detail: string;
  /** 执行时间戳 */
  timestamp: number;
}

interface HistoryState {
  /** 撤销栈（最近操作在末尾） */
  undoStack: HistoryItem[];
  /** 重做栈（最近撤销的在末尾） */
  redoStack: HistoryItem[];

  /** 是否可以撤销 */
  canUndo: boolean;
  /** 是否可以重做 */
  canRedo: boolean;

  // ═══════════════════════════════════════════════════════════
  // Actions
  // ═══════════════════════════════════════════════════════════

  /** 记录一个操作 */
  push: (item: HistoryItem) => void;
  /** 撤销：弹出 undoStack 顶部，压入 redoStack */
  popUndo: () => HistoryItem | null;
  /** 重做：弹出 redoStack 顶部，压入 undoStack */
  popRedo: () => HistoryItem | null;
  /** 清空所有历史 */
  clear: () => void;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  undoStack: [],
  redoStack: [],
  canUndo: false,
  canRedo: false,

  push: (item) =>
    set((state) => {
      const undoStack = [...state.undoStack, item];
      return {
        undoStack,
        redoStack: [], // 新操作清空 redo 栈
        canUndo: undoStack.length > 0,
        canRedo: false,
      };
    }),

  popUndo: () => {
    const { undoStack } = get();
    if (undoStack.length === 0) return null;

    const item = undoStack[undoStack.length - 1];
    const newUndoStack = undoStack.slice(0, -1);

    set((state) => ({
      undoStack: newUndoStack,
      redoStack: [...state.redoStack, item],
      canUndo: newUndoStack.length > 0,
      canRedo: true,
    }));

    return item;
  },

  popRedo: () => {
    const { redoStack } = get();
    if (redoStack.length === 0) return null;

    const item = redoStack[redoStack.length - 1];
    const newRedoStack = redoStack.slice(0, -1);

    set((state) => ({
      undoStack: [...state.undoStack, item],
      redoStack: newRedoStack,
      canUndo: true,
      canRedo: newRedoStack.length > 0,
    }));

    return item;
  },

  clear: () =>
    set({
      undoStack: [],
      redoStack: [],
      canUndo: false,
      canRedo: false,
    }),
}));