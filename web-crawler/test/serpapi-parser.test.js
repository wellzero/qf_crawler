import { jest } from '@jest/globals';
import SerpApiParser from '../src/parsers/serpapi-parser.js';

describe('SerpApiParser', () => {
  let parser;

  beforeEach(() => {
    parser = new SerpApiParser();
  });

  describe('matches', () => {
    test('should match SerpApi documentation URLs', () => {
      expect(parser.matches('https://serpapi.com/search-api')).toBe(true);
      expect(parser.matches('https://serpapi.com/baidu-news-api')).toBe(true);
      expect(parser.matches('https://serpapi.com/google-images-api')).toBe(true);
      expect(parser.matches('http://serpapi.com/youtube-api')).toBe(true);
    });

    test('should not match excluded non-documentation URLs', () => {
      expect(parser.matches('https://serpapi.com/users/123')).toBe(false);
      expect(parser.matches('https://serpapi.com/login')).toBe(false);
      expect(parser.matches('https://serpapi.com/signup')).toBe(false);
      expect(parser.matches('https://serpapi.com/dashboard')).toBe(false);
      expect(parser.matches('https://serpapi.com/plan')).toBe(false);
      expect(parser.matches('https://serpapi.com/legal/terms')).toBe(false);
    });

    test('should not match other domains', () => {
      expect(parser.matches('https://example.com/search-api')).toBe(false);
      expect(parser.matches('https://api.serpapi.com/search')).toBe(false);
    });
  });

  describe('getPriority', () => {
    test('should return 100 (high priority)', () => {
      expect(parser.getPriority()).toBe(100);
    });
  });

  describe('generateFilename', () => {
    test('should generate filename from URL path', () => {
      expect(parser.generateFilename('https://serpapi.com/search-api')).toBe('search-api-api');
      expect(parser.generateFilename('https://serpapi.com/baidu-news-api')).toBe('baidu-news-api-api');
    });

    test('should handle nested paths', () => {
      expect(parser.generateFilename('https://serpapi.com/structures/google')).toBe('structures_google-api');
    });

    test('should handle root URL', () => {
      expect(parser.generateFilename('https://serpapi.com/')).toBe('serpapi-home');
      expect(parser.generateFilename('https://serpapi.com')).toBe('serpapi-home');
    });

    test('should handle invalid URLs', () => {
      expect(parser.generateFilename('invalid-url')).toBe('serpapi-doc');
    });
  });

  describe('inferEngine', () => {
    test('should infer correct engine from URL', () => {
      expect(parser.inferEngine('https://serpapi.com/baidu-news-api')).toBe('baidu_news');
      expect(parser.inferEngine('https://serpapi.com/baidu-api')).toBe('baidu');
      expect(parser.inferEngine('https://serpapi.com/google-images')).toBe('google_images');
      expect(parser.inferEngine('https://serpapi.com/google-news')).toBe('google_news');
      expect(parser.inferEngine('https://serpapi.com/youtube-api')).toBe('youtube');
      expect(parser.inferEngine('https://serpapi.com/bing-api')).toBe('bing');
    });

    test('should return google as default for unknown paths', () => {
      expect(parser.inferEngine('https://serpapi.com/some-new-api')).toBe('google');
    });

    test('should handle search-api as google', () => {
      expect(parser.inferEngine('https://serpapi.com/search-api')).toBe('google');
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
    test('should return serpapi-doc type with parsed data', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockResolvedValue(undefined),
        waitForSelector: jest.fn().mockResolvedValue(undefined),
        waitForTimeout: jest.fn().mockResolvedValue(undefined),
        evaluate: jest.fn().mockResolvedValue({
          title: 'Google Search API',
          description: 'API for Google search results',
          endpoint: 'https://serpapi.com/search',
          method: 'GET',
          parameters: [{ name: 'q', required: 'Required', type: 'String', description: 'Search query' }],
          responseStructure: [],
          examples: [{ title: 'Example 1', responseJson: '{"results": []}' }],
          importantNotes: [],
          rawContent: 'raw content'
        })
      };

      const result = await parser.parse(mockPage, 'https://serpapi.com/search-api');

      expect(result.type).toBe('serpapi-doc');
      expect(result.url).toBe('https://serpapi.com/search-api');
      expect(result.title).toBe('Google Search API');
      expect(result.engine).toBe('google');
      expect(result.parameters.length).toBe(1);
    });

    test('should infer correct engine from URL', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockResolvedValue(undefined),
        waitForSelector: jest.fn().mockResolvedValue(undefined),
        waitForTimeout: jest.fn().mockResolvedValue(undefined),
        evaluate: jest.fn().mockResolvedValue({
          title: 'Baidu News API',
          description: '',
          endpoint: 'https://serpapi.com/search',
          method: 'GET',
          parameters: [],
          responseStructure: [],
          examples: [],
          importantNotes: [],
          rawContent: ''
        })
      };

      const result = await parser.parse(mockPage, 'https://serpapi.com/baidu-news-api');

      expect(result.engine).toBe('baidu_news');
    });

    test('should handle errors gracefully', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockRejectedValue(new Error('Page error')),
        waitForSelector: jest.fn().mockResolvedValue(undefined),
        waitForTimeout: jest.fn().mockResolvedValue(undefined),
        evaluate: jest.fn().mockRejectedValue(new Error('Parse error'))
      };

      const result = await parser.parse(mockPage, 'https://serpapi.com/search-api');

      expect(result.type).toBe('serpapi-doc');
      expect(result.url).toBe('https://serpapi.com/search-api');
      expect(result.title).toBe('');
      expect(result.parameters).toEqual([]);
    });
  });
});