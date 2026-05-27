/**
 * ExplodeOp — 按分隔符展开为新列
 *
 * 将多值列（如 "苹果,香蕉,橙子"）按分隔符拆分，
 * 每个拆分出的值自动在原列之后开辟一个新列。
 *
 * 示例：
 *   col0 = "a,b,c", col1 = "x"
 *   → col0 = "a", col0_1 = "b", col0_2 = "c", col1 = "x"（同一行，新增2列）
 *
 * 参数：
 *   - columnId: 要展开的列索引
 *   - separator: 分隔符（默认逗号 ","）
 *   - trim: 是否去除展开后值的首尾空格（默认 true）
 */

import { BaseOperation } from "./Operation";
import type {
  NormalizedTable,
  SerializedOperation,
  Column,
} from "../types";

/** Explode 操作参数 */
interface ExplodeParams {
  columnId: string;
  separator?: string;
  trim?: boolean;
}

export class ExplodeOp extends BaseOperation {
  readonly type = "explode";
  readonly label: string;
  readonly detail: string;

  private columnId: string;
  private separator: string;
  private shouldTrim: boolean;
  /** 执行前的原始表引用，undo 时直接返回 */
  private _beforeTable: NormalizedTable | null = null;

  constructor(params: Record<string, unknown>) {
    super();
    const p = params as unknown as ExplodeParams;
    this.columnId = p.columnId;
    this.separator = p.separator ?? ",";
    this.shouldTrim = p.trim ?? true;
    this.label = `分隔展开列${this.columnId}`;
    this.detail = `按分隔符"${this.separator}"将列${this.columnId}展开为新列`;
  }

  /**
   * 执行分隔展开（开辟新列模式）
   *
   * 算法：
   *   1. 保存原始表引用（用于 undo）
   *   2. 扫描全表目标列，确定最大拆分份数 maxParts
   *   3. 在原列之后插入 (maxParts-1) 个新列
   *   4. 遍历每行：拆分原值 → 第一个值保留在原列，其余填入新列
   *   5. 不足 maxParts 的行，新列填空字符串
   *   6. 返回新表
   */
  execute(table: NormalizedTable): NormalizedTable {
    this._beforeTable = table;

    const colIdx = parseInt(this.columnId, 10);
    if (isNaN(colIdx) || colIdx < 0 || colIdx >= table.columns.length) {
      throw new Error(
        `列索引 "${this.columnId}" 无效（共 ${table.columns.length} 列）`,
      );
    }

    const originalColName = table.columns[colIdx].name;

    // ── 第1步：扫描全表，找出最大拆分份数 ──
    let maxParts = 1;
    for (const row of table.rows) {
      const cell = row.cells[colIdx];
      if (cell && cell.value !== null && cell.value !== undefined) {
        const rawValue = String(cell.value);
        if (rawValue.length === 0) continue;
        const parts = rawValue.split(this.separator);
        if (parts.length > maxParts) maxParts = parts.length;
      }
    }

    if (maxParts <= 1) {
      // 无拆分点，返回原表（不可变拷贝）
      return this.cloneTable(table);
    }

    // ── 第2步：在原列之后插入新列 ──
    const newCols: Column[] = table.columns.map((c) => ({ ...c }));
    for (let i = 1; i < maxParts; i++) {
      newCols.splice(colIdx + i, 0, {
        id: `${originalColName}_${i}`,
        name: `${originalColName}_${i}`,
        dtype: table.columns[colIdx].dtype,
        isKey: false,
      });
    }

    // ── 第3步：拆分每行，填入新列 ──
    const newRows = table.rows.map((row) => {
      const cell = row.cells[colIdx];
      const rawValue = cell?.value;
      const strVal =
        rawValue !== null && rawValue !== undefined ? String(rawValue) : "";
      const parts =
        strVal.length > 0 ? strVal.split(this.separator) : [];

      const newCells = [...row.cells];

      // 原列取第一个值
      if (parts.length > 0) {
        const firstVal = this.shouldTrim ? parts[0].trim() : parts[0];
        newCells[colIdx] = {
          value: this.parseValue(firstVal),
          isVirtual: false,
          sourceRef: null,
        };
      } else {
        newCells[colIdx] = {
          value: "",
          isVirtual: false,
          sourceRef: null,
        };
      }

      // 后续列依次填入，不足的填空
      for (let i = 1; i < maxParts; i++) {
        const part = i < parts.length ? parts[i] : "";
        const val = this.shouldTrim ? part.trim() : part;
        newCells.splice(colIdx + i, 0, {
          value: this.parseValue(val),
          isVirtual: false,
          sourceRef: null,
        });
      }

      return { ...row, cells: newCells, isVirtual: false };
    });

    return {
      columns: newCols,
      rows: newRows,
      originalFileName: table.originalFileName,
      sheetName: table.sheetName,
    };
  }

  /**
   * 撤销分隔展开
   *
   * 直接返回操作前的原始表（零拷贝还原）。
   */
  undo(_table: NormalizedTable): NormalizedTable {
    if (!this._beforeTable) {
      throw new Error("无法撤销：没有保存操作前的表格");
    }
    return this._beforeTable;
  }

  serialize(): SerializedOperation {
    return {
      type: this.type,
      params: {
        columnId: this.columnId,
        separator: this.separator,
        trim: this.shouldTrim,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════
  // 工具方法
  // ═══════════════════════════════════════════════════════════

  /** 将字符串解析为数字（如果是数字格式的话） */
  private parseValue(value: string): string | number {
    const trimmed = value.trim();
    if (/^-?\d+$/.test(trimmed)) {
      return parseInt(trimmed, 10);
    }
    if (/^-?\d+\.\d+$/.test(trimmed)) {
      return parseFloat(trimmed);
    }
    return value;
  }
}