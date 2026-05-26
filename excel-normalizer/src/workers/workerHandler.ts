/**
 * Worker 消息处理器 — Worker 线程侧
 *
 * 通用消息路由框架，Worker 入口调用此函数即可自动处理消息分发。
 */

import {
  WorkerRequest,
  WorkerResponse,
  WorkerMessageType,
} from "../types";

/** 消息处理函数签名 */
export type MessageHandler = (
  payload: unknown
) => Promise<{ type: WorkerMessageType; payload: unknown }>;

/**
 * 启动 Worker 消息循环
 * @param handlers 消息类型 → 处理函数映射
 */
export function startWorker(handlers: Partial<Record<WorkerMessageType, MessageHandler>>) {
  self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
    const request = event.data;
    const handler = handlers[request.type];

    if (!handler) {
      const response: WorkerResponse = {
        id: request.id,
        type: request.type as WorkerMessageType,
        payload: null,
        error: `Unknown message type: ${request.type}`,
      };
      (self as unknown as Worker).postMessage(response);
      return;
    }

    try {
      const result = await handler(request.payload);
      const response: WorkerResponse = {
        id: request.id,
        type: result.type,
        payload: result.payload,
      };
      (self as unknown as Worker).postMessage(response);
    } catch (err) {
      const response: WorkerResponse = {
        id: request.id,
        type: request.type as WorkerMessageType,
        payload: null,
        error: err instanceof Error ? err.message : String(err),
      };
      (self as unknown as Worker).postMessage(response);
    }
  };
}