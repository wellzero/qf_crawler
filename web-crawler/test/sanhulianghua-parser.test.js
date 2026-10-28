import { jest } from '@jest/globals';
import SanhulianghuaParser from '../src/parsers/sanhulianghua-parser.js';

describe('SanhulianghuaParser', () => {
  let parser;

  beforeEach(() => {
    parser = new SanhulianghuaParser();
  });

  describe('matches', () => {
    test('should match sanhulianghua index.php docs URLs', () => {
      expect(parser.matches('http://www.sanhulianghua.com/index.php?do=page_base_hsa_gupiao')).toBe(true);
      expect(parser.matches('https://www.sanhulianghua.com/index.php?do=page_real_hsa_gegumin')).toBe(true);
      expect(parser.matches('https://www.sanhulianghua.com/index.php?do=page_base')).toBe(true);
    });

    test('should not match other URLs', () => {
      expect(parser.matches('https://example.com/index.php?do=page_base_hsa_gupiao')).toBe(false);
      expect(parser.matches('https://www.sanhulianghua.com/page_base')).toBe(false);
      expect(parser.matches('https://www.sanhulianghua.com/')).toBe(false);
    });
  });

  describe('getPriority', () => {
    test('should return 100 (high priority)', () => {
      expect(parser.getPriority()).toBe(100);
    });
  });

  describe('generateFilename', () => {
    test('should strip page_ prefix from do param', () => {
      expect(parser.generateFilename('http://www.sanhulianghua.com/index.php?do=page_base_hsa_gupiao')).toBe('base_hsa_gupiao');
      expect(parser.generateFilename('http://www.sanhulianghua.com/index.php?do=page_real_hsa_gegumin')).toBe('real_hsa_gegumin');
    });

    test('should handle URL without do param', () => {
      expect(parser.generateFilename('http://www.sanhulianghua.com/index.php')).toBe('sanhulianghua-api');
    });

    test('should handle invalid URLs', () => {
      expect(parser.generateFilename('invalid-url')).toBe('sanhulianghua-api');
    });
  });

  describe('waitForContent', () => {
    test('should wait for content selectors', async () => {
      const page = {
        waitForLoadState: jest.fn().mockResolvedValue(undefined),
        waitForSelector: jest.fn().mockResolvedValue(undefined),
        waitForTimeout: jest.fn().mockResolvedValue(undefined)
      };

      await parser.waitForContent(page);
      expect(page.waitForLoadState).toHaveBeenCalledWith('networkidle', { timeout: 30000 });
      expect(page.waitForSelector).toHaveBeenCalledWith('h2, table, p', { timeout: 15000 });
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

  describe('parse', () => {
    test('should return sanhulianghua-api type with parsed data', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockResolvedValue(undefined),
        waitForSelector: jest.fn().mockResolvedValue(undefined),
        waitForTimeout: jest.fn().mockResolvedValue(undefined),
        evaluate: jest.fn().mockResolvedValue({
          title: '股票基础数据',
          description: '获取股票基础信息',
          updateTime: '2024-01-01',
          endpoints: [{ type: 'http', url: 'http://api.sanhulianghua.com/stock' }],
          method: 'GET',
          parameters: [{ name: 'symbol', type: 'string', required: true, description: '股票代码' }],
          responses: [{ name: 'symbol', type: 'string', description: '股票代码' }],
          rawContent: 'raw content'
        })
      };

      const result = await parser.parse(mockPage, 'http://www.sanhulianghua.com/index.php?do=page_base_hsa_gupiao');

      expect(result.type).toBe('sanhulianghua-api');
      expect(result.url).toBe('http://www.sanhulianghua.com/index.php?do=page_base_hsa_gupiao');
      expect(result.title).toBe('股票基础数据');
      expect(result.parameters.length).toBe(1);
    });

    test('should handle parse errors gracefully', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockRejectedValue(new Error('Page error')),
        waitForSelector: jest.fn().mockResolvedValue(undefined),
        waitForTimeout: jest.fn().mockResolvedValue(undefined),
        evaluate: jest.fn().mockRejectedValue(new Error('Parse error'))
      };

      const result = await parser.parse(mockPage, 'http://www.sanhulianghua.com/index.php?do=page_base_hsa_gupiao');

      expect(result.type).toBe('sanhulianghua-api');
      expect(result.url).toBe('http://www.sanhulianghua.com/index.php?do=page_base_hsa_gupiao');
      expect(result.title).toBe('');
      expect(result.parameters).toEqual([]);
      expect(result.responses).toEqual([]);
      expect(result.suggestedFilename).toBe('base_hsa_gupiao');
    });

    test('should handle empty data gracefully', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockResolvedValue(undefined),
        waitForSelector: jest.fn().mockResolvedValue(undefined),
        waitForTimeout: jest.fn().mockResolvedValue(undefined),
        evaluate: jest.fn().mockResolvedValue({
          title: '',
          description: '',
          endpoints: [],
          method: 'GET',
          parameters: [],
          responses: [],
          rawContent: ''
        })
      };

      const result = await parser.parse(mockPage, 'http://www.sanhulianghua.com/index.php?do=page_test');

      expect(result.type).toBe('sanhulianghua-api');
      expect(result.title).toBe('');
      expect(result.parameters).toEqual([]);
    });

    test('should extract method from page content', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockResolvedValue(undefined),
        waitForSelector: jest.fn().mockResolvedValue(undefined),
        waitForTimeout: jest.fn().mockResolvedValue(undefined),
        evaluate: jest.fn().mockResolvedValue({
          title: 'API',
          description: '',
          endpoints: [],
          method: 'POST',
          parameters: [],
          responses: [],
          rawContent: '请求方式：POST'
        })
      };

      const result = await parser.parse(mockPage, 'http://www.sanhulianghua.com/index.php?do=page_test');

      expect(result.method).toBe('POST');
    });
  });
});
