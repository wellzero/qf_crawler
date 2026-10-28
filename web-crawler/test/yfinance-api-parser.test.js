import { jest } from '@jest/globals';
import YfinanceApiParser from '../src/parsers/yfinance-api-parser.js';

jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined)
}));

describe('YfinanceApiParser', () => {
  let parser;

  beforeEach(() => {
    parser = new YfinanceApiParser();
    jest.clearAllMocks();
  });

  describe('matches', () => {
    test('should match YFinance documentation URLs', () => {
      expect(parser.matches('https://www.aidoczh.com/yfinance/')).toBe(true);
      expect(parser.matches('https://www.aidoczh.com/yfinance/reference/yfinance.ticker.html')).toBe(true);
      expect(parser.matches('https://www.aidoczh.com/yfinance/tutorial/quickstart.html')).toBe(true);
      expect(parser.matches('http://www.aidoczh.com/yfinance/guide/index.html')).toBe(true);
    });

    test('should not match other URLs', () => {
      expect(parser.matches('https://aidoczh.com/yfinance/')).toBe(false);
      expect(parser.matches('https://www.aidoczh.com/')).toBe(false);
      expect(parser.matches('https://www.aidoczh.com/other/')).toBe(false);
      expect(parser.matches('https://yfinance.com/')).toBe(false);
    });
  });

  describe('getPriority', () => {
    test('should return 100 (high priority)', () => {
      expect(parser.getPriority()).toBe(100);
    });
  });

  describe('cleanTitle', () => {
    test('should remove Sphinx permalink symbols', () => {
      expect(parser.cleanTitle('yfinance.Ticker#')).toBe('yfinance.Ticker');
      expect(parser.cleanTitle('API Reference##')).toBe('API Reference');
      expect(parser.cleanTitle('Title')).toBe('Title');
    });

    test('should handle empty input', () => {
      expect(parser.cleanTitle('')).toBe('');
      expect(parser.cleanTitle(null)).toBe('');
    });
  });

  describe('generateFilename', () => {
    test('should use apiName when provided', () => {
      expect(parser.generateFilename('https://www.aidoczh.com/yfinance/reference/yfinance.ticker.html', 'yfinance.Ticker')).toBe('yfinance.Ticker');
      expect(parser.generateFilename('https://www.aidoczh.com/yfinance/reference/method.html', 'Ticker.history')).toBe('Ticker.history');
    });

    test('should generate filename from URL path', () => {
      expect(parser.generateFilename('https://www.aidoczh.com/yfinance/reference/yfinance.ticker.html')).toBe('yfinance.ticker');
      expect(parser.generateFilename('https://www.aidoczh.com/yfinance/reference/api/yfinance.Ticker.history.html')).toBe('yfinance.Ticker.history');
    });

    test('should handle index pages', () => {
      expect(parser.generateFilename('https://www.aidoczh.com/yfinance/reference/index.html')).toBe('index');
    });

    test('should handle invalid URLs', () => {
      expect(parser.generateFilename('invalid-url')).toBe('yfinance_doc');
    });
  });

  describe('generateTitle', () => {
    test('should use apiName when it contains dots', () => {
      expect(parser.generateTitle('https://url', 'Generic Title', 'yfinance.Ticker.history')).toBe('yfinance.Ticker.history');
    });

    test('should use extracted title when meaningful', () => {
      expect(parser.generateTitle('https://url', '日线行情', null)).toBe('日线行情');
      expect(parser.generateTitle('https://url', 'Stock History', null)).toBe('Stock History');
    });

    test('should extract from URL when title is generic', () => {
      const result = parser.generateTitle('https://www.aidoczh.com/yfinance/reference/yfinance.ticker.html', 'API参考', null);
      expect(result).toBe('yfinance.ticker');
    });

    test('should fallback to extracted title', () => {
      expect(parser.generateTitle('https://url', 'Some Title', null)).toBe('Some Title');
    });
  });

  describe('extractPageType', () => {
    test('should extract page type from URL', () => {
      expect(parser.extractPageType('https://www.aidoczh.com/yfinance/reference/method.html')).toBe('reference');
      expect(parser.extractPageType('https://www.aidoczh.com/yfinance/tutorial/quickstart.html')).toBe('tutorial');
      expect(parser.extractPageType('https://www.aidoczh.com/yfinance/guide/usage.html')).toBe('guide');
    });

    test('should return doc as default', () => {
      expect(parser.extractPageType('https://www.aidoczh.com/yfinance/other.html')).toBe('doc');
      expect(parser.extractPageType('invalid-url')).toBe('doc');
    });
  });

  describe('supportsLinkDiscovery', () => {
    test('should return true', () => {
      expect(parser.supportsLinkDiscovery()).toBe(true);
    });
  });

  describe('discoverLinks', () => {
    test('should discover links from sidebar', async () => {
      const mockPage = {
        url: jest.fn().mockReturnValue('https://www.aidoczh.com/yfinance/reference/index.html'),
        evaluate: jest.fn().mockResolvedValue([
          'https://www.aidoczh.com/yfinance/reference/yfinance.ticker.html',
          'https://www.aidoczh.com/yfinance/reference/yfinance.market.html'
        ])
      };

      const links = await parser.discoverLinks(mockPage);

      expect(Array.isArray(links)).toBe(true);
    });

    test('should handle errors gracefully', async () => {
      const mockPage = {
        url: jest.fn().mockReturnValue('https://www.aidoczh.com/yfinance/reference'),
        evaluate: jest.fn().mockRejectedValue(new Error('Evaluate failed'))
      };

      const links = await parser.discoverLinks(mockPage);

      expect(links).toEqual([]);
    });
  });

  describe('waitForContent', () => {
    test('should wait for Sphinx content selectors', async () => {
      const page = {
        waitForLoadState: jest.fn().mockResolvedValue(undefined),
        waitForSelector: jest.fn().mockResolvedValue(undefined),
        waitForTimeout: jest.fn().mockResolvedValue(undefined)
      };

      await parser.waitForContent(page);
      expect(page.waitForLoadState).toHaveBeenCalledWith('domcontentloaded', { timeout: 30000 });
      expect(page.waitForSelector).toHaveBeenCalled();
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
      expect(parser.sanitizeFilename('test file')).toBe('test_file');
      expect(parser.sanitizeFilename('file\\/:*?"<>|name')).toBe('file_name');
    });

    test('should handle empty input', () => {
      expect(parser.sanitizeFilename('')).toBe('');
      expect(parser.sanitizeFilename(null)).toBe('');
    });

    test('should truncate long filenames', () => {
      const longName = 'very_long_file_name_that_exceeds_eighty_characters_limit_test';
      expect(parser.sanitizeFilename(longName).length).toBeLessThanOrEqual(80);
    });
  });

  describe('determineTableType', () => {
    test('should identify parameters table', () => {
      expect(parser.determineTableType({}, ['参数', '类型', '描述'])).toBe('parameters');
      expect(parser.determineTableType({}, ['name', 'type', 'description'])).toBe('parameters');
    });

    test('should identify returns table', () => {
      expect(parser.determineTableType({}, ['返回', '类型', '描述'])).toBe('returns');
      expect(parser.determineTableType({}, ['return', 'type', 'description'])).toBe('returns');
    });

    test('should identify attributes table', () => {
      expect(parser.determineTableType({}, ['属性', '类型', '描述'])).toBe('attributes');
      expect(parser.determineTableType({}, ['attribute', 'type'])).toBe('attributes');
    });

    test('should return unknown for unrecognized tables', () => {
      expect(parser.determineTableType({}, ['col1', 'col2', 'col3'])).toBe('unknown');
    });
  });

  describe('buildSingleMemberMarkdown', () => {
    test('should build markdown for method member', () => {
      const member = {
        type: 'method',
        name: 'history',
        signature: 'history(period="1mo")',
        description: 'Get historical prices',
        parameters: ['period', 'interval']
      };

      const markdown = parser.buildSingleMemberMarkdown(member, 'Ticker', 'https://url');

      expect(markdown).toContain('# Ticker.history()');
      expect(markdown).toContain('## 类型');
      expect(markdown).toContain('方法');
      expect(markdown).toContain('## 签名');
      expect(markdown).toContain('## 参数');
    });

    test('should build markdown for attribute member', () => {
      const member = {
        type: 'attribute',
        name: 'ticker',
        signature: 'ticker',
        description: 'Stock ticker symbol'
      };

      const markdown = parser.buildSingleMemberMarkdown(member, 'Ticker', 'https://url');

      expect(markdown).toContain('# Ticker.ticker');
      expect(markdown).toContain('## 类型');
      expect(markdown).toContain('属性');
    });
  });

  describe('parse', () => {
    test('should return yfinance-api type with parsed data', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockResolvedValue(undefined),
        waitForSelector: jest.fn().mockResolvedValue(undefined),
        waitForTimeout: jest.fn().mockResolvedValue(undefined),
        evaluate: jest.fn().mockResolvedValue({
          title: 'yfinance.Ticker',
          apiName: 'yfinance.Ticker',
          description: 'Stock ticker class',
          signature: 'class Ticker(ticker)',
          parameters: [],
          returns: [],
          attributes: [{ name: 'ticker', type: 'str', description: 'Symbol' }],
          tables: [],
          codeExamples: [{ language: 'python', code: 'import yfinance as yf' }],
          notes: [],
          examples: [],
          seeAlso: [],
          sidebarLinks: [],
          rawContent: 'raw',
          isClassPage: false,
          apiMembers: []
        })
      };

      const result = await parser.parse(mockPage, 'https://www.aidoczh.com/yfinance/reference/yfinance.ticker.html');

      expect(result.type).toBe('yfinance-api');
      expect(result.url).toBe('https://www.aidoczh.com/yfinance/reference/yfinance.ticker.html');
      expect(result.pageType).toBe('reference');
      expect(result.apiName).toBe('yfinance.Ticker');
      expect(result.attributes.length).toBe(1);
    });

    test('should handle class pages with apiMembers', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockResolvedValue(undefined),
        waitForSelector: jest.fn().mockResolvedValue(undefined),
        waitForTimeout: jest.fn().mockResolvedValue(undefined),
        evaluate: jest.fn().mockResolvedValue({
          title: 'Ticker',
          apiName: 'Ticker',
          description: 'Ticker class',
          signature: 'class Ticker',
          parameters: [],
          returns: [],
          attributes: [],
          tables: [],
          codeExamples: [],
          notes: [],
          examples: [],
          seeAlso: [],
          sidebarLinks: [],
          rawContent: '',
          isClassPage: true,
          apiMembers: [
            { type: 'method', name: 'history', signature: 'history()', description: 'Get history' }
          ]
        })
      };

      const result = await parser.parse(mockPage, 'https://www.aidoczh.com/yfinance/reference/yfinance.ticker.html');

      expect(result.isClassPage).toBe(true);
      expect(result.apiMembers.length).toBe(1);
      expect(result.skipDefaultMarkdownOutput).toBe(true);
    });

    test('should handle errors gracefully', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockRejectedValue(new Error('Page error')),
        waitForSelector: jest.fn().mockResolvedValue(undefined),
        waitForTimeout: jest.fn().mockResolvedValue(undefined),
        evaluate: jest.fn().mockRejectedValue(new Error('Parse error'))
      };

      const result = await parser.parse(mockPage, 'https://www.aidoczh.com/yfinance/reference/yfinance.ticker.html');

      expect(result.type).toBe('yfinance-api');
      expect(result.url).toBe('https://www.aidoczh.com/yfinance/reference/yfinance.ticker.html');
      expect(result.title).toBe('');
      expect(result.parameters).toEqual([]);
    });
  });
});