/**
 * ExplodeOp — 按分隔符展开列
 *
 * 将多值列（如 "苹果,香蕉,橙子"）按分隔符拆分为多行。
 *
 * 示例：
 *   A1=苹果,香蕉   B1=水果
 *   → A1=苹果  B1=水果  (isVirtual=false)
 *     A2=香蕉  B1=水果  (isVirtual=true, 来源 A1)
 *
 * 参数：
 *   - columnId: 要展开的列
 *   - separator: 分隔符（默认逗号 ","）
 *   - trim: 是否去除展开后值的首尾空格（默认 true）
 */

import { BaseOperation } from "./Operation";
import type {
  NormalizedTable,
  SerializedOperation,
  Row,
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

  constructor(params: Record<string, unknown>) {
    super();
    const p = params as unknown as ExplodeParams;
    this.columnId = p.columnId;
    this.separator = p.separator ?? ",";
    this.shouldTrim = p.trim ?? true;
    this.label = `按列${this.columnId}展开`;
    this.detail = `分隔符 "${this.separator}" 展开（列${this.columnId}）`;
  }

  /**
   * 执行展开
   *
   * 算法：
   *   1. 拷贝 columns 和 rows
   *   2. 遍历每一行：
   *      a. 取目标列的单元格值
   *      b. 按分隔符 split
   *      c. 第一个值：替换原行单元格，isVirtual=false
   *      d. 其余值：插入新行，isVirtual=true，sourceRef=原行号
   *   3. 返回新表
   */
  execute(table: NormalizedTable): NormalizedTable {
    const colIdx = parseInt(this.columnId, 10);

    if (isNaN(colIdx) || colIdx < 0 || colIdx >= table.columns.length) {
      throw new Error(`列索引 "${this.columnId}" 无效（共 ${table.columns.length} 列）`);
    }

    const newRows: Row[] = [];
    let rowId = 0;

    for (const row of table.rows) {
      const cell = row.cells[colIdx];
      if (!cell || cell.value === null || cell.value === "") {
        // 空值：直接保留原行
        newRows.push({
          ...this.cloneRow(row),
          id: rowId++,
        });
        continue;
      }

      const rawValue = String(cell.value);
      const parts = rawValue.split(this.separator);

      if (parts.length <= 1) {
        // 没有分隔符：保留原行
        newRows.push({
          ...this.cloneRow(row),
          id: rowId++,
        });
        continue;
      }

      // 有多个值：展开
      const sourceRef = `R${row.id}`;

      for (let i = 0; i < parts.length; i++) {
        let part = parts[i];
        if (this.shouldTrim) {
          part = part.trim();
        }

        // 解析为数字（如果是数字）
        const parsedValue = this.parseValue(part);

        const newRow = this.cloneRow(row);
        newRow.id = rowId++;
        newRow.cells[colIdx] = {
          value: parsedValue,
          isVirtual: i > 0, // 第一个保持原始行标记，其余是虚拟行
          sourceRef: i > 0 ? sourceRef : null,
        };

        if (i > 0) {
          newRow.isVirtual = true;
        }

        newRows.push(newRow);
      }
    }

    return {
      columns: structuredClone(table.columns),
      rows: newRows,
      originalFileName: table.originalFileName,
      sheetName: table.sheetName,
    };
  }

  /**
   * 撤销展开
   *
   * 将同一 sourceRef 的虚拟行合并回原行。
   * 算法：
   *   1. 按 sourceRef 分组（null = 原始行，其他 = 虚拟行）
   *   2. 对于每组，合并对应列的值（用原分隔符连接）
   *   3. 返回合并后的行
   */
  undo(table: NormalizedTable): NormalizedTable {
    const colIdx = parseInt(this.columnId, 10);

    // sourceRef → group of rows
    const groups = new Map<string | null, Row[]>();

    for (const row of table.rows) {
      const cell = row.cells[colIdx];
      const key = cell?.sourceRef ?? null;

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(row);
    }

    const mergedRows: Row[] = [];
    let rowId = 0;

    for (const [sourceRef, rows] of groups) {
      if (sourceRef === null) {
        // 没有来源的原始/独立行：直接保留
        for (const row of rows) {
          mergedRows.push({
            ...row,
            id: rowId++,
            isVirtual: false,
          });
        }
      } else {
        // 虚拟行组：将值合并回一行
        // 找第一行作为模板
        const template = rows[0];
        const parts: string[] = [];

        for (const row of rows) {
          const cell = row.cells[colIdx];
          if (cell && cell.value !== null) {
            parts.push(String(cell.value));
          }
        }

        template.cells[colIdx] = {
          value: parts.join(this.separator),
          isVirtual: false,
          sourceRef: null,
        };
        template.id = rowId++;
        template.isVirtual = false;
        mergedRows.push(template);
      }
    }

    return {
      columns: structuredClone(table.columns),
      rows: mergedRows,
      originalFileName: table.originalFileName,
      sheetName: table.sheetName,
    };
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

  /** 深拷贝一行 */
  private cloneRow(row: Row): Row {
    return {
      id: row.id,
      isVirtual: row.isVirtual,
      cells: row.cells.map((cell) => ({
        value: cell.value,
        isVirtual: cell.isVirtual,
        sourceRef: cell.sourceRef,
      })),
    };
  }

  /** 将字符串解析为数字（如果是数字格式的话） */
  private parseValue(value: string): string | number {
    const trimmed = value.trim();
    // 整数
    if (/^-?\d+$/.test(trimmed)) {
      return parseInt(trimmed, 10);
    }
    // 浮点数
    if (/^-?\d+\.\d+$/.test(trimmed)) {
      return parseFloat(trimmed);
    }
    return value;
  }
}