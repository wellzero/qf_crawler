import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

/**
 * Browser Manager - 管理Playwright浏览器实例
 * 负责浏览器的启动、页面创建、导航和关闭
 */
class BrowserManager {
  constructor() {
    this.browser = null;
    this.context = null;
    this.storageStatePath = null;
    this.execFileAsync = promisify(execFile);
  }

  /**
   * 启动浏览器
   * @param {Object} options - 浏览器选项
   * @param {boolean} options.headless - 是否无头模式，默认true
   * @param {number} options.timeout - 默认超时时间（毫秒），默认30000
   * @param {string} options.storageStatePath - Cookie存储路径，用于保持登录状态
   * @param {string} options.userDataDir - Chrome用户数据目录，用于复用当前浏览器的登录状态
   * @param {boolean} options.ignoreHTTPSErrors - 是否忽略HTTPS证书错误，默认false
   * @returns {Promise<void>}
   */
  async launch(options = {}) {
    const {
      headless = true,
      timeout = 30000,
      storageStatePath = null,
      userDataDir = null,
      ignoreHTTPSErrors = false,
      fetchMethod = 'playwright'
    } = options;
    
    this.storageStatePath = storageStatePath;
    this.fetchMethod = fetchMethod;

    // If userDataDir is provided, use persistent context to reuse browser profile
    if (userDataDir) {
      const persistentOptions = {
        headless,
        timeout,
        channel: 'chrome',
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        locale: 'en-US',
        ignoreHTTPSErrors,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--disable-features=IsolateOrigins,site-per-process',
          '--no-sandbox',
          '--disable-setuid-sandbox'
        ]
      };

      try {
        this.context = await chromium.launchPersistentContext(userDataDir, persistentOptions);
        this.browser = this.context.browser();
        this.defaultTimeout = timeout;
        return;
      } catch (error) {
        console.warn('Failed to launch with user data dir, falling back to regular mode:', error.message);
        // Fall through to regular launch
      }
    }

