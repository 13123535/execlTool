/**
 * 操作注册表
 *
 * 维护 type → 操作类构造函数 的映射。
 * Worker 入口收到 SerializedOperation 后，通过注册表
 * 反序列化为真正的 Operation 实例并执行。
 *
 * 注册表使用懒加载：每个操作类在被引用时才 import，
 * 避免循环依赖和过大的初始包体。
 */

import type { Operation, SerializedOperation } from "../types";

/** 操作类构造函数签名 */
type OperationConstructor = new (params: Record<string, unknown>) => Operation;

/** 注册表（type → 构造函数） */
const registry = new Map<string, OperationConstructor>();

/**
 * 注册一个操作类
 *
 * @param type 操作类型标识（与 SerializedOperation.type 对应）
 * @param ctor 操作类构造函数
 */
export function registerOperation(
  type: string,
  ctor: OperationConstructor,
): void {
  if (registry.has(type)) {
    console.warn(`[registry] 操作类型 "${type}" 已注册，将被覆盖`);
  }
  registry.set(type, ctor);
}

/**
 * 反序列化：将 SerializedOperation 还原为 Operation 实例
 *
 * @param serialized 序列化的操作数据
 * @returns 操作实例
 * @throws 未注册的操作类型
 */
export function deserializeOperation(
  serialized: SerializedOperation,
): Operation {
  const ctor = registry.get(serialized.type);
  if (!ctor) {
    throw new Error(
      `[registry] 未注册的操作类型: "${serialized.type}"。` +
        `可用类型: [${[...registry.keys()].join(", ")}]`,
    );
  }
  return new ctor(serialized.params);
}

/**
 * 获取所有已注册的操作类型
 */
export function getRegisteredTypes(): string[] {
  return [...registry.keys()];
}