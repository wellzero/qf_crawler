import { jest } from '@jest/globals';
import SearchResultParser from '../src/parsers/search-result-parser.js';

describe('SearchResultParser', () => {
  let parser;

  beforeEach(() => {
    parser = new SearchResultParser();
  });

  describe('matches', () => {
    test('should match common search URL patterns', () => {
      expect(parser.matches('https://www.google.com/search?q=test')).toBe(true);
      expect(parser.matches('https://www.baidu.com/s?wd=test')).toBe(true);
      expect(parser.matches('https://www.bing.com/search?q=test')).toBe(true);
      expect(parser.matches('https://example.com/search?query=test')).toBe(true);
      expect(parser.matches('https://example.com/result?q=test')).toBe(true);
    });

    test('should match URLs with query parameters', () => {
      expect(parser.matches('https://example.com/page?q=test')).toBe(true);
      expect(parser.matches('https://example.com/page?query=test')).toBe(true);
      expect(parser.matches('https://example.com/page?keyword=test')).toBe(true);
      expect(parser.matches('https://example.com/page?wd=test')).toBe(true);
      expect(parser.matches('https://example.com/page?word=test')).toBe(true);
    });

    test('should not match non-search URLs', () => {
      expect(parser.matches('https://example.com/article')).toBe(false);
      expect(parser.matches('https://example.com/docs/api')).toBe(false);
      expect(parser.matches('https://example.com/product/123')).toBe(false);
    });
  });

  describe('getPriority', () => {
    test('should return 5 (low priority)', () => {
      expect(parser.getPriority()).toBe(5);
    });
  });

  describe('extractSearchInfo', () => {
    test('should call page.evaluate to extract search info', async () => {
      const mockPage = {
        evaluate: jest.fn().mockResolvedValue({
          query: 'testquery',
          totalResults: 100,
          searchTime: '0.5秒'
        })
      };

      const result = await parser.extractSearchInfo(mockPage, 'https://example.com/search?q=testquery');

      expect(mockPage.evaluate).toHaveBeenCalled();
      expect(result.query).toBe('testquery');
    });

    test('should handle missing query parameters', async () => {
      const mockPage = {
        evaluate: jest.fn().mockResolvedValue({
          query: '',
          totalResults: 0,
          searchTime: ''
        })
      };

      const result = await parser.extractSearchInfo(mockPage, 'https://example.com/search');

      expect(mockPage.evaluate).toHaveBeenCalled();
      expect(result.query).toBe('');
      expect(result.totalResults).toBe(0);
    });
  });

  describe('extractResults', () => {
    test('should extract search results from page', async () => {
      const mockPage = {
        evaluate: jest.fn().mockResolvedValue([
          { rank: 1, title: 'Result 1', href: 'https://result1.com', snippet: 'Snippet 1', displayUrl: 'result1.com', isAd: false },
          { rank: 2, title: 'Result 2', href: 'https://result2.com', snippet: 'Snippet 2', displayUrl: 'result2.com', isAd: false }
        ])
      };

      const results = await parser.extractResults(mockPage);

      expect(results.length).toBe(2);
      expect(results[0].title).toBe('Result 1');
      expect(results[0].isAd).toBe(false);
    });

    test('should return empty array on evaluation error', async () => {
      const mockPage = {
        evaluate: jest.fn().mockResolvedValue([])
      };

      const results = await parser.extractResults(mockPage);

      expect(results).toEqual([]);
    });
  });

  describe('extractRelatedSearches', () => {
    test('should extract related searches', async () => {
      const mockPage = {
        evaluate: jest.fn().mockResolvedValue([
          { text: 'related search 1', href: 'https://example.com/search?q=related+search+1' },
          { text: 'related search 2', href: 'https://example.com/search?q=related+search+2' }
        ])
      };

      const related = await parser.extractRelatedSearches(mockPage);

      expect(related.length).toBe(2);
      expect(related[0].text).toBe('related search 1');
    });

    test('should return empty array when no related searches', async () => {
      const mockPage = {
        evaluate: jest.fn().mockResolvedValue([])
      };

      const related = await parser.extractRelatedSearches(mockPage);

      expect(related).toEqual([]);
    });
  });

  describe('extractPagination', () => {
    test('should extract pagination info', async () => {
      const mockPage = {
        evaluate: jest.fn().mockResolvedValue({
          current: 1,
          total: 10,
          pages: [1, 2, 3, 4, 5]
        })
      };

      const pagination = await parser.extractPagination(mockPage);

      expect(pagination.current).toBe(1);
      expect(pagination.total).toBe(10);
      expect(pagination.pages).toEqual([1, 2, 3, 4, 5]);
    });

    test('should return default pagination when none found', async () => {
      const mockPage = {
        evaluate: jest.fn().mockResolvedValue({
          current: 1,
          total: 1,
          pages: []
        })
      };

      const pagination = await parser.extractPagination(mockPage);

      expect(pagination.current).toBe(1);
      expect(pagination.total).toBe(1);
    });
  });

  describe('extractAds', () => {
    test('should extract ads from page', async () => {
      const mockPage = {
        evaluate: jest.fn().mockResolvedValue([
          { title: 'Ad 1', href: 'https://ad1.com' },
          { title: 'Ad 2', href: 'https://ad2.com' }
        ])
      };

      const ads = await parser.extractAds(mockPage);

      expect(ads.length).toBe(2);
      expect(ads[0].title).toBe('Ad 1');
    });

    test('should return empty array when no ads', async () => {
      const mockPage = {
        evaluate: jest.fn().mockResolvedValue([])
      };

      const ads = await parser.extractAds(mockPage);

      expect(ads).toEqual([]);
    });
  });

  describe('parse', () => {
    test('should return search-result type with all components', async () => {
      parser.extractSearchInfo = jest.fn().mockResolvedValue({ query: 'test', totalResults: 100, searchTime: '0.5秒' });
      parser.extractResults = jest.fn().mockResolvedValue([
        { rank: 1, title: 'Result 1', href: 'https://result1.com', snippet: 'Snippet', displayUrl: 'result1.com', isAd: false }
      ]);
      parser.extractRelatedSearches = jest.fn().mockResolvedValue([{ text: 'related', href: 'https://related.com' }]);
      parser.extractPagination = jest.fn().mockResolvedValue({ current: 1, total: 10, pages: [] });
      parser.extractAds = jest.fn().mockResolvedValue([]);

      const result = await parser.parse({}, 'https://example.com/search?q=test');

      expect(result.type).toBe('search-result');
      expect(result.query).toBe('test');
      expect(result.results.length).toBe(1);
      expect(result.relatedSearches.length).toBe(1);
    });

    test('should handle errors gracefully', async () => {
      parser.extractSearchInfo = jest.fn().mockRejectedValue(new Error('Failed'));

      const result = await parser.parse({}, 'https://example.com/search?q=test');

      expect(result.type).toBe('search-result');
      expect(result.query).toBe('');
      expect(result.results).toEqual([]);
    });
  });
});