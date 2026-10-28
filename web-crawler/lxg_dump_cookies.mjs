/**
 * lxg_dump_cookies.mjs — 从 Chrome 持久化 profile 导出理杏仁 cookie (JSON)
 *
 * 供 lxg_api_download.py 纯 HTTP 重放使用: 浏览器只用来取登录态,
 * 不渲染任何数据页面, 全程 ~4 秒。
 *
 * 用法: node lxg_dump_cookies.mjs [profileDir]
 *   默认 profileDir = ./chrome_user_data_finance_w0
 * 输出: stdout 打印 cookie 数组 JSON (Playwright context.cookies 格式)
 */
import { chromium } from 'playwright';
import path from 'path';

const profile = process.argv[2] || path.resolve('./chrome_user_data_finance_w0');

const context = await chromium.launchPersistentContext(profile, {
  headless: true,
  args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
});
const cookies = await context.cookies('https://www.lixinger.com');
await context.close();
process.stdout.write(JSON.stringify(cookies));
