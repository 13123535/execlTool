/**
 * ClusterEngine — 聚类/智能分组引擎
 *
 * 支持（Phase 3 起点）：
 *   - 文本聚类：按文本相似度自动分组（基于字符重叠度）
 *   - 异常检测：找出偏离均值的数值行
 */

import type { WorkbookData, Operation, OperationType } from "../types";
import type { OperationEngine } from "./baseEngine";

type ClusterAction =
  | { action: "textCluster"; columnIndex: number; threshold: number; outputColumn: number }
  | { action: "outlierDetect"; columnIndex: number; multiplier: number; markerColumn: number };

export interface ClusterParams {
  action: ClusterAction;
}

/** Jaccard 相似度（基于字符集合） */
function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.replace(/\s+/g, "").toLowerCase());
  const setB = new Set(b.replace(/\s+/g, "").toLowerCase());
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 1 : intersection.size / union.size;
}

export class ClusterEngine implements OperationEngine<ClusterParams> {
  readonly type = "cluster" as OperationType;

  execute(workbook: WorkbookData, operation: Operation<ClusterParams>): WorkbookData {
    const { action } = operation.params;
    const sheet = workbook.sheets[workbook.activeSheetIndex];
    if (!sheet) return workbook;

    const headers = { ...sheet.headers };
    const rows = sheet.rows.map(row => ({ ...row }));

    switch (action.action) {
      case "textCluster": {
        const { columnIndex, threshold, outputColumn } = action;
        let nextGroupId = 1;
        const groups: number[] = new Array(rows.length).fill(0);

        for (let i = 0; i < rows.length; i++) {
          if (groups[i] > 0) continue;

          groups[i] = nextGroupId;
          const refValue = String(rows[i][columnIndex]?.value ?? "");

          for (let j = i + 1; j < rows.length; j++) {
            if (groups[j] > 0) continue;
            const cmpValue = String(rows[j][columnIndex]?.value ?? "");
            const similarity = jaccardSimilarity(refValue, cmpValue);
            if (similarity >= threshold) {
              groups[j] = nextGroupId;
            }
          }
          nextGroupId++;
        }

        for (let i = 0; i < rows.length; i++) {
          rows[i][outputColumn] = { value: `组${groups[i]}` };
        }

        headers[outputColumn] = "聚类分组";
        const newColCount = Math.max(sheet.meta.colCount, outputColumn + 1);
        return {
          ...workbook,
          sheets: workbook.sheets.map((s, idx) =>
            idx === workbook.activeSheetIndex
              ? { ...s, headers, rows, meta: { ...s.meta, colCount: newColCount } }
              : s
          ),
        };
      }

      case "outlierDetect": {
        const { columnIndex, multiplier, markerColumn } = action;

        // 计算均值和标准差
        const values = rows
          .map(r => Number(r[columnIndex]?.value))
          .filter(v => !isNaN(v));

        if (values.length === 0) return workbook;

        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
        const stdDev = Math.sqrt(variance);
        const lowerBound = mean - multiplier * stdDev;
        const upperBound = mean + multiplier * stdDev;

        for (let i = 0; i < rows.length; i++) {
          const v = Number(rows[i][columnIndex]?.value);
          const isOutlier = !isNaN(v) && (v < lowerBound || v > upperBound);
          rows[i][markerColumn] = { value: isOutlier ? "异常" : "正常" };
        }

        headers[markerColumn] = "异常标记";
        const newColCount = Math.max(sheet.meta.colCount, markerColumn + 1);
        return {
          ...workbook,
          sheets: workbook.sheets.map((s, idx) =>
            idx === workbook.activeSheetIndex
              ? { ...s, headers, rows, meta: { ...s.meta, colCount: newColCount } }
              : s
          ),
        };
      }
    }

    return workbook;
  }

  validate(operation: Operation<ClusterParams>): true | string {
    if (!operation.params.action) return "需要指定聚类操作动作";
    if (operation.params.action.action === "textCluster" &&
        (operation.params.action.threshold < 0 || operation.params.action.threshold > 1))
      return "相似度阈值应在 0～1 之间";
    return true;
  }
}