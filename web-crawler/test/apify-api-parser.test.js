import ApifyApiParser from '../src/parsers/apify-api-parser.js';

describe('ApifyApiParser', () => {
  let parser;

  beforeEach(() => {
    parser = new ApifyApiParser();
  });

  describe('matches', () => {
    test('should match docs.apify.com/api/v2 URLs', () => {
      expect(parser.matches('https://docs.apify.com/api/v2')).toBe(true);
      expect(parser.matches('https://docs.apify.com/api/v2.md')).toBe(true);
      expect(parser.matches('https://docs.apify.com/api/v2?query=test')).toBe(true);
    });

    test('should match openapi URLs', () => {
      expect(parser.matches('https://docs.apify.com/api/openapi.json')).toBe(true);
      expect(parser.matches('https://docs.apify.com/api/openapi.yaml')).toBe(true);
    });

    test('should not match other URLs', () => {
      expect(parser.matches('https://docs.apify.com/actors')).toBe(false);
      expect(parser.matches('https://apify.com')).toBe(false);
      expect(parser.matches('https://api.apify.com/v2')).toBe(false);
    });
  });

  describe('getPriority', () => {
    test('should return 110', () => {
      expect(parser.getPriority()).toBe(110);
    });
  });

  describe('parse', () => {
    test('should route to parseApiDoc for v2 URLs', async () => {
      const mockPage = {
        evaluate: async () => ({
          title: 'Apify API',
          description: 'API documentation',
          openapiLinks: ['https://docs.apify.com/api/openapi.json'],
          referenceRoutes: ['#/reference/actors'],
          rawContent: 'raw content',
          canonicalMarkdown: ''
        })
      };

      parser.fetchCanonicalMarkdown = async () => '';

      const result = await parser.parse(mockPage, 'https://docs.apify.com/api/v2');

      expect(result.type).toBe('apify-api-doc');
      expect(result.api.method).toBe('MULTI');
      expect(result.api.baseUrl).toBe('https://api.apify.com');
    });

    test('should route to parseOpenApiJson for openapi URLs', async () => {
      const mockPage = {
        evaluate: async () => '{"info":{"title":"Apify API"},"paths":{"/v2/acts":{"get":{"summary":"Get acts"}}},"servers":[{"url":"https://api.apify.com"}]}'
      };

      const result = await parser.parse(mockPage, 'https://docs.apify.com/api/openapi.json');

      expect(result.type).toBe('apify-openapi');
      expect(result.title).toBe('Apify API');
    });

    test('should handle JSON parse errors', async () => {
      const mockPage = {
        evaluate: async () => 'invalid json'
      };

      const result = await parser.parse(mockPage, 'https://docs.apify.com/api/openapi.json');

      expect(result.type).toBe('apify-openapi');
      expect(result.description).toContain('Failed to parse');
    });
  });

  describe('parseOpenApiJson', () => {
    test('should parse OpenAPI specification', async () => {
      const mockPage = {
        evaluate: async () => JSON.stringify({
          info: { title: 'Apify API v2', version: '1.0.0', description: 'The API' },
          servers: [{ url: 'https://api.apify.com' }],
          paths: {
            '/v2/acts': {
              get: { operationId: 'getActs', summary: 'List all acts', tags: ['Acts'] },
              post: { operationId: 'createAct', summary: 'Create act' }
            }
          }
        })
      };

      const result = await parser.parseOpenApiJson(mockPage, 'https://docs.apify.com/api/openapi.json');

      expect(result.type).toBe('apify-openapi');
      expect(result.title).toBe('Apify API v2');
      expect(result.version).toBe('1.0.0');
      expect(result.servers).toContain('https://api.apify.com');
      expect(result.operations).toHaveLength(2);
      expect(result.operationCount).toBe(2);
    });

    test('should filter valid HTTP methods', async () => {
      const mockPage = {
        evaluate: async () => JSON.stringify({
          info: { title: 'Test' },
          paths: {
            '/test': {
              get: { summary: 'GET' },
              post: { summary: 'POST' },
              options: { summary: 'OPTIONS' },
              xCustom: { summary: 'Custom' }
            }
          }
        })
      };

      const result = await parser.parseOpenApiJson(mockPage, 'https://docs.apify.com/api/openapi.json');

      expect(result.operations).toHaveLength(3);
    });
  });

  describe('parseApiDoc', () => {
    test('should merge DOM and markdown content', async () => {
      const mockPage = {
        evaluate: async () => ({
          title: 'Apify API v2',
          description: 'Documentation',
          openapiLinks: [],
          referenceRoutes: ['#/reference/runs'],
          rawContent: 'DOM content',
          canonicalMarkdown: ''
        })
      };

      parser.fetchCanonicalMarkdown = async () => '# Apify API\n\nMarkdown content\n\n#/reference/actors';

      const result = await parser.parseApiDoc(mockPage, 'https://docs.apify.com/api/v2');

      expect(result.entryPoints).toContain('https://docs.apify.com/api/v2');
      expect(result.referenceRoutes).toContain('#/reference/runs');
      expect(result.referenceRoutes).toContain('#/reference/actors');
    });
  });
});