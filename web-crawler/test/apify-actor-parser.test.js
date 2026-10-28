import ApifyActorParser from '../src/parsers/apify-actor-parser.js';

describe('ApifyActorParser', () => {
  let parser;

  beforeEach(() => {
    parser = new ApifyActorParser();
  });

  describe('matches', () => {
    test('should match apify.com URLs', () => {
      expect(parser.matches('https://apify.com/apify/web-scraper')).toBe(true);
      expect(parser.matches('https://apify.com/test/actor')).toBe(true);
    });

    test('should match docs.apify.com URLs', () => {
      expect(parser.matches('https://docs.apify.com/api/v2')).toBe(true);
    });

    test('should not match other URLs', () => {
      expect(parser.matches('https://example.com')).toBe(false);
    });
  });

  describe('getPriority', () => {
    test('should return 95', () => {
      expect(parser.getPriority()).toBe(95);
    });
  });

  describe('generateFilename', () => {
    test('should generate filename from URL', () => {
      expect(parser.generateFilename('https://apify.com/apify/web-scraper')).toBe('apify_com_apify_web-scraper');
    });

    test('should handle invalid URLs', () => {
      expect(parser.generateFilename('invalid-url')).toBe('apify_doc');
    });
  });
});