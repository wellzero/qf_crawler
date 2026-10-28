import BraveSearchParser from '../src/parsers/brave-search-parser.js';

describe('BraveSearchParser', () => {
  let parser;

  beforeEach(() => {
    parser = new BraveSearchParser();
  });

  describe('matches', () => {
    test('should match api-dashboard.search.brave.com documentation URLs', () => {
      expect(parser.matches('https://api-dashboard.search.brave.com/documentation')).toBe(true);
      expect(parser.matches('https://api-dashboard.search.brave.com/documentation/services/web-search')).toBe(true);
    });

    test('should not match other URLs', () => {
      expect(parser.matches('https://search.brave.com')).toBe(false);
    });
  });

  describe('getPriority', () => {
    test('should return 100', () => {
      expect(parser.getPriority()).toBe(100);
    });
  });

  describe('generateFilename', () => {
    test('should generate filename from URL path', () => {
      expect(parser.generateFilename('https://api-dashboard.search.brave.com/documentation/services/web-search')).toBe('services-web-search');
    });
  });
});