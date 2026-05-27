/**
 * RemoveEmptyOp — 清除空行/空列
 *
 * 支持三种模式：
 *
 *   1. strict（严格模式）
 *      行的所有列值都为 null 或空字符串 "" 时，整行删除。
 *      适用场景：文件末尾空白行、段落间空行分隔符。风险极低。
 *
 *   2. key_columns + OR 逻辑
 *      用户指定若干关键列，只要其中任意一列值为空，整行删除。
 *      适用场景："姓名或电话，缺一个就删除"。
 *
 *   3. key_columns + AND 逻辑
 *      用户指定若干关键列，所有指定列都为空时才删除整行。
 *      适用场景："除非连备选联系方式都没有，才删除"。
 *
 * 辅助参数：
 *   - treatWhitespaceAsEmpty（默认 true）：空格、\t、\n 等视为空
 *   - removeEmptyCols（默认 false）：同时删除所有行为空的列
 *
 * 安全保护：
 *   - 拒绝删除所有行（至少保留1行）
 *   - 列模式下拒绝删除所有列（至少保留1列）
 *
 * undo 语义：
 *   execute 时保存 _beforeTable，undo 直接返回原始表。
 */

import { BaseOperation } from "./Operation";
import type { NormalizedTable, SerializedOperation, Cell } from "../types";

/** 删除模式 */
type RemoveMode = "strict" | "key_columns";
/** 关键列逻辑 */
type KeyLogic = "or" | "and";

interface RemoveEmptyParams {
  mode?: RemoveMode;
  keyColumnIds?: string[];
  logic?: KeyLogic;
  treatWhitespaceAsEmpty?: boolean;
  removeEmptyCols?: boolean;
}

export class RemoveEmptyOp extends BaseOperation {
  readonly type = "remove_empty";
  readonly label: string;
  readonly detail: string;

  private mode: RemoveMode;
  private keyColumnIds: string[];
  private logic: KeyLogic;
  private treatWhitespaceAsEmpty: boolean;
  private removeEmptyCols: boolean;
  private _beforeTable: NormalizedTable | null = null;

  constructor(params: Record<string, unknown>) {
    super();
    const p = params as RemoveEmptyParams;

    this.mode = p.mode ?? "strict";
    this.keyColumnIds = p.keyColumnIds ?? [];
    this.logic = p.logic ?? "or";
    this.treatWhitespaceAsEmpty = p.treatWhitespaceAsEmpty ?? true;
    this.removeEmptyCols = p.removeEmptyCols ?? false;

    // 生成友好标签
    if (this.mode === "strict") {
      this.label = "删除空行（严格模式）";
      this.detail = "删除整行全为空的数据";
    } else {
      const logicLabel = this.logic === "or" ? "任一为空→删除" : "全部为空→删除";
      this.label = `删除空行（${this.keyColumnIds.length}列${logicLabel}）`;
      this.detail = `关键列[${this.keyColumnIds.join(",")}] ${logicLabel}`;
    }
  }

  execute(table: NormalizedTable): NormalizedTable {
    this._beforeTable = table;
    const result = this.cloneTable(table);

    if (this.mode === "strict") {
      this.pruneRowsStrict(result);
    } else {
      this.pruneRowsByKeyColumns(result);
    }

    if (this.removeEmptyCols) {
      this.pruneCols(result);
    }

    return result;
  }

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
        mode: this.mode,
        keyColumnIds: this.keyColumnIds,
        logic: this.logic,
        treatWhitespaceAsEmpty: this.treatWhitespaceAsEmpty,
        removeEmptyCols: this.removeEmptyCols,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // 核心逻辑
  // ═══════════════════════════════════════════════════════════════

  /**
   * 判断 cell 是否为空值
   *
   * 当 treatWhitespaceAsEmpty = true 时：
   *   null / undefined / 空字符串 / 仅含空白字符 → 视为空
   * 当 treatWhitespaceAsEmpty = false 时：
   *   仅 null / undefined / 空字符串 → 视为空，" " 保留
   */
  private isEmptyCell(cell?: Cell): boolean {
    if (!cell || cell.value === null || cell.value === undefined) return true;
    const val = cell.value;
    if (typeof val === "string") {
      if (this.treatWhitespaceAsEmpty) {
        return val.trim() === "";
      }
      return val === "";
    }
    return false;
  }

  /**
   * 严格模式：所有列都为空 → 删除行
   */
  private pruneRowsStrict(table: NormalizedTable): void {
    if (table.rows.length <= 1) return;
    const newRows = table.rows.filter(
      (row) => !row.cells.every((cell) => this.isEmptyCell(cell)),
    );
    if (newRows.length > 0) {
      table.rows = newRows;
    }
  }

  /**
   * 关键列模式：按指定列判断
   *
   * OR 逻辑：任一关键列为空 → 删除
   * AND 逻辑：所有关键列都为空 → 删除
   */
  private pruneRowsByKeyColumns(table: NormalizedTable): void {
    if (table.rows.length <= 1 || this.keyColumnIds.length === 0) return;

    // 将 columnId（字符串索引）转为数字索引并校验
    const colIndices: number[] = [];
    for (const id of this.keyColumnIds) {
      const idx = parseInt(id, 10);
      if (
        !isNaN(idx) &&
        idx >= 0 &&
        idx < table.columns.length
      ) {
        colIndices.push(idx);
      }
    }
    if (colIndices.length === 0) return;

    const newRows = table.rows.filter((row) => {
      const cellStates = colIndices.map((ci) =>
        this.isEmptyCell(row.cells[ci]),
      );

      if (this.logic === "or") {
        // 任一为空 → 删（返回 false 表示过滤掉）
        return !cellStates.some((empty) => empty);
      } else {
        // 全部为空 → 删（返回 false 表示过滤掉）
        return !cellStates.every((empty) => empty);
      }
    });

    if (newRows.length > 0) {
      table.rows = newRows;
    }
  }

  /**
   * 判断整列是否为空
   */
  private isColEmpty(rows: { cells: Cell[] }[], colIdx: number): boolean {
    return rows.every((row) => this.isEmptyCell(row.cells[colIdx]));
  }

  /**
   * 删除空列（安全：至少保留1列）
   */
  private pruneCols(table: NormalizedTable): void {
    const colCount = table.columns.length;
    if (colCount <= 1) return;

    const indicesToKeep: number[] = [];
    for (let ci = 0; ci < colCount; ci++) {
      if (!this.isColEmpty(table.rows, ci)) {
        indicesToKeep.push(ci);
      }
    }
    if (indicesToKeep.length === 0) return;

    table.columns = indicesToKeep.map((i) => table.columns[i]);
    table.rows = table.rows.map((row) => {
      const newCells = indicesToKeep.map((i) => row.cells[i]);
      return { ...row, cells: newCells };
    });
  }
}