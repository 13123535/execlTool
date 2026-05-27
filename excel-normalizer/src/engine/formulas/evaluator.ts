/**
 * 公式引擎 — AST 求值器
 *
 * 递归遍历 AST，执行计算。
 *
 * 行上下文（row context）：一个 Record<string, string | number | null>，
 * key = 列名，value = 当前行该列的值。
 *
 * 聚合函数（AVG, SUM, COUNT, MEDIAN, STDEV）：
 * 这些需要整表数据，不在行级别 evaluate 中处理。
 * 由 AddColumnOp 在执行时特殊处理：先扫描全表计算聚合值，
 * 然后将其作为常量注入每一行的 rowContext 中。
 */

import type { ASTNode, ColumnRef, FunctionCall } from "./types";
import { BUILTIN_FUNCTIONS, AGGREGATE_FUNCS } from "./functions";

/**
 * 行上下文：列名 → 单元格值
 */
export type RowContext = Record<string, string | number | boolean | null>;

/**
 * 计算值 = 表达式返回值 | 聚合函数的返回值
 */
export type EvalValue = string | number | boolean | null;

// ═══════════════════════════════════════════════════════════════
// 公开 API
// ═══════════════════════════════════════════════════════════════

/**
 * 在指定行上下文中求值 AST
 *
 * @param node AST 根节点
 * @param ctx 行上下文（列名 → 值）
 * @returns 计算结果
 * @throws 求值错误（未定义函数、除零等）
 */
export function evaluate(node: ASTNode, ctx: RowContext): EvalValue {
  return evalNode(node, ctx);
}

// ═══════════════════════════════════════════════════════════════
// 递归求值
// ═══════════════════════════════════════════════════════════════

function evalNode(node: ASTNode, ctx: RowContext): EvalValue {
  switch (node.type) {
    case "number":
      return node.value;

    case "string":
      return node.value;

    case "boolean":
      return node.value;

    case "null":
      return null;

    case "column_ref":
      return evalColumnRef(node, ctx);

    case "binary_op":
      return evalBinaryOp(node, ctx);

    case "unary_op":
      return evalUnaryOp(node, ctx);

    case "function_call":
      return evalFuncCall(node, ctx);

    default:
      throw new Error(`[evaluator] 未知 AST 节点类型: ${(node as ASTNode).type}`);
  }
}

// ── 列引用 ──

function evalColumnRef(node: ColumnRef, ctx: RowContext): EvalValue {
  const val = ctx[node.name];
  // 未找到的列返回 null
  if (val === undefined) return null;
  return val;
}

// ── 二元运算 ──

function evalBinaryOp(
  node: { op: string; left: ASTNode; right: ASTNode },
  ctx: RowContext,
): EvalValue {
  const left = evalNode(node.left, ctx);
  const right = evalNode(node.right, ctx);

  switch (node.op) {
    // 算术
    case "+": return add(left, right);
    case "-": return sub(left, right);
    case "*": return mul(left, right);
    case "/": return div(left, right);
    case "%": return mod(left, right);

    // 比较
    case ">": return gt(left, right);
    case "<": return lt(left, right);
    case ">=": return gte(left, right);
    case "<=": return lte(left, right);
    case "==": return eq(left, right);
    case "!=": return neq(left, right);

    // 逻辑
    case "&&": return Boolean(left) && Boolean(right);
    case "||": return Boolean(left) || Boolean(right);

    default:
      throw new Error(`[evaluator] 未知运算符: ${node.op}`);
  }
}

// ── 一元运算 ──

function evalUnaryOp(
  node: { op: string; operand: ASTNode },
  ctx: RowContext,
): EvalValue {
  const val = evalNode(node.operand, ctx);
  if (node.op === "-") {
    const n = toNumber(val);
    return n === null ? null : -n;
  }
  if (node.op === "!") {
    return !val;
  }
  throw new Error(`[evaluator] 未知一元运算符: ${node.op}`);
}

// ── 函数调用 ──

function evalFuncCall(node: FunctionCall, ctx: RowContext): EvalValue {
  const funcName = node.name;

  // 聚合函数在行级别返回 null（由 AddColumnOp 外部处理）
  if (AGGREGATE_FUNCS.has(funcName)) {
    return null;
  }

  const fn = BUILTIN_FUNCTIONS.get(funcName);
  if (!fn) {
    throw new Error(`[evaluator] 未定义的函数: ${funcName}`);
  }

  // 求值所有参数
  const evalArgs = node.args.map((arg) => evalNode(arg, ctx));
  return fn(...evalArgs);
}

// ═══════════════════════════════════════════════════════════════
// 算术运算符实现（含类型自动转换）
// ═══════════════════════════════════════════════════════════════

function toNumber(v: EvalValue): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string" && v !== "") {
    const parsed = parseFloat(v);
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

function add(a: EvalValue, b: EvalValue): EvalValue {
  // 字符串拼接优先
  if (typeof a === "string" || typeof b === "string") {
    return String(a ?? "") + String(b ?? "");
  }
  const na = toNumber(a);
  const nb = toNumber(b);
  if (na === null || nb === null) return null;
  return na + nb;
}

function sub(a: EvalValue, b: EvalValue): EvalValue {
  const na = toNumber(a);
  const nb = toNumber(b);
  if (na === null || nb === null) return null;
  return na - nb;
}

function mul(a: EvalValue, b: EvalValue): EvalValue {
  const na = toNumber(a);
  const nb = toNumber(b);
  if (na === null || nb === null) return null;
  return na * nb;
}

function div(a: EvalValue, b: EvalValue): EvalValue {
  const na = toNumber(a);
  const nb = toNumber(b);
  if (na === null || nb === null) return null;
  if (nb === 0) return null; // 除零返回 null
  return na / nb;
}

function mod(a: EvalValue, b: EvalValue): EvalValue {
  const na = toNumber(a);
  const nb = toNumber(b);
  if (na === null || nb === null) return null;
  if (nb === 0) return null;
  return na % nb;
}

// ═══════════════════════════════════════════════════════════════
// 比较运算符实现
// ═══════════════════════════════════════════════════════════════

function cmp(a: EvalValue, b: EvalValue): number {
  // null 排在最低
  if (a === null && b === null) return 0;
  if (a === null) return -1;
  if (b === null) return 1;

  // 类型相同时直接比较
  if (typeof a === typeof b) {
    if (typeof a === "number") return (a as number) - (b as number);
    if (typeof a === "boolean") return (a ? 1 : 0) - (b ? 1 : 0);
    return String(a).localeCompare(String(b));
  }

  // 数字 vs 字符串 → 尝试数字比较
  const na = toNumber(a);
  const nb = toNumber(b);
  if (na !== null && nb !== null) return na - nb;

  // 兜底：字符串比较
  return String(a).localeCompare(String(b));
}

function gt(a: EvalValue, b: EvalValue): boolean { return cmp(a, b) > 0; }
function lt(a: EvalValue, b: EvalValue): boolean { return cmp(a, b) < 0; }
function gte(a: EvalValue, b: EvalValue): boolean { return cmp(a, b) >= 0; }
function lte(a: EvalValue, b: EvalValue): boolean { return cmp(a, b) <= 0; }
function eq(a: EvalValue, b: EvalValue): boolean { return cmp(a, b) === 0; }
function neq(a: EvalValue, b: EvalValue): boolean { return cmp(a, b) !== 0; }