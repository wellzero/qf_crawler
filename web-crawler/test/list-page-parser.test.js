import { jest } from '@jest/globals';
import ListPageParser from '../src/parsers/list-page-parser.js';

describe('ListPageParser', () => {
  let parser;

  beforeEach(() => {
    parser = new ListPageParser();
  });

  describe('matches', () => {
    test('should match URLs with /list', () => {
      expect(parser.matches('https://example.com/list')).toBe(true);
      expect(parser.matches('https://example.com/news/list')).toBe(true);
    });

    test('should match URLs with /news', () => {
      expect(parser.matches('https://example.com/news')).toBe(true);
    });

    test('should match URLs with /articles', () => {
      expect(parser.matches('https://example.com/articles')).toBe(true);
    });

    test('should match URLs with /products', () => {
      expect(parser.matches('https://example.com/products')).toBe(true);
    });

    test('should match category URLs', () => {
      expect(parser.matches('https://example.com/category/tech')).toBe(true);
      expect(parser.matches('https://example.com/catalog/electronics')).toBe(true);
    });

    test('should match tag URLs', () => {
      expect(parser.matches('https://example.com/tag/javascript')).toBe(true);
    });

    test('should match paginated URLs', () => {
      expect(parser.matches('https://example.com/news?page=1')).toBe(true);
      expect(parser.matches('https://example.com/articles?p=2')).toBe(true);
      expect(parser.matches('https://example.com/list?pn=3')).toBe(true);
    });

    test('should match news channel URLs', () => {
      expect(parser.matches('https://news.example.com/world/')).toBe(true);
      expect(parser.matches('https://news.example.com/china/')).toBe(true);
      expect(parser.matches('https://news.example.com/tech/')).toBe(true);
      expect(parser.matches('https://news.example.com/finance/')).toBe(true);
      expect(parser.matches('https://news.example.com/sports/')).toBe(true);
    });

    test('should match .html list pages', () => {
      expect(parser.matches('https://example.com/news/1.html')).toBe(true);
    });

    test('should not match article detail URLs', () => {
      expect(parser.matches('https://example.com/article/123')).toBe(false);
      expect(parser.matches('https://example.com/news/20240315-story')).toBe(false);
    });

    test('should not match API documentation URLs', () => {
      expect(parser.matches('https://example.com/api/doc')).toBe(false);
    });

    test('should not match generic URLs', () => {
      expect(parser.matches('https://example.com/about')).toBe(false);
      expect(parser.matches('https://example.com/contact')).toBe(false);
    });
  });

  describe('getPriority', () => {
    test('should return 4 (medium priority)', () => {
      expect(parser.getPriority()).toBe(4);
    });
  });

  describe('extractPageInfo', () => {
    test('should extract page metadata', async () => {
      const page = {
        evaluate: jest.fn().mockResolvedValue({
          title: 'News List',
          description: 'Latest news'
        })
      };

      const info = await parser.extractPageInfo(page);
      expect(info.title).toBe('News List');
      expect(info.description).toBe('Latest news');
    });
  });

  describe('extractListItems', () => {
    test('should extract list items', async () => {
      const page = {
        evaluate: jest.fn().mockResolvedValue([
          { title: 'Item 1', url: '/item/1' },
          { title: 'Item 2', url: '/item/2' }
        ])
      };

      const items = await parser.extractListItems(page);
      expect(items).toHaveLength(2);
      expect(items[0].title).toBe('Item 1');
    });
  });

  describe('extractPagination', () => {
    test('should extract pagination info', async () => {
      const page = {
        evaluate: jest.fn().mockResolvedValue({
          currentPage: 1,
          totalPages: 10,
          hasNext: true
        })
      };

      const pagination = await parser.extractPagination(page);
      expect(pagination.currentPage).toBe(1);
      expect(pagination.totalPages).toBe(10);
    });
  });

  describe('parse', () => {
    test('should return list-page type', async () => {
      const mockPage = {
        evaluate: jest.fn().mockResolvedValue({})
      };

      parser.extractPageInfo = jest.fn().mockResolvedValue({
        title: 'News List',
        description: 'Latest news'
      });
      parser.extractListItems = jest.fn().mockResolvedValue([
        { title: 'Item 1', url: '/item/1' }
      ]);
      parser.extractPagination = jest.fn().mockResolvedValue({ currentPage: 1 });
      parser.extractFilters = jest.fn().mockResolvedValue([]);
      parser.extractSidebar = jest.fn().mockResolvedValue({});

      const result = await parser.parse(mockPage, 'https://example.com/news');

      expect(result.type).toBe('list-page');
      expect(result.url).toBe('https://example.com/news');
      expect(result.title).toBe('News List');
      expect(result.listItems).toHaveLength(1);
    });

    test('should handle errors gracefully', async () => {
      const mockPage = {
        evaluate: jest.fn().mockRejectedValue(new Error('Parse error'))
      };

      const result = await parser.parse(mockPage, 'https://example.com/list');

      expect(result.type).toBe('list-page');
      expect(result.url).toBe('https://example.com/list');
      expect(result.listItems).toEqual([]);
    });
  });
});