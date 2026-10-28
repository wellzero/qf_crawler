/**
 * lxg_bootstrap.mjs — 一次性引导: 抓取理杏仁各页面的
 *   1) 指标中文字典 (DOM 中 data-metrics-id="cn.non_financial.ps.toi" → 指标名)
 *   2) 各页面的 API 请求模板 (url + postData, stockId/日期范围在重放时替换)
 * 结果写入 JSON, 供 lxg_api_download.py 纯 HTTP 重放使用。
 *
 * 用法: node lxg_bootstrap.mjs [profileDir] [outJson]
 *   默认 profileDir = ./chrome_user_data_finance_w0
 *   默认 outJson    = /home/quant_volumn/quant_free/quant_free/datapull/lxg_api_templates.json
 *
 * 指标名与请求模板是同种 fsTableType (非金融企业) 通用的, 只需运行一次;
 * 若字典缺新指标或接口变更, 重新运行即可。
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const profile = process.argv[2] || path.resolve('./chrome_user_data_finance_w0');
const outJson = process.argv[3] || '/home/quant_volumn/quant_free/quant_free/datapull/lxg_api_templates.json';

const BASE = 'https://www.lixinger.com/analytics/company/detail/sh/600519/600519';
// 页面名 → 路径 (finance 页面带 granularity=q 以触发季报请求模板)
const PAGES = {
  ps: `${BASE}/ps?granularity=q`,
  bs: `${BASE}/bs?granularity=q`,
  cfs: `${BASE}/cfs?granularity=q`,
  m: `${BASE}/m?granularity=q`,
  revenue: `${BASE}/operation-revenue-constitution`,
  suppliers: `${BASE}/major-customers-and-suppliers`,
  // fundamental 页面 (指标矩阵, metrics_* 输出来源)
  profit: `${BASE}/fundamental/profit`,
  safety: `${BASE}/fundamental/safety`,
  growth: `${BASE}/fundamental/growth`,
  cashflow: `${BASE}/fundamental/cashflow`,
  'operation-capability': `${BASE}/fundamental/operation-capability`,
  costs: `${BASE}/fundamental/costs`,
  'per-capita': `${BASE}/fundamental/per-capita`,
  asset: `${BASE}/fundamental/asset`,
  debt: `${BASE}/fundamental/debt`,
  'custom-chart': `${BASE}/fundamental/custom-chart`,
  'surplus-reinvestment-rate': `${BASE}/fundamental/surplus-reinvestment-rate`,
  peg: `${BASE}/fundamental/peg`,
  dcf: `${BASE}/fundamental/dcf`,
  // 估值类 (metrics.csv 输出来源)
  valuation: `${BASE}/fundamental/valuation`,
  'valuation_primary': `${BASE}/fundamental/valuation/primary`,
  'valuation_other': `${BASE}/fundamental/valuation/other`,
  'valuation_band': `${BASE}/fundamental/valuation/band`,
};

const context = await chromium.launchPersistentContext(profile, {
  headless: true,
  args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  viewport: { width: 1920, height: 1080 },
});
const page = context.pages()[0] || await context.newPage();

const metrics = {};   // "ps.toi" -> "营业总收入"
const pages = {};     // pageName -> [{ url, post }]

let currentPage = null;
page.on('request', (req) => {
  if (!currentPage) return;
  const url = req.url();
  if (req.method() !== 'POST' || !url.includes('lixinger.com/api/company/')) return;
  const post = req.postData() || '';
  if (!post.includes('stockId')) return;   // 只要数据接口
  try {
    const entry = { url, post: JSON.parse(post) };
    const list = (pages[currentPage] = pages[currentPage] || []);
    const key = url + JSON.stringify(entry.post.metricsNames || entry.post.priceMetricsNames || '');
    if (!list.some(e => e.url + JSON.stringify(e.post.metricsNames || e.post.priceMetricsNames || '') === key)) {
      list.push(entry);
    }
  } catch {}
});

for (const [name, url] of Object.entries(PAGES)) {
  currentPage = name;
  console.log(`[bootstrap] ${name} ${url}`);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(8000);
    // 抓字典: data-metrics-id 图标所在 td 的文本即指标中文名
    const found = await page.evaluate(() => {
      const out = {};
      document.querySelectorAll('[data-metrics-id]').forEach(el => {
        const id = el.getAttribute('data-metrics-id') || '';
        const parts = id.split('.');
        if (parts.length < 2) return;
        const key = parts.slice(-2).join('.');
        const td = el.closest('td, th, .field-title, div');
        let label = (td?.innerText || '').replace(/\s+/g, '').trim();
        if (!label || label.length > 30) label = '';
        if (label && !out[key]) out[key] = label;
      });
      return out;
    });
    Object.assign(metrics, found);
    console.log(`  字典 +${Object.keys(found).length}, 接口 ${((pages[name] || []).length)} 个`);
  } catch (e) {
    console.log(`  失败: ${e.message}`);
  }
}
currentPage = null;
await context.close();

const result = { generatedAt: new Date().toISOString(), metrics, pages };
fs.mkdirSync(path.dirname(outJson), { recursive: true });
fs.writeFileSync(outJson, JSON.stringify(result, null, 1));
console.log(`\n写入 ${outJson}: 字典 ${Object.keys(metrics).length} 条, 页面 ${Object.keys(pages).length} 个`);
