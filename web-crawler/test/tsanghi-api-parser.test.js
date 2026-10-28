import { jest } from '@jest/globals';
import TsanghiApiParser from '../src/parsers/tsanghi-api-parser.js';

jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('path', () => ({
  join: jest.fn((...args) => args.join('/'))
}));

describe('TsanghiApiParser', () => {
  let parser;

  beforeEach(() => {
    parser = new TsanghiApiParser();
    jest.clearAllMocks();
  });

  describe('supportsLinkDiscovery', () => {
    test('should return true (SPA needs custom link discovery)', () => {
      expect(parser.supportsLinkDiscovery()).toBe(true);
    });
  });

  describe('discoverLinks', () => {
    test('should return current URL only (SPA)', async () => {
      const mockPage = {
        url: jest.fn().mockReturnValue('https://tsanghi.com/fin/doc')
      };

      const links = await parser.discoverLinks(mockPage);

      expect(links).toEqual(['https://tsanghi.com/fin/doc']);
    });
  });

  describe('matches', () => {
    test('should match Tsanghi documentation URLs', () => {
      expect(parser.matches('https://tsanghi.com/fin/doc')).toBe(true);
      expect(parser.matches('https://tsanghi.com/fin/doc/')).toBe(true);
      expect(parser.matches('https://www.tsanghi.com/fin/doc')).toBe(true);
      expect(parser.matches('http://tsanghi.com/fin/doc')).toBe(true);
    });

    test('should not match non-documentation URLs', () => {
      expect(parser.matches('https://tsanghi.com/')).toBe(false);
      expect(parser.matches('https://tsanghi.com/fin')).toBe(false);
      expect(parser.matches('https://tsanghi.com/other/doc')).toBe(false);
    });
  });

  describe('getPriority', () => {
    test('should return 100 (high priority)', () => {
      expect(parser.getPriority()).toBe(100);
    });
  });

  describe('generateFilename', () => {
    test('should generate filename from menu path', () => {
      expect(parser.generateFilename('https://tsanghi.com/fin/doc', '股票 > 日行情')).toBe('股票_日行情');
    });

    test('should generate filename from URL when no menu path', () => {
      expect(parser.generateFilename('https://tsanghi.com/fin/doc?index=stock-daily')).toBe('doc_stock_daily');
    });

    test('should handle invalid URLs', () => {
      expect(parser.generateFilename('invalid-url')).toBe('api_doc');
    });

    test('should truncate long filenames', () => {
      const longPath = '很长的路径名称测试超过五十个字符的限制情况处理方式';
      const result = parser.generateFilename('https://tsanghi.com/fin/doc', longPath);
      expect(result.length).toBeLessThanOrEqual(50);
    });
  });

  describe('waitForContent', () => {
    test('should wait for Element UI menu', async () => {
      const page = {
        waitForLoadState: jest.fn().mockResolvedValue(undefined),
        waitForSelector: jest.fn().mockResolvedValue(undefined),
        waitForTimeout: jest.fn().mockResolvedValue(undefined)
      };

      await parser.waitForContent(page);
      expect(page.waitForLoadState).toHaveBeenCalledWith('domcontentloaded', { timeout: 30000 });
      expect(page.waitForSelector).toHaveBeenCalledWith('.el-menu', { timeout: 15000 });
    });

    test('should handle errors gracefully', async () => {
      const page = {
        waitForLoadState: jest.fn().mockRejectedValue(new Error('Timeout')),
        waitForSelector: jest.fn().mockResolvedValue(undefined),
        waitForTimeout: jest.fn().mockResolvedValue(undefined)
      };

      await expect(parser.waitForContent(page)).resolves.not.toThrow();
    });
  });

  describe('sanitizeFilename', () => {
    test('should sanitize filename correctly', () => {
      expect(parser.sanitizeFilename('test > file')).toBe('test_file');
      expect(parser.sanitizeFilename('file with spaces')).toBe('file_with_spaces');
      expect(parser.sanitizeFilename('file\\/:*?"<>|name')).toBe('file_name');
    });

    test('should handle empty input', () => {
      expect(parser.sanitizeFilename('')).toBe('');
      expect(parser.sanitizeFilename(null)).toBe('');
    });

    test('should truncate long filenames', () => {
      const longName = 'very_long_file_name_that_exceeds_one_hundred_characters_limit_test_test_test_test_test';
      expect(parser.sanitizeFilename(longName).length).toBeLessThanOrEqual(100);
    });
  });

  describe('buildSinglePageMarkdown', () => {
    test('should build markdown from page item', () => {
      const pageItem = {
        title: 'Stock API',
        breadcrumb: '股票 > 日行情',
        apiUrl: 'https://api.tsanghi.com/stock',
        httpMethod: 'GET',
        tables: [
          [
            ['Name', 'Type', 'Description'],
            ['symbol', 'string', 'Stock symbol']
          ]
        ],
        codeExamples: [{ language: 'bash', code: 'curl https://api.tsanghi.com/stock' }],
        content: 'Get daily stock prices'
      };

      const markdown = parser.buildSinglePageMarkdown(pageItem, 'https://tsanghi.com/fin/doc');

      expect(markdown).toContain('# Stock API');
      expect(markdown).toContain('## 源URL');
      expect(markdown).toContain('## 接口说明');
      expect(markdown).toContain('## 参数');
      expect(markdown).toContain('Name | Type | Description');
    });

    test('should handle minimal page item', () => {
      const pageItem = {
        title: 'Untitled'
      };

      const markdown = parser.buildSinglePageMarkdown(pageItem, 'https://tsanghi.com/fin/doc');

      expect(markdown).toContain('# Untitled');
      expect(markdown).toContain('## 源URL');
    });

    test('should handle tables correctly', () => {
      const pageItem = {
        title: 'API',
        tables: [
          [
            ['col1', 'col2'],
            ['val1', 'val2']
          ]
        ]
      };

      const markdown = parser.buildSinglePageMarkdown(pageItem, 'https://tsanghi.com/fin/doc');

      expect(markdown).toContain('## 参数');
      expect(markdown).toContain('| col1 | col2 |');
    });

    test('should handle multiple tables', () => {
      const pageItem = {
        title: 'API',
        tables: [
          [['Header'], ['Value']],
          [['Another Header'], ['Another Value']]
        ]
      };

      const markdown = parser.buildSinglePageMarkdown(pageItem, 'https://tsanghi.com/fin/doc');

      expect(markdown).toContain('| Header |');
      expect(markdown).toContain('| Another Header |');
    });
  });

  describe('parse', () => {
    test('should return tsanghi-api type with pages', async () => {
      parser.waitForContent = jest.fn().mockResolvedValue(undefined);
      parser.crawlAllPages = jest.fn().mockResolvedValue([
        { title: 'Page 1', breadcrumb: 'Category 1', content: 'Content 1' }
      ]);

      const mockPage = {
        waitForLoadState: jest.fn().mockResolvedValue(undefined),
        waitForSelector: jest.fn().mockResolvedValue(undefined),
        waitForTimeout: jest.fn().mockResolvedValue(undefined)
      };

      const result = await parser.parse(mockPage, 'https://tsanghi.com/fin/doc');

      expect(result.type).toBe('tsanghi-api');
      expect(result.url).toBe('https://tsanghi.com/fin/doc');
      expect(result.pages.length).toBe(1);
      expect(result.skipDefaultMarkdownOutput).toBe(true);
    });

    test('should handle errors gracefully', async () => {
      parser.waitForContent = jest.fn().mockRejectedValue(new Error('Failed'));
      parser.crawlAllPages = jest.fn().mockRejectedValue(new Error('Crawl failed'));

      const mockPage = {};

      const result = await parser.parse(mockPage, 'https://tsanghi.com/fin/doc');

      expect(result.type).toBe('tsanghi-api');
      expect(result.pages).toEqual([]);
      expect(result.skipDefaultMarkdownOutput).toBe(true);
    });
  });

  describe('expandAllMenus', () => {
    test('should expand collapsed submenus', async () => {
      const mockPage = {
        $$: jest.fn().mockResolvedValue([
          { evaluate: jest.fn().mockResolvedValue(false), click: jest.fn().mockResolvedValue(undefined) }
        ]),
        waitForTimeout: jest.fn().mockResolvedValue(undefined)
      };

      await parser.expandAllMenus(mockPage);

      expect(mockPage.$$).toHaveBeenCalledWith('.el-submenu');
    });

    test('should skip already expanded menus', async () => {
      const mockPage = {
        $$: jest.fn().mockResolvedValue([
          { evaluate: jest.fn().mockResolvedValue(true) }
        ]),
        waitForTimeout: jest.fn().mockResolvedValue(undefined)
      };

      await parser.expandAllMenus(mockPage);
    });
  });

  describe('extractPageContent', () => {
    test('should extract content from page', async () => {
      const mockPage = {
        evaluate: jest.fn().mockResolvedValue({
          breadcrumb: '股票 > 日行情',
          title: 'Stock Daily',
          apiUrl: 'https://api.tsanghi.com/stock',
          httpMethod: 'GET',
          tables: [],
          codeExamples: [],
          content: 'Get daily stock prices'
        })
      };

      const content = await parser.extractPageContent(mockPage);

      expect(content.title).toBe('Stock Daily');
      expect(content.breadcrumb).toBe('股票 > 日行情');
      expect(content.httpMethod).toBe('GET');
    });

    test('should return null when no content container', async () => {
      const mockPage = {
        evaluate: jest.fn().mockResolvedValue(null)
      };

      const content = await parser.extractPageContent(mockPage);

      expect(content).toBeNull();
    });
  });

  describe('getMenuPath', () => {
    test('should extract menu path from element', async () => {
      const mockItem = {
        evaluate: jest.fn().mockResolvedValue('Category > Subcategory > Item')
      };

      const path = await parser.getMenuPath(mockItem);

      expect(path).toBe('Category > Subcategory > Item');
    });
  });
});