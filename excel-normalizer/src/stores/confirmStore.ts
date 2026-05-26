/**
 * confirmStore — 操作确认弹窗状态管理
 *
 * Worker 执行"破坏性操作"前，通过 postMessage 发送 ConfirmRequest。
 * 主线程收到后写入此 store，UI 层渲染 ConfirmDialog 组件。
 * 用户确认/取消后，Promise resolve，结果通过 postMessage 返回 Worker。
 *
 * 流程：
 *   Worker → postMessage({type:"confirm-request", requestId, operationType, message})
 *   → workerClient 调用 confirmStore.show() → UI 弹出 Modal
 *   → 用户点击确认/取消 → confirmStore 的 pending resolver 被调用
 *   → workerClient 把结果 postMessage 回 Worker
 *   → Worker 继续执行或取消
 */

import { create } from "zustand";

/** 确认请求 */
export interface ConfirmRequest {
  /** 唯一请求 ID */
  requestId: string;
  /** 操作类型标签 */
  operationType: string;
  /** 确认消息 */
  message: string;
  /** 解决器：用户确认后调用 */
  resolve: (confirmed: boolean) => void;
}

/** Store 状态 */
interface ConfirmState {
  /** 当前待处理的确认请求（null = 无请求） */
  pendingRequest: ConfirmRequest | null;

  /**
   * 显示确认弹窗
   *
   * @param requestId 请求 ID
   * @param operationType 操作类型标签
   * @param message 确认消息
   * @returns Promise<boolean> — true = 确认，false = 取消
   */
  show: (
    requestId: string,
    operationType: string,
    message: string,
  ) => Promise<boolean>;

  /** 清除当前请求（内部使用） */
  _clear: () => void;
}

export const useConfirmStore = create<ConfirmState>((set) => ({
  pendingRequest: null,

  show: (requestId, operationType, message) => {
    return new Promise<boolean>((resolve) => {
      const request: ConfirmRequest = {
        requestId,
        operationType,
        message,
        resolve,
      };
      set({ pendingRequest: request });
    });
  },

  _clear: () => set({ pendingRequest: null }),
}));