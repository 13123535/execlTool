/**
 * StatusBar — 底部状态栏
 *
 * 显示当前表格统计信息：
 *   - 文件名
 *   - 行数 / 列数
 *   - 虚拟行数量（由 FillDown/Explode 生成）
 *   - 处理中的 Loader
 *
 * 使用 Ant Design：Typography, Tag, Spin
 */

import React from "react";
import { Typography, Tag, Spin } from "antd";
import {
  FileTextOutlined,
  TableOutlined,
  ColumnHeightOutlined,
  ExclamationCircleOutlined,
} from "@ant-design/icons";
import { useTableStore } from "../stores/tableStore";

const { Text } = Typography;

const StatusBar: React.FC = () => {
  const table = useTableStore((s) => s.table);
  const fileName = useTableStore((s) => s.fileName);
  const isProcessing = useTableStore((s) => s.isProcessing);
  const error = useTableStore((s) => s.error);

  if (!table) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "4px 16px",
          borderTop: "1px solid #f0f0f0",
          background: "#fafafa",
          minHeight: 32,
        }}
      >
        <Text type="secondary" style={{ fontSize: 12 }}>
          未加载文件
        </Text>
      </div>
    );
  }

  const totalRows = table.rows.length;
  const virtualRows = table.rows.filter((r) => r.isVirtual).length;
  const colCount = table.columns.length;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "4px 16px",
        borderTop: "1px solid #f0f0f0",
        background: "#fafafa",
        minHeight: 32,
      }}
    >
      {/* 文件名 */}
      <Tag icon={<FileTextOutlined />} color="blue">
        {fileName ?? "未知文件"}
      </Tag>

      {/* 行列数 */}
      <Tag icon={<TableOutlined />} color="default">
        {totalRows} 行 × {colCount} 列
      </Tag>

      {/* 虚拟行 */}
      {virtualRows > 0 && (
        <Tag icon={<ColumnHeightOutlined />} color="orange">
          {virtualRows} 虚拟行
        </Tag>
      )}

      {/* 错误提示 */}
      {error && (
        <Tag icon={<ExclamationCircleOutlined />} color="red">
          {error}
        </Tag>
      )}

      {/* 处理中 */}
      {isProcessing && (
        <span style={{ marginLeft: "auto" }}>
          <Spin size="small" />
        </span>
      )}
    </div>
  );
};

export default StatusBar;