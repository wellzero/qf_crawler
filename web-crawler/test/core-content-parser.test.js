import CoreContentParser from '../src/parsers/core-content-parser.js';

describe('CoreContentParser', () => {
  let parser;

  beforeEach(() => {
    parser = new CoreContentParser();
  });

  describe('matches', () => {
    test('should match with parserMode option', () => {
      expect(parser.matches('https://example.com', { parserMode: 'core-content' })).toBe(true);
    });

    test('should match with classification type', () => {
      expect(parser.matches('https://example.com', { classification: { type: 'article_page' } })).toBe(true);
    });

    test('should not match without matching options', () => {
      expect(parser.matches('https://example.com')).toBe(false);
      expect(parser.matches('https://example.com', {})).toBe(false);
    });
  });

  describe('getPriority', () => {
    test('should return 200', () => {
      expect(parser.getPriority()).toBe(200);
    });
  });

  describe('isArticleLike', () => {
    test('should return true for article-like content', () => {
      const coreResult = {
        blocks: [{ type: 'paragraph', content: 'text' }],
        meta: {
          paragraphCount: 5,
          totalParagraphChars: 1000,
          averageParagraphChars: 200,
          tableCount: 0,
          formCount: 0,
          linkDensity: 0.1,
          listItemCount: 3
        }
      };

      expect(parser.isArticleLike(coreResult)).toBe(true);
    });

    test('should return false for too few paragraphs', () => {
      const coreResult = {
        blocks: [],
        meta: { paragraphCount: 2 }
      };

      expect(parser.isArticleLike(coreResult)).toBe(false);
    });

    test('should return false for no meta', () => {
      expect(parser.isArticleLike(null)).toBe(false);
      expect(parser.isArticleLike({})).toBe(false);
    });
  });

  describe('getRejectReason', () => {
    test('should return paragraphs-too-few', () => {
      expect(parser.getRejectReason({ meta: { paragraphCount: 2 } })).toBe('paragraphs-too-few');
    });

    test('should return no-core-content-meta for null input', () => {
      expect(parser.getRejectReason(null)).toBe('no-core-content-meta');
    });
  });
});