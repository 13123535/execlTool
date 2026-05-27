/**
 * 历史记录管理 (Zustand) — 方案C 重写：diff 链
 *
 * 核心变动：
 *   - 不再保存 Operation 实例引用（解除内存泄漏风险）
 *   - 改为保存 PatchDiff（正向 + 反向），undo/redo 时直接调 tableStore.updateCells()
 *   - 序列化友好（全部 JSON 可序列化），不再依赖 Operation 的私有快照
 *
 * HistoryItem：
 *   - diffs: PatchDiff       操作产生的 diff（正向：old→new）
 *   - reverseDiffs: PatchDiff 反向 diff（new→old，undo 用）
 *   - label / detail / timestamp
 */

import { create } from "zustand";
import type { PatchDiff } from "../engine";

// ═══════════════════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════════════════

/** 历史记录项（纯 JSON，无实例引用） */
export interface HistoryItem {
  /** 正向 diff（old→new，redo 用） */
  diffs: PatchDiff;
  /** 反向 diff（new→old，undo 用） */
  reverseDiffs: PatchDiff;
  /** 界面显示标签 */
  label: string;
  /** 详细描述 */
  detail: string;
  /** 执行时间戳 */
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════════
// State & Actions
// ═══════════════════════════════════════════════════════════════

interface HistoryState {
  /** 撤销栈（最近操作在末尾） */
  undoStack: HistoryItem[];
  /** 重做栈（最近撤销的在末尾） */
  redoStack: HistoryItem[];
  /** 是否可撤销 */
  canUndo: boolean;
  /** 是否可重做 */
  canRedo: boolean;

  /** 记录一个操作 */
  push: (item: HistoryItem) => void;
  /** 撤销：弹出 undoStack 顶部，压入 redoStack */
  popUndo: () => HistoryItem | null;
  /** 重做：弹出 redoStack 顶部，压入 undoStack */
  popRedo: () => HistoryItem | null;
  /** 清空所有历史 */
  clear: () => void;
}

// ═══════════════════════════════════════════════════════════════
// Store
// ═══════════════════════════════════════════════════════════════

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