import AlphavantageApiParser from '../src/parsers/alphavantage-api-parser.js';

describe('AlphavantageApiParser', () => {
  let parser;

  beforeEach(() => {
    parser = new AlphavantageApiParser();
  });

  describe('matches', () => {
    test('should match alphavantage.co/documentation URLs', () => {
      expect(parser.matches('https://www.alphavantage.co/documentation')).toBe(true);
      expect(parser.matches('https://www.alphavantage.co/documentation/')).toBe(true);
      expect(parser.matches('http://www.alphavantage.co/documentation')).toBe(true);
    });

    test('should not match other URLs', () => {
      expect(parser.matches('https://www.alphavantage.co')).toBe(false);
      expect(parser.matches('https://alphavantage.co/documentation')).toBe(false);
      expect(parser.matches('https://example.com/documentation')).toBe(false);
    });
  });

  describe('getPriority', () => {
    test('should return 100', () => {
      expect(parser.getPriority()).toBe(100);
    });
  });

  describe('generateFilename', () => {
    test('should use hash as filename', () => {
      expect(parser.generateFilename('https://www.alphavantage.co/documentation#time-series')).toBe('time-series');
      expect(parser.generateFilename('https://www.alphavantage.co/documentation#fundamentals')).toBe('fundamentals');
    });

    test('should return api_overview for URLs without hash', () => {
      expect(parser.generateFilename('https://www.alphavantage.co/documentation')).toBe('api_overview');
    });

    test('should handle invalid URLs', () => {
      expect(parser.generateFilename('invalid-url')).toBe('api_doc');
    });
  });

  describe('extractAnchorId', () => {
    test('should extract anchor from URL', () => {
      expect(parser.extractAnchorId('https://www.alphavantage.co/documentation#time-series')).toBe('time-series');
      expect(parser.extractAnchorId('https://www.alphavantage.co/documentation')).toBe('');
    });

    test('should return empty string for invalid URLs', () => {
      expect(parser.extractAnchorId('invalid-url')).toBe('');
    });
  });

  describe('sanitizeFilename', () => {
    test('should sanitize filename', () => {
      expect(parser.sanitizeFilename('TIME_SERIES_DAILY')).toBe('TIME_SERIES_DAILY');
      expect(parser.sanitizeFilename('a b c')).toBe('a_b_c');
    });

    test('should truncate long names', () => {
      const longName = 'a'.repeat(100);
      expect(parser.sanitizeFilename(longName).length).toBeLessThanOrEqual(80);
    });

    test('should handle empty input', () => {
      expect(parser.sanitizeFilename('')).toBe('');
      expect(parser.sanitizeFilename(null)).toBe('');
    });
  });

  describe('buildSingleApiMarkdown', () => {
    test('should build markdown for API', () => {
      const api = {
        title: 'TIME_SERIES_DAILY',
        functionName: 'TIME_SERIES_DAILY',
        description: 'Returns daily time series data.',
        parameters: [
          { name: 'symbol', required: true, description: 'Stock symbol' },
          { name: 'apikey', required: true, description: 'API key' }
        ],
        examples: [{ url: 'https://example.com/api', description: 'Example' }],
        codeExamples: [{ language: 'python', code: 'import requests' }]
      };

      const markdown = parser.buildSingleApiMarkdown(api, 'https://www.alphavantage.co/documentation');

      expect(markdown).toContain('# TIME_SERIES_DAILY');
      expect(markdown).toContain('## 函数名');
      expect(markdown).toContain('## 描述');
      expect(markdown).toContain('## 必需参数');
      expect(markdown).toContain('| `symbol` |');
      expect(markdown).toContain('## 代码示例');
    });

    test('should include premium/trending tags', () => {
      const api = {
        title: 'Premium API',
        premium: true,
        trending: true
      };

      const markdown = parser.buildSingleApiMarkdown(api, 'https://www.alphavantage.co/documentation');

      expect(markdown).toContain('[Premium, Trending]');
    });
  });

  describe('parse', () => {
    test('should handle parse errors gracefully', async () => {
      const mockPage = {
        waitForSelector: async () => { throw new Error('timeout'); },
        waitForLoadState: async () => {},
        waitForTimeout: async () => {},
        evaluate: async () => { throw new Error('evaluate error'); }
      };

      const result = await parser.parse(mockPage, 'https://www.alphavantage.co/documentation');

      expect(result.type).toBe('alphavantage-api');
      expect(result.title).toBe('');
      expect(result.parameters).toEqual([]);
    });
  });
});