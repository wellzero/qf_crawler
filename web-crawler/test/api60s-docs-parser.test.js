import Api60sDocsParser from '../src/parsers/api60s-docs-parser.js';

describe('Api60sDocsParser', () => {
  let parser;

  beforeEach(() => {
    parser = new Api60sDocsParser();
  });

  describe('matches', () => {
    test('should match docs.60s-api.viki.moe URLs', () => {
      expect(parser.matches('https://docs.60s-api.viki.moe/')).toBe(true);
      expect(parser.matches('https://docs.60s-api.viki.moe/api')).toBe(true);
    });

    test('should not match other URLs', () => {
      expect(parser.matches('https://example.com')).toBe(false);
    });
  });

  describe('getPriority', () => {
    test('should return 110', () => {
      expect(parser.getPriority()).toBe(110);
    });
  });
});