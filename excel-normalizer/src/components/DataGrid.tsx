/**
 * DataGrid — 表格视图组件
 *
 * 使用 Ant Design Table 展示 NormalizedTable 数据。
 * 注意：antd v6 的 ColumnType.title 类型层面不支持 JSX（运行时支持），
 * 因此 columns 在 useMemo 内整体用 as any 断言绕过类型检查。
 *
 * 特性：
 *   - 自动列宽适配
 *   - 虚拟行高亮（黄色背景）
 *   - 空值显示为灰底 "—"
 *   - 支持列选择（点击选中列头）
 *   - 分页展示大表（默认 100 行/页）
 */

import React, { useMemo } from "react";
import { Table, Typography } from "antd";
import type { NormalizedTable } from "../engine";

const { Text } = Typography;

/** 表格属性 */
interface DataGridProps {
  table: NormalizedTable | null;
  selectedColumn: string | null;
  onColumnSelect: (colIdx: string | null) => void;
}

interface GridRow {
  _key: string;
  _isVirtual: boolean;
  [key: string]: unknown;
}

/** 单元格渲染 */
const CellRenderer: React.FC<{ value: unknown; isVirtual: boolean }> = ({
  value,
  isVirtual,
}) => {
  if (value === null || value === undefined || value === "") {
    return (
      <Text
        type="secondary"
        style={{
          background: "#f5f5f5",
          padding: "0 4px",
          borderRadius: 2,
          fontSize: 12,
          fontStyle: "italic",
        }}
      >
        —
      </Text>
    );
  }

  return (
    <span
      style={{
        background: isVirtual ? "#fffbe6" : "transparent",
        padding: isVirtual ? "0 4px" : undefined,
        borderRadius: isVirtual ? 2 : undefined,
      }}
    >
      {String(value)}
    </span>
  );
};

/** 将表格行转为平铺记录 */
function buildRows(table: NormalizedTable, maxRows: number): GridRow[] {
  return table.rows.slice(0, maxRows).map((row) => {
    const record: GridRow = {
      _key: String(row.id),
      _isVirtual: row.isVirtual,
    };
    // 按 column 下标映射（而非 cell 下标），保证新增列（id 非数字）也能对齐
    table.columns.forEach((col, colIdx) => {
      const cell = row.cells[colIdx];
      const value = cell?.value;
      record[col.id] = value;
      // 传递 rowSpan 元数据给 onCell 回调
      if (cell?.rowSpan !== undefined) {
        record[`_rowSpan_${col.id}`] = cell.rowSpan;
      }
    });
    return record;
  });
}

const DataGrid: React.FC<DataGridProps> = ({
  table,
  selectedColumn,
  onColumnSelect,
}) => {
  const { columns, dataSource } = useMemo(() => {
    if (!table) return { columns: [] as any[], dataSource: [] as GridRow[] };
    const maxRows = 5000;

    // 列定义：antd v6 的 ColumnType.title 类型不接受 JSX（但运行时接受）
    // 这里使用 as any 整体断言，打断 TS 的类型推断链
    const cols = table.columns.map((col) => {
      const colKey = col.id;
      const isSelected = selectedColumn === colKey;
      return {
        key: colKey,
        dataIndex: colKey,
        width: 150,
        ellipsis: true,
        title: (
          <span
            onClick={() => onColumnSelect(isSelected ? null : colKey)}
            style={{
              cursor: "pointer",
              fontWeight: isSelected ? "bold" : "normal",
              color: isSelected ? "#1677ff" : "inherit",
              userSelect: "none",
            }}
          >
            {isSelected ? "▸ " : ""}
            {col.name}
          </span>
        ),
        sorter: (a: GridRow, b: GridRow) => {
          const va = String(a[colKey] ?? "");
          const vb = String(b[colKey] ?? "");
          return va.localeCompare(vb, "zh-CN");
        },
        render: (value: unknown, record: GridRow) => (
          <CellRenderer value={value} isVirtual={record._isVirtual} />
        ),
        onCell: (record: GridRow) => {
          const rSpan = record[`_rowSpan_${colKey}`] as number | undefined;
          if (rSpan === 0) return { rowSpan: 0 };
          if (rSpan && rSpan > 1) {
            return {
              rowSpan: rSpan,
              style: {
                verticalAlign: "middle" as const,
              },
            };
          }
          return {};
        },
      };
    });

    return {
      // 整体断言为 any[]，打断 antd ColumnType 的类型推断
      columns: cols as any[],
      dataSource: buildRows(table, maxRows),
    };
  }, [table, selectedColumn, onColumnSelect]);

  if (!table) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "#999",
          fontSize: 14,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
          <div>拖放 CSV / Excel 文件到此处导入</div>
          <div style={{ fontSize: 12, marginTop: 8 }}>
            或点击左上角「导入」按钮选择文件
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        height: "100%",
        overflow: "auto",
        padding: "0 16px 8px",
      }}
    >
      {table.rows.length > 5000 && (
        <div
          style={{
            padding: "4px 8px",
            background: "#fff7e6",
            border: "1px solid #ffd591",
            borderRadius: 4,
            margin: "8px 0",
            fontSize: 12,
          }}
        >
          ⚠️ 表格过大（{table.rows.length} 行），仅显示前 5000 行。请使用筛选缩小范围。
        </div>
      )}

      <Table<GridRow>
        columns={columns}
        dataSource={dataSource}
        rowKey="_key"
        size="small"
        bordered
        pagination={{
          defaultPageSize: 100,
          showSizeChanger: true,
          pageSizeOptions: ["50", "100", "200", "500"],
          showTotal: (total, range) =>
            `${range[0]}-${range[1]} / ${total} 行`,
          size: "small",
        }}
        scroll={{ x: "max-content", y: "calc(100vh - 200px)" }}
        sticky
        rowClassName={(record) => (record._isVirtual ? "virtual-row" : "")}
      />
    </div>
  );
};

export default DataGrid;