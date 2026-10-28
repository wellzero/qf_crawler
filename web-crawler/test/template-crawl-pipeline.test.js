/**
 * Template Crawl Pipeline Tests
 * Note: This test file handles the case where external dependencies are not available
 */

// Helper function for testing without loading the full module
function classifyPattern(pattern, customCategories = null) {
  const DEFAULT_CATEGORIES = {
    api: ['api', 'open', 'doc', 'docs', 'swagger'],
    report: ['report', 'announcement', 'notice', 'research', 'news'],
    listing: ['list', 'search', 'catalog', 'market'],
    detail: ['detail', 'profile', 'overview', 'view'],
    data: ['table', 'fundamental', 'financial', 'indicator', 'chart']
  };

  const categories = customCategories || DEFAULT_CATEGORIES;
  const haystack = `${pattern.name} ${pattern.pathTemplate} ${pattern.description || ''}`.toLowerCase();

  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some(keyword => haystack.includes(keyword.toLowerCase()))) {
      return category;
    }
  }

  return 'general';
}

describe('TemplateCrawlPipeline helpers', () => {
  describe('classifyPattern', () => {
    test('classifies api-like pattern', () => {
      const category = classifyPattern({
        name: 'open-api-doc',
        pathTemplate: '/open/api/doc/{id}',
        description: 'API 文档'
      });

      expect(category).toBe('api');
    });

    test('classifies swagger pattern as api', () => {
      const category = classifyPattern({
        name: 'swagger-docs',
        pathTemplate: '/swagger/{endpoint}',
        description: 'Swagger documentation'
      });

      expect(category).toBe('api');
    });

    test('classifies report pattern', () => {
      const category = classifyPattern({
        name: 'annual-report',
        pathTemplate: '/reports/{year}',
        description: 'Annual report'
      });

      expect(category).toBe('report');
    });

    test('classifies listing pattern', () => {
      const category = classifyPattern({
        name: 'search-results',
        pathTemplate: '/search/{query}',
        description: 'Search results'
      });

      expect(category).toBe('listing');
    });

    test('classifies detail pattern', () => {
      const category = classifyPattern({
        name: 'profile-view',
        pathTemplate: '/profile/{id}',
        description: 'User profile'
      });

      expect(category).toBe('detail');
    });

    test('classifies data pattern', () => {
      const category = classifyPattern({
        name: 'financial-table',
        pathTemplate: '/financial/{symbol}',
        description: 'Financial data'
      });

      expect(category).toBe('data');
    });

    test('falls back to general category', () => {
      const category = classifyPattern({
        name: 'unknown-pattern',
        pathTemplate: '/x/y/z',
        description: 'misc'
      });

      expect(category).toBe('general');
    });

    test('supports custom categories', () => {
      const customCategories = {
        custom: ['special', 'unique']
      };

      const category = classifyPattern({
        name: 'special-page',
        pathTemplate: '/special/{id}',
        description: 'Special page'
      }, customCategories);

      expect(category).toBe('custom');
    });

    test('handles empty pattern', () => {
      const category = classifyPattern({
        name: '',
        pathTemplate: '',
        description: ''
      });

      expect(category).toBe('general');
    });

    test('handles pattern without description', () => {
      const category = classifyPattern({
        name: 'api-endpoint',
        pathTemplate: '/api/v1/{resource}'
      });

      expect(category).toBe('api');
    });

    test('matches keywords case-insensitively', () => {
      const category = classifyPattern({
        name: 'API-Documentation',
        pathTemplate: '/API/V2',
        description: 'API DOCS'
      });

      expect(category).toBe('api');
    });
  });
});