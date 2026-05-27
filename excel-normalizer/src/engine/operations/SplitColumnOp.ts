/**
 * SplitColumnOp — 拆分列
 *
 * 将一列按规则拆分为多列。支持三种模式：
 *   1. delimiter — 按分隔符拆分（如空格、逗号）
 *   2. widths    — 按固定字符宽度拆分
 *   3. regex     — 正则匹配 + 捕获组提取
 *
 * 示例（regex 模式）：
 *   输入：   "6盒[花香25顺丰/邮政空运（每盒125g）中果 14-17mm"
 *   正则：   /(\d+盒)?\[(.+?)\]\s*(\S+)\s+(\S+)/
 *   输出列： ["数量","描述","规格","尺寸"]
 *   结果：   ["6盒", "花香25顺丰/邮政空运（每盒125g）", "中果", "14-17mm"]
 *
 * 参数：
 *   - columnId: 源列索引
 *   - delimiter: 分隔符字符（delimiter 模式）
 *   - widths: 固定宽度数组（widths 模式）
 *   - pattern: 正则表达式字符串（regex 模式）
 *   - newColumnNames: 拆分后新增列名数组（源列保留，新增列插入其后）
 *   - maxParts: 最大拆分数（仅 delimiter 模式，0 = 不限制）
 *   - trimEach: 是否对每个拆分值去空格（默认 true）
 *
 * undo 语义：
 *   execute 时保存 _beforeTable 原始表引用。
 *   undo 时直接返回原始表，零拷贝。
 */

import { BaseOperation } from "./Operation";
import type {
  NormalizedTable,
  Column,
  Cell,
  SerializedOperation,
} from "../types";

/** SplitColumn 操作参数 */
interface SplitColumnParams {
  columnId: string;
  delimiter?: string;
  widths?: number[];
  pattern?: string;
  newColumnNames: string[];
  maxParts?: number;
  trimEach?: boolean;
}

type SplitMode = "delimiter" | "widths" | "regex";

export class SplitColumnOp extends BaseOperation {
  readonly type = "split_column";
  readonly label: string;
  readonly detail: string;

  private columnId: string;
  private delimiter?: string;
  private widths?: number[];
  private pattern?: string;
  private newColumnNames: string[];
  private maxParts: number;
  private trimEach: boolean;
  private mode: SplitMode;
  private regex?: RegExp;

  /** 执行前的原始表引用，undo 时直接返回，避免二次 clone */
  private _beforeTable: NormalizedTable | null = null;

  constructor(params: Record<string, unknown>) {
    super();
    const p = params as unknown as SplitColumnParams;

    // 参数校验
    this.columnId = p.columnId;
    this.delimiter = p.delimiter;
    this.widths = p.widths;
    this.pattern = p.pattern;
    this.newColumnNames = p.newColumnNames ?? [];
    this.maxParts = p.maxParts ?? 0;
    this.trimEach = p.trimEach ?? true;

    // 确定模式
    const modes: SplitMode[] = [];
    if (p.delimiter !== undefined) modes.push("delimiter");
    if (p.widths !== undefined) modes.push("widths");
    if (p.pattern !== undefined) modes.push("regex");

    if (modes.length !== 1) {
      throw new Error(
        `SplitColumnOp: 必须且只能指定 delimiter / widths / pattern 中的一个，当前有 ${modes.length} 个`,
      );
    }
    this.mode = modes[0];

    // regex 模式：编译正则
    if (this.mode === "regex" && this.pattern) {
      try {
        this.regex = new RegExp(this.pattern, "g");
      } catch {
        throw new Error(`SplitColumnOp: 无效的正则表达式——"${this.pattern}"`);
      }
    }

    this.label = `拆分列${this.columnId}(${this.mode})`;
    this.detail =
      this.mode === "regex"
        ? `正则提取 → ${this.newColumnNames.join(", ")}`
        : `拆分为 ${this.newColumnNames.length} 列`;
  }

