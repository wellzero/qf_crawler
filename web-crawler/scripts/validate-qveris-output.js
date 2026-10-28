#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const outRoot = path.join(__dirname, '..', 'output', 'qveris-api-docs');
  const pagesDirs = fs.readdirSync(outRoot).filter((n) => n.startsWith('pages-')).sort().reverse();
  if (pagesDirs.length === 0) {
    throw new Error('No pages-* output found under output/qveris-api-docs');
  }

  const latestPagesDir = pagesDirs[0];
  const mdPath = path.join(outRoot, latestPagesDir, 'qveris-api-docs.md');
  const md = fs.readFileSync(mdPath, 'utf8');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await page.goto('https://qveris.ai/docs', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(4000);

  const apiButton = page.locator('button', { hasText: /^API$/ }).first();
  if (await apiButton.count()) {
    await apiButton.click();
    await page.waitForTimeout(3000);
  }

  const web = await page.evaluate(() => {
    const toc = [...document.querySelectorAll('button.w-full.text-left, nav button')]
      .map((el) => el.textContent.trim())
      .filter(Boolean);
    return { toc: [...new Set(toc)] };
  });
  await browser.close();

  const fenceCount = (md.match(/```/g) || []).length;
  const missingToc = web.toc.filter((item) => !md.includes(item));
  const keyChecks = ['/search', '/tools/execute?tool_id={tool_id}', '/tools/by-ids', 'Base URL', '认证方式', '发现的端点'];
  const missingKeys = keyChecks.filter((item) => !md.includes(item));

  const reportLines = [
    '# QVeris 抓取结果核验报告',
    '',
    '- 轮次: 11',
    `- 最新输出: ${path.relative(path.join(__dirname, '..'), mdPath)}`,
    `- MD 行数: ${md.split('\n').length}`,
    `- Markdown 代码围栏标记数量: ${fenceCount} (${fenceCount % 2 === 0 ? '偶数, 结构正常' : '奇数, 可能异常'})`,
    '',
    '## 与原页面对照',
    '',
    '### 页面目录项(TOC)缺失检查',
    `- 页面目录项数: ${web.toc.length}`,
    `- MD缺失目录项数: ${missingToc.length}`,
    ...(missingToc.length ? missingToc.map((item) => `  - ${item}`) : ['- 未发现目录项缺失（基于可见TOC文本匹配）']),
    '',
    '### 关键接口信息检查',
    ...keyChecks.map((item) => `- ${item}: ${md.includes(item) ? '✅' : '❌'}`),
    '',
    '### Markdown 结构检查',
    `- 一级标题数量: ${(md.match(/^#\s+/gm) || []).length}`,
    `- 二级标题数量: ${(md.match(/^##\s+/gm) || []).length}`,
    `- 三级标题数量: ${(md.match(/^###\s+/gm) || []).length}`,
    `- 列表项数量: ${(md.match(/^- /gm) || []).length}`,
    `- 代码块数量: ${Math.floor(fenceCount / 2)}`,
    '',
    '## 结论',
    `- 本次 11 轮输出中，${missingKeys.length === 0 ? '关键接口字段均存在，未发现明显缺失。' : `存在关键字段缺失: ${missingKeys.join(', ')}`}`,
    `- Markdown 结构${fenceCount % 2 === 0 ? '未发现围栏错乱，段落层级清晰。' : '可能存在围栏错乱，需人工复核。'}`,
  ];

  const reportPath = path.join(outRoot, 'qveris-validation-report.md');
  fs.writeFileSync(reportPath, reportLines.join('\n'));
  console.log(`Validation report written: ${path.relative(path.join(__dirname, '..'), reportPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
