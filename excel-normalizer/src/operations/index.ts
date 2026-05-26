/**
 * 操作引擎入口
 *
 * 自动注册所有操作引擎到全局注册表。
 */

import { operationRegistry } from "./baseEngine";
import { ExpandEngine } from "./expandEngine";
import { CollapseEngine } from "./collapseEngine";
import { ColumnEngine } from "./columnEngine";
import { RowEngine } from "./rowEngine";
import { CleanEngine } from "./cleanEngine";
import { TransformEngine } from "./transformEngine";
import { ClusterEngine } from "./clusterEngine";

// 注册所有引擎
operationRegistry.register(new ExpandEngine());
operationRegistry.register(new CollapseEngine());
operationRegistry.register(new ColumnEngine());
operationRegistry.register(new RowEngine());
operationRegistry.register(new CleanEngine());
operationRegistry.register(new TransformEngine());
operationRegistry.register(new ClusterEngine());

export { operationRegistry } from "./baseEngine";
export type { OperationEngine } from "./baseEngine";
export { ExpandEngine } from "./expandEngine";
export { CollapseEngine } from "./collapseEngine";
export { ColumnEngine } from "./columnEngine";
export { RowEngine } from "./rowEngine";
export { CleanEngine } from "./cleanEngine";
export { TransformEngine } from "./transformEngine";
export { ClusterEngine } from "./clusterEngine";