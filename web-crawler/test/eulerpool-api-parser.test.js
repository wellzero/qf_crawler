import EulerpoolApiParser from '../src/parsers/eulerpool-api-parser.js';

describe('EulerpoolApiParser', () => {
  let parser;

  beforeEach(() => {
    parser = new EulerpoolApiParser();
  });

  describe('matches', () => {
    test('should match eulerpool.com developers API URLs', () => {
      expect(parser.matches('https://eulerpool.com/developers/api/')).toBe(true);
      expect(parser.matches('https://eulerpool.com/developers/api/stocks')).toBe(true);
    });

    test('should not match other URLs', () => {
      expect(parser.matches('https://eulerpool.com')).toBe(false);
      expect(parser.matches('https://example.com/api')).toBe(false);
    });
  });

  describe('getPriority', () => {
    test('should return 100', () => {
      expect(parser.getPriority()).toBe(100);
    });
  });

  describe('generateFilename', () => {
    test('should generate filename from URL path', () => {
      expect(parser.generateFilename('https://eulerpool.com/developers/api/stocks')).toBe('stocks');
    });

    test('should handle invalid URLs', () => {
      expect(parser.generateFilename('invalid-url')).toBe('api_doc');
    });
  });
});