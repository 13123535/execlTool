/**
 * ToolBar — 操作工具栏
 *
 * 提供核心操作的触发入口：
 *   1. Fill Down — 合并单元格展开
 *   2. Explode  — 按分隔符展开
 *   3. Undo/Redo — 撤销/重做
 *
 * 使用 Ant Design 组件：Button、Space、Divider、Select、Input、message
 */

import React, { useState, useCallback } from "react";
import {
  Button,
  Divider,
  Select,
  Input,
  message,
  Tooltip,
} from "antd";
import {
  VerticalAlignBottomOutlined,
  SplitCellsOutlined,
  UndoOutlined,
  RedoOutlined,
  QuestionCircleOutlined,
} from "@ant-design/icons";
import { useTableStore } from "../stores/tableStore";
import { useHistoryStore } from "../stores/historyStore";

/** 工具栏属性 */
interface ToolBarProps {
  /** Worker 代理：执行操作 */
  onExecute: (type: string, params: Record<string, unknown>) => Promise<void>;
  /** Worker 代理：撤销 */
  onUndo: () => Promise<void>;
  /** Worker 代理：重做 */
  onRedo: () => Promise<void>;
}

/** 操作配置 */
interface OpConfig {
  type: string;
  label: string;
  icon: React.ReactNode;
  tooltip: string;
  params: (colId: string, extra: string) => Record<string, unknown>;
  extraLabel?: string;
}

/** 可用操作列表 */
const OPERATIONS: OpConfig[] = [
  {
    type: "filldown",
    label: "填充展开",
    icon: <VerticalAlignBottomOutlined />,
    tooltip: "合并单元格展开：将合并区域的值向下填充到空单元格",
    params: (colId) => ({ columnId: colId }),
  },
  {
    type: "explode",
    label: "分隔展开",
    icon: <SplitCellsOutlined />,
    tooltip: "按分隔符展开：将逗号/顿号分隔的值拆成多行",
    params: (colId, extra) => ({
      columnId: colId,
      separator: extra || ",",
      trim: true,
    }),
    extraLabel: "分隔符",
  },
];

const ToolBar: React.FC<ToolBarProps> = ({ onExecute, onUndo, onRedo }) => {
  const table = useTableStore((s) => s.table);
  const isProcessing = useTableStore((s) => s.isProcessing);
  const { canUndo, canRedo } = useHistoryStore();

  const [selectedCol, setSelectedCol] = useState<string | null>(null);
  const [separator, setSeparator] = useState<string>(",");

  const columns = (table?.columns ?? []) as { id: string; name: string }[];

  /** 生成列选项 */
  const columnOptions = columns.map((col) => ({
    value: col.id,
    label: col.name,
  }));

  /** 执行操作 */
  const handleExecute = useCallback(
    async (op: OpConfig) => {
      if (!selectedCol) {
        message.warning("请先选择一列");
        return;
      }
      try {
        await onExecute(op.type, op.params(selectedCol, separator));
        message.success(`${op.label} 执行成功`);
      } catch (err) {
        message.error(
          `${op.label} 失败: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
    [selectedCol, separator, onExecute],
  );

  /** 撤销 */
  const handleUndo = useCallback(async () => {
    try {
      await onUndo();
      message.success("已撤销");
    } catch (err) {
      message.error(
        `撤销失败: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }, [onUndo]);

  /** 重做 */
  const handleRedo = useCallback(async () => {
    try {
      await onRedo();
      message.success("已重做");
    } catch (err) {
      message.error(
        `重做失败: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }, [onRedo]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 16px",
        borderBottom: "1px solid #f0f0f0",
        background: "#fafafa",
        flexWrap: "wrap",
      }}
    >
      {/* 列选择 */}
      <Select
        placeholder="选择操作列"
        style={{ minWidth: 160 }}
        value={selectedCol}
        onChange={setSelectedCol}
        options={columnOptions}
        disabled={isProcessing || columns.length === 0}
        showSearch
        allowClear
      />

      <Divider type="vertical" />

      {/* 操作按钮 */}
      {OPERATIONS.map((op) => (
        <React.Fragment key={op.type}>
          <Tooltip title={op.tooltip}>
            <Button
              icon={op.icon}
              onClick={() => handleExecute(op)}
              loading={isProcessing}
              disabled={!selectedCol}
            >
              {op.label}
            </Button>
          </Tooltip>
          {op.extraLabel === "分隔符" && (
            <Input
              placeholder="分隔符"
              value={separator}
              onChange={(e) => setSeparator(e.target.value)}
              style={{ width: 80 }}
              disabled={isProcessing}
              maxLength={5}
            />
          )}
        </React.Fragment>
      ))}

      <Divider type="vertical" />

      {/* 撤销/重做 */}
      <Tooltip title="撤销 (Ctrl+Z)">
        <Button
          icon={<UndoOutlined />}
          onClick={handleUndo}
          disabled={!canUndo || isProcessing}
        >
          撤销
        </Button>
      </Tooltip>
      <Tooltip title="重做 (Ctrl+Y)">
        <Button
          icon={<RedoOutlined />}
          onClick={handleRedo}
          disabled={!canRedo || isProcessing}
        >
          重做
        </Button>
      </Tooltip>

      <Divider type="vertical" />

      {/* 帮助 */}
      <Tooltip title="快捷键: Ctrl+Z 撤销, Ctrl+Y 重做">
        <Button
          type="text"
          icon={<QuestionCircleOutlined />}
          style={{ marginLeft: "auto" }}
        />
      </Tooltip>
    </div>
  );
};

export default ToolBar;