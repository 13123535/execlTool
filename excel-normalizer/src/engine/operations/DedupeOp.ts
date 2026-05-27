/**
 * DedupeOp — 按指定列去重
 *
 * 根据指定列的值判断是否重复，保留第一条或最后一条。
 *
 * 参数：
 *   - columnId: 用作去重判断的列 ID（必填，支持逗号分隔多列）
 *   - keep: 保留策略，默认 "first"
 *     - "first" : 保留第一次出现的行
 *     - "last"  : 保留最后一次出现的行
 *
 * 示例：
 *   列B = ["张三","李四","张三","王五"]，columnId="1", keep="first"
 *   → 保留行0、行1、行3（第2行"张三"重复被移除）
 *
 * undo 语义：
 *   execute 时保存 _beforeTable 原始表引用。
 *   undo 时直接返回原始表，零拷贝。
 */

import { BaseOperation } from "./Operation";
import type {
  NormalizedTable,
  SerializedOperation,
  CellValue,
} from "../types";

/** Dedupe 操作参数 */
interface DedupeParams {
  columnId: string;
  keep?: "first" | "last";
}

export class DedupeOp extends BaseOperation {
  readonly type = "dedupe";
  readonly label: string;
  readonly detail: string;

  private columnIds: number[];
  private keep: "first" | "last";
  /** 执行前的原始表引用，undo 时直接返回 */
  private _beforeTable: NormalizedTable | null = null;

  constructor(params: Record<string, unknown>) {
    super();
    const p = params as unknown as DedupeParams;

    if (!p.columnId) {
      throw new Error("DedupeOp: columnId 参数为必填项");
    }

    // 支持逗号分隔多列，如 "0,2"
    const colIds: number[] = [];
    for (const part of p.columnId.split(",")) {
      const idx = parseInt(part.trim(), 10);
      if (isNaN(idx) || idx < 0) {
        throw new Error(`DedupeOp: 列索引 "${part.trim()}" 无效`);
      }
      colIds.push(idx);
    }
    this.columnIds = colIds;
    this.keep = p.keep ?? "first";

    const colLabel = this.columnIds.length === 1
      ? `列${this.columnIds[0]}`
      : `列[${this.columnIds.join(",")}]`;
    const keepLabel = this.keep === "first" ? "保留第一条" : "保留最后一条";
    this.label = `按${colLabel}去重`;
    this.detail = `${keepLabel}，共 ${this.columnIds.length} 个去重列`;
  }

  /**
   * 执行去重
   *
   * 算法：
   *   1. 保存原始表引用（用于 undo）
   *   2. 深拷贝原表
   *   3. 按 keep 策略遍历行
   *      - "first": 正向遍历，用 Set 记录已出现的组合键，跳过重复
   *      - "last": 反向遍历，用 Set 记录已出现的组合键，跳过重复，最后反转
   *   4. 返回新表
   */
  execute(table: NormalizedTable): NormalizedTable {
    this._beforeTable = table;

    const result = this.cloneTable(table);
    const seen = new Set<string>();

    // 校验列索引有效
    const colCount = result.columns.length;
    for (const ci of this.columnIds) {
      if (ci >= colCount) {
        throw new Error(
          `DedupeOp: 列索引 ${ci} 越界（共 ${colCount} 列）`,
        );
      }
    }

    const allRows = result.rows;
    if (this.keep === "first") {
      result.rows = allRows.filter((row) => {
        const key = this.makeKey(row, this.columnIds);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    } else {
      // "last": 反向遍历
      const kept: NormalizedTable["rows"] = [];
      for (let ri = allRows.length - 1; ri >= 0; ri--) {
        const key = this.makeKey(allRows[ri], this.columnIds);
        if (seen.has(key)) continue;
        seen.add(key);
        kept.unshift(allRows[ri]);
      }
      result.rows = kept;
    }

    return result;
  }

  /**
   * 撤销 Dedupe
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
        columnId: this.columnIds.join(","),
        keep: this.keep,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // 私有方法
  // ═══════════════════════════════════════════════════════════════

  /**
   * 生成行的组合键
   *
   * 将指定列的单元格值拼接为唯一键字符串。
   * null 值统一用空字符串表示。
   */
  private makeKey(row: { cells: { value: CellValue }[] }, colIds: number[]): string {
    return colIds
      .map((ci) => {
        const cell = row.cells[ci];
        if (cell === undefined) return "";
        return cell.value === null ? "" : String(cell.value);
      })
      .join("\x00"); // NULL 字符作为分隔，避免值中包含逗号等常见分隔符冲突
  }
}