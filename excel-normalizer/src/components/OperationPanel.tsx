/**
 * OperationPanel — 操作面板（右侧工具栏）
 *
 * 按功能结构分组展示所有可用操作。
 * 每个操作对应 Engine 层一个已注册的 Operation 类型。
 *
 * 交互流程：
 *   - 顶部：全局列选择器（共享给各操作）
 *   - 分组折叠面板：内容清洗 / 结构整理 / 去重合并 / …
 *   - 每个操作按钮：图标 + 标签 + Tooltip 说明
 *   - 点击后：
 *     1) 如操作含 isDestructive 标记 → 弹出 ConfirmDialog
 *     2) 构造 params → 调用 onExecute(type, params)
 *
 * 与 ToolBar 的关系：
 *   ToolBar 保留快速操作（undo/redo），OperationPanel 提供完整功能目录。
 */

import React, { useState, useCallback, useMemo } from "react";
import {
  Button,
  Collapse,
  Select,
  Input,
  Tooltip,
  Typography,
  Divider,
} from "antd";
import {
  ScissorOutlined,
  ClearOutlined,
  VerticalAlignBottomOutlined,
  SplitCellsOutlined,
  MergeCellsOutlined,
} from "@ant-design/icons";
import { useTableStore } from "../stores/tableStore";

const { Text } = Typography;
const { Panel } = Collapse;

// ═══════════════════════════════════════════════════════════
// 操作元数据定义
// ═══════════════════════════════════════════════════════════

/** 操作分类 */
type OpCategory =
  | "clean"      // 内容清洗
  | "structure"  // 结构整理
  | "dedup"      // 去重与合并
  | "rowcol"     // 行列操作
  | "format";    // 格式标准化

/** 单个操作的 UI 元数据 */
interface OpMeta {
  /** 对应 registry 中的 type */
  type: string;
  /** 显示标签 */
  label: string;
  /** 图标 */
  icon: React.ReactNode;
  /** Tooltip 说明 */
  description: string;
  /** 操作分类 */
  category: OpCategory;
  /** 是否需要列选择 */
  needsColumn?: boolean;
  /** 额外参数控件 */
  extraParam?: {
    key: string;
    label: string;
    defaultValue: string;
    type: "input" | "number";
  };
  /** 是否为破坏性操作（需确认） */
  isDestructive?: boolean;
}

/** 操作清册 */
const OP_MANIFEST: OpMeta[] = [
  // ── 内容清洗 ──
  {
    type: "trim",
    label: "去前后空格",
    icon: <ClearOutlined />,
    description: "清除所有单元格前后的空格字符",
    category: "clean",
  },
  {
    type: "clean_invisible",
    label: "清除不可见字符",
    icon: <ScissorOutlined />,
    description: "清除零宽字符、特殊空白、控制字符等",
    category: "clean",
  },

  // ── 结构整理 ──
  {
    type: "filldown",
    label: "填充展开",
    icon: <VerticalAlignBottomOutlined />,
    description: "将合并单元格的值向下填充到空单元格",
    category: "structure",
    needsColumn: true,
  },
  {
    type: "explode",
    label: "分隔展开",
    icon: <SplitCellsOutlined />,
    description: "按分隔符将一列中的多个值拆分为多行",
    category: "structure",
    needsColumn: true,
    extraParam: {
      key: "separator",
      label: "分隔符",
      defaultValue: ",",
      type: "input",
    },
  },
  {
    type: "collapse",
    label: "按列合并",
    icon: <MergeCellsOutlined />,
    description:
      "将指定列中连续相同值的行合并为一个单元格区域。非主键列的值会拼接。",
    category: "structure",
    needsColumn: true,
    extraParam: {
      key: "separator",
      label: "拼接分隔符",
      defaultValue: "、",
      type: "input",
    },
    isDestructive: true,
  },

  // ── 去重与合并（占位：后续实现）──
  // { type: "dedup_exact", label: "完全去重", ... category: "dedup" },
  // { type: "dedup_column", label: "按列去重", ... category: "dedup" },

  // ── 行列操作（占位：后续实现）──
  // { type: "sort", label: "排序", ... category: "rowcol" },
  // { type: "filter", label: "筛选", ... category: "rowcol" },

  // ── 格式标准化（占位：后续实现）──
  // { type: "date_format", label: "日期格式", ... category: "format" },
];

// ═══════════════════════════════════════════════════════════
// 分类配置
// ═══════════════════════════════════════════════════════════

/** 分类显示配置 */
interface CategoryConfig {
  key: OpCategory;
  title: string;
}

const CATEGORIES: CategoryConfig[] = [
  { key: "clean", title: "🧹 内容清洗" },
  { key: "structure", title: "📐 结构整理" },
  { key: "dedup", title: "🔍 去重与合并" },
  { key: "rowcol", title: "📋 行列操作" },
  { key: "format", title: "📏 格式标准化" },
];

// ═══════════════════════════════════════════════════════════
// Props
// ═══════════════════════════════════════════════════════════

