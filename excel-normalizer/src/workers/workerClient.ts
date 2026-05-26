/**
 * Worker 客户端 — 主线程侧
 *
 * 提供 Promise-based 的 Web Worker 通信接口。
 * 支持 request/response 模式，自动匹配消息 ID。
 */

import {
  WorkerRequest,
  WorkerResponse,
  WorkerMessageType,
} from "../types";

/**
 * 创建一个 Worker 客户端实例
 * @param workerUrl Web Worker 的 URL
 */
export function createWorkerClient(workerUrl: string) {
  const worker = new Worker(workerUrl, { type: "module" });

  /** 等待响应的 pending 请求 Map */
  const pending = new Map<string, {
    resolve: (res: WorkerResponse) => void;
    reject: (err: Error) => void;
  }>();

  let counter = 0;

  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const response = event.data;
    const waiter = pending.get(response.id);
    if (!waiter) {
      console.warn("[WorkerClient] received unknown response id:", response.id);
      return;
    }
    pending.delete(response.id);
    if (response.error) {
      waiter.reject(new Error(response.error));
    } else {
      waiter.resolve(response);
    }
  };

  worker.onerror = (event) => {
    console.error("[WorkerClient] unhandled worker error:", event);
  };

  /**
   * 发送请求并等待响应
   */
  function send<T = unknown>(
    type: WorkerMessageType,
    payload: unknown
  ): Promise<WorkerResponse & { payload: T }> {
    return new Promise((resolve, reject) => {
      const id = `req_${++counter}_${Date.now()}`;
      const request: WorkerRequest = { id, type, payload };
      pending.set(id, { resolve: resolve as (res: WorkerResponse) => void, reject });
      worker.postMessage(request);
    }) as Promise<WorkerResponse & { payload: T }>;
  }

  /**
   * 终止 Worker
   */
  function terminate() {
    // 清理所有 pending
    for (const [id, waiter] of pending) {
      waiter.reject(new Error("Worker terminated"));
      pending.delete(id);
    }
    worker.terminate();
  }

  return { send, terminate, worker };
}

export type WorkerClient = ReturnType<typeof createWorkerClient>;