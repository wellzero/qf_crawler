import { jest } from '@jest/globals';
import TiingoApiParser from '../src/parsers/tiingo-api-parser.js';

describe('TiingoApiParser', () => {
  let parser;

  beforeEach(() => {
    parser = new TiingoApiParser();
  });

  describe('matches', () => {
    test('should match Tiingo documentation URLs', () => {
      expect(parser.matches('https://www.tiingo.com/documentation')).toBe(true);
      expect(parser.matches('https://www.tiingo.com/documentation/')).toBe(true);
      expect(parser.matches('https://www.tiingo.com/documentation/prices')).toBe(true);
      expect(parser.matches('http://www.tiingo.com/documentation/fundamentals')).toBe(true);
    });

    test('should not match non-documentation URLs', () => {
      expect(parser.matches('https://www.tiingo.com/')).toBe(false);
      expect(parser.matches('https://www.tiingo.com/prices')).toBe(false);
      expect(parser.matches('https://tiingo.com/documentation')).toBe(false);
    });
  });

  describe('getPriority', () => {
    test('should return 100 (high priority)', () => {
      expect(parser.getPriority()).toBe(100);
    });
  });

  describe('supportsLinkDiscovery', () => {
    test('should return true (supports custom link discovery)', () => {
      expect(parser.supportsLinkDiscovery()).toBe(true);
    });
  });

  describe('generateFilename', () => {
    test('should generate filename from URL path', () => {
      expect(parser.generateFilename('https://www.tiingo.com/documentation/prices')).toBe('prices');
      expect(parser.generateFilename('https://www.tiingo.com/documentation/fundamentals')).toBe('fundamentals');
    });

    test('should handle nested paths', () => {
      expect(parser.generateFilename('https://www.tiingo.com/documentation/prices/daily')).toBe('prices_daily');
    });

    test('should handle root documentation URL', () => {
      expect(parser.generateFilename('https://www.tiingo.com/documentation')).toBe('overview');
      expect(parser.generateFilename('https://www.tiingo.com/documentation/')).toBe('overview');
    });

    test('should handle invalid URLs', () => {
      expect(parser.generateFilename('invalid-url')).toBe('api_doc');
    });
  });

  describe('extractDocPath', () => {
    test('should extract documentation path from URL', () => {
      expect(parser.extractDocPath('https://www.tiingo.com/documentation/prices')).toBe('prices');
      expect(parser.extractDocPath('https://www.tiingo.com/documentation/fundamentals')).toBe('fundamentals');
    });

    test('should return empty string for root documentation URL', () => {
      expect(parser.extractDocPath('https://www.tiingo.com/documentation')).toBe('');
      expect(parser.extractDocPath('https://www.tiingo.com/documentation/')).toBe('');
    });

    test('should handle invalid URLs', () => {
      expect(parser.extractDocPath('invalid-url')).toBe('');
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

  describe('discoverLinks', () => {
    test('should discover links from sidebar', async () => {
      const mockPage = {
        url: jest.fn().mockReturnValue('https://www.tiingo.com/documentation/prices'),
        waitForSelector: jest.fn().mockResolvedValue(undefined),
        evaluate: jest.fn().mockResolvedValue(5),
        waitForTimeout: jest.fn().mockResolvedValue(undefined),
        goto: jest.fn().mockResolvedValue(undefined)
      };

      const links = await parser.discoverLinks(mockPage);

      expect(Array.isArray(links)).toBe(true);
    });

    test('should handle errors gracefully', async () => {
      const mockPage = {
        url: jest.fn().mockReturnValue('https://www.tiingo.com/documentation/prices'),
        waitForSelector: jest.fn().mockRejectedValue(new Error('No sidebar'))
      };

      const links = await parser.discoverLinks(mockPage);

      expect(links).toEqual([]);
    });
  });

  describe('parse', () => {
    test('should return tiingo-api type with parsed data', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockResolvedValue(undefined),
        waitForSelector: jest.fn().mockResolvedValue(undefined),
        waitForTimeout: jest.fn().mockResolvedValue(undefined),
        evaluate: jest.fn().mockResolvedValue({
          title: 'Tiingo Prices API',
          description: 'Get stock prices',
          sections: [{ title: 'Section 1', content: [] }],
          codeExamples: ['curl https://api.tiingo.com/prices'],
          tables: [],
          rawContent: 'raw content'
        })
      };

      parser._extractTabContents = jest.fn().mockResolvedValue([]);

      const result = await parser.parse(mockPage, 'https://www.tiingo.com/documentation/prices');

      expect(result.type).toBe('tiingo-api');
      expect(result.url).toBe('https://www.tiingo.com/documentation/prices');
      expect(result.title).toBe('Tiingo Prices API');
      expect(result.sections.length).toBe(1);
    });

    test('should handle errors gracefully', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockRejectedValue(new Error('Page error')),
        waitForSelector: jest.fn().mockResolvedValue(undefined),
        waitForTimeout: jest.fn().mockResolvedValue(undefined),
        evaluate: jest.fn().mockRejectedValue(new Error('Parse error'))
      };

      const result = await parser.parse(mockPage, 'https://www.tiingo.com/documentation/prices');

      expect(result.type).toBe('tiingo-api');
      expect(result.url).toBe('https://www.tiingo.com/documentation/prices');
      expect(result.title).toBe('');
      expect(result.sections).toEqual([]);
    });
  });
});