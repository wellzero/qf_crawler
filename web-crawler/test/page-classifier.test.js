import { jest } from '@jest/globals';
import PageClassifier from '../src/parsers/page-classifier.js';

describe('PageClassifier', () => {
  let classifier;

  beforeEach(() => {
    classifier = new PageClassifier();
  });

  describe('extractUrlFeatures', () => {
    test('should detect API pattern URLs', () => {
      const features = classifier.extractUrlFeatures('https://example.com/api/doc/stock');
      expect(features.apiPattern).toBe(true);
    });

    test('should detect list hint URLs', () => {
      expect(classifier.extractUrlFeatures('https://example.com/news').listHint).toBe(true);
      expect(classifier.extractUrlFeatures('https://example.com/list?page=1').listHint).toBe(true);
      expect(classifier.extractUrlFeatures('https://example.com/category/tech').listHint).toBe(true);
    });

    test('should detect directory hint URLs', () => {
      expect(classifier.extractUrlFeatures('https://example.com/directory').directoryHint).toBe(true);
      expect(classifier.extractUrlFeatures('https://example.com/docs/guide').directoryHint).toBe(true);
    });

    test('should detect detail hint URLs', () => {
      expect(classifier.extractUrlFeatures('https://example.com/detail/123').detailHint).toBe(true);
      expect(classifier.extractUrlFeatures('https://example.com/article/456').detailHint).toBe(true);
      expect(classifier.extractUrlFeatures('https://example.com/page?id=123').detailHint).toBe(true);
    });

    test('should detect search hint URLs', () => {
      expect(classifier.extractUrlFeatures('https://example.com/search?q=test').searchHint).toBe(true);
      expect(classifier.extractUrlFeatures('https://example.com/s?keyword=abc').searchHint).toBe(true);
    });

    test('should detect login hint URLs', () => {
      expect(classifier.extractUrlFeatures('https://example.com/login').loginHint).toBe(true);
      expect(classifier.extractUrlFeatures('https://example.com/register').loginHint).toBe(true);
      expect(classifier.extractUrlFeatures('https://example.com/signin').loginHint).toBe(true);
    });

    test('should detect homepage URLs', () => {
      expect(classifier.extractUrlFeatures('https://example.com').isHomepage).toBe(true);
      expect(classifier.extractUrlFeatures('https://example.com/').isHomepage).toBe(true);
      expect(classifier.extractUrlFeatures('https://example.com/index.html').isHomepage).toBe(true);
      expect(classifier.extractUrlFeatures('https://example.com/page').isHomepage).toBe(false);
    });

    test('should handle empty or invalid URLs', () => {
      const features = classifier.extractUrlFeatures('');
      expect(features.url).toBe('');
      expect(features.apiPattern).toBe(false);
    });
  });

  describe('classify', () => {
    test('should classify api doc by url pattern', async () => {
      const result = await classifier.classify({ evaluate: async () => ({}) }, 'https://example.com/api/doc/stock');

      expect(result.type).toBe('api_doc_page');
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    test('should return generic_page when DOM extraction fails', async () => {
      const page = {
        evaluate: jest.fn().mockRejectedValue(new Error('DOM error'))
      };

      const result = await classifier.classify(page, 'https://example.com/page');

      expect(result.type).toBe('generic_page');
      expect(result.confidence).toBeLessThan(0.5);
      expect(result.reasons).toContain('dom-features-failed');
    });
  });

  describe('classifyByRules', () => {
    test('should classify article by content signals', () => {
      const result = classifier.classifyByRules({
        paragraphCount: 8,
        avgParagraphLength: 120,
        linkDensity: 0.12,
        tableCount: 0,
        maxTableRows: 0,
        repeatedListBlocks: 2,
        listItems: 6,
        paginationDetected: false,
        navLinks: 2,
        hasTreeStyle: false,
        detailHint: true
      });

      expect(result.type).toBe('article_page');
    });

    test('should classify table content page by table dominance', () => {
      const result = classifier.classifyByRules({
        paragraphCount: 2,
        avgParagraphLength: 20,
        linkDensity: 0.05,
        tableCount: 1,
        maxTableRows: 18,
        repeatedListBlocks: 0,
        listItems: 0,
        paginationDetected: false,
        navLinks: 1,
        hasTreeStyle: false
      });

      expect(result.type).toBe('table_content_page');
    });

    test('should classify login page', () => {
      const result = classifier.classifyByRules({
        loginHint: true,
        linkCount: 10,
        paragraphCount: 1,
        avgParagraphLength: 20,
        linkDensity: 0.1,
        tableCount: 0,
        maxTableRows: 0,
        repeatedListBlocks: 0,
        listItems: 0
      });

      expect(result.type).toBe('login_page');
    });

    test('should classify search result page', () => {
      const result = classifier.classifyByRules({
        searchHint: true,
        repeatedListBlocks: 10,
        listItems: 15,
        paragraphCount: 1,
        avgParagraphLength: 20,
        linkDensity: 0.3,
        tableCount: 0,
        maxTableRows: 0
      });

      expect(result.type).toBe('search_result_page');
    });

    test('should classify portal page with multiple navs', () => {
      const result = classifier.classifyByRules({
        isHomepage: true,
        hasMultipleNavs: true,
        hasMultipleSections: true,
        navCount: 3,
        sectionCount: 5,
        contentBlocks: 4,
        hasHotArea: true,
        linkCount: 150,
        paragraphCount: 5,
        avgParagraphLength: 30,
        linkDensity: 0.5,
        tableCount: 0,
        maxTableRows: 0,
        repeatedListBlocks: 3,
        listItems: 10
      });

      expect(result.type).toBe('portal_page');
    });

    test('should classify list page with pagination', () => {
      const result = classifier.classifyByRules({
        paginationDetected: true,
        repeatedListBlocks: 15,
        listItems: 25,
        linkDensity: 0.3,
        paragraphCount: 2,
        avgParagraphLength: 20,
        tableCount: 0,
        maxTableRows: 0,
        navLinks: 5,
        hasTreeStyle: false
      });

      expect(result.type).toBe('list_page');
    });

    test('should classify directory page', () => {
      const result = classifier.classifyByRules({
        navLinks: 20,
        hasTreeStyle: true,
        linkDensity: 0.4,
        paragraphCount: 1,
        avgParagraphLength: 15,
        tableCount: 0,
        maxTableRows: 0,
        repeatedListBlocks: 0,
        listItems: 5,
        paginationDetected: false
      });

      expect(result.type).toBe('directory_page');
    });

    test('should fallback to generic_page when no patterns match', () => {
      const result = classifier.classifyByRules({
        paragraphCount: 1,
        avgParagraphLength: 20,
        linkDensity: 0.1,
        tableCount: 0,
        maxTableRows: 0,
        repeatedListBlocks: 0,
        listItems: 2,
        paginationDetected: false,
        navLinks: 3,
        hasTreeStyle: false
      });

      expect(result.type).toBe('generic_page');
    });
  });

  describe('buildResult', () => {
    test('should build result with all fields', () => {
      const result = classifier.buildResult('article_page', 0.8, ['test-reason'], { paragraphCount: 5 });

      expect(result.type).toBe('article_page');
      expect(result.confidence).toBe(0.8);
      expect(result.reasons).toEqual(['test-reason']);
      expect(result.features.paragraphCount).toBe(5);
    });
  });
});
