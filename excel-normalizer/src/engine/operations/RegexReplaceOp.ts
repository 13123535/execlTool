/**
 * RegexReplaceOp — 正则替换
 *
 * 对指定列（或所有列）的文本值进行正则匹配并替换。
 *
 * 参数：
 *   - columnId : 目标列 ID（"*" 表示所有列，默认 "*"）
 *   - pattern  : 正则表达式（字符串形式）
 *   - replacement: 替换文本（支持 $1、$2 等捕获组引用）
 *   - flags    : 正则标志（如 "gi"），默认 "g"
 *
 * 示例：
 *   pattern="北京", replacement="北京市"
 *   → "北京海淀" → "北京市海淀"
 *
 *   pattern="(\\d{3})\\d{4}(\\d{4})", replacement="$1****$2"
 *   → "13812345678" → "138****5678"（手机号脱敏）
 *
 * undo 语义：
 *   execute 时保存 _beforeTable 原始表引用。
 *   undo 时直接返回原始表，零拷贝。
 */

import { BaseOperation } from "./Operation";
import type {
  NormalizedTable,
  SerializedOperation,
} from "../types";

/** RegexReplace 操作参数 */
interface RegexReplaceParams {
  columnId?: string;
  pattern: string;
  replacement: string;
  flags?: string;
}

export class RegexReplaceOp extends BaseOperation {
  readonly type = "regex_replace";
  readonly label: string;
  readonly detail: string;

  private columnId: string;
  private pattern: string;
  private replacement: string;
  private flags: string;
  /** 执行前的原始表引用，undo 时直接返回 */
  private _beforeTable: NormalizedTable | null = null;

  constructor(params: Record<string, unknown>) {
    super();
    const p = params as unknown as RegexReplaceParams;

    if (!p.pattern) {
      throw new Error("RegexReplaceOp: pattern 参数为必填项");
    }

    this.columnId = p.columnId ?? "*";
    this.pattern = p.pattern;
    this.replacement = p.replacement ?? "";
    this.flags = p.flags ?? "g";

    // 截断过长的 pattern/replacement 用于显示
    const shortPattern = this.pattern.length > 30
      ? this.pattern.slice(0, 30) + "…"
      : this.pattern;
    const shortReplacement = this.replacement.length > 20
      ? this.replacement.slice(0, 20) + "…"
      : this.replacement;

    const scope = this.columnId === "*" ? "所有列" : `列${this.columnId}`;
    this.label = `正则替换(${shortPattern})`;
    this.detail = `在${scope}中 /${this.pattern}/${this.flags} → "${shortReplacement}"`;
  }

  /**
   * 执行正则替换
   *
   * 算法：
   *   1. 保存原始表引用（用于 undo）
   *   2. 深拷贝原表
   *   3. 编译正则表达式
   *   4. 解析目标列
   *   5. 遍历每一行：字符串值 → replace(regex, replacement)
   *   6. 返回新表
   */
  execute(table: NormalizedTable): NormalizedTable {
    this._beforeTable = table;

    const result = this.cloneTable(table);
    const targetCols = this.resolveColumnIndices(result);

    let regex: RegExp;
    try {
      regex = new RegExp(this.pattern, this.flags);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`RegexReplaceOp: 正则表达式无效 - ${msg}`);
    }

    for (const colIdx of targetCols) {
      for (let ri = 0; ri < result.rows.length; ri++) {
        const cell = result.rows[ri].cells[colIdx];
        if (cell === undefined) continue;

        if (typeof cell.value === "string") {
          cell.value = cell.value.replace(regex, this.replacement);
        }
      }
    }

    return result;
  }

  /**
   * 撤销 RegexReplace
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
        pattern: this.pattern,
        replacement: this.replacement,
        flags: this.flags,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // 私有方法
  // ═══════════════════════════════════════════════════════════════

  private resolveColumnIndices(table: NormalizedTable): number[] {
    if (this.columnId === "*") {
      return table.columns.map((_, i) => i);
    }

    const idx = parseInt(this.columnId, 10);
    if (isNaN(idx) || idx < 0 || idx >= table.columns.length) {
      throw new Error(
        `RegexReplaceOp: 列索引 "${this.columnId}" 无效（共 ${table.columns.length} 列）`,
      );
    }
    return [idx];
  }
}