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
 * 特殊操作（needDialog=true）：
 *   点击按钮后打开专属 Modal 弹窗，收集复杂参数后再执行。
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
  Modal,
  Radio,
  Switch,
  Alert,
  Space,
} from "antd";
import {
  ScissorOutlined,
  ClearOutlined,
  VerticalAlignBottomOutlined,
  SplitCellsOutlined,
  MergeCellsOutlined,
  CalculatorOutlined,
  DeleteOutlined,
  LineOutlined,
  FilterOutlined,
  CodeOutlined,
  FontSizeOutlined,
  InfoCircleOutlined,
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
  /** 是否需要弹窗收集复杂参数 */
  needDialog?: boolean;
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
  {
    type: "normalize_newline",
    label: "规范化换行符",
    icon: <LineOutlined />,
    description: "将 \\r\\n、\\r 统一为 \\n，合并连续空行",
    category: "clean",
  },
  {
    type: "remove_empty",
    label: "清除空行/空列",
    icon: <DeleteOutlined />,
    description:
      "支持严格模式（全空删除）和关键列模式（指定列为空时删除），可选 OR/AND 逻辑",
    category: "clean",
    isDestructive: true,
    needDialog: true,
  },

  {
    type: "filldown",
    label: "填充展开",
    icon: <VerticalAlignBottomOutlined />,
    description: "将合并单元格的值向下填充到空单元格",
    category: "structure",
    needsColumn: true,
  },
  {
    type: "visual_collapse",
    label: "视觉合并",
    icon: <SplitCellsOutlined style={{ transform: "rotate(90deg)" }} />,
    description:
      "将指定列中连续相同值的行合并为一个视觉单元格区域。与「填充展开」互为逆操作。",
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
      "将指定列值相同的行合并为一行。其他列的值按指定分隔符拼接。与「分隔展开」互为逆操作。",
    category: "structure",
    needsColumn: true,
    isDestructive: true,
    needDialog: true,
  },
  {
    type: "split_column",
    label: "拆分列",
    icon: <SplitCellsOutlined />,
    description: "按分隔符/固定宽度/正则表达式将一列拆分为多列",
    category: "structure",
    needsColumn: true,
    extraParam: {
      key: "separator",
      label: "分隔符/正则",
      defaultValue: ",",
      type: "input",
    },
    isDestructive: true,
  },

  // ── 行列操作 ──
  {
    type: "add_column",
    label: "新增公式列",
    icon: <CalculatorOutlined />,
    description:
      "添加新列，值由公式计算得出。支持引用其他列、算术运算、内置函数（SUM/AVG/COUNT 等）。",
    category: "rowcol",
    extraParam: {
      key: "formula",
      label: "公式",
      defaultValue: "",
      type: "input",
    },
  },

  // ── 去重与合并 ──
  {
    type: "dedupe",
    label: "按列去重",
    icon: <FilterOutlined />,
    description: "按指定列去重，保留第一条或最后一条",
    category: "dedup",
    needsColumn: true,
    extraParam: {
      key: "mode",
      label: "保留(first/last)",
      defaultValue: "first",
      type: "input",
    },
    isDestructive: true,
  },

  // ── 格式标准化 ──
  {
    type: "regex_replace",
    label: "正则替换",
    icon: <CodeOutlined />,
    description: "按正则表达式查找并替换单元格内容",
    category: "format",
    needsColumn: true,
    extraParam: {
      key: "pattern",
      label: "正则表达式",
      defaultValue: "",
      type: "input",
    },
  },
  {
    type: "normalize_width",
    label: "全角转半角",
    icon: <FontSizeOutlined />,
    description: "将全角字母/数字/标点转换为半角字符",
    category: "format",
    extraParam: {
      key: "target",
      label: "范围(all/letter/number/punctuation)",
      defaultValue: "all",
      type: "input",
    },
  },
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
    "rowcol",
  ]);

  // ── 删除空行弹窗状态 ──
  const [removeEmptyDlgOpen, setRemoveEmptyDlgOpen] = useState(false);
  const [removeEmptyMode, setRemoveEmptyMode] = useState<"strict" | "key_columns">("strict");
  const [removeEmptyKeyCols, setRemoveEmptyKeyCols] = useState<string[]>([]);
  const [removeEmptyLogic, setRemoveEmptyLogic] = useState<"or" | "and">("or");
  const [removeEmptyTreatWS, setRemoveEmptyTreatWS] = useState(true);

  // ── 按列合并弹窗状态 ──
  const [collapseDlgOpen, setCollapseDlgOpen] = useState(false);
  const [collapseSeparator, setCollapseSeparator] = useState(",");
  const [collapseConcatCols, setCollapseConcatCols] = useState<string[]>([]);

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
      if (op.needDialog) {
        // 打开专属弹窗，不直接执行
        if (op.type === "remove_empty") {
          // 打开弹窗时，默认勾选所有列作为关键列
          setRemoveEmptyKeyCols(columns.map((c) => c.id));
          setRemoveEmptyMode("strict");
          setRemoveEmptyLogic("or");
          setRemoveEmptyTreatWS(true);
          setRemoveEmptyDlgOpen(true);
        }
        if (op.type === "collapse") {
          // 默认排除 key 列本身，选择所有其他列做拼接
          const otherCols = columns
            .filter((c) => c.id !== selectedCol)
            .map((c) => c.id);
          setCollapseConcatCols(otherCols);
          setCollapseSeparator(",");
          setCollapseDlgOpen(true);
        }
        return;
      }

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
    [selectedCol, onExecute, columns],
  );

  // ── 执行删除空行 ──
  const handleRemoveEmptyOk = useCallback(async () => {
    setRemoveEmptyDlgOpen(false);

    const params: Record<string, unknown> = {
      mode: removeEmptyMode,
      treatWhitespaceAsEmpty: removeEmptyTreatWS,
    };

    if (removeEmptyMode === "key_columns") {
      params.keyColumnIds = removeEmptyKeyCols;
      params.logic = removeEmptyLogic;
    }

    await onExecute("remove_empty", params);
  }, [
    removeEmptyMode,
    removeEmptyKeyCols,
    removeEmptyLogic,
    removeEmptyTreatWS,
    onExecute,
  ]);

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
        <Text
          type="secondary"
          style={{ fontSize: 12, display: "block", marginBottom: 6 }}
        >
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

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* 按列合并弹窗 */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <Modal
        title="按列合并 — 逆分隔展开"
        open={collapseDlgOpen}
        onOk={async () => {
          setCollapseDlgOpen(false);
          if (!selectedCol) return;
          await onExecute("collapse", {
            columnId: selectedCol,
            separator: collapseSeparator,
            concatColumnIds: collapseConcatCols,
          });
        }}
        onCancel={() => setCollapseDlgOpen(false)}
        okText="执行合并"
        cancelText="取消"
        okButtonProps={{ danger: true, loading: isProcessing }}
        width={500}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Text type="secondary">
            将指定 key 列中值相同的行合并为一行（与「分隔展开」互为逆操作）。
          </Text>

          <div>
            <Text strong style={{ fontSize: 13, display: "block", marginBottom: 6 }}>
              Key 列（分组依据）
            </Text>
            <Select
              placeholder="已在顶部选择"
              style={{ width: "100%" }}
              value={selectedCol ?? undefined}
              disabled
              size="small"
            />
            <Text type="secondary" style={{ fontSize: 11, display: "block", marginTop: 4 }}>
              该列值相同的行将被合并为一行
            </Text>
          </div>

          <div>
            <Text strong style={{ fontSize: 13, display: "block", marginBottom: 6 }}>
              拼接列（选择需要拼接值的列）
            </Text>
            <Select
              mode="multiple"
              placeholder="选择需要按分隔符拼接值的列"
              style={{ width: "100%" }}
              value={collapseConcatCols}
              onChange={(vals) => setCollapseConcatCols(vals)}
              options={columnOptions}
              maxTagCount={5}
              size="small"
            />
            <Text type="secondary" style={{ fontSize: 11, display: "block", marginTop: 4 }}>
              未选中的列保留第一条行的值
            </Text>
          </div>

          <div>
            <Text strong style={{ fontSize: 13, display: "block", marginBottom: 6 }}>
              拼接分隔符
            </Text>
            <Input
              placeholder="分隔符，默认逗号"
              value={collapseSeparator}
              onChange={(e) => setCollapseSeparator(e.target.value)}
              size="small"
              style={{ width: "100%" }}
            />
          </div>
        </div>
      </Modal>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* 删除空行弹窗 */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <Modal
        title="删除空行配置"
        open={removeEmptyDlgOpen}
        onOk={handleRemoveEmptyOk}
        onCancel={() => setRemoveEmptyDlgOpen(false)}
        okText="执行删除"
        cancelText="取消"
        okButtonProps={{ danger: true, loading: isProcessing }}
        width={500}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* 模式选择 */}
          <div>
            <Text strong style={{ fontSize: 13, display: "block", marginBottom: 8 }}>
              删除模式
            </Text>
            <Radio.Group
              value={removeEmptyMode}
              onChange={(e) => setRemoveEmptyMode(e.target.value)}
            >
              <Space direction="vertical" size={8}>
                <Radio value="strict">
                  <Text strong>严格模式（全空删除）</Text>
                  <Text
                    type="secondary"
                    style={{ display: "block", fontSize: 12, marginLeft: 24 }}
                  >
                    所有列值都为 null 或空字符串时，删除整行。适用于文件末尾空白行。
                  </Text>
                </Radio>
                <Radio value="key_columns">
                  <Text strong>关键列模式（指定列为空删除）</Text>
                  <Text
                    type="secondary"
                    style={{ display: "block", fontSize: 12, marginLeft: 24 }}
                  >
                    根据指定关键列的值判断是否删除该行。
                  </Text>
                </Radio>
              </Space>
            </Radio.Group>
          </div>

          {/* 关键列配置（仅关键列模式） */}
          {removeEmptyMode === "key_columns" && (
            <>
              <div>
                <Text strong style={{ fontSize: 13, display: "block", marginBottom: 6 }}>
                  关键列
                </Text>
                <Select
                  mode="multiple"
                  placeholder="选择 1-3 个关键信息列"
                  style={{ width: "100%" }}
                  value={removeEmptyKeyCols}
                  onChange={(vals) => setRemoveEmptyKeyCols(vals.slice(0, 5))}
                  options={columnOptions}
                  maxTagCount={5}
                  size="small"
                />
                <Alert
                  style={{ marginTop: 6 }}
                  message="建议选择 1-3 个关键信息列，缺失即删除"
                  type="info"
                  showIcon
                  icon={<InfoCircleOutlined />}
                />
              </div>

              <div>
                <Text strong style={{ fontSize: 13, display: "block", marginBottom: 8 }}>
                  删除逻辑
                </Text>
                <Radio.Group
                  value={removeEmptyLogic}
                  onChange={(e) => setRemoveEmptyLogic(e.target.value)}
                >
                  <Space direction="vertical" size={6}>
                    <Radio value="or">
                      <Text>任一列为空即删除（OR）</Text>
                      <Text
                        type="secondary"
                        style={{ display: "block", fontSize: 12, marginLeft: 24 }}
                      >
                        适合"姓名或电话，缺一个我就不要"
                      </Text>
                    </Radio>
                    <Radio value="and">
                      <Text>所有指定列为空才删除（AND）</Text>
                      <Text
                        type="secondary"
                        style={{ display: "block", fontSize: 12, marginLeft: 24 }}
                      >
                        适合"除非连备选联系方式都没有，才删除"
                      </Text>
                    </Radio>
                  </Space>
                </Radio.Group>
              </div>
            </>
          )}

          {/* 空白字符串选项 */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 12px",
              background: "#fafafa",
              borderRadius: 6,
            }}
          >
            <div>
              <Text style={{ fontSize: 13 }}>将空白字符串视为空</Text>
              <Text
                type="secondary"
                style={{ display: "block", fontSize: 11 }}
              >
                开启后，" "、"\t" 等纯空白字符也被判定为空值
              </Text>
            </div>
            <Switch
              checked={removeEmptyTreatWS}
              onChange={setRemoveEmptyTreatWS}
              size="small"
            />
          </div>
        </div>
      </Modal>
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

const OpItem: React.FC<OpItemProps> = ({
  op,
  disabled,
  loading,
  onExecute,
}) => {
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
        <>
          {op.extraParam.type === "input" ? (
            <Input
              size="small"
              placeholder={op.extraParam.label}
              value={extraValue}
              onChange={(e) => setExtraValue(e.target.value)}
              style={{ width: 100, fontSize: 11 }}
              disabled={loading}
              maxLength={200}
            />
          ) : (
            <Input
              size="small"
              type="number"
              placeholder={op.extraParam.label}
              value={extraValue}
              onChange={(e) => setExtraValue(e.target.value)}
              style={{ width: 60 }}
              disabled={loading}
            />
          )}
        </>
      )}
    </div>
  );
};

export default OperationPanel;