  /**
   * 执行拆分
   *
   * 算法（通用）：
   *   1. 保存原始表引用（undo 零拷贝）
   *   2. 深拷贝原表
   *   3. 在源列之后插入 newColumnNames.length 个新列
   *   4. 更新所有列索引
   *   5. 对每一行按选定模式拆分 → 填充到源列 + 新增列
   *   6. 超出拆分结果的部分填充 null
   */
  execute(table: NormalizedTable): NormalizedTable {
    this._beforeTable = table;

    const colIdx = this.resolveColumnIndex(table);
    const result = this.cloneTable(table);

    // Step 1: 在源列之后插入新列（从后往前插，索引不乱）
    for (let i = this.newColumnNames.length - 1; i >= 0; i--) {
      const newCol: Column = {
        id: `split_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        name: this.newColumnNames[i],
        dtype: "text",
        isKey: false,
      };
      result.columns.splice(colIdx + 1, 0, newCol);
    }

    // Step 2: 列已按 splice 插入顺序排列，无需额外操作

    // Step 3: 逐行拆分
    const totalTargetCols = 1 + this.newColumnNames.length; // 源列 + 新增列
    for (const row of result.rows) {
      const sourceStr = this.getCellString(row.cells[colIdx]);
      const parts = this.splitValue(sourceStr);

      // 在 row.cells 的 colIdx+1 处插入新 cell 占位
      const newCells: Cell[] = [];
      for (let i = 0; i < this.newColumnNames.length; i++) {
        newCells.push({
          value: null,
          isVirtual: false,
          sourceRef: null,
        });
      }
      row.cells.splice(colIdx + 1, 0, ...newCells);

      // 填充所有目标列
      for (let i = 0; i < totalTargetCols; i++) {
        let val: string | number | null = parts[i] ?? null;
        if (typeof val === "string" && this.trimEach) {
          val = val.trim();
        }
        row.cells[colIdx + i].value = val;
      }
    }

    return result;
  }

  /**
   * 撤销拆分
   *
   * 直接返回 execute 时保存的原始表引用（零拷贝）。
   */
  undo(_table: NormalizedTable): NormalizedTable {
    if (this._beforeTable) {
      return this._beforeTable;
    }
    return _table;
  }

  serialize(): SerializedOperation {
    return {
      type: this.type,
      params: {
        columnId: this.columnId,
        delimiter: this.delimiter,
        widths: this.widths,
        pattern: this.pattern,
        newColumnNames: this.newColumnNames,
        maxParts: this.maxParts,
        trimEach: this.trimEach,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // 拆分核心
  // ═══════════════════════════════════════════════════════════════

  /**
   * 按当前模式拆分单个值
   */
  private splitValue(value: string): string[] {
    switch (this.mode) {
      case "delimiter":
        return this.splitByDelimiter(value);
      case "widths":
        return this.splitByWidths(value);
      case "regex":
        return this.splitByRegex(value);
      default:
        return [];
    }
  }

  /**
   * 模式1：按分隔符拆分
   */
  private splitByDelimiter(value: string): string[] {
    if (!value) return [];
    const delim = this.delimiter!;
    if (this.maxParts > 0) {
      const parts = value.split(delim);
      if (parts.length <= this.maxParts) return parts;
      // 前 maxParts-1 项正常拆分，尾部保持原样
      return [
        ...parts.slice(0, this.maxParts - 1),
        parts.slice(this.maxParts - 1).join(delim),
      ];
    }
    return value.split(delim);
  }

  /**
   * 模式2：按固定宽度拆分
   */
  private splitByWidths(value: string): string[] {
    const result: string[] = [];
    let pos = 0;
    for (const w of this.widths!) {
      result.push(value.slice(pos, pos + w));
      pos += w;
    }
    // 剩余部分作为最后一个值
    if (pos < value.length) {
      result.push(value.slice(pos));
    }
    return result;
  }

  /**
   * 模式3：正则匹配 + 捕获组提取
   *
   * 对每个 cell 值执行正则 exec，提取所有捕获组。
   * 如果一行有多个 match，取最后一个（适合"提取关键字段"场景）。
   * 如果无匹配，返回空数组 → 所有输出列填 null。
   */
  private splitByRegex(value: string): string[] {
    if (!value || !this.regex) return [];

    const parts: string[] = [];
    let match: RegExpExecArray | null;

    // 重置 lastIndex（全局匹配标志）
    this.regex.lastIndex = 0;

    // 取所有匹配，保留最后一组
    while ((match = this.regex.exec(value)) !== null) {
      // 丢弃 match[0]（完整匹配），提取捕获组 match[1..]
      parts.length = 0;
      for (let i = 1; i < match.length; i++) {
        parts.push(match[i] ?? "");
      }
    }

    return parts;
  }

  // ═══════════════════════════════════════════════════════════════
  // 工具方法
  // ═══════════════════════════════════════════════════════════════

  /**
   * 安全获取 cell 的字符串值
   */
  private getCellString(cell?: Cell): string {
    if (!cell || cell.value === null || cell.value === undefined) return "";
    return String(cell.value);
  }

  /**
   * 解析 columnId → 列索引
   */
  private resolveColumnIndex(table: NormalizedTable): number {
    const idx = parseInt(this.columnId, 10);
    if (isNaN(idx) || idx < 0 || idx >= table.columns.length) {
      throw new Error(
        `SplitColumnOp: 列索引 "${this.columnId}" 无效（共 ${table.columns.length} 列）`,
      );
    }
    return idx;
  }
}