    // Regular launch mode
    const launchOptions = {
      headless,
      timeout,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ]
    };

    // Try to use system Chrome if available, fallback to Chromium
    try {
      launchOptions.channel = 'chrome';
      this.browser = await chromium.launch(launchOptions);
    } catch (error) {
      // If Chrome channel fails, try without it (use bundled Chromium)
      delete launchOptions.channel;
      this.browser = await chromium.launch(launchOptions);
    }

    // Create a browser context with persistent storage
    const contextOptions = {
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      locale: 'en-US',
      ignoreHTTPSErrors
    };

    // Load saved cookies/storage if exists
    if (this.storageStatePath && fs.existsSync(this.storageStatePath)) {
      try {
        contextOptions.storageState = this.storageStatePath;
      } catch (error) {
        // If loading fails, continue without saved state
        console.warn('Failed to load storage state:', error.message);
      }
    }

    this.context = await this.browser.newContext(contextOptions);

    this.defaultTimeout = timeout;
  }

  /**
   * 保存浏览器状态（cookies等）以便下次复用
   * @returns {Promise<void>}
   */
  async saveStorageState() {
    if (this.context && this.storageStatePath) {
      try {
        // Ensure directory exists
        const dir = path.dirname(this.storageStatePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        await this.context.storageState({ path: this.storageStatePath });
      } catch (error) {
        console.warn('Failed to save storage state:', error.message);
      }
    }
  }

  /**
   * 创建新页面
   * @returns {Promise<Page>} Playwright页面对象
   * @throws {Error} 如果浏览器未启动
   */
  async newPage() {
    if (!this.context) {
      throw new Error('Browser not launched. Call launch() first.');
    }

    const page = await this.context.newPage();
    return page;
  }

  async fallbackLoadHtml(page, url, timeout) {
    const { stdout } = await this.execFileAsync('curl', [
      '-L',
      '--max-time',
      String(Math.ceil(timeout / 1000)),
      '--fail',
      url
    ], {
      maxBuffer: 10 * 1024 * 1024
    });

    if (!stdout || !stdout.trim()) {
      throw new Error('Fallback curl returned empty html');
    }

    const withBase = stdout.includes('<head')
      ? stdout.replace(/<head(.*?)>/i, `<head$1><base href="${url}">`)
      : `<base href="${url}">${stdout}`;

    // 使用 about:blank 避免导航超时
    await page.goto('about:blank', { timeout: 5000 });
    await page.setContent(withBase, {
      timeout,
      waitUntil: 'domcontentloaded'
    });
  }

  /**
   * 导航到URL
   * @param {Page} page - 页面对象
   * @param {string} url - 目标URL
   * @param {number} timeout - 超时时间（毫秒），可选
   * @param {Object} options - 导航选项
   * @returns {Promise<Response>} 页面响应对象
   * @throws {Error} 如果导航失败或超时
   */
  async goto(page, url, timeout, options = {}) {
    const actualTimeout = timeout || this.defaultTimeout;
    const forcePlaywright = options.forcePlaywright || false;

    // 如果配置为直接请求模式，拦截请求并只加载HTML（阻止所有JS/CSS/图片等资源以提升性能）
    if (this.fetchMethod === 'request' && !forcePlaywright) {
      try {
        await page.route('**/*', async (route) => {
          const request = route.request();
          if (request.resourceType() === 'document') {
            // 对主文档放行，使用Playwright内置的网络请求
            await route.continue();
          } else {
            // 阻止所有非文档资源（如 scripts, stylesheets, images, xhr）
            await route.abort();
          }
        });

        const response = await page.goto(url, {
          timeout: actualTimeout,
          waitUntil: 'domcontentloaded'
        });
        
        return response;
      } catch (error) {
        console.warn(`Request mode failed for ${url}, falling back to Playwright full mode: ${error.message}`);
        // 解除拦截以备回退
        await page.unroute('**/*');
      }
    }

    const domReadyTimeout = Math.min(actualTimeout, 15000);

    try {
      const response = await page.goto(url, {
        timeout: domReadyTimeout,
        waitUntil: 'domcontentloaded'
      });

      return response;
    } catch (error) {
      if (error?.message?.includes('Timeout')) {
        try {
          const response = await page.goto(url, {
            timeout: actualTimeout,
            waitUntil: 'commit'
          });

          // commit 后若 DOM 依然为空，改用 HTML 兜底注入
          const hasContent = await page.evaluate(() => {
            return Boolean(document.body && document.body.querySelector('*'));
          }).catch(() => false);

          if (!hasContent) {
            await this.fallbackLoadHtml(page, url, actualTimeout);
            return null;
          }

          return response;
        } catch (fallbackError) {
          try {
            await this.fallbackLoadHtml(page, url, actualTimeout);
            return null;
          } catch (htmlError) {
            throw new Error(`Failed to navigate to ${url}: ${fallbackError.message}; HTML fallback failed: ${htmlError.message}`);
          }
        }
      }

      throw new Error(`Failed to navigate to ${url}: ${error.message}`);
    }
  }

  /**
   * 等待页面加载完成
   * @param {Page} page - 页面对象
   * @param {number} timeout - 超时时间（毫秒），可选
   * @returns {Promise<void>}
   * @throws {Error} 如果等待超时
   */
  async waitForLoad(page, timeout) {
    const actualTimeout = timeout || this.defaultTimeout;

    try {
      // 使用 load 而不是 networkidle，对于 SPA 更可靠
      await page.waitForLoadState('load', {
        timeout: actualTimeout
      });
    } catch (error) {
      // 如果 load 也超时，尝试 domcontentloaded
      try {
        await page.waitForLoadState('domcontentloaded', { timeout: 5000 });
      } catch (e) {
        // 忽略，页面可能已经加载
      }
    }
  }

  /**
   * 关闭浏览器
   * @returns {Promise<void>}
   */
  async close() {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

export default BrowserManager;
