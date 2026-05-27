/**
 * CollapseOp — 按列合并（逆分隔展开）
 *
 * 将指定 key 列中值相同的行合并为一行。
 * 选中拼接列的值按指定分隔符拼接；未选中的列保留第一条行的值。
 * 是 ExplodeOp 的逆操作。
 *
 * 示例 (key col="0", concat cols="1", separator=",")：
 *   col0 | col1 | col2
 *   广东  | 深圳 | 440300
 *   广东  | 广州 | 440100
 *   江苏  | 南京 | 320100
 *   →
 *   广东  | 深圳,广州 | 440300
 *   江苏  | 南京      | 320100
 *
 * @module CollapseOp
 */

import { BaseOperation } from "./Operation";
import type {
  NormalizedTable,
  SerializedOperation,
  Row,
  CellValue,
} from "../types";

/** Collapse 操作参数 */
interface CollapseParams {
  /** 分组依据列 */
  columnId: string;
  /** 拼接分隔符 */
  separator?: string;
  /** 需要按分隔符拼接值的列 ID 列表 */
  concatColumnIds?: string[];
}

export class CollapseOp extends BaseOperation {
  readonly type = "collapse";
  readonly label: string;
  readonly detail: string;

  private columnId: string;
  private separator: string;
  private concatColumnIds: string[];

  /** execute 时保存原始 rows 深拷贝，用于 undo 恢复 */
  private _originalRows: Row[] | null = null;

  constructor(params: Record<string, unknown>) {
    super();
    const p = params as unknown as CollapseParams;
    this.columnId = p.columnId;
    this.separator = p.separator ?? ",";
    this.concatColumnIds = p.concatColumnIds ?? [];

    this.label = `按列合并`;
    this.detail = `将「${this.columnId}」列值相同的行合并为一行（逆分隔展开）`;
  }

  // ═══════════════════════════════════════════════════════════
  // execute
  // ═══════════════════════════════════════════════════════════

  execute(table: NormalizedTable): NormalizedTable {
    const keyColIdx = this.resolveColIndex(table);

    // 解析 concatColumnIds 为索引
    const concatIndices = this.concatColumnIds
      .map((id) => this.resolveColIndex(table, id))
      .filter((idx) => idx !== keyColIdx); // 排除 key 列本身

    // 深拷贝，保存原始 rows 用于 undo
    const result = this.cloneTable(table);
    this._originalRows = result.rows.map((row) => ({
      ...row,
      cells: row.cells.map((cell) => ({ ...cell })),
    }));

    if (result.rows.length === 0) return result;

    // 按 key 列分组（保持原序，同 key 连续或分散都合并）
    const groups = new Map<CellValue, Row[]>();
    const groupOrder: CellValue[] = [];

    for (const row of result.rows) {
      const key = this.getCellValue(row, keyColIdx);
      const keyStr = String(key ?? ""); // Map key 用字符串
      const existing = groups.get(keyStr);
      if (existing) {
        existing.push(row);
      } else {
        groups.set(keyStr, [row]);
        groupOrder.push(keyStr);
      }
    }

    // 构建合并后的行
    const mergedRows: Row[] = [];

    for (const keyStr of groupOrder) {
      const group = groups.get(keyStr)!;
      const firstRow = group[0]!;

      const newCells = firstRow.cells.map((cell, colIdx) => {
        // key 列：保留第一个值
        if (colIdx === keyColIdx) {
          return { ...cell, value: cell.value };
        }

        // 拼接列：合并所有行该列的非空值
        if (concatIndices.includes(colIdx)) {
          const values: string[] = [];
          for (const row of group) {
            const v = row.cells[colIdx]?.value;
            if (v !== null && v !== undefined && String(v).trim() !== "") {
              values.push(String(v));
            }
          }
          return {
            ...cell,
            value: values.length > 0 ? values.join(this.separator) : null,
          };
        }

        // 其他列：保留第一行的值
        return { ...cell, value: cell.value };
      });

      mergedRows.push({
        ...firstRow,
        cells: newCells,
        isVirtual: false,
      });
    }

    return { ...result, rows: mergedRows };
  }

  // ═══════════════════════════════════════════════════════════
  // undo
  // ═══════════════════════════════════════════════════════════

  undo(table: NormalizedTable): NormalizedTable {
    if (!this._originalRows) {
      return this.cloneTable(table);
    }
    return { ...table, rows: this._originalRows };
  }

  // ═══════════════════════════════════════════════════════════
  // serialize
  // ═══════════════════════════════════════════════════════════

  serialize(): SerializedOperation {
    return {
      type: this.type,
      params: {
        columnId: this.columnId,
        separator: this.separator,
        concatColumnIds: this.concatColumnIds,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════
  // 私有方法
  // ═══════════════════════════════════════════════════════════

  /** columnId → 数组下标（按表当前列顺序） */
  private resolveColIndex(table: NormalizedTable, colId?: string): number {
    const targetId = colId ?? this.columnId;
    // 先尝试按列名匹配
    const byName = table.columns.findIndex((c) => c.name === targetId);
    if (byName !== -1) return byName;
    // 再尝试按索引
    const idx = parseInt(targetId, 10);
    if (!isNaN(idx) && idx >= 0 && idx < table.columns.length) {
      return idx;
    }
    throw new Error(
      `CollapseOp: 列 "${targetId}" 无效（共 ${table.columns.length} 列）`,
    );
  }

  /** 安全获取单元格值 */
  private getCellValue(row: Row, colIdx: number): CellValue {
    const cell = row.cells[colIdx];
    return cell ? cell.value : null;
  }
}