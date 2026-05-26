/**
 * TransformEngine — 变形/公式操作引擎
 *
 * 支持（Phase 3 起点）：
 *   - 工时计算：开始-结束时间差
 *   - 身份证解析：提取生日/性别/年龄/地区
 *   - 文本提取：从文本中提取手机号/邮箱/号码/正则匹配
 */

import type { WorkbookData, Operation, OperationType } from "../types";
import type { OperationEngine } from "./baseEngine";

type TransformType =
  | { type: "timeCalc"; startColumn: number; endColumn: number; outputColumn: number }
  | { type: "idCardParse"; columnIndex: number; outputs: ("birthday" | "gender" | "age" | "region")[] }
  | { type: "textExtract"; columnIndex: number; extractType: "phone" | "email" | "number" | "regex"; pattern?: string; outputColumn: number };

export interface TransformParams {
  transform: TransformType;
}

/** 工时计算（小时），支持跨天 */
function calcWorkHours(start: string, end: string): number {
  const parse = (s: string) => {
    const parts = s.split(":");
    return parseInt(parts[0]) * 60 + parseInt(parts[1] || "0");
  };
  const startMin = parse(start);
  let endMin = parse(end);
  if (endMin <= startMin) endMin += 24 * 60; // 跨天
  return (endMin - startMin) / 60;
}

/** 身份证解析 */
function parseIdCard(id: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (id.length !== 18 && id.length !== 15) return result;

  // 生日
  if (id.length === 18) {
    result.birthday = `${id.slice(6, 10)}-${id.slice(10, 12)}-${id.slice(12, 14)}`;
    result.gender = parseInt(id[16]) % 2 === 0 ? "女" : "男";
    const birthYear = parseInt(id.slice(6, 10));
    result.age = String(new Date().getFullYear() - birthYear);
  } else {
    result.birthday = `19${id.slice(6, 8)}-${id.slice(8, 10)}-${id.slice(10, 12)}`;
    result.gender = parseInt(id[14]) % 2 === 0 ? "女" : "男";
    const birthYear = 1900 + parseInt(id.slice(6, 8));
    result.age = String(new Date().getFullYear() - birthYear);
  }

  return result;
}

export class TransformEngine implements OperationEngine<TransformParams> {
  readonly type = "transform" as OperationType;

  execute(workbook: WorkbookData, operation: Operation<TransformParams>): WorkbookData {
    const { transform } = operation.params;
    const sheet = workbook.sheets[workbook.activeSheetIndex];
    if (!sheet) return workbook;

    const headers = { ...sheet.headers };
    const rows = sheet.rows.map(row => ({ ...row }));

    switch (transform.type) {
      case "timeCalc": {
        const { startColumn, endColumn, outputColumn } = transform;
        for (const row of rows) {
          const start = String(row[startColumn]?.value ?? "");
          const end = String(row[endColumn]?.value ?? "");
          const hours = (start && end) ? calcWorkHours(start, end) : null;
          row[outputColumn] = { value: hours != null ? Math.round(hours * 100) / 100 : null };
        }
        if (!headers[outputColumn]) headers[outputColumn] = "工时(h)";
        break;
      }

      case "idCardParse": {
        const { columnIndex, outputs } = transform;
        let colOffset = 0;
        for (const output of outputs) {
          const outCol = columnIndex + 1 + colOffset;
          for (const row of rows) {
            const id = String(row[columnIndex]?.value ?? "");
            const parsed = parseIdCard(id);
            row[outCol] = { value: parsed[output] ?? null };
          }
          const labels: Record<string, string> = { birthday: "生日", gender: "性别", age: "年龄", region: "地区" };
          headers[outCol] = labels[output] ?? output;
          colOffset++;
        }
        // 更新列数
        const newColCount = Math.max(sheet.meta.colCount, columnIndex + 1 + outputs.length);
        return {
          ...workbook,
          sheets: workbook.sheets.map((s, i) =>
            i === workbook.activeSheetIndex
              ? { ...s, headers, rows, meta: { ...s.meta, colCount: newColCount } }
              : s
          ),
        };
      }

      case "textExtract": {
        const { columnIndex, extractType, pattern, outputColumn } = transform;
        for (const row of rows) {
          const text = String(row[columnIndex]?.value ?? "");
          let result: string | null = null;
          switch (extractType) {
            case "phone": {
              const match = text.match(/1[3-9]\d{9}/);
              result = match ? match[0] : null;
              break;
            }
            case "email": {
              const match = text.match(/[\w.-]+@[\w.-]+\.\w+/);
              result = match ? match[0] : null;
              break;
            }
            case "number": {
              const match = text.match(/\d+/);
              result = match ? match[0] : null;
              break;
            }
            case "regex": {
              if (pattern) {
                try {
                  const match = text.match(new RegExp(pattern));
                  result = match ? match[0] : null;
                } catch {
                  result = null;
                }
              }
              break;
            }
          }
          row[outputColumn] = { value: result ?? null };
        }
        if (!headers[outputColumn]) headers[outputColumn] = `提取(${extractType})`;
        const newColCount = Math.max(sheet.meta.colCount, outputColumn + 1);
        return {
          ...workbook,
          sheets: workbook.sheets.map((s, i) =>
            i === workbook.activeSheetIndex
              ? { ...s, headers, rows, meta: { ...s.meta, colCount: newColCount } }
              : s
          ),
        };
      }
    }

    return {
      ...workbook,
      sheets: workbook.sheets.map((s, i) =>
        i === workbook.activeSheetIndex ? { ...s, headers, rows } : s
      ),
    };
  }

  validate(operation: Operation<TransformParams>): true | string {
    if (!operation.params.transform) return "需要指定变形操作";
    return true;
  }
}