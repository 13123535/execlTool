/**
 * CleanEngine — 数据清洗引擎
 *
 * 支持：
 *   - trim: 去除首尾空白
 *   - cleanWhitespace: 清除不可见字符
 *   - case: 大小写转换 (upper/lower/title)
 *   - fullwidth→halfwidth: 全角转半角
 *   - replace: 正则替换
 *   - mask: 数据脱敏（手机号/身份证/姓名/自定义）
 */

import type { WorkbookData, Operation, OperationType } from "../types";
import type { OperationEngine } from "./baseEngine";

type CleanAction =
  | { action: "trim"; columnIndex: number }
  | { action: "cleanWhitespace"; columnIndex: number }
  | { action: "case"; columnIndex: number; to: "upper" | "lower" | "title" }
  | { action: "fullwidthToHalfwidth"; columnIndex: number }
  | { action: "replace"; columnIndex: number; pattern: string; replacement: string; isRegex: boolean }
  | { action: "mask"; columnIndex: number; maskType: "phone" | "idcard" | "name" | "custom"; pattern?: string; replacement?: string };

export interface CleanParams {
  action: CleanAction;
}

/** 全角字符转半角 */
function fullwidthToHalfwidth(str: string): string {
  return str.replace(/[\uFF01-\uFF5E]/g, ch =>
    String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
  ).replace(/\u3000/g, " "); // 全角空格
}

/** Title Case */
function toTitleCase(str: string): string {
  return str.replace(/\w\S*/g, word =>
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  );
}

export class CleanEngine implements OperationEngine<CleanParams> {
  readonly type = "clean" as OperationType;

  execute(workbook: WorkbookData, operation: Operation<CleanParams>): WorkbookData {
    const { action } = operation.params;
    const sheet = workbook.sheets[workbook.activeSheetIndex];
    if (!sheet) return workbook;

    const rows = sheet.rows.map(row => {
      const newRow = { ...row };
      const cell = newRow[action.columnIndex];
      if (!cell) return newRow;

      const strVal = String(cell.value ?? "");
      let result: string | number | boolean | null = cell.value;

      switch (action.action) {
        case "trim":
          result = strVal.trim();
          break;

        case "cleanWhitespace":
          result = strVal.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim();
          break;

        case "case":
          switch (action.to) {
            case "upper": result = strVal.toUpperCase(); break;
            case "lower": result = strVal.toLowerCase(); break;
            case "title": result = toTitleCase(strVal); break;
          }
          break;

        case "fullwidthToHalfwidth":
          result = fullwidthToHalfwidth(strVal);
          break;

        case "replace": {
          try {
            const pattern = action.isRegex ? new RegExp(action.pattern, "g") : action.pattern;
            result = strVal.replace(pattern, action.replacement);
          } catch {
            result = strVal;
          }
          break;
        }

        case "mask": {
          result = strVal;
          const { maskType, pattern, replacement } = action;
          if (maskType === "phone") {
            result = strVal.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2");
          } else if (maskType === "idcard") {
            result = strVal.replace(/(\d{6})\d{8}(\d{4})/, "$1********$2");
          } else if (maskType === "name") {
            result = strVal.replace(/(.)(.*)/, "$1*");
          } else if (maskType === "custom" && pattern && replacement != null) {
            try {
              const re = new RegExp(pattern, "g");
              result = strVal.replace(re, replacement);
            } catch {
              // keep original
            }
          }
          break;
        }
      }

      newRow[action.columnIndex] = { value: result };
      return newRow;
    });

    return {
      ...workbook,
      sheets: workbook.sheets.map((s, i) =>
        i === workbook.activeSheetIndex ? { ...s, rows } : s
      ),
    };
  }

  validate(operation: Operation<CleanParams>): true | string {
    if (!operation.params.action) return "需要指定清洗操作动作";
    return true;
  }
}