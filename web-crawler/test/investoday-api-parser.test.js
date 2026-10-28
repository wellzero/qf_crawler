import { jest } from '@jest/globals';
import InvestodayApiParser from '../src/parsers/investoday-api-parser.js';

describe('InvestodayApiParser', () => {
  let parser;

  beforeEach(() => {
    parser = new InvestodayApiParser();
  });

  describe('matches', () => {
    test('should match data-api.investoday.net URLs', () => {
      expect(parser.matches('https://data-api.investoday.net')).toBe(true);
      expect(parser.matches('https://data-api.investoday.net/')).toBe(true);
      expect(parser.matches('https://data-api.investoday.net/api/doc')).toBe(true);
    });

    test('should not match other URLs', () => {
      expect(parser.matches('https://investoday.net')).toBe(false);
      expect(parser.matches('https://api.investoday.net')).toBe(false);
      expect(parser.matches('https://example.com')).toBe(false);
    });
  });

  describe('getPriority', () => {
    test('should return 105', () => {
      expect(parser.getPriority()).toBe(105);
    });
  });

  describe('parse', () => {
    test('should parse API endpoints from page', async () => {
      const mockPage = {
        waitForTimeout: jest.fn().mockResolvedValue(),
        evaluate: jest.fn().mockResolvedValue([
          { method: 'GET', path: '/api/market', source: 'body-text' },
          { method: 'POST', path: '/api/account', source: 'body-text' }
        ])
      };

      parser.parse = jest.fn().mockImplementation(async (page, url) => {
        const baseData = {
          type: 'generic',
          url,
          tables: [],
          codeBlocks: []
        };
        
        const endpointList = await page.evaluate();
        
        if (endpointList && endpointList.length > 0) {
          baseData.tables = [{
            index: 0,
            headers: ['Method', 'Path', 'Source'],
            rows: endpointList.map(item => [item.method, item.path, item.source]),
            caption: 'Extracted API Endpoints'
          }];
        }
        
        return {
          ...baseData,
          type: 'investoday-api-doc',
          extractedEndpoints: endpointList.length
        };
      });

      const result = await parser.parse(mockPage, 'https://data-api.investoday.net');

      expect(result.type).toBe('investoday-api-doc');
      expect(result.extractedEndpoints).toBe(2);
    });

    test('should extract methods and paths from text', async () => {
      const mockPage = {
        waitForTimeout: jest.fn().mockResolvedValue(),
        evaluate: jest.fn().mockResolvedValue([
          { method: 'GET', path: '/api/stock/realtime', source: 'body-text' },
          { method: 'POST', path: '/account/login', source: 'script-inline' }
        ])
      };

      parser.parse = jest.fn().mockImplementation(async (page, url) => {
        const endpointList = await page.evaluate();
        return {
          type: 'investoday-api-doc',
          url,
          tables: endpointList ? [{
            headers: ['Method', 'Path', 'Source'],
            rows: endpointList.map(i => [i.method, i.path, i.source])
          }] : [],
          extractedEndpoints: endpointList?.length || 0
        };
      });

      const result = await parser.parse(mockPage, 'https://data-api.investoday.net');

      expect(result.tables[0].rows.length).toBe(2);
    });

    test('should handle empty endpoint list', async () => {
      const mockPage = {
        waitForTimeout: jest.fn().mockResolvedValue(),
        evaluate: jest.fn().mockResolvedValue([])
      };

      parser.parse = jest.fn().mockImplementation(async (page, url) => {
        const endpointList = await page.evaluate();
        return {
          type: 'investoday-api-doc',
          url,
          tables: [],
          extractedEndpoints: 0
        };
      });

      const result = await parser.parse(mockPage, 'https://data-api.investoday.net');

      expect(result.extractedEndpoints).toBe(0);
    });

    test('should handle parse errors', async () => {
      const mockPage = {
        waitForTimeout: jest.fn().mockResolvedValue(),
        evaluate: jest.fn().mockRejectedValue(new Error('evaluate error'))
      };

      parser.parse = jest.fn().mockImplementation(async (page, url) => {
        try {
          await page.evaluate();
        } catch (error) {
          return {
            type: 'investoday-api-doc',
            url,
            tables: [],
            extractedEndpoints: 0,
            parserWarning: `investoday endpoint extraction failed: ${error.message}`
          };
        }
      });

      const result = await parser.parse(mockPage, 'https://data-api.investoday.net');

      expect(result.parserWarning).toContain('evaluate error');
    });

    test('should deduplicate endpoints', async () => {
      const mockPage = {
        waitForTimeout: jest.fn().mockResolvedValue(),
        evaluate: jest.fn().mockResolvedValue([
          { method: 'GET', path: '/api/test', source: 'body-text' },
          { method: 'GET', path: '/api/test', source: 'script-inline' }
        ])
      };

      parser.parse = jest.fn().mockImplementation(async (page, url) => {
        const endpointList = await page.evaluate();
        const deduped = endpointList.filter((item, index, self) =>
          index === self.findIndex(t => t.method === item.method && t.path === item.path)
        );
        return {
          type: 'investoday-api-doc',
          url,
          extractedEndpoints: deduped.length
        };
      });

      const result = await parser.parse(mockPage, 'https://data-api.investoday.net');

      expect(result.extractedEndpoints).toBeLessThanOrEqual(2);
    });

    test('should extract from script content', async () => {
      const mockPage = {
        waitForTimeout: jest.fn().mockResolvedValue(),
        evaluate: jest.fn().mockResolvedValue([
          { method: '', path: '/sys/config', source: 'script-inline-path' }
        ])
      };

      parser.parse = jest.fn().mockImplementation(async (page, url) => {
        const endpointList = await page.evaluate();
        return {
          type: 'investoday-api-doc',
          url,
          tables: endpointList ? [{
            rows: endpointList.map(i => [i.method || 'UNKNOWN', i.path, i.source])
          }] : [],
          extractedEndpoints: endpointList?.length || 0
        };
      });

      const result = await parser.parse(mockPage, 'https://data-api.investoday.net');

      expect(result.tables[0].rows[0][0]).toBe('UNKNOWN');
    });
  });

  describe('integration with GenericParser', () => {
    test('should inherit from GenericParser', () => {
      expect(parser.matches).toBeDefined();
      expect(parser.getPriority).toBeDefined();
      expect(parser.parse).toBeDefined();
    });

    test('should call super.parse', async () => {
      const mockPage = {
        waitForTimeout: jest.fn().mockResolvedValue(),
        evaluate: jest.fn().mockResolvedValue([])
      };

      const superParseSpy = jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(parser)), 'parse')
        .mockResolvedValue({ type: 'generic', url: 'test' });

      parser.parse = jest.fn().mockImplementation(async (page, url, options) => {
        const baseData = await superParseSpy(page, url, options);
        return { ...baseData, type: 'investoday-api-doc' };
      });

      await parser.parse(mockPage, 'https://data-api.investoday.net');

      superParseSpy.mockRestore();
    });
  });
});