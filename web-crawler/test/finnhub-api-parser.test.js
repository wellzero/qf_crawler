import FinnhubApiParser from '../src/parsers/finnhub-api-parser.js';

describe('FinnhubApiParser', () => {
  let parser;

  beforeEach(() => {
    parser = new FinnhubApiParser();
  });

  describe('matches', () => {
    test('should match finnhub.io docs API URLs', () => {
      expect(parser.matches('https://finnhub.io/docs/api')).toBe(true);
      expect(parser.matches('https://finnhub.io/docs/api/')).toBe(true);
      expect(parser.matches('https://finnhub.io/docs/api/company-profile')).toBe(true);
    });

    test('should not match other URLs', () => {
      expect(parser.matches('https://finnhub.io')).toBe(false);
      expect(parser.matches('https://finnhub.io/docs')).toBe(false);
      expect(parser.matches('https://example.com/docs/api')).toBe(false);
    });
  });

  describe('getPriority', () => {
    test('should return 100', () => {
      expect(parser.getPriority()).toBe(100);
    });
  });

  describe('generateFilename', () => {
    test('should generate filename from URL path', () => {
      expect(parser.generateFilename('https://finnhub.io/docs/api/company-profile')).toBe('company-profile');
      expect(parser.generateFilename('https://finnhub.io/docs/api/quote')).toBe('quote');
    });

    test('should handle root API page', () => {
      expect(parser.generateFilename('https://finnhub.io/docs/api')).toBe('api_overview');
      expect(parser.generateFilename('https://finnhub.io/docs/api/')).toBe('api_overview');
    });

    test('should handle invalid URLs', () => {
      expect(parser.generateFilename('invalid-url')).toBe('api_doc');
    });
  });

  describe('extractApiPath', () => {
    test('should extract API path from URL', () => {
      expect(parser.extractApiPath('https://finnhub.io/docs/api/company-profile')).toBe('company-profile');
      expect(parser.extractApiPath('https://finnhub.io/docs/api')).toBe('');
    });

    test('should return empty string for invalid URLs', () => {
      expect(parser.extractApiPath('invalid-url')).toBe('');
    });
  });

  describe('parse', () => {
    test('should parse API documentation page', async () => {
      const mockPage = {
        waitForLoadState: async () => {},
        waitForSelector: async () => {},
        waitForTimeout: async () => {},
        evaluate: async () => ({
          title: 'Company Profile',
          description: 'Get company profile information',
          method: 'GET',
          endpoint: '/stock/profile',
          parameters: [{ name: 'symbol', required: true, type: 'string', description: 'Stock symbol' }],
          responses: [{ code: '200', description: 'Success' }],
          codeExamples: [{ language: 'Python', code: 'import finnhub' }],
          rawContent: 'raw content'
        })
      };

      const result = await parser.parse(mockPage, 'https://finnhub.io/docs/api/company-profile');

      expect(result.type).toBe('finnhub-api');
      expect(result.url).toBe('https://finnhub.io/docs/api/company-profile');
      expect(result.title).toBe('Company Profile');
    });

    test('should handle overview page', async () => {
      const mockPage = {
        waitForLoadState: async () => {},
        waitForSelector: async () => {},
        waitForTimeout: async () => {},
        evaluate: async () => ({
          title: 'API Overview',
          description: 'Overview content',
          rawContent: 'overview content'
        })
      };

      const result = await parser.parse(mockPage, 'https://finnhub.io/docs/api');

      expect(result.type).toBe('finnhub-api');
      expect(result.title).toBe('API Overview');
    });

    test('should handle parse errors gracefully', async () => {
      const mockPage = {
        waitForLoadState: async () => { throw new Error('timeout'); },
        waitForSelector: async () => {},
        waitForTimeout: async () => {},
        evaluate: async () => { throw new Error('evaluate error'); }
      };

      const result = await parser.parse(mockPage, 'https://finnhub.io/docs/api/company-profile');

      expect(result.type).toBe('finnhub-api');
      expect(result.title).toBe('');
      expect(result.parameters).toEqual([]);
    });
  });

  describe('waitForContent', () => {
    test('should wait for content to load', async () => {
      const mockPage = {
        waitForLoadState: async () => {},
        waitForSelector: async () => {},
        waitForTimeout: async () => {}
      };

      await parser.waitForContent(mockPage);
    });

    test('should handle timeout gracefully', async () => {
      const mockPage = {
        waitForLoadState: async () => {},
        waitForSelector: async () => { throw new Error('timeout'); },
        waitForTimeout: async () => {}
      };

      await parser.waitForContent(mockPage);
    });
  });
});