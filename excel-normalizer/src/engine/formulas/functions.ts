/**
 * 公式引擎 — 内置函数注册表
 *
 * 每个函数接收参数数组，返回计算结果。
 * 参数已在求值器中被求值为原始值（string | number | boolean | null）。
 *
 * 添加新函数：
 *   1. 编写实现函数
 *   2. 注册到 BUILTIN_FUNCTIONS Map
 */
// 函数签名：接收已求值的参数，返回计算结果
export type FormulaFunc = (...args: (string | number | boolean | null)[]) => string | number | boolean | null;

/** 内置函数表 */
export const BUILTIN_FUNCTIONS = new Map<string, FormulaFunc>();

// ═══════════════════════════════════════════════════════════════
// 字符串函数
// ═══════════════════════════════════════════════════════════════

BUILTIN_FUNCTIONS.set("CONCAT", (...args) => {
  return args.map(String).join("");
});

BUILTIN_FUNCTIONS.set("UPPER", (s) => {
  return typeof s === "string" ? s.toUpperCase() : String(s ?? "").toUpperCase();
});

BUILTIN_FUNCTIONS.set("LOWER", (s) => {
  return typeof s === "string" ? s.toLowerCase() : String(s ?? "").toLowerCase();
});

BUILTIN_FUNCTIONS.set("TRIM", (s) => {
  return typeof s === "string" ? s.trim() : String(s ?? "").trim();
});

BUILTIN_FUNCTIONS.set("LEFT", (s, n) => {
  const str = typeof s === "string" ? s : String(s ?? "");
  const count = typeof n === "number" ? n : (n !== null ? parseInt(String(n)) : 1);
  return str.slice(0, count);
});

BUILTIN_FUNCTIONS.set("RIGHT", (s, n) => {
  const str = typeof s === "string" ? s : String(s ?? "");
  const count = typeof n === "number" ? n : (n !== null ? parseInt(String(n)) : 1);
  return str.slice(-count);
});

BUILTIN_FUNCTIONS.set("MID", (s, start, len) => {
  const str = typeof s === "string" ? s : String(s ?? "");
  const startPos = typeof start === "number" ? start - 1 : 0; // MID is 1-indexed
  const length = typeof len === "number" ? len : str.length;
  return str.slice(startPos, startPos + length);
});

BUILTIN_FUNCTIONS.set("LEN", (s) => {
  return typeof s === "string" ? s.length : String(s ?? "").length;
});

BUILTIN_FUNCTIONS.set("REPLACE", (s, search, replacement) => {
  const str = typeof s === "string" ? s : String(s ?? "");
  const find = String(search ?? "");
  const replace = String(replacement ?? "");
  return str.split(find).join(replace);
});

BUILTIN_FUNCTIONS.set("STARTS_WITH", (s, prefix) => {
  const str = typeof s === "string" ? s : String(s ?? "");
  return str.startsWith(String(prefix ?? ""));
});

BUILTIN_FUNCTIONS.set("ENDS_WITH", (s, suffix) => {
  const str = typeof s === "string" ? s : String(s ?? "");
  return str.endsWith(String(suffix ?? ""));
});

BUILTIN_FUNCTIONS.set("CONTAINS", (s, sub) => {
  const str = typeof s === "string" ? s : String(s ?? "");
  return str.includes(String(sub ?? ""));
});

// ═══════════════════════════════════════════════════════════════
// 数学函数
// ═══════════════════════════════════════════════════════════════

BUILTIN_FUNCTIONS.set("ROUND", (x, n) => {
  const val = typeof x === "number" ? x : parseFloat(String(x));
  const decimals = typeof n === "number" ? n : (n !== null ? parseInt(String(n)) : 0);
  if (isNaN(val)) return null;
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
});

BUILTIN_FUNCTIONS.set("CEIL", (x) => {
  const val = typeof x === "number" ? x : parseFloat(String(x));
  return isNaN(val) ? null : Math.ceil(val);
});

