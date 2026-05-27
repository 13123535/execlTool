/**
 * AddColumnOp — 新增公式列
 *
 * 根据用户输入的公式表达式，为每行计算一个新列的值。
 *
 * 支持：
 *   - 普通表达式：{价格} * 1.13 → 含税价
 *   - 条件表达式：IF({金额} > 1000, "大额", "小额")
 *   - 字符串拼接：CONCAT({省}, {市})
 *   - 聚合函数：SUM({销售额}) → 所有行相同值，表示全表汇总
 *
 * 公式语法：
 *   {列名} 引用当前行列值
 *   算术：+ - * / %
 *   比较：> < >= <= == !=
 *   逻辑：&& || !
 *   函数：IF, IFNULL, CONCAT, LEFT, RIGHT, MID, LEN, ROUND, ABS ...
 *   聚合：SUM, AVG, COUNT, MEDIAN, STDEV（全表扫描）
 *
 * 参数：
 *   - expression: 公式表达式字符串
 *   - newColumnName: 新列名称
 */

import { BaseOperation } from "./Operation";
import type {
  NormalizedTable,
  SerializedOperation,
  Cell,
  Column,
} from "../types";
import { parse, extractColumnRefs } from "../formulas/parser";
import { evaluate } from "../formulas/evaluator";
import type { ASTNode } from "../formulas/types";
import type { RowContext } from "../formulas/evaluator";

interface AddColumnParams {
  expression: string;
  newColumnName: string;
}

export class AddColumnOp extends BaseOperation {
  readonly type = "add_column";
  readonly label: string;
  readonly detail: string;

  private expression: string;
  private newColumnName: string;
  private ast: ASTNode | null = null;

  constructor(params: Record<string, unknown>) {
    super();
    const p = params as unknown as AddColumnParams;

    if (!p.expression || typeof p.expression !== "string") {
      throw new Error("[AddColumnOp] 参数 'expression' 必须是非空字符串");
    }
    if (!p.newColumnName || typeof p.newColumnName !== "string") {
      throw new Error("[AddColumnOp] 参数 'newColumnName' 必须是非空字符串");
    }

    this.expression = p.expression;
    this.newColumnName = p.newColumnName;
    this.label = `新增列: ${this.newColumnName}`;
    this.detail = `公式: ${this.expression}`;

    // 在构造时解析，尽早发现语法错误
    this.ast = parse(this.expression);
  }

  /**
   * 执行新增列
   *
   * 流程：
   *   1. 深拷贝原表
   *   2. 解析公式
   *   3. 建立列名 → 列索引映射
   *   4. 如果是纯行级表达式 → 逐行求值
   *   5. 如果含聚合函数 → 先全表扫描计算聚合值，再逐行求值
   *   6. 新增列追加到末尾
   */
  execute(table: NormalizedTable): NormalizedTable {
    if (!this.ast) {
      throw new Error("[AddColumnOp] AST 未初始化");
    }

    const result = this.cloneTable(table);

    // 建立列名 → 列索引的双向映射
    const colNameToIdx = new Map<string, number>();
    const colIdxToName = new Map<number, string>();
    for (let i = 0; i < result.columns.length; i++) {
      const col = result.columns[i];
      colNameToIdx.set(col.name, i);
      colIdxToName.set(i, col.name);
    }

    // 验证公式中引用的列是否存在
    const referencedCols = extractColumnRefs(this.ast);
    for (const colName of referencedCols) {
      if (!colNameToIdx.has(colName)) {
        throw new Error(
          `[AddColumnOp] 公式引用了不存在的列 "${colName}"。` +
          `可用列: [${[...colNameToIdx.keys()].join(", ")}]`,
        );
      }
    }

    // 检查是否需要聚合函数
    const needsAggregation = this.hasAggregateCall(this.ast);

    // 预先计算聚合值（如有）—— 聚合函数只返回 number | null
    const aggregateValues: Record<string, string | number | null> =
      needsAggregation ? this.computeAggregates(result, colIdxToName) : {};

    // 新增列定义
    const newColId = String(result.columns.length);
    const newColumn: Column = {
      id: newColId,
      name: this.newColumnName,
      dtype: "text", // 默认 text，后续可根据值自动推断
      isKey: false,
    };
    result.columns.push(newColumn);

    // 逐行计算新列值
    for (const row of result.rows) {
      const ctx = this.buildRowContext(row, colIdxToName);
      // 注入聚合值到上下文（函数名如 SUM, AVG 作为 key）
      for (const key of Object.keys(aggregateValues)) {
        ctx[key] = aggregateValues[key];
      }
      const computed = evaluate(this.ast, ctx);
      // Cell.value 类型是 string | number | null，boolean 转为 string
      const cellValue: string | number | null =
        computed === null || computed === undefined
          ? null
          : typeof computed === "boolean"
            ? String(computed)
            : computed;
      const newCell: Cell = {
        value: cellValue,
        isVirtual: false,
        sourceRef: null,
      };
      row.cells.push(newCell);
    }

    return result;
  }

  /**
   * 撤销新增列：直接移除末尾列
   */
  undo(table: NormalizedTable): NormalizedTable {
    const result = this.cloneTable(table);

    // 移除最后一列（假设 undo 对称：add_column 只能在末尾追加）
    if (result.columns.length > 0) {
      result.columns.pop();
    }
    for (const row of result.rows) {
      if (row.cells.length > 0) {
        row.cells.pop();
      }
    }

    return result;
  }

