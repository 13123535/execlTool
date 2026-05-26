/**
 * saveFile 工具模块
 * 负责文件保存功能，支持浏览器下载和 Tauri 原生保存对话框两种方式
 */

import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';

/**
 * 检测当前是否运行在 Tauri 环境中
 */
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * 触发浏览器下载（非 Tauri 环境）
 */
function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * 通过 Tauri 原生保存对话框保存文件
 * @param data - 文件二进制数据
 * @param defaultName - 默认文件名
 * @param filters - 文件类型过滤器
 */
async function saveViaTauri(
  data: Uint8Array,
  defaultName: string,
  filters: Array<{ name: string; extensions: string[] }>,
): Promise<void> {
  const filePath = await save({
    defaultPath: defaultName,
    filters,
  });

  if (!filePath) {
    // 用户取消了保存
    return;
  }

  await writeFile(filePath, data);
}

/**
 * 统一的保存文件入口
 *
 * 在 Tauri 桌面环境下弹出原生保存对话框；
 * 在浏览器环境下触发浏览器下载。
 *
 * @param data - 文件内容（Uint8Array / ArrayBuffer / Blob 均可）
 * @param fileName - 建议的文件名（含扩展名，如 "export.xlsx"）
 * @param filters - Tauri 环境下的文件类型过滤（浏览器环境忽略）
 * @param mimeType - 浏览器下载时的 MIME 类型（默认 application/octet-stream）
 */
export async function saveFile(
  data: Uint8Array | ArrayBuffer | Blob,
  fileName: string,
  filters?: Array<{ name: string; extensions: string[] }>,
  mimeType: string = 'application/octet-stream',
): Promise<void> {
  if (isTauri()) {
    if (data instanceof Blob) {
      const buffer = await data.arrayBuffer();
      data = new Uint8Array(buffer);
    }
    if (data instanceof ArrayBuffer) {
      data = new Uint8Array(data);
    }
    await saveViaTauri(
      data as Uint8Array,
      fileName,
      filters ?? [{ name: 'All Files', extensions: ['*'] }],
    );
  } else {
    if (data instanceof Blob) {
      downloadBlob(data, fileName);
    } else {
      let buffer: ArrayBuffer;
      if (data instanceof ArrayBuffer) {
        buffer = data;
      } else {
        buffer = data.buffer as ArrayBuffer;
      }
      const blob = new Blob([buffer], { type: mimeType });
      downloadBlob(blob, fileName);
    }
  }
}

/**
 * 保存文本内容到文件（如 CSV）
 */
export async function saveTextFile(
  content: string,
  fileName: string,
  filters?: Array<{ name: string; extensions: string[] }>,
): Promise<void> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  await saveFile(data, fileName, filters, 'text/csv;charset=utf-8');
}