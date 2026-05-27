/**
 * NormalizeWidthOp — 全角半角统一
 *
 * 将全角字符转换为半角字符，主要处理：
 *   - 全角字母：ａ~ｚ → a~z，Ａ~Ｚ → A~Z
 *   - 全角数字：０~９ → 0~9
 *   - 全角标点：，。！＂＃＄％＆＇（）＊＋，－．／：；＜＝＞？＠［＼］＾＿｀｛｜｝～
 *              → ,.!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~
 *   - 全角空格　(U+3000) → 半角空格 (U+0020)
 *
 * 参数：
 *   - columnId: 目标列 ID（"*" 表示所有列，默认 "*"）
 *   - target  : 转换目标，默认 "all"
 *     - "all"      : 字母 + 数字 + 标点 + 空格
 *     - "letter"   : 仅字母
 *     - "number"   : 仅数字
 *     - "punctuation": 仅标点 + 空格
 *
 * 示例：
 *   "ＡＢＣ１２３" → "ABC123"
 *   "你好，世界！" → "你好,世界!"
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

/** NormalizeWidth 操作参数 */
interface NormalizeWidthParams {
  columnId?: string;
  target?: "all" | "letter" | "number" | "punctuation";
}

/** 全角到半角的 Unicode 偏移常数 */
const FULLWIDTH_OFFSET = 0xFEE0;

export class NormalizeWidthOp extends BaseOperation {
  readonly type = "normalize_width";
  readonly label: string;
  readonly detail: string;

  private columnId: string;
  private target: "all" | "letter" | "number" | "punctuation";
  /** 执行前的原始表引用，undo 时直接返回 */
  private _beforeTable: NormalizedTable | null = null;

  constructor(params: Record<string, unknown>) {
    super();
    const p = params as unknown as NormalizeWidthParams;
    this.columnId = p.columnId ?? "*";
    this.target = p.target ?? "all";

    const targetLabel: Record<string, string> = {
      all: "字母+数字+标点",
      letter: "字母",
      number: "数字",
      punctuation: "标点+空格",
    };
    const scope = this.columnId === "*" ? "所有列" : `列${this.columnId}`;
    this.label = `全角转半角(${targetLabel[this.target]})`;
    this.detail = `在${scope}中转换${targetLabel[this.target]}全角→半角`;
  }

  /**
   * 执行全角转半角
   *
   * 算法：
   *   1. 保存原始表引用（用于 undo）
   *   2. 深拷贝原表
   *   3. 解析目标列
   *   4. 遍历每一行：字符串值 → 逐个字符检查并转换
   *   5. 返回新表
   */
  execute(table: NormalizedTable): NormalizedTable {
    this._beforeTable = table;

    const result = this.cloneTable(table);
    const targetCols = this.resolveColumnIndices(result);

    for (const colIdx of targetCols) {
      for (let ri = 0; ri < result.rows.length; ri++) {
        const cell = result.rows[ri].cells[colIdx];
        if (cell === undefined) continue;

        if (typeof cell.value === "string") {
          cell.value = this.convertString(cell.value);
        }
      }
    }

    return result;
  }

  /**
   * 撤销 NormalizeWidth
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
        target: this.target,
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
        `NormalizeWidthOp: 列索引 "${this.columnId}" 无效（共 ${table.columns.length} 列）`,
      );
    }
    return [idx];
  }

  /**
   * 将字符串中的全角字符转换为半角
   */
  private convertString(s: string): string {
    const chars: string[] = [];
    for (let i = 0; i < s.length; i++) {
      chars.push(this.convertChar(s.charCodeAt(i)));
    }
    return chars.join("");
  }

  /**
   * 转换单个字符
   *
   * Unicode 全角字符范围：
   *   - FF01~FF5E: 全角标点+数字+字母（对应半角 0x21~0x7E）
   *   - FF10~FF19: 全角数字 0~9
   *   - FF21~FF3A: 全角大写字母 A~Z
   *   - FF41~FF5A: 全角小写字母 a~z
   *   - 3000     : 全角空格（IDEOGRAPHIC SPACE）
   */
  private convertChar(code: number): string {
    // 全角空格 → 半角空格
    if (code === 0x3000) {
      if (this.target === "all" || this.target === "punctuation") {
        return " ";
      }
      return String.fromCharCode(code);
    }

    // 全角范围 FF01~FF5E → 半角 0x21~0x7E
    if (code >= 0xFF01 && code <= 0xFF5E) {
      // 根据 target 判断是否转换
      if (this.target === "all") {
        return String.fromCharCode(code - FULLWIDTH_OFFSET);
      }
      if (this.target === "letter" && this.isFullwidthLetter(code)) {
        return String.fromCharCode(code - FULLWIDTH_OFFSET);
      }
      if (this.target === "number" && this.isFullwidthDigit(code)) {
        return String.fromCharCode(code - FULLWIDTH_OFFSET);
      }
      if (this.target === "punctuation" && !this.isFullwidthLetter(code) && !this.isFullwidthDigit(code)) {
        return String.fromCharCode(code - FULLWIDTH_OFFSET);
      }
    }

    // 不需要转换的字符保持原样
    return String.fromCharCode(code);
  }

  /** 判断是否为全角字母（A-Z 或 a-z） */
  private isFullwidthLetter(code: number): boolean {
    return (code >= 0xFF21 && code <= 0xFF3A) || (code >= 0xFF41 && code <= 0xFF5A);
  }

  /** 判断是否为全角数字（0-9） */
  private isFullwidthDigit(code: number): boolean {
    return code >= 0xFF10 && code <= 0xFF19;
  }
}