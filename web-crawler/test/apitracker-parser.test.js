import ApiTrackerParser from '../src/parsers/apitracker-parser.js';

describe('ApiTrackerParser', () => {
  let parser;

  beforeEach(() => {
    parser = new ApiTrackerParser();
  });

  describe('matches', () => {
    test('should match apitracker.io category URLs', () => {
      expect(parser.matches('https://apitracker.io/categories/fintech')).toBe(true);
      expect(parser.matches('https://apitracker.io/categories/fintech/')).toBe(true);
    });

    test('should match apitracker.io detail URLs', () => {
      expect(parser.matches('https://apitracker.io/a/openai-api')).toBe(true);
      expect(parser.matches('https://apitracker.io/a/stock-api')).toBe(true);
    });

    test('should not match other URLs', () => {
      expect(parser.matches('https://apitracker.io')).toBe(false);
      expect(parser.matches('https://apitracker.io/all-apis')).toBe(false);
      expect(parser.matches('https://example.com')).toBe(false);
    });
  });

  describe('getPriority', () => {
    test('should return 110', () => {
      expect(parser.getPriority()).toBe(110);
    });
  });

  describe('parse', () => {
    test('should parse category page', async () => {
      const mockPage = {
        waitForSelector: async () => {},
        waitForLoadState: async () => {},
        evaluate: async () => ({
          type: 'apitracker-category',
          url: 'https://apitracker.io/categories/fintech',
          title: 'Fintech APIs',
          category: 'fintech',
          entries: [
            { slug: 'openai', name: 'OpenAI API', url: 'https://apitracker.io/a/openai' },
            { slug: 'stripe', name: 'Stripe API', url: 'https://apitracker.io/a/stripe' }
          ],
          docsEntrances: [],
          apiSpecs: [],
          postmanCollections: [],
          urlRules: { include: [], exclude: [] },
          rawContent: ''
        })
      };

      const result = await parser.parse(mockPage, 'https://apitracker.io/categories/fintech');

      expect(result.type).toBe('apitracker-category');
      expect(result.category).toBe('fintech');
      expect(result.entries).toHaveLength(2);
    });

    test('should parse detail page', async () => {
      const mockPage = {
        waitForSelector: async () => {},
        waitForLoadState: async () => {},
        evaluate: async () => ({
          type: 'apitracker-api-detail',
          url: 'https://apitracker.io/a/openai',
          title: 'OpenAI API',
          slug: 'openai',
          companyName: 'OpenAI',
          websiteUrl: 'https://openai.com',
          apiBaseEndpoint: 'https://api.openai.com/v1',
          graphqlEndpoint: '',
          docsEntrances: ['https://openai.com/api'],
          apiSpecs: [{ type: 'openapi', format: 'json', url: 'https://openai.com/spec.json' }],
          postmanCollections: [],
          urlRules: { include: [], exclude: [] },
          rawContent: ''
        })
      };

      const result = await parser.parse(mockPage, 'https://apitracker.io/a/openai');

      expect(result.type).toBe('apitracker-api-detail');
      expect(result.slug).toBe('openai');
      expect(result.companyName).toBe('OpenAI');
      expect(result.docsEntrances).toContain('https://openai.com/api');
    });

    test('should handle parse errors gracefully', async () => {
      const mockPage = {
        waitForSelector: async () => { throw new Error('timeout'); },
        waitForLoadState: async () => {},
        evaluate: async () => { throw new Error('evaluate error'); }
      };

      const result = await parser.parse(mockPage, 'https://apitracker.io/a/test');

      expect(result.type).toBe('apitracker-error');
      expect(result.error).toBe('evaluate error');
    });

    test('should detect page type from URL', async () => {
      const categoryPage = {
        waitForSelector: async () => {},
        waitForLoadState: async () => {},
        evaluate: async () => ({ type: 'apitracker-category', entries: [] })
      };

      const detailPage = {
        waitForSelector: async () => {},
        waitForLoadState: async () => {},
        evaluate: async () => ({ type: 'apitracker-api-detail', slug: 'test' })
      };

      const catResult = await parser.parse(categoryPage, 'https://apitracker.io/categories/fintech');
      const detResult = await parser.parse(detailPage, 'https://apitracker.io/a/test-api');

      expect(catResult.type).toBe('apitracker-category');
      expect(detResult.type).toBe('apitracker-api-detail');
    });
  });

  describe('extractCategoryEntries', () => {
    test('should extract entries from page', async () => {
      const mockPage = {
        evaluate: async () => [
          { slug: 'api1', name: 'API One', url: 'https://apitracker.io/a/api1' },
          { slug: 'api2', name: 'API Two', url: 'https://apitracker.io/a/api2' }
        ]
      };

      const entries = await parser.extractCategoryEntries(mockPage);

      expect(entries).toHaveLength(2);
      expect(entries[0].slug).toBe('api1');
    });
  });

  describe('waitForContent', () => {
    test('should wait for Next.js data', async () => {
      const mockPage = {
        waitForSelector: async () => {},
        waitForLoadState: async () => {}
      };

      await parser.waitForContent(mockPage);
    });
  });
});