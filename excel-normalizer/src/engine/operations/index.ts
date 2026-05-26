/**
 * 操作引擎入口 — 自动注册所有操作
 *
 * Worker 启动时导入此文件，自动将所有操作类注册到 registry。
 */

import { registerOperation } from "./registry";
import { FillDownOp } from "./FillDownOp";
import { ExplodeOp } from "./ExplodeOp";
import { TrimOp } from "./TrimOp";
import { CleanInvisibleOp } from "./CleanInvisibleOp";
import { CollapseOp } from "./CollapseOp";
import type { Operation } from "../types";

type OpCtor = new (params: Record<string, unknown>) => Operation;

// 注册所有操作
registerOperation("filldown", FillDownOp as OpCtor);
registerOperation("explode", ExplodeOp as OpCtor);
registerOperation("trim", TrimOp as OpCtor);
registerOperation("clean_invisible", CleanInvisibleOp as OpCtor);
registerOperation("collapse", CollapseOp as OpCtor);

export { FillDownOp } from "./FillDownOp";
export { ExplodeOp } from "./ExplodeOp";
export { TrimOp } from "./TrimOp";
export { CleanInvisibleOp } from "./CleanInvisibleOp";
export { CollapseOp } from "./CollapseOp";
export { BaseOperation } from "./Operation";
export {
  registerOperation,
  deserializeOperation,
  getRegisteredTypes,
} from "./registry";
