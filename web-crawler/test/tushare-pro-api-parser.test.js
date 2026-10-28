import { jest } from '@jest/globals';
import TushareProApiParser from '../src/parsers/tushare-pro-api-parser.js';

describe('TushareProApiParser', () => {
  let parser;

  beforeEach(() => {
    parser = new TushareProApiParser();
  });

  describe('matches', () => {
    test('should match Tushare Pro documentation URLs', () => {
      expect(parser.matches('https://tushare.pro/document/2?doc_id=25')).toBe(true);
      expect(parser.matches('https://tushare.pro/document/1?doc_id=1')).toBe(true);
      expect(parser.matches('https://tushare.pro/document/')).toBe(true);
      expect(parser.matches('http://tushare.pro/document/2')).toBe(true);
    });

    test('should not match non-documentation URLs', () => {
      expect(parser.matches('https://tushare.pro/')).toBe(false);
      expect(parser.matches('https://tushare.pro/api')).toBe(false);
      expect(parser.matches('https://tushare.pro/user')).toBe(false);
      expect(parser.matches('https://example.com/document/2')).toBe(false);
    });
  });

  describe('getPriority', () => {
    test('should return 100 (high priority)', () => {
      expect(parser.getPriority()).toBe(100);
    });
  });

  describe('generateFilename', () => {
    test('should generate filename with API name', () => {
      expect(parser.generateFilename('https://tushare.pro/document/2?doc_id=25', 'daily')).toBe('daily_25');
      expect(parser.generateFilename('https://tushare.pro/document/2?doc_id=100', '股票列表')).toBe('股票列表_100');
    });

    test('should generate filename from doc_id when no API name', () => {
      expect(parser.generateFilename('https://tushare.pro/document/2?doc_id=25')).toBe('doc_25');
      expect(parser.generateFilename('https://tushare.pro/document/2?doc_id=100')).toBe('doc_100');
    });

    test('should handle invalid URLs', () => {
      expect(parser.generateFilename('invalid-url')).toBe('tushare_doc');
    });
  });

  describe('extractDocId', () => {
    test('should extract doc_id from URL', () => {
      expect(parser.extractDocId('https://tushare.pro/document/2?doc_id=25')).toBe('25');
      expect(parser.extractDocId('https://tushare.pro/document/2?doc_id=100')).toBe('100');
    });

    test('should return empty string for URLs without doc_id', () => {
      expect(parser.extractDocId('https://tushare.pro/document/2')).toBe('');
      expect(parser.extractDocId('https://tushare.pro/document/')).toBe('');
    });

    test('should handle invalid URLs', () => {
      expect(parser.extractDocId('invalid-url')).toBe('');
    });
  });

  describe('extractDocType', () => {
    test('should extract document type from URL', () => {
      expect(parser.extractDocType('https://tushare.pro/document/2?doc_id=25')).toBe('2');
      expect(parser.extractDocType('https://tushare.pro/document/1?doc_id=1')).toBe('1');
    });

    test('should return 2 as default', () => {
      expect(parser.extractDocType('https://tushare.pro/document')).toBe('2');
      expect(parser.extractDocType('invalid-url')).toBe('2');
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

  describe('parse', () => {
    test('should return tushare-pro-api type with parsed data', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockResolvedValue(undefined),
        waitForSelector: jest.fn().mockResolvedValue(undefined),
        waitForTimeout: jest.fn().mockResolvedValue(undefined),
        evaluate: jest.fn().mockResolvedValue({
          title: '日线行情',
          apiName: 'daily',
          description: '获取股票日线行情数据',
          limit: '单次最大3000',
          permission: '需要100积分',
          pointsRequired: '100',
          inputParams: [{ 名称: 'ts_code', 类型: 'str', 必选: '否', 描述: '股票代码' }],
          outputParams: [{ 名称: 'ts_code', 类型: 'str', 默认显示: '是', 描述: '股票代码' }],
          additionalTables: [],
          codeExample: 'pro = ts.pro_api()',
          dataExample: 'ts_code trade_date open high low close...',
          category: '股票数据 > 日线行情',
          paragraphs: [],
          lists: [],
          sidebarLinks: [],
          rawContent: 'raw content'
        })
      };

      const result = await parser.parse(mockPage, 'https://tushare.pro/document/2?doc_id=25');

      expect(result.type).toBe('tushare-pro-api');
      expect(result.url).toBe('https://tushare.pro/document/2?doc_id=25');
      expect(result.docId).toBe('25');
      expect(result.docType).toBe('2');
      expect(result.title).toBe('日线行情');
      expect(result.apiName).toBe('daily');
      expect(result.inputParams.length).toBe(1);
      expect(result.outputParams.length).toBe(1);
    });

    test('should handle errors gracefully', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockRejectedValue(new Error('Page error')),
        waitForSelector: jest.fn().mockResolvedValue(undefined),
        waitForTimeout: jest.fn().mockResolvedValue(undefined),
        evaluate: jest.fn().mockRejectedValue(new Error('Parse error'))
      };

      const result = await parser.parse(mockPage, 'https://tushare.pro/document/2?doc_id=25');

      expect(result.type).toBe('tushare-pro-api');
      expect(result.url).toBe('https://tushare.pro/document/2?doc_id=25');
      expect(result.docId).toBe('25');
      expect(result.title).toBe('');
      expect(result.inputParams).toEqual([]);
    });
  });
});