/**
 * App — 应用根组件
 *
 * 职责：数据总线，串联导入→转换→存储→展示→操作→导出全链路
 *
 * 数据流：
 *   导入：File → NormalizedTable → tableStore
 *   操作：OperationPanel 点击 → useOperationExecutor.execute() → Operation → tableStore.updateTable()
 *   导出：NormalizedTable → XLSX/CSV（带确认弹窗）
 *
 * 状态提升：
 *   selectedColumn — 各组件共享的列选择状态，由 App 统一管理
 */

import { useCallback, useRef, useState } from "react";
import { ConfigProvider, Button, Modal, message } from "antd";
import zhCN from "antd/locale/zh_CN";
import {
  DownloadOutlined,
  FileExcelOutlined,
  FileTextOutlined,
  UndoOutlined,
  RedoOutlined,
} from "@ant-design/icons";
import { useTableStore } from "./stores/tableStore";
import { useHistoryStore } from "./stores/historyStore";
import { useOperationExecutor } from "./hooks/useOperationExecutor";
import { parseXLSX } from "./importers/xlsxImporter";
import { parseCSV } from "./importers/csvImporter";
import { exportToXLSX } from "./exporters/xlsxExporter";
import { exportToCSV } from "./exporters/csvExporter";
import { saveFile } from "./utils/saveFile";
import DataGrid from "./components/DataGrid";
import StatusBar from "./components/StatusBar";
import OperationPanel from "./components/OperationPanel";
import { ConfirmDialog } from "./components/ConfirmDialog";
import "./App.css";

