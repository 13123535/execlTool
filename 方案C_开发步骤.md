方案C — 大文件虚拟化重构 开发步骤
═══════════════════════════════════════════════════════════

目标：支持百万级数据不卡死，Worker线程解析 + glide-data-grid虚拟渲染 + diff式操作

总开发周期预估：4~6天


第一阶段：类型&抽象层（基础，无依赖其他步骤）
───────────────────────────────────────────────────────

步骤1：engine/types.ts — 新增类型定义
  文件：src/engine/types.ts
  内容：
    + PatchDiff = { colIdx: number; rowIdx: number; oldValue: CellValue; newValue: CellValue }[]
    + CellValue 类型提权到 engine/types.ts（目前重复定义在两处）
    + DataChunk = { columns: Column[]; rows: Row[]; totalRows: number; loadedFrom: number; loadedTo: number }
    + ImportProgress = { phase: "parsing"|"done"; loadedRows: number; estimatedTotal: number | null }
  删掉 types/index.ts 中废弃的 SheetData/WorkbookData（旧格式）

步骤2：types/index.ts — 更新 Worker 协议
  文件：src/types/index.ts
  内容：
    + WorkerMessageType 新增:
        ImportProgress   = "importProgress"    // 主线程→UI 进度
        ExecuteDiff      = "executeDiff"        // 操作后的diff结果
        GetCellBatch     = "getCellBatch"       // Grid按需请求单元格
    + 新增 GetCellBatchPayload: { rowStart, rowEnd, colStart, colEnd }
    + 新增 ImportProgressPayload: { phase, loadedRows, estimatedTotal }
    + 新增 ExecuteDiffPayload: { diffs: PatchDiff, stats: { beforeRowCount, afterRowCount } }


第二阶段：Store 重构（核心数据层）
───────────────────────────────────────────────────────

步骤3：tableStore.ts — 重写
  文件：src/stores/tableStore.ts
  内容：
    State:
      + columns: Column[]          （不变）
      + rows: Row[]                （分片加载，但仍是全量数组，内存友好）
      + totalRowCount: number
      + loadedRowCount: number     （已加载行数，导入中动态增长）
      + isImporting: boolean       （导入进度中）
      + importProgress: number     （0-100 百分比）
      + isTruncated: boolean       （是否超限截断）
      + fileName: string | null
      + error: string | null
    Actions:
      + setColumns(columns)         只设列头
      + appendRows(newRows: Row[])  分片追加行
      + setTableFull(table)         全量替换（小文件用）
      + updateCell(colIdx, rowIdx, value)  单个单元格更新（diff还原用）
      + updateCells(diffs: PatchDiff)      批量diff更新
      + getRowSlice(start, end) → Row[]    按需取行（Grid用）
      + reset()

步骤4：historyStore.ts — 改为 diff 链
  文件：src/stores/historyStore.ts
  内容：
    HistoryItem 改为：
      + diffs: PatchDiff          操作产生的全部diff
      + reverseDiffs: PatchDiff   反向diff（旧值变新值）
      + label: string
      + detail: string
      + timestamp: number
    undo/redo 时：
      popUndo() → 用 reverseDiffs 调用 tableStore.updateCells() 还原
      popRedo() → 用 diffs 调用 tableStore.updateCells() 再次执行
    不再保存 Operation 实例引用（解除内存泄漏风险）


第三阶段：Worker 激活 + 导入流式化
───────────────────────────────────────────────────────

步骤5：excelWorker.ts — 激活 Worker
  文件：src/workers/excelWorker.ts
  内容：
    + 注册 Worker 消息处理：
        handleImport(filePath/buffer, options) → 流式解析 → 分批 postMessage
        handleExecuteOperation(table, operation) → 执行 → 返回 diff
    + 使用 startWorker(handlers) 框架

步骤6：xlsxImporter.ts — 流式改造
  文件：src/importers/xlsxImporter.ts
  内容：
    + 新增 parseXLSXStreaming(buffer, options, onChunk, onProgress)
      每读取 5000 行就回调 onChunk({columns, rows}) 
      解析完回调 onProgress({phase:"done"})
    + 保留原有 parseXLSX 用于小文件全量加载
    + 列头在第一批 chunk 中发出

步骤7：csvImporter.ts — 流式改造（同 xlsx）
  文件：src/importers/csvImporter.ts
  内容：
    + PapaParse 配置 step 回调，每 5000 行 flush

步骤8：workerClient.ts — 增强
  文件：src/workers/workerClient.ts
  内容：
    + 加 onProgress 回调注册（监听 ImportProgress 消息）
    + 加超时 30s 自动 reject
    + sendAndListen(type, payload, onProgress?) 新API


第四阶段：glide-data-grid 集成
───────────────────────────────────────────────────────

步骤9：安装依赖
  命令：pnpm add @glideapps/glide-data-grid
  注意：glide-data-grid 需要 peerDeps react react-dom

