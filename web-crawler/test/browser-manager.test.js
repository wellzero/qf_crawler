import BrowserManager from '../src/browser-manager.js';

describe('BrowserManager', () => {
  let browserManager;

  beforeEach(() => {
    browserManager = new BrowserManager();
  });

  afterEach(async () => {
    // 确保每个测试后关闭浏览器
    if (browserManager.browser) {
      await browserManager.close();
    }
  });

  describe('launch', () => {
    test('should launch browser in headless mode by default', async () => {
      await browserManager.launch();
      
      expect(browserManager.browser).toBeDefined();
      expect(browserManager.browser).not.toBeNull();
      expect(browserManager.defaultTimeout).toBe(30000);
    });

    test('should launch browser with custom headless option', async () => {
      // CI/container 环境通常没有 DISPLAY，无法启动 headed browser
      if (!process.env.DISPLAY) {
        await browserManager.launch({ headless: true });
      } else {
        await browserManager.launch({ headless: false });
      }

      expect(browserManager.browser).toBeDefined();
      expect(browserManager.browser).not.toBeNull();
    });

    test('should launch browser with custom timeout', async () => {
      await browserManager.launch({ timeout: 60000 });
      
      expect(browserManager.browser).toBeDefined();
      expect(browserManager.defaultTimeout).toBe(60000);
    });
  });

  describe('newPage', () => {
    test('should create a new page after browser is launched', async () => {
      await browserManager.launch();
      const page = await browserManager.newPage();
      
      expect(page).toBeDefined();
      expect(typeof page.goto).toBe('function');
      
      await page.close();
    });

    test('should throw error if browser is not launched', async () => {
      await expect(browserManager.newPage()).rejects.toThrow(
        'Browser not launched. Call launch() first.'
      );
    });
  });

  describe('goto', () => {
    test('should navigate to a URL successfully', async () => {
      await browserManager.launch();
      const page = await browserManager.newPage();
      
      // 使用一个简单的data URL进行测试
      const response = await browserManager.goto(page, 'data:text/html,<h1>Test</h1>');
      
      expect(response).toBeDefined();
      
      await page.close();
    });

    test('should use default timeout if not specified', async () => {
      await browserManager.launch({ timeout: 5000 });
      const page = await browserManager.newPage();
      
      const response = await browserManager.goto(page, 'data:text/html,<h1>Test</h1>');
      
      expect(response).toBeDefined();
      
      await page.close();
    });

    test('should use custom timeout if specified', async () => {
      await browserManager.launch();
      const page = await browserManager.newPage();
      
      const response = await browserManager.goto(
        page, 
        'data:text/html,<h1>Test</h1>', 
        10000
      );
      
      expect(response).toBeDefined();
      
      await page.close();
    });

    test('should throw error on navigation failure', async () => {
      await browserManager.launch();
      const page = await browserManager.newPage();
      
      // 使用无效的URL和短超时
      await expect(
        browserManager.goto(page, 'http://127.0.0.1:1', 3000)
      ).rejects.toThrow(/Failed to navigate/);
      
      await page.close();
    }, 10000); // 增加测试超时到10秒
  });

  describe('waitForLoad', () => {
    test('should wait for page to load', async () => {
      await browserManager.launch();
      const page = await browserManager.newPage();
      
      await browserManager.goto(page, 'data:text/html,<h1>Test</h1>');
      
      // 对于简单的data URL，应该立即完成
      await expect(browserManager.waitForLoad(page, 5000)).resolves.not.toThrow();
      
      await page.close();
    });

    test('should use default timeout if not specified', async () => {
      await browserManager.launch({ timeout: 5000 });
      const page = await browserManager.newPage();
      
      await browserManager.goto(page, 'data:text/html,<h1>Test</h1>');
      await expect(browserManager.waitForLoad(page)).resolves.not.toThrow();
      
      await page.close();
    });
  });

  describe('close', () => {
    test('should close browser successfully', async () => {
      await browserManager.launch();
      
      expect(browserManager.browser).not.toBeNull();
      
      await browserManager.close();
      
      expect(browserManager.browser).toBeNull();
    });

    test('should handle close when browser is not launched', async () => {
      await expect(browserManager.close()).resolves.not.toThrow();
    });

    test('should handle multiple close calls', async () => {
      await browserManager.launch();
      await browserManager.close();
      await expect(browserManager.close()).resolves.not.toThrow();
    });
  });

  describe('integration', () => {
    test('should handle complete workflow', async () => {
      // 启动浏览器
      await browserManager.launch({ headless: true, timeout: 30000 });
      
      // 创建页面
      const page = await browserManager.newPage();
      
      // 导航到URL
      await browserManager.goto(page, 'data:text/html,<h1>Test Page</h1>');
      
      // 等待加载
      await browserManager.waitForLoad(page, 5000);
      
      // 验证页面内容
      const content = await page.content();
      expect(content).toContain('Test Page');
      
      // 关闭页面
      await page.close();
      
      // 关闭浏览器
      await browserManager.close();
      
      expect(browserManager.browser).toBeNull();
    });
  });
});