  serialize(): SerializedOperation {
    return {
      type: this.type,
      params: {
        expression: this.expression,
        newColumnName: this.newColumnName,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // 私有方法
  // ═══════════════════════════════════════════════════════════════

  /** 根据行列数据构建行上下文 */
  private buildRowContext(
    row: NormalizedTable["rows"][number],
    colIdxToName: Map<number, string>,
  ): RowContext {
    const ctx: RowContext = {};
    for (let i = 0; i < row.cells.length; i++) {
      const colName = colIdxToName.get(i);
      if (colName !== undefined) {
        ctx[colName] = row.cells[i]?.value ?? null;
      }
    }
    return ctx;
  }

  /** 检查 AST 中是否包含聚合函数调用 */
  private hasAggregateCall(node: ASTNode): boolean {
    let found = false;
    const aggSet = new Set(["AVG", "SUM", "COUNT", "MEDIAN", "STDEV"]);

    function walk(n: ASTNode): void {
      if (found) return;
      if (n.type === "function_call" && aggSet.has(n.name)) {
        found = true;
        return;
      }
      if (n.type === "binary_op") {
        walk(n.left);
        walk(n.right);
      }
      if (n.type === "unary_op") {
        walk(n.operand);
      }
      if (n.type === "function_call") {
        for (const arg of n.args) walk(arg);
      }
    }

    walk(node);
    return found;
  }

  /** 计算聚合函数值: 遍历全表 → 计算结果 → 返回 {SUM: 100, AVG: 50, ...} */
  private computeAggregates(
    table: NormalizedTable,
    colIdxToName: Map<number, string>,
  ): Record<string, string | number | null> {
    const result: Record<string, string | number | null> = {};

    // 需要处理的聚合函数类型
    const needed = new Set<string>();
    this.collectAggCalls(this.ast!, needed);

    for (const funcName of needed) {
      // 检查聚合函数的参数是否是列引用
      const colName = this.getAggregateColumnName(this.ast!, funcName);
      if (!colName) {
        result[funcName] = null;
        continue;
      }

      const colIdx = this.findColIdxByName(colName, colIdxToName);
      if (colIdx === -1) {
        result[funcName] = null;
        continue;
      }

      // 收集该列所有数值
      const values: number[] = [];
      for (const row of table.rows) {
        const cell = row.cells[colIdx];
        if (!cell || cell.value === null) continue;
        const num = typeof cell.value === "number" ? cell.value : parseFloat(String(cell.value));
        if (!isNaN(num)) values.push(num);
      }

      // 计算聚合
      switch (funcName.toUpperCase()) {
        case "SUM":
          result[funcName] = values.reduce((a, b) => a + b, 0);
          break;
        case "AVG":
          result[funcName] = values.length > 0
            ? values.reduce((a, b) => a + b, 0) / values.length
            : null;
          break;
        case "COUNT":
          result[funcName] = values.length;
          break;
        case "MEDIAN": {
          if (values.length === 0) { result[funcName] = null; break; }
          const sorted = [...values].sort((a, b) => a - b);
          const mid = Math.floor(sorted.length / 2);
          result[funcName] = sorted.length % 2 !== 0
            ? sorted[mid]
            : (sorted[mid - 1] + sorted[mid]) / 2;
          break;
        }
        case "STDEV": {
          if (values.length === 0) { result[funcName] = null; break; }
          const avg = values.reduce((a, b) => a + b, 0) / values.length;
          const variance = values.reduce((a, b) => a + (b - avg) ** 2, 0) / values.length;
          result[funcName] = Math.sqrt(variance);
          break;
        }
        default:
          result[funcName] = null;
      }
    }

    return result;
  }

  /** 收集 AST 中所有的聚合函数名 */
  private collectAggCalls(node: ASTNode, out: Set<string>): void {
    const aggSet = new Set(["AVG", "SUM", "COUNT", "MEDIAN", "STDEV"]);
    if (node.type === "function_call" && aggSet.has(node.name)) {
      out.add(node.name);
    }
    if (node.type === "binary_op") {
      this.collectAggCalls(node.left, out);
      this.collectAggCalls(node.right, out);
    }
    if (node.type === "unary_op") {
      this.collectAggCalls(node.operand, out);
    }
    if (node.type === "function_call") {
      for (const arg of node.args) {
        this.collectAggCalls(arg, out);
      }
    }
  }

  /** 从 AST 中提取指定聚合函数的列引用参数 */
  private getAggregateColumnName(node: ASTNode, funcName: string): string | null {
    if (
      node.type === "function_call" &&
      node.name === funcName &&
      node.args.length > 0 &&
      node.args[0].type === "column_ref"
    ) {
      return node.args[0].name;
    }
    // 递归查找
    if (node.type === "binary_op") {
      return (
        this.getAggregateColumnName(node.left, funcName) ??
        this.getAggregateColumnName(node.right, funcName)
      );
    }
    if (node.type === "function_call") {
      for (const arg of node.args) {
        const found = this.getAggregateColumnName(arg, funcName);
        if (found) return found;
      }
    }
    return null;
  }

  /** 根据列名查找列索引 */
  private findColIdxByName(
    name: string,
    colIdxToName: Map<number, string>,
  ): number {
    for (const [idx, colName] of colIdxToName) {
      if (colName === name) return idx;
    }
    return -1;
  }
}