import EodhdApiParser from '../src/parsers/eodhd-api-parser.js';

describe('EodhdApiParser', () => {
  let parser;

  beforeEach(() => {
    parser = new EodhdApiParser();
  });

  describe('matches', () => {
    test('should match eodhd.com financial-apis URLs', () => {
      expect(parser.matches('https://eodhd.com/financial-apis')).toBe(true);
      expect(parser.matches('https://eodhd.com/financial-apis/')).toBe(true);
    });

    test('should match blog URLs', () => {
      expect(parser.matches('https://eodhd.com/financial-apis-blog/article')).toBe(true);
    });

    test('should not match other URLs', () => {
      expect(parser.matches('https://eodhd.com')).toBe(false);
      expect(parser.matches('https://example.com')).toBe(false);
    });
  });

  describe('isBlogPage', () => {
    test('should detect blog pages', () => {
      expect(parser.isBlogPage('https://eodhd.com/financial-apis-blog/article')).toBe(true);
    });

    test('should return false for non-blog pages', () => {
      expect(parser.isBlogPage('https://eodhd.com/financial-apis/api')).toBe(false);
    });
  });

  describe('isMarketplacePage', () => {
    test('should detect marketplace pages', () => {
      expect(parser.isMarketplacePage('https://eodhd.com/marketplace/esg')).toBe(true);
    });

    test('should return false for non-marketplace pages', () => {
      expect(parser.isMarketplacePage('https://eodhd.com/financial-apis/api')).toBe(false);
    });
  });

  describe('isListPage', () => {
    test('should detect list pages', () => {
      expect(parser.isListPage('https://eodhd.com/financial-apis-blog/')).toBe(true);
      expect(parser.isListPage('https://eodhd.com/financial-apis/category/stock')).toBe(true);
    });

    test('should return false for detail pages', () => {
      expect(parser.isListPage('https://eodhd.com/financial-apis/api-documentation')).toBe(false);
    });
  });

  describe('getPriority', () => {
    test('should return 100', () => {
      expect(parser.getPriority()).toBe(100);
    });
  });

  describe('generateFilename', () => {
    test('should generate filename from URL path', () => {
      expect(parser.generateFilename('https://eodhd.com/financial-apis/fundamentals-api')).toBe('fundamentals-api');
    });

    test('should handle category pages', () => {
      expect(parser.generateFilename('https://eodhd.com/financial-apis/category/stock')).toBe('category_stock');
    });

    test('should handle root pages', () => {
      expect(parser.generateFilename('https://eodhd.com/financial-apis')).toBe('api_overview');
    });

    test('should handle invalid URLs', () => {
      expect(parser.generateFilename('invalid-url')).toBe('api_doc');
    });
  });

  describe('convertToMarkdown', () => {
    test('should convert API doc to markdown', () => {
      const data = {
        title: 'Fundamentals API',
        description: 'Get fundamental data.',
        codeExamples: [{ type: 'endpoint', code: 'https://api.com' }],
        parameters: [{ name: 'symbol', description: 'Stock symbol' }],
        sections: [{ title: 'Usage', content: 'How to use' }],
        relatedApis: [{ title: 'Related', url: 'https://related.com' }]
      };

      const markdown = parser.convertToMarkdown(data);

      expect(markdown).toContain('# Fundamentals API');
    });
  });

  describe('convertListToMarkdown', () => {
    test('should convert list to markdown', () => {
      const data = {
        title: 'Blog Posts',
        items: [
          { title: 'Post 1', link: 'https://eodhd.com/post1' }
        ]
      };

      const markdown = parser.convertListToMarkdown(data);

      expect(markdown).toContain('# Blog Posts');
    });
  });

  describe('convertBlogToMarkdown', () => {
    test('should convert blog article to markdown', () => {
      const data = {
        title: 'Blog Article',
        publishDate: '2024-01-01',
        contentParts: [{ type: 'paragraph', text: 'Content' }]
      };

      const markdown = parser.convertBlogToMarkdown(data);

      expect(markdown).toContain('# Blog Article');
    });
  });

  describe('convertMarketplaceToMarkdown', () => {
    test('should convert marketplace to markdown', () => {
      const data = {
        title: 'ESG Data API',
        provider: 'ESG Provider',
        description: 'ESG data service'
      };

      const markdown = parser.convertMarketplaceToMarkdown(data);

      expect(markdown).toContain('# ESG Data API');
    });
  });
});