function App() {
  // ================================================================
  // 隐藏的文件输入
  // ================================================================
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ================================================================
  // 表格状态（新版 Store）
  // ================================================================
  const table = useTableStore((s) => s.table);
  const fileName = useTableStore((s) => s.fileName);
  const isProcessing = useTableStore((s) => s.isProcessing);
  const setTable = useTableStore((s) => s.setTable);
  const setProcessing = useTableStore((s) => s.setProcessing);
  const setError = useTableStore((s) => s.setError);

  // ================================================================
  // 操作执行器
  // ================================================================
  const { execute, undo, redo } = useOperationExecutor();

  // ================================================================
  // 列选择状态（跨组件共享）
  // ================================================================
  const [selectedColumn, setSelectedColumn] = useState<string | null>(null);

  // ================================================================
  // 导出弹窗状态
  // ================================================================
  const [exportModalOpen, setExportModalOpen] = useState(false);

  // ================================================================
  // 导入文件
  // ================================================================
  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setProcessing(true);
      setError(null);

      try {
        const buffer = await file.arrayBuffer();
        const ext = file.name.split(".").pop()?.toLowerCase();
        let workbook;

        if (ext === "xlsx" || ext === "xls") {
          workbook = await parseXLSX(buffer, file.name);
        } else if (ext === "csv") {
          const text = new TextDecoder().decode(buffer);
          workbook = parseCSV(text, file.name, {
            format: "csv",
            delimiter: ",",
            hasHeader: true,
          });
        } else {
          throw new Error("不支持的文件格式，请使用 .xlsx, .xls 或 .csv 文件");
        }

        // 更新 Store（导入器已直接返回 NormalizedTable，无需桥接转换）
        setTable(workbook, file.name);
        useHistoryStore.getState().clear();

        // 重置列选择
        setSelectedColumn(null);

        message.success(`成功导入：${file.name}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "导入文件失败");
      } finally {
        setProcessing(false);
        // 重置 input 以便重复选择同一文件
        e.target.value = "";
      }
    },
    [setTable, setProcessing, setError],
  );

  // ================================================================
  // 导出文件（带确认弹窗 + 格式选择）
  // ================================================================
  const handleExportClick = useCallback(() => {
    if (!table) {
      message.warning("请先导入文件");
      return;
    }
    setExportModalOpen(true);
  }, [table]);

  /** 确认导出：执行实际的导出逻辑 */
  const doExport = useCallback(
    async (format: "xlsx" | "csv") => {
      if (!table) return;
      setExportModalOpen(false);
      setProcessing(true);

      try {
        const baseName = (fileName ?? "export").replace(/\.[^.]+$/, "");

        if (format === "xlsx") {
          const buffer = await exportToXLSX(table);
          const exportFileName = `${baseName}_规范化.xlsx`;
          await saveFile(buffer, exportFileName, [
            { name: "Excel 文件", extensions: ["xlsx"] },
          ]);
          message.success(`已导出：${exportFileName}`);
        } else {
          const csvText = exportToCSV(table, {
            includeHeader: true,
            delimiter: ",",
          });
          const exportFileName = `${baseName}_规范化.csv`;
          const encoder = new TextEncoder();
          await saveFile(
            encoder.encode("\uFEFF" + csvText),
            exportFileName,
            [{ name: "CSV 文件", extensions: ["csv"] }],
          );
          message.success(`已导出：${exportFileName}`);
        }
      } catch (err) {
        message.error(
          `导出失败: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        setProcessing(false);
      }
    },
    [table, fileName, setProcessing],
  );

  // ================================================================
  // 键盘快捷键
  // ================================================================
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && e.key === "z") {
        e.preventDefault();
        undo();
      }
      if (e.ctrlKey && (e.key === "y" || (e.shiftKey && e.key === "z"))) {
        e.preventDefault();
        redo();
      }
    },
    [undo, redo],
  );

  // ================================================================
  // 渲染
  // ================================================================
  return (
    <ConfigProvider locale={zhCN}>
      <div
        className="app-layout"
        onKeyDown={handleKeyDown}
        tabIndex={0}
        style={{ outline: "none", height: "100vh", display: "flex", flexDirection: "column" }}
      >
        {/* 顶部标题栏 */}
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 16px",
            background: "#fff",
            borderBottom: "1px solid #f0f0f0",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Excel 规范化工具</h1>
            {fileName && (
              <span style={{ fontSize: 12, color: "#999" }}>{fileName}</span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {/* Undo / Redo */}
            <Button
              icon={<UndoOutlined />}
              onClick={undo}
              disabled={!useHistoryStore((s) => s.canUndo) || isProcessing}
              title="撤销 (Ctrl+Z)"
            />
            <Button
              icon={<RedoOutlined />}
              onClick={redo}
              disabled={!useHistoryStore((s) => s.canRedo) || isProcessing}
              title="重做 (Ctrl+Y)"
            />
            <Button
              type="primary"
              onClick={handleImportClick}
              loading={isProcessing}
            >
              导入
            </Button>
            <Button
              icon={<DownloadOutlined />}
              onClick={handleExportClick}
              disabled={!table || isProcessing}
            >
              导出
            </Button>
          </div>
        </header>

        {/* 隐藏的文件选择器 */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />

        {/* 主内容区 */}
        <main style={{ flex: 1, overflow: "hidden", display: "flex" }}>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <DataGrid
              table={table}
              selectedColumn={selectedColumn}
              onColumnSelect={setSelectedColumn}
            />
          </div>
          {table && (
            <OperationPanel
              onExecute={execute}
              isProcessing={isProcessing}
            />
          )}
        </main>

        {/* 状态栏 */}
        <StatusBar />

        {/* 确认弹窗（全局监听 confirmStore） */}
        <ConfirmDialog />

        {/* 导出确认弹窗 */}
        <ExportConfirmModal
          open={exportModalOpen}
          fileName={fileName ?? "export"}
          rowCount={table?.rows.length ?? 0}
          colCount={table?.columns.length ?? 0}
          onExport={(format) => doExport(format)}
          onCancel={() => setExportModalOpen(false)}
        />

        {/* 加载遮罩 */}
        {isProcessing && (
          <div className="loading-overlay">
            <div className="loading-spinner" />
            <p>处理中...</p>
          </div>
        )}
      </div>
    </ConfigProvider>
  );
}

// ================================================================
// 导出确认弹窗
// ================================================================
function ExportConfirmModal({
  open,
  fileName,
  rowCount,
  colCount,
  onExport,
  onCancel,
}: {
  open: boolean;
  fileName: string;
  rowCount: number;
  colCount: number;
  onExport: (format: "xlsx" | "csv") => void;
  onCancel: () => void;
}) {
  const baseName = fileName.replace(/\.[^.]+$/, "");

  return (
    <Modal
      title="导出文件"
      open={open}
      onCancel={onCancel}
      footer={null}
      width={420}
      centered
    >
      <div style={{ padding: "12px 0" }}>
        {/* 数据概览 */}
        <div className="export-info" style={{ marginBottom: 16, color: "#666", fontSize: 13 }}>
          <p style={{ margin: "0 0 8px 0" }}>
            <strong>文件名：</strong>
            {fileName}
          </p>
          <p style={{ margin: "0 0 8px 0" }}>
            <strong>数据规模：</strong>
            {rowCount} 行 × {colCount} 列
          </p>
        <p style={{ margin: 0, color: "#999", fontSize: 12 }}>
          桌面应用将弹出保存对话框，浏览器将自动下载
        </p>
        </div>

        {/* 格式选择 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Button
            type="primary"
            size="large"
            block
            icon={<FileExcelOutlined />}
            onClick={() => onExport("xlsx")}
          >
            导出 Excel (.xlsx)
            <span style={{ fontSize: 11, marginLeft: 8, opacity: 0.7 }}>
              {baseName}_规范化.xlsx
            </span>
          </Button>
          <Button
            size="large"
            block
            icon={<FileTextOutlined />}
            onClick={() => onExport("csv")}
          >
            导出 CSV (.csv)
            <span style={{ fontSize: 11, marginLeft: 8, opacity: 0.7 }}>
              {baseName}_规范化.csv
            </span>
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default App;
