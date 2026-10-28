import { describe, expect, test, beforeEach, jest } from '@jest/globals';
import QverisApiParser from '../src/parsers/qveris-api-parser.js';

describe('QverisApiParser', () => {
  let parser;

  beforeEach(() => {
    parser = new QverisApiParser();
  });

  describe('matches', () => {
    test('should match QVeris docs URLs', () => {
      expect(parser.matches('https://qveris.ai/docs')).toBe(true);
      expect(parser.matches('https://qveris.ai/docs/')).toBe(true);
      expect(parser.matches('http://qveris.ai/docs')).toBe(true);
    });

    test('should not match other QVeris URLs', () => {
      expect(parser.matches('https://qveris.ai/')).toBe(false);
      expect(parser.matches('https://qveris.ai/api')).toBe(false);
      expect(parser.matches('https://qveris.ai/docs/api')).toBe(false);
    });

    test('should not match other domains', () => {
      expect(parser.matches('https://example.com/docs')).toBe(false);
    });
  });

  describe('getPriority', () => {
    test('should return 100 (high priority)', () => {
      expect(parser.getPriority()).toBe(100);
    });
  });

  describe('supportsLinkDiscovery', () => {
    test('should return false (single page docs)', () => {
      expect(parser.supportsLinkDiscovery()).toBe(false);
    });
  });

  describe('generateFilename', () => {
    test('should return fixed filename', () => {
      expect(parser.generateFilename('https://qveris.ai/docs')).toBe('qveris-api-docs');
      expect(parser.generateFilename('https://qveris.ai/docs/')).toBe('qveris-api-docs');
    });
  });

  describe('extractEndpointsFromText', () => {
    test('should extract endpoint paths from text', () => {
      const text = `
        POST /search
        POST /tools/execute?tool_id={tool_id}
        POST /tools/by-ids
      `;
      const endpoints = parser.extractEndpointsFromText(text);

      expect(endpoints).toContain('/search');
      expect(endpoints).toContain('/tools/execute?tool_id={tool_id}');
      expect(endpoints).toContain('/tools/by-ids');
    });

    test('should handle GET methods', () => {
      const text = 'GET /api/status GET /health';
      const endpoints = parser.extractEndpointsFromText(text);

      expect(endpoints).toContain('/api/status');
      expect(endpoints).toContain('/health');
    });

    test('should deduplicate endpoints', () => {
      const text = 'POST /search POST /search GET /search';
      const endpoints = parser.extractEndpointsFromText(text);

      expect(endpoints.length).toBe(1);
      expect(endpoints).toContain('/search');
    });

    test('should clean trailing punctuation', () => {
      const text = 'POST /endpoint), POST /path;';
      const endpoints = parser.extractEndpointsFromText(text);

      expect(endpoints).toContain('/endpoint');
      expect(endpoints).toContain('/path');
    });

    test('should return empty array for no endpoints', () => {
      expect(parser.extractEndpointsFromText('no endpoints here')).toEqual([]);
    });
  });

  describe('normalizeCodeExamples', () => {
    test('should infer language and deduplicate', () => {
      const codeExamples = parser.normalizeCodeExamples([
        { className: 'language-bash', code: 'curl -X POST https://qveris.ai/api/v1/search -d "{\\"query\\": \\"weather\\"}"' },
        { className: 'language-bash', code: 'curl -X POST https://qveris.ai/api/v1/search -d "{\\"query\\": \\"weather\\"}"' },
        { className: 'language-json', code: '{\n  "query": "weather",\n  "limit": 5\n}' }
      ]);

      expect(codeExamples.length).toBe(2);
      expect(codeExamples.find((item) => item.language === 'bash')).toBeTruthy();
      expect(codeExamples.find((item) => item.language === 'json')).toBeTruthy();
    });

    test('should infer TypeScript from code content', () => {
      const codeExamples = parser.normalizeCodeExamples([
        { className: '', code: 'export async function fetchData() { return await fetch(url); }' }
      ]);

      expect(codeExamples[0].language).toBe('typescript');
    });

    test('should infer Python from code content', () => {
      const codeExamples = parser.normalizeCodeExamples([
        { className: '', code: 'import requests\ndef get_data():\n    return requests.get(url)' }
      ]);

      expect(codeExamples[0].language).toBe('python');
    });

    test('should infer JSON from starting characters', () => {
      const codeExamples = parser.normalizeCodeExamples([
        { className: '', code: '{"key": "value", "anotherKey": "some longer value here to make it pass thirty chars"}' }
      ]);

      expect(codeExamples.length).toBeGreaterThan(0);
      expect(codeExamples[0].language).toBe('json');
    });

    test('should filter short code examples', () => {
      const codeExamples = parser.normalizeCodeExamples([
        { className: 'language-bash', code: 'short' }
      ]);

      expect(codeExamples.length).toBe(0);
    });
  });

  describe('extractApiInfo', () => {
    test('should extract base URL', () => {
      const content = 'API Base URL: https://qveris.ai/api/v1';
      const apiInfo = parser.extractApiInfo(content);

      expect(apiInfo.baseUrl).toBe('https://qveris.ai/api/v1');
    });

    test('should extract auth method', () => {
      const content = 'Authorization: Bearer YOUR_API_KEY';
      const apiInfo = parser.extractApiInfo(content);

      expect(apiInfo.authMethod).toBe('Bearer Token');
    });

    test('should extract endpoint details', () => {
      const content = 'POST /search - Search for tools\nPOST /tools/execute - Execute tool';
      const apiInfo = parser.extractApiInfo(content);

      expect(apiInfo.endpoints.length).toBeGreaterThan(0);
    });

    test('should return empty apiInfo for no content', () => {
      const apiInfo = parser.extractApiInfo('no api info');

      expect(apiInfo.baseUrl).toBe('');
      expect(apiInfo.authMethod).toBe('');
    });
  });

  describe('mergeRenderedAndChunkData', () => {
    test('should merge data from rendered page and JS chunk', () => {
      const renderedData = {
        title: 'QVeris API Docs',
        description: 'rendered',
        endpoints: ['/search'],
        codeExamples: [{ language: 'bash', code: 'curl -X POST /search' }],
        parameters: [{ name: 'query' }],
        apiInfo: {
          baseUrl: 'https://qveris.ai/api/v1',
          authMethod: 'Bearer Token',
          endpoints: [{ method: 'POST', path: '/search', params: ['query', 'limit'] }]
        },
        baseUrl: 'https://qveris.ai/api/v1',
        authMethod: 'Bearer Token',
        authentication: 'Bearer Token',
        markdownContent: '## 目录\n- Quick start',
        source: 'rendered-page'
      };

      const jsChunkData = {
        title: 'QVeris API Documentation',
        description: 'chunk',
        endpoints: ['/tools/execute', '/tools/by-ids'],
        codeExamples: [{ language: 'json', code: '{ "tool_id": "abc" }' }],
        apiInfo: {
          baseUrl: 'https://qveris.ai/api/v1',
          authMethod: 'Bearer Token',
          endpoints: [{ method: 'POST', path: '/tools/execute', params: ['tool_id'] }]
        },
        source: 'js-chunk'
      };

      const merged = parser.mergeRenderedAndChunkData(renderedData, jsChunkData, 'https://qveris.ai/docs');
      expect(merged).toBeTruthy();
      expect(merged.baseUrl).toBe('https://qveris.ai/api/v1');
      expect(merged.authMethod).toBe('Bearer Token');
      expect(merged.endpoints).toEqual(expect.arrayContaining(['/search', '/tools/execute', '/tools/by-ids']));
      expect(merged.parameters).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'query' }),
        expect.objectContaining({ name: 'tool_id' })
      ]));
    });

    test('should return null when both inputs are null', () => {
      expect(parser.mergeRenderedAndChunkData(null, null, 'url')).toBeNull();
    });

    test('should return rendered data when chunk data is null', () => {
      const renderedData = { title: 'Test', endpoints: [] };
      const result = parser.mergeRenderedAndChunkData(renderedData, null, 'url');

      expect(result).toBe(renderedData);
    });

    test('should return chunk data when rendered data is null', () => {
      const jsChunkData = { title: 'Test', endpoints: [] };
      const result = parser.mergeRenderedAndChunkData(null, jsChunkData, 'url');

      expect(result).toBe(jsChunkData);
    });
  });

  describe('parseJsChunkContent', () => {
    test('should parse JS content and extract data', () => {
      const jsContent = `
        const data = {
          endpoints: ["POST /search", "GET /tools"],
          code: "curl -X POST https://qveris.ai/api/v1/search"
        };
      `;
      const result = parser.parseJsChunkContent(jsContent, 'https://qveris.ai/docs');

      expect(result.type).toBe('qveris-api');
      expect(result.baseUrl).toBe('https://qveris.ai/api/v1');
      expect(result.authMethod).toBe('Bearer Token');
    });

    test('should handle empty JS content', () => {
      const result = parser.parseJsChunkContent('', 'https://qveris.ai/docs');

      expect(result.type).toBe('qveris-api');
      expect(result.endpoints.length).toBeGreaterThan(0);
    });
  });

  describe('generateRawContent', () => {
    test('should generate raw content from examples', () => {
      const codeExamples = [{ language: 'bash', code: 'curl example' }];
      const apiInfo = {
        baseUrl: 'https://api.example.com',
        authMethod: 'Bearer',
        endpoints: [{ method: 'POST', path: '/search', description: 'Search', params: ['query'] }]
      };
      const sections = [];

      const content = parser.generateRawContent(codeExamples, apiInfo, sections);

      expect(content).toContain('# QVeris API Documentation');
      expect(content).toContain('## Base URL');
      expect(content).toContain('https://api.example.com');
    });
  });

  describe('waitForContent', () => {
    test('should wait for content and click API tab', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockResolvedValue(undefined),
        waitForTimeout: jest.fn().mockResolvedValue(undefined),
        $: jest.fn().mockResolvedValue({
          evaluate: jest.fn().mockResolvedValue(false),
          click: jest.fn().mockResolvedValue(undefined)
        })
      };

      await parser.waitForContent(mockPage);
      expect(mockPage.waitForLoadState).toHaveBeenCalled();
    });

    test('should handle errors gracefully', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockRejectedValue(new Error('Timeout')),
        waitForTimeout: jest.fn().mockResolvedValue(undefined)
      };

      await expect(parser.waitForContent(mockPage)).resolves.not.toThrow();
    });
  });

  describe('expandInteractiveContent', () => {
    test('should expand details elements', async () => {
      const mockPage = {
        evaluate: jest.fn().mockResolvedValue(undefined),
        locator: jest.fn().mockReturnValue({
          all: jest.fn().mockResolvedValue([])
        }),
        waitForTimeout: jest.fn().mockResolvedValue(undefined)
      };

      await parser.expandInteractiveContent(mockPage);
      expect(mockPage.evaluate).toHaveBeenCalled();
    });

    test('should handle errors gracefully', async () => {
      const mockPage = {
        evaluate: jest.fn().mockRejectedValue(new Error('Expand failed'))
      };

      await expect(parser.expandInteractiveContent(mockPage)).resolves.not.toThrow();
    });
  });

  describe('parse', () => {
    test('should return qveris-api type with parsed data', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockResolvedValue(undefined),
        waitForTimeout: jest.fn().mockResolvedValue(undefined),
        evaluate: jest.fn().mockResolvedValue({
          title: 'QVeris API',
          description: 'API docs',
          sections: [],
          codeExamples: [],
          endpoints: ['/search'],
          apiInfo: { baseUrl: 'https://qveris.ai/api/v1', authMethod: 'Bearer' }
        }),
        $: jest.fn().mockResolvedValue(null),
        locator: jest.fn().mockReturnValue({ all: jest.fn().mockResolvedValue([]) })
      };

      parser.extractFromJsChunk = jest.fn().mockResolvedValue(null);

      const result = await parser.parse(mockPage, 'https://qveris.ai/docs');

      expect(result.type).toBe('qveris-api');
      expect(result.url).toBe('https://qveris.ai/docs');
      expect(result.suggestedFilename).toBe('qveris-api-docs');
    });

    test('should handle errors gracefully', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockRejectedValue(new Error('Page error')),
        waitForTimeout: jest.fn().mockResolvedValue(undefined)
      };

      const result = await parser.parse(mockPage, 'https://qveris.ai/docs');

      expect(result.type).toBe('qveris-api');
      expect(result.url).toBe('https://qveris.ai/docs');
      expect(result.title).toBe('');
    });
  });
});
