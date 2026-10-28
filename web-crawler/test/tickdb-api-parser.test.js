import { jest } from '@jest/globals';
import TickdbApiParser from '../src/parsers/tickdb-api-parser.js';

describe('TickdbApiParser', () => {
  let parser;

  beforeEach(() => {
    parser = new TickdbApiParser();
  });

  describe('matches', () => {
    test('should match TickDB API documentation URLs', () => {
      expect(parser.matches('https://docs.tickdb.ai/en')).toBe(true);
      expect(parser.matches('https://docs.tickdb.ai/en/')).toBe(true);
      expect(parser.matches('https://docs.tickdb.ai/en/rest-api')).toBe(true);
      expect(parser.matches('http://docs.tickdb.ai/en/websocket')).toBe(true);
    });

    test('should not match non-en URLs', () => {
      expect(parser.matches('https://docs.tickdb.ai/')).toBe(false);
      expect(parser.matches('https://docs.tickdb.ai/zh')).toBe(false);
      expect(parser.matches('https://tickdb.ai/en')).toBe(false);
    });
  });

  describe('getPriority', () => {
    test('should return 100 (high priority)', () => {
      expect(parser.getPriority()).toBe(100);
    });
  });

  describe('generateFilename', () => {
    test('should generate filename from URL path', () => {
      expect(parser.generateFilename('https://docs.tickdb.ai/en/rest-api')).toBe('rest-api');
      expect(parser.generateFilename('https://docs.tickdb.ai/en/websocket')).toBe('websocket');
    });

    test('should handle nested paths', () => {
      expect(parser.generateFilename('https://docs.tickdb.ai/en/rest-api/stocks')).toBe('rest-api_stocks');
    });

    test('should use hash when present', () => {
      expect(parser.generateFilename('https://docs.tickdb.ai/en/rest-api#stocks')).toBe('stocks');
      expect(parser.generateFilename('https://docs.tickdb.ai/en#overview')).toBe('overview');
    });

    test('should handle root en URL', () => {
      expect(parser.generateFilename('https://docs.tickdb.ai/en')).toBe('api_overview');
      expect(parser.generateFilename('https://docs.tickdb.ai/en/')).toBe('api_overview');
    });

    test('should handle invalid URLs', () => {
      expect(parser.generateFilename('invalid-url')).toBe('api_doc');
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
      expect(page.waitForSelector).toHaveBeenCalledWith('h1', { timeout: 15000 });
      expect(page.waitForTimeout).toHaveBeenCalled();
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
    test('should return tickdb-api type with parsed data', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockResolvedValue(undefined),
        waitForSelector: jest.fn().mockResolvedValue(undefined),
        waitForTimeout: jest.fn().mockResolvedValue(undefined),
        evaluate: jest.fn().mockResolvedValue({
          title: 'REST API',
          markdownContent: '# REST API\n\nContent here',
          apiPath: '/api/v1/stocks',
          httpMethod: 'GET',
          codeExamples: [{ language: 'bash', code: 'curl https://api.tickdb.ai/v1/stocks' }]
        })
      };

      const result = await parser.parse(mockPage, 'https://docs.tickdb.ai/en/rest-api');

      expect(result.type).toBe('tickdb-api');
      expect(result.url).toBe('https://docs.tickdb.ai/en/rest-api');
      expect(result.title).toBe('REST API');
      expect(result.apiPath).toBe('/api/v1/stocks');
      expect(result.codeExamples.length).toBe(1);
    });

    test('should handle errors gracefully', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockRejectedValue(new Error('Page error')),
        waitForSelector: jest.fn().mockResolvedValue(undefined),
        waitForTimeout: jest.fn().mockResolvedValue(undefined),
        evaluate: jest.fn().mockRejectedValue(new Error('Parse error'))
      };

      const result = await parser.parse(mockPage, 'https://docs.tickdb.ai/en/rest-api');

      expect(result.type).toBe('tickdb-api');
      expect(result.url).toBe('https://docs.tickdb.ai/en/rest-api');
      expect(result.title).toBe('');
      expect(result.codeExamples).toEqual([]);
    });
  });
});