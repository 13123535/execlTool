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
import { VisualCollapseOp } from "./VisualCollapseOp";
import { AddColumnOp } from "./AddColumnOp";
import { SplitColumnOp } from "./SplitColumnOp";
import { RemoveEmptyOp } from "./RemoveEmptyOp";
import { NormalizeNewlineOp } from "./NormalizeNewlineOp";
import { DedupeOp } from "./DedupeOp";
import { RegexReplaceOp } from "./RegexReplaceOp";
import { NormalizeWidthOp } from "./NormalizeWidthOp";
import type { Operation } from "../types";

type OpCtor = new (params: Record<string, unknown>) => Operation;

// 注册所有操作
registerOperation("filldown", FillDownOp as OpCtor);
registerOperation("explode", ExplodeOp as OpCtor);
registerOperation("trim", TrimOp as OpCtor);
registerOperation("clean_invisible", CleanInvisibleOp as OpCtor);
registerOperation("collapse", CollapseOp as OpCtor);
registerOperation("visual_collapse", VisualCollapseOp as OpCtor);
registerOperation("add_column", AddColumnOp as OpCtor);
registerOperation("split_column", SplitColumnOp as OpCtor);
registerOperation("remove_empty", RemoveEmptyOp as OpCtor);
registerOperation("normalize_newline", NormalizeNewlineOp as OpCtor);
registerOperation("dedupe", DedupeOp as OpCtor);
registerOperation("regex_replace", RegexReplaceOp as OpCtor);
registerOperation("normalize_width", NormalizeWidthOp as OpCtor);

export { FillDownOp } from "./FillDownOp";
export { ExplodeOp } from "./ExplodeOp";
export { TrimOp } from "./TrimOp";
export { CleanInvisibleOp } from "./CleanInvisibleOp";
export { CollapseOp } from "./CollapseOp";
export { VisualCollapseOp } from "./VisualCollapseOp";
export { AddColumnOp } from "./AddColumnOp";
export { SplitColumnOp } from "./SplitColumnOp";
export { RemoveEmptyOp } from "./RemoveEmptyOp";
export { NormalizeNewlineOp } from "./NormalizeNewlineOp";
export { DedupeOp } from "./DedupeOp";
export { RegexReplaceOp } from "./RegexReplaceOp";
export { NormalizeWidthOp } from "./NormalizeWidthOp";
export { BaseOperation } from "./Operation";
export {
  registerOperation,
  deserializeOperation,
  getRegisteredTypes,
} from "./registry";