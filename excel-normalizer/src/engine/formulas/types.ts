/**
 * 公式引擎 — AST 节点类型定义
 *
 * 公式语法示例：
 *   {价格} * 1.13
 *   IF({金额} > 1000, "大额", "小额")
 *   CONCAT({省}, "-", {市})
 *   ROUND({价格} * 1.13, 2)
 *   LEFT({姓名}, 3)
 *   IFNULL({备注}, "无")
 *
 * 列引用使用 {列名} 语法，避免与函数调用混淆。
 * 字符串使用单引号或双引号包围。
 */
export type ASTNode =
  | NumberLiteral
  | StringLiteral
  | BooleanLiteral
  | NullLiteral
  | ColumnRef
  | BinaryOp
  | UnaryOp
  | FunctionCall;

// ── 字面量节点 ──

export interface NumberLiteral {
  type: "number";
  value: number;
}

export interface StringLiteral {
  type: "string";
  value: string;
}

export interface BooleanLiteral {
  type: "boolean";
  value: boolean;
}

export interface NullLiteral {
  type: "null";
}

// ── 列引用 ──

export interface ColumnRef {
  type: "column_ref";
  /** 列名（不含花括号） */
  name: string;
}

// ── 运算符 ──

export interface BinaryOp {
  type: "binary_op";
  /** 运算符：+ - * / % > < >= <= == != && || */
  op: string;
  left: ASTNode;
  right: ASTNode;
}

export interface UnaryOp {
  type: "unary_op";
  /** 运算符：- ! */
  op: string;
  operand: ASTNode;
}

// ── 函数调用 ──

export interface FunctionCall {
  type: "function_call";
  /** 函数名（大写） */
  name: string;
  /** 实参列表 */
  args: ASTNode[];
}