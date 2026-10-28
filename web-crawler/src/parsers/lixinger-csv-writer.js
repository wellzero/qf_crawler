/**
 * lixinger-csv-writer.js — 理杏仁解析器共用的 CSV 输出工具
 *
 * 财务报表/基本面分页数据直接落 CSV (不再经 markdown):
 * - RFC-4180 转义 (逗号/引号/换行)
 * - 同表头的多个表格合并不重复表头; 不同表头的表格块之间空行分隔
 * - 输出带 BOM (﻿), Excel 直接打开中文不乱码
 */

/**
 * CSV 单元格转义 (含逗号、引号、换行时加引号)
 */
export function csvEscape(cell) {
  const s = String(cell ?? '');
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/**
 * 将多个表格序列化为 CSV 文本。
 * 表头相同的表格合并 (不重复表头); 表头不同的表格之间用空行分隔。
 */
export function tablesToCSV(tables) {
  const lines = [];
  let prevHeaders = null;
  for (const table of tables) {
    const headers = (table.headers || []).map(h => String(h ?? ''));
    const headersChanged = !prevHeaders || headers.join('') !== prevHeaders.join('');
    if (headersChanged) {
      if (prevHeaders) lines.push('');
      lines.push(headers.map(h => csvEscape(h)).join(','));
      prevHeaders = headers;
    }
    for (const row of table.rows || []) {
      lines.push(row.map(c => csvEscape(c)).join(','));
    }
  }
  return '\uFEFF' + lines.join('\n') + '\n';
}

/**
 * 将表格保存为 CSV 文件, 返回实际写入的文件名。
 * uniqueOnExists 为 true 时, 若文件已存在则附加 URL 哈希避免覆盖
 * (分页财务报表需要; fundamental 页面保持原有的覆盖语义)。
 */
export async function saveTablesAsCSV(pagesDir, filename, tables, pageUrl, { uniqueOnExists = false } = {}) {
  const fs = await import('fs');
  let target = `${pagesDir}/${filename}`;
  if (uniqueOnExists && fs.existsSync(target)) {
    const crypto = await import('crypto');
    const urlHash = crypto.createHash('md5').update(pageUrl).digest('hex').substring(0, 8);
    target = `${pagesDir}/${filename.replace(/\.csv$/, '')}_${urlHash}.csv`;
  }
  fs.writeFileSync(target, tablesToCSV(tables), 'utf-8');
  return target.split('/').pop();
}
