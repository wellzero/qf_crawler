import ApiDocParser from '../src/parsers/api-doc-parser.js';

describe('ApiDocParser', () => {
  let parser;

  beforeEach(() => {
    parser = new ApiDocParser();
  });

  describe('matches', () => {
    test('should match URLs with /api/doc', () => {
      expect(parser.matches('https://example.com/api/doc')).toBe(true);
      expect(parser.matches('https://example.com/api/doc/users')).toBe(true);
      expect(parser.matches('https://example.com/api/doc/')).toBe(true);
    });

    test('should match with classification option', () => {
      expect(parser.matches('https://example.com/any', { classification: { type: 'api_doc_page' } })).toBe(true);
    });

    test('should not match other URLs', () => {
      expect(parser.matches('https://example.com/documentation')).toBe(false);
      expect(parser.matches('https://example.com/api')).toBe(false);
    });
  });

  describe('getPriority', () => {
    test('should return 100', () => {
      expect(parser.getPriority()).toBe(100);
    });
  });

  describe('extractBriefDescription', () => {
    test('should handle errors', async () => {
      const mockPage = {
        evaluate: async () => { throw new Error('error'); }
      };

      const result = await parser.extractBriefDescription(mockPage);
      expect(result).toBe('');
    });
  });

  describe('extractRequestUrl', () => {
    test('should handle errors', async () => {
      const mockPage = {
        evaluate: async () => { throw new Error('error'); }
      };

      const result = await parser.extractRequestUrl(mockPage);
      expect(result).toBe('');
    });
  });

  describe('extractRequestMethod', () => {
    test('should handle errors', async () => {
      const mockPage = {
        evaluate: async () => { throw new Error('error'); }
      };

      const result = await parser.extractRequestMethod(mockPage);
      expect(result).toBe('');
    });
  });

  describe('extractParameters', () => {
    test('should handle errors', async () => {
      const mockPage = {
        evaluate: async () => { throw new Error('error'); }
      };

      const result = await parser.extractParameters(mockPage);
      expect(result).toEqual([]);
    });
  });

  describe('extractApiExamples', () => {
    test('should handle errors', async () => {
      const mockPage = {
        evaluate: async () => { throw new Error('error'); },
        waitForTimeout: async () => {}
      };

      const result = await parser.extractApiExamples(mockPage);
      expect(result).toEqual([]);
    });
  });

  describe('extractResponseData', () => {
    test('should handle errors', async () => {
      const mockPage = {
        evaluate: async () => { throw new Error('error'); }
      };

      const result = await parser.extractResponseData(mockPage);
      expect(result.description).toBe('');
      expect(result.table).toEqual([]);
    });
  });
});