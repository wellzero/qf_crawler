import { jest } from '@jest/globals';
import TavilyApiParser from '../src/parsers/tavily-api-parser.js';

describe('TavilyApiParser', () => {
  let parser;

  beforeEach(() => {
    parser = new TavilyApiParser();
  });

  describe('matches', () => {
    test('should match Tavily API documentation URLs', () => {
      expect(parser.matches('https://docs.tavily.com/documentation/api-reference')).toBe(true);
      expect(parser.matches('https://docs.tavily.com/documentation/api-reference/search')).toBe(true);
      expect(parser.matches('http://docs.tavily.com/documentation/api-reference/extract')).toBe(true);
    });

    test('should not match non-api-reference URLs', () => {
      expect(parser.matches('https://docs.tavily.com/documentation')).toBe(false);
      expect(parser.matches('https://docs.tavily.com/')).toBe(false);
      expect(parser.matches('https://tavily.com/documentation/api-reference')).toBe(false);
    });
  });

  describe('getPriority', () => {
    test('should return 100 (high priority)', () => {
      expect(parser.getPriority()).toBe(100);
    });
  });

  describe('generateFilename', () => {
    test('should generate filename from URL path', () => {
      expect(parser.generateFilename('https://docs.tavily.com/documentation/api-reference/search')).toBe('search');
      expect(parser.generateFilename('https://docs.tavily.com/documentation/api-reference/extract')).toBe('extract');
    });

    test('should handle nested paths', () => {
      expect(parser.generateFilename('https://docs.tavily.com/documentation/api-reference/search/basic')).toBe('search_basic');
    });

    test('should handle root api-reference URL', () => {
      expect(parser.generateFilename('https://docs.tavily.com/documentation/api-reference')).toBe('api_overview');
      expect(parser.generateFilename('https://docs.tavily.com/documentation/api-reference/')).toBe('api_overview');
    });

    test('should handle invalid URLs', () => {
      expect(parser.generateFilename('invalid-url')).toBe('api_doc');
    });
  });

  describe('extractApiPath', () => {
    test('should extract API path from URL', () => {
      expect(parser.extractApiPath('https://docs.tavily.com/documentation/api-reference/search')).toBe('search');
      expect(parser.extractApiPath('https://docs.tavily.com/documentation/api-reference/extract')).toBe('extract');
    });

    test('should return empty string for root api-reference URL', () => {
      expect(parser.extractApiPath('https://docs.tavily.com/documentation/api-reference')).toBe('');
      expect(parser.extractApiPath('https://docs.tavily.com/documentation/api-reference/')).toBe('');
    });

    test('should handle invalid URLs', () => {
      expect(parser.extractApiPath('invalid-url')).toBe('');
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
    test('should return tavily-api type with parsed data', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockResolvedValue(undefined),
        waitForSelector: jest.fn().mockResolvedValue(undefined),
        waitForTimeout: jest.fn().mockResolvedValue(undefined),
        evaluate: jest.fn().mockResolvedValue({
          title: 'Search API',
          description: 'Search the web',
          method: 'POST',
          endpoint: '/search',
          baseUrl: 'https://api.tavily.com',
          parameters: [{ name: 'query', type: 'string', required: true, description: 'Search query' }],
          requestHeaders: [],
          requestBody: null,
          responseStructure: [],
          examples: [{ language: 'bash', code: 'curl -X POST https://api.tavily.com/search' }],
          mainContent: [],
          rawContent: 'raw content'
        })
      };

      const result = await parser.parse(mockPage, 'https://docs.tavily.com/documentation/api-reference/search');

      expect(result.type).toBe('tavily-api');
      expect(result.url).toBe('https://docs.tavily.com/documentation/api-reference/search');
      expect(result.title).toBe('Search API');
      expect(result.method).toBe('POST');
      expect(result.endpoint).toBe('/search');
      expect(result.parameters.length).toBe(1);
    });

    test('should handle errors gracefully', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockRejectedValue(new Error('Page error')),
        waitForSelector: jest.fn().mockResolvedValue(undefined),
        waitForTimeout: jest.fn().mockResolvedValue(undefined),
        evaluate: jest.fn().mockRejectedValue(new Error('Parse error'))
      };

      const result = await parser.parse(mockPage, 'https://docs.tavily.com/documentation/api-reference/search');

      expect(result.type).toBe('tavily-api');
      expect(result.url).toBe('https://docs.tavily.com/documentation/api-reference/search');
      expect(result.title).toBe('');
      expect(result.baseUrl).toBe('https://api.tavily.com');
    });
  });
});