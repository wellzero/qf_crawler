import { jest } from '@jest/globals';
import ArticleParser from '../src/parsers/article-parser.js';

describe('ArticleParser', () => {
  let parser;

  beforeEach(() => {
    parser = new ArticleParser();
  });

  describe('matches', () => {
    test('should match article URLs with /article/', () => {
      expect(parser.matches('https://example.com/article/123')).toBe(true);
      expect(parser.matches('https://example.com/articles/123')).toBe(true);
    });

    test('should match news URLs with /news/', () => {
      expect(parser.matches('https://example.com/news/20240315-story')).toBe(true);
    });

    test('should match blog URLs with /blog/', () => {
      expect(parser.matches('https://example.com/blog/my-post')).toBe(true);
    });

    test('should match post URLs with /post/', () => {
      expect(parser.matches('https://example.com/post/12345')).toBe(true);
    });

    test('should match detail URLs with /detail/', () => {
      expect(parser.matches('https://example.com/detail/123')).toBe(true);
    });

    test('should match date-based URLs', () => {
      expect(parser.matches('https://example.com/2024/01/15/my-article')).toBe(true);
      expect(parser.matches('https://example.com/2024-01-15/my-article')).toBe(true);
    });

    test('should match .html article URLs', () => {
      expect(parser.matches('https://example.com/news/123456.html')).toBe(true);
      expect(parser.matches('https://example.com/123456.html')).toBe(true);
      expect(parser.matches('https://example.com/123456.htm')).toBe(true);
    });

    test('should match Sina article patterns', () => {
      expect(parser.matches('https://news.sina.com.cn/c/2024-01-15/doc-abc123.shtml')).toBe(true);
      expect(parser.matches('https://news.sina.com.cn/w/2024-01-15/story')).toBe(true);
    });

    test('should match query parameter article patterns', () => {
      expect(parser.matches('https://example.com/page?id=12345')).toBe(true);
    });

    test('should not match API documentation URLs', () => {
      expect(parser.matches('https://example.com/api/doc/users')).toBe(false);
      expect(parser.matches('https://example.com/docs/guide')).toBe(false);
      expect(parser.matches('https://example.com/reference/api')).toBe(false);
    });

    test('should not match list pages', () => {
      expect(parser.matches('https://example.com/news/list')).toBe(false);
      expect(parser.matches('https://example.com/category/tech')).toBe(false);
      expect(parser.matches('https://example.com/news?page=1')).toBe(false);
    });

    test('should not match generic URLs', () => {
      expect(parser.matches('https://example.com/about')).toBe(false);
      expect(parser.matches('https://example.com/contact')).toBe(false);
    });

    test('should be case-insensitive', () => {
      expect(parser.matches('https://example.com/ARTICLE/123')).toBe(true);
      expect(parser.matches('https://example.com/NEWS/123')).toBe(true);
    });
  });

  describe('getPriority', () => {
    test('should return 5 (medium-high priority)', () => {
      expect(parser.getPriority()).toBe(5);
    });
  });

  describe('extractArticleInfo', () => {
    test('should extract article metadata', async () => {
      const page = {
        evaluate: jest.fn().mockResolvedValue({
          title: 'Test Article',
          publishTime: '2024-01-15',
          source: 'Test Source'
        })
      };

      const info = await parser.extractArticleInfo(page);
      expect(info.title).toBe('Test Article');
      expect(info.publishTime).toBe('2024-01-15');
    });
  });

  describe('extractContent', () => {
    test('should extract article content', async () => {
      const page = {
        evaluate: jest.fn().mockResolvedValue('This is the article content.')
      };

      const content = await parser.extractContent(page);
      expect(content).toBe('This is the article content.');
    });
  });

  describe('parse', () => {
    test('should return article type', async () => {
      const mockPage = {
        evaluate: jest.fn().mockResolvedValue({})
      };

      parser.extractArticleInfo = jest.fn().mockResolvedValue({
        title: 'Test Article',
        publishTime: '2024-01-15',
        source: 'Test'
      });
      parser.extractContent = jest.fn().mockResolvedValue('Article content');
      parser.extractAuthor = jest.fn().mockResolvedValue('John Doe');
      parser.extractRelatedArticles = jest.fn().mockResolvedValue([]);
      parser.extractTags = jest.fn().mockResolvedValue([]);
      parser.extractCommentsInfo = jest.fn().mockResolvedValue({});
      parser.extractContentImages = jest.fn().mockResolvedValue([]);

      const result = await parser.parse(mockPage, 'https://example.com/article/123');

      expect(result.type).toBe('article');
      expect(result.url).toBe('https://example.com/article/123');
      expect(result.title).toBe('Test Article');
      expect(result.author).toBe('John Doe');
    });

    test('should handle errors gracefully', async () => {
      const mockPage = {
        evaluate: jest.fn().mockRejectedValue(new Error('Parse error'))
      };

      const result = await parser.parse(mockPage, 'https://example.com/article/123');

      expect(result.type).toBe('article');
      expect(result.url).toBe('https://example.com/article/123');
    });
  });
});