interface OperationPanelProps {
  /** 执行操作：onExecute(type, params) */
  onExecute: (type: string, params: Record<string, unknown>) => Promise<void>;
  /** 是否正在处理中 */
  isProcessing: boolean;
}

// ═══════════════════════════════════════════════════════════
// 组件
// ═══════════════════════════════════════════════════════════

const OperationPanel: React.FC<OperationPanelProps> = ({
  onExecute,
  isProcessing,
}) => {
  // ── 共享状态 ──
  const table = useTableStore((s) => s.table);
  const [selectedCol, setSelectedCol] = useState<string | null>(null);
  const [activeKeys, setActiveKeys] = useState<string[]>([
    "clean",
    "structure",
  ]);

  // ── 列选项 ──
  const columns = (table?.columns ?? []) as { id: string; name: string }[];
  const columnOptions = useMemo(
    () =>
      columns.map((col) => ({
        value: col.id,
        label: col.name,
      })),
    [columns],
  );

  // ── 执行操作 ──
  const handleExecute = useCallback(
    async (op: OpMeta, extraValue: string) => {
      if (op.needsColumn && !selectedCol) {
        return;
      }

      const params: Record<string, unknown> = {};
      if (op.needsColumn && selectedCol) {
        params.columnId = selectedCol;
      }
      if (op.extraParam && extraValue) {
        params[op.extraParam.key] = extraValue;
      }

      await onExecute(op.type, params);
    },
    [selectedCol, onExecute],
  );

  // ── 渲染单个操作项 ──
  const renderOpItem = useCallback(
    (op: OpMeta) => (
      <OpItem
        key={op.type}
        op={op}
        disabled={isProcessing || (op.needsColumn === true && !selectedCol)}
        loading={isProcessing}
        onExecute={(extraValue) => handleExecute(op, extraValue)}
      />
    ),
    [selectedCol, isProcessing, handleExecute],
  );

  // ── 按分类分组 ──
  const groupedOps = useMemo(() => {
    const map = new Map<OpCategory, OpMeta[]>();
    for (const op of OP_MANIFEST) {
      const list = map.get(op.category) ?? [];
      list.push(op);
      map.set(op.category, list);
    }
    return map;
  }, []);

  return (
    <div
      style={{
        width: 220,
        background: "#fff",
        borderLeft: "1px solid #f0f0f0",
        display: "flex",
        flexDirection: "column",
        overflow: "auto",
      }}
    >
      {/* 标题 */}
      <div style={{ padding: "12px 16px 8px" }}>
        <Text strong style={{ fontSize: 14 }}>
          操作面板
        </Text>
      </div>

      <Divider style={{ margin: 0 }} />

      {/* 列选择器 */}
      <div style={{ padding: "12px 16px" }}>
        <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 6 }}>
          目标列
        </Text>
        <Select
          placeholder="选择操作列"
          style={{ width: "100%" }}
          value={selectedCol}
          onChange={setSelectedCol}
          options={columnOptions}
          disabled={isProcessing || columns.length === 0}
          showSearch
          allowClear
          size="small"
        />
      </div>

      <Divider style={{ margin: 0 }} />

      {/* 操作分组 */}
      <Collapse
        activeKey={activeKeys}
        onChange={(keys) => setActiveKeys(keys as string[])}
        ghost
        style={{ flex: 1 }}
      >
        {CATEGORIES.map((cat) => {
          const ops = groupedOps.get(cat.key) ?? [];
          if (ops.length === 0) return null;

          return (
            <Panel
              key={cat.key}
              header={
                <Text style={{ fontSize: 13, fontWeight: 500 }}>
                  {cat.title}
                </Text>
              }
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  padding: "0 0 0 4px",
                }}
              >
                {ops.map(renderOpItem)}
              </div>
            </Panel>
          );
        })}
      </Collapse>

      {/* 空状态提示 */}
      {!table && (
        <div
          style={{
            padding: 16,
            textAlign: "center",
            color: "#bbb",
            fontSize: 13,
          }}
        >
          请先导入文件
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// 子组件：单个操作项
// ═══════════════════════════════════════════════════════════

interface OpItemProps {
  op: OpMeta;
  disabled: boolean;
  loading: boolean;
  onExecute: (extraValue: string) => void;
}

const OpItem: React.FC<OpItemProps> = ({ op, disabled, loading, onExecute }) => {
  const [extraValue, setExtraValue] = useState(
    op.extraParam?.defaultValue ?? "",
  );

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 0",
      }}
    >
      <Tooltip title={op.description} placement="right">
        <Button
          size="small"
          icon={op.icon}
          onClick={() => onExecute(extraValue)}
          loading={loading}
          disabled={disabled}
          danger={op.isDestructive}
        >
          {op.label}
        </Button>
      </Tooltip>
      {op.extraParam && (
        <Input
          size="small"
          placeholder={op.extraParam.label}
          value={extraValue}
          onChange={(e) => setExtraValue(e.target.value)}
          style={{ width: 80 }}
          disabled={loading}
          maxLength={10}
        />
      )}
    </div>
  );
};

export default OperationPanel;