步骤10：DataGrid.tsx — 完全重写（最大工作量）
  文件：src/components/DataGrid.tsx
  内容：
    + 使用 <DataEditor /> 组件，核心回调：
        getCellContent([col, row]) → { data, displayData, ... }
        getCellsForSelection → true（支持复制粘贴）
        onCellEdited → 本地编辑暂存
    + columns 映射：tableStore.columns → GridColumn[]
    + getCellContent 内部直接读 tableStore.getCell(colIdx, rowIdx)
      不构建全量 dataSource，零额外内存
    + 虚拟行高亮（row.isVirtual → themeOverride）
    + rowSpan 通过 drawCell 控制
    + 空值灰显样式
    + 分页/滚动由 glide 原生支持
    + 列头点击选中 → onColumnSelect 回调
    + 保留表格过大警告提示（rows.length > 某个阈值）

步骤11：App.tsx — 重新连线
  文件：src/App.tsx
  更改：
    + 导入流程改为：
        读 buffer → Worker.send("import", buffer) 
        → 监听 progress → tableStore.appendRows() 分批写入
        → 完成后设置 isTruncated 标志
    + DataGrid props 改为只传 selectedColumn + onColumnSelect（不再传 table）
    + 初始化 Worker：useEffect 中 createWorkerClient()
    + 销毁 Worker：useEffect return cleanup
    + 操作执行：
        useOperationExecutor.execute(type, params)
        → Worker.send("executeOperation", {table, serializedOp})
        → 返回 { diffs, stats }
        → tableStore.updateCells(diffs) + historyStore.push(diffs)
    + 移除 JSON.parse(JSON.stringify) 深拷贝


第五阶段：操作引擎适配
───────────────────────────────────────────────────────

步骤12：useOperationExecutor.ts — 改为 diff 模式
  文件：src/hooks/useOperationExecutor.ts
  内容：
    + execute() 不再深拷贝 table
    + 改为通过 workerClient.send("executeOperation", ...)
    + 收到 diff 后调 tableStore.updateCells(diffs)
    + 历史记录保存 diffs + reverseDiffs
    + 不再依赖 Operation 实例的私有快照

步骤13：操作类适配 — 添加 diff 输出（少量工作）
  说明：现有 12 个 Operation 的 execute() 都返回 NormalizedTable（全量），
        需要在 Worker 侧加一个包装函数，对比前后表生成 diff。
  做法：
    + 在 excelWorker.ts 中加一个 compareTables(old, new) → PatchDiff 工具函数
    + 每个操作仍然返回全量 NormalizedTable
    + Worker 层自动做 diff 比较后只传 diff 给主线程
  → 操作类本身不需要改任何代码！


第六阶段：导出器适配
───────────────────────────────────────────────────────

步骤14：xlsxExporter.ts — 分页写入
  文件：src/exporters/xlsxExporter.ts
  内容：
    + exportToXLSX 改为每 5000 行一个 worksheet.addRows() 批量写入
    + 避免一次性构建全量 rowValues 数组

步骤15：csvExporter.ts — 流式写入（改动极小）
  文件：src/exporters/csvExporter.ts
  内容：
    + 改为每 5000 行一段 Papa.unparse + 追加，最后 join
    + 或直接字符串拼接（对大文件更省内存）


第七阶段：验证 & 清理
───────────────────────────────────────────────────────

步骤16：删除废弃代码
  - 删除 types/index.ts 中的 SheetData / WorkbookData / CellData / RowData 旧类型
  - 删除 excelWorker.ts 中的空壳导出（如果完全重写）
  - 确认没有其他地方引用旧类型

步骤17：运行类型检查
  命令：cd excel-normalizer && pnpm tsc --noEmit

步骤18：运行测试
  命令：cd excel-normalizer && pnpm vitest run

步骤19：手动验证场景
  □ 小文件导入（<1000 行）→ 正常显示
  □ 大文件导入（10万+ 行）→ 不卡死，有进度条
  □ 操作执行（去空格）→ 只更新变化的单元格，UI 不闪
  □ 撤销/重做 → 正确还原
  □ 导出 CSV/XLSX → 结果正确


═══════════════════════════════════════════════════════════
文件改动汇总
───────────────────────────────────────────────────────
🔴 重写（6个文件）：
  1. DataGrid.tsx        (~220行重写为 ~300行)
  2. tableStore.ts       (~70行重写为 ~120行)
  3. historyStore.ts     (~120行重写为 ~80行)
  4. excelWorker.ts      (~8行→~150行)
  5. useOperationExecutor.ts (~100行重写为 ~80行)
  6. workerClient.ts     (~80行→~120行)

🟡 改动（5个文件）：
  7. xlsxImporter.ts     (+流式方法 ~60行)
  8. csvImporter.ts      (+流式方法 ~40行)
  9. App.tsx             (导入/Worker/t连线 ~50行改动)
  10. engine/types.ts    (+PatchDiff等 ~40行)
  11. types/index.ts     (+新协议 ~30行, -旧类型 ~60行)

🟡 轻改（2个文件）：
  12. xlsxExporter.ts    (分批写入 ~15行改动)
  13. csvExporter.ts     (分批输出 ~10行改动)

🟢 不动（~20个文件）：
  所有 operation/*.ts（12个）+ registry + panel + statusbar + confirm + exporters/index + importers/index

新增依赖：
  @glideapps/glide-data-grid