BUILTIN_FUNCTIONS.set("FLOOR", (x) => {
  const val = typeof x === "number" ? x : parseFloat(String(x));
  return isNaN(val) ? null : Math.floor(val);
});

BUILTIN_FUNCTIONS.set("ABS", (x) => {
  const val = typeof x === "number" ? x : parseFloat(String(x));
  return isNaN(val) ? null : Math.abs(val);
});

BUILTIN_FUNCTIONS.set("MIN", (...args) => {
  const nums = args.map(a => typeof a === "number" ? a : parseFloat(String(a))).filter(v => !isNaN(v));
  return nums.length > 0 ? Math.min(...nums) : null;
});

BUILTIN_FUNCTIONS.set("MAX", (...args) => {
  const nums = args.map(a => typeof a === "number" ? a : parseFloat(String(a))).filter(v => !isNaN(v));
  return nums.length > 0 ? Math.max(...nums) : null;
});

BUILTIN_FUNCTIONS.set("POW", (base, exp) => {
  const b = typeof base === "number" ? base : parseFloat(String(base));
  const e = typeof exp === "number" ? exp : parseFloat(String(exp));
  if (isNaN(b) || isNaN(e)) return null;
  return Math.pow(b, e);
});

BUILTIN_FUNCTIONS.set("SQRT", (x) => {
  const val = typeof x === "number" ? x : parseFloat(String(x));
  if (isNaN(val) || val < 0) return null;
  return Math.sqrt(val);
});

// ═══════════════════════════════════════════════════════════════
// 逻辑 / 条件函数
// ═══════════════════════════════════════════════════════════════

BUILTIN_FUNCTIONS.set("IF", (cond, trueVal, falseVal) => {
  return cond ? trueVal : falseVal;
});

BUILTIN_FUNCTIONS.set("IFNULL", (x, defaultVal) => {
  return x === null || x === undefined || (typeof x === "string" && x === "") ? (defaultVal ?? "无") : x;
});

BUILTIN_FUNCTIONS.set("ISNULL", (x) => {
  return x === null || x === undefined || (typeof x === "string" && x === "");
});

BUILTIN_FUNCTIONS.set("NOT", (x) => {
  return !x;
});

BUILTIN_FUNCTIONS.set("AND", (...args) => {
  return args.every(Boolean);
});

BUILTIN_FUNCTIONS.set("OR", (...args) => {
  return args.some(Boolean);
});

BUILTIN_FUNCTIONS.set("XOR", (a, b) => {
  return Boolean(a) !== Boolean(b);
});

// ═══════════════════════════════════════════════════════════════
// 类型转换函数
// ═══════════════════════════════════════════════════════════════

BUILTIN_FUNCTIONS.set("NUMBER", (x) => {
  if (typeof x === "number") return x;
  const parsed = parseFloat(String(x ?? ""));
  return isNaN(parsed) ? null : parsed;
});

BUILTIN_FUNCTIONS.set("TEXT", (x) => {
  return String(x ?? "");
});

BUILTIN_FUNCTIONS.set("INT", (x) => {
  if (typeof x === "number") return Math.floor(x);
  const parsed = parseFloat(String(x ?? ""));
  return isNaN(parsed) ? null : Math.floor(parsed);
});

// ═══════════════════════════════════════════════════════════════
// 聚合函数（对列引用才有效，在求值器中特殊处理）
// ═══════════════════════════════════════════════════════════════

// 这些函数在 AddColumnOp 级别处理，不在行级别 evaluate 中。
// 行级别调用直接返回 null。

/**
 * 检查函数名是否属于聚合函数（需要全表扫描）
 */
export function isAggregateFunc(name: string): boolean {
  return ["AVG", "SUM", "COUNT", "MEDIAN", "STDEV"].includes(name.toUpperCase());
}

export const AGGREGATE_FUNCS = new Set<string>(["AVG", "SUM", "COUNT", "MEDIAN", "STDEV"]);