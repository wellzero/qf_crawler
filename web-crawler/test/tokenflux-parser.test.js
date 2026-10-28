import { jest } from '@jest/globals';
import TokenfluxParser from '../src/parsers/tokenflux-parser.js';

jest.mock('child_process', () => ({
  execFile: jest.fn()
}));

jest.mock('util', () => ({
  promisify: jest.fn(() => jest.fn())
}));

describe('TokenfluxParser', () => {
  let parser;

  beforeEach(() => {
    parser = new TokenfluxParser();
    jest.clearAllMocks();
  });

  describe('matches', () => {
    test('should match Tokenflux docs URLs', () => {
      expect(parser.matches('https://tokenflux.ai/docs/quickstart')).toBe(true);
      expect(parser.matches('https://tokenflux.ai/mcps')).toBe(true);
      expect(parser.matches('https://tokenflux.ai/mcps/exa-search')).toBe(true);
      expect(parser.matches('http://tokenflux.ai/mcps/some-tool')).toBe(true);
    });

    test('should not match other Tokenflux URLs', () => {
      expect(parser.matches('https://tokenflux.ai/')).toBe(false);
      expect(parser.matches('https://tokenflux.ai/pricing')).toBe(false);
      expect(parser.matches('https://tokenflux.ai/docs')).toBe(false);
      expect(parser.matches('https://tokenflux.ai/docs/api')).toBe(false);
    });

    test('should not match other domains', () => {
      expect(parser.matches('https://example.com/docs/quickstart')).toBe(false);
    });
  });

  describe('getPriority', () => {
    test('should return 110 (high priority)', () => {
      expect(parser.getPriority()).toBe(110);
    });
  });

  describe('generateFilename', () => {
    test('should generate filename from URL path', () => {
      expect(parser.generateFilename('https://tokenflux.ai/docs/quickstart')).toBe('docs_quickstart');
      expect(parser.generateFilename('https://tokenflux.ai/mcps')).toBe('mcps');
      expect(parser.generateFilename('https://tokenflux.ai/mcps/exa-search')).toBe('mcps_exa-search');
    });

    test('should handle root URL', () => {
      expect(parser.generateFilename('https://tokenflux.ai/')).toBe('tokenflux_index');
    });

    test('should handle invalid URLs', () => {
      expect(parser.generateFilename('invalid-url')).toBe('tokenflux_page');
    });
  });

  describe('isMcpDetailPage', () => {
    test('should identify MCP detail pages', () => {
      expect(parser.isMcpDetailPage('https://tokenflux.ai/mcps/exa-search')).toBe(true);
      expect(parser.isMcpDetailPage('https://tokenflux.ai/mcps/some-tool-id')).toBe(true);
    });

    test('should not identify non-MCP detail pages', () => {
      expect(parser.isMcpDetailPage('https://tokenflux.ai/mcps')).toBe(false);
      expect(parser.isMcpDetailPage('https://tokenflux.ai/docs/quickstart')).toBe(false);
      expect(parser.isMcpDetailPage('https://tokenflux.ai/mcps/category/sub')).toBe(false);
    });
  });

  describe('extractMcpId', () => {
    test('should extract MCP ID from URL', () => {
      expect(parser.extractMcpId('https://tokenflux.ai/mcps/exa-search')).toBe('exa-search');
      expect(parser.extractMcpId('https://tokenflux.ai/mcps/some-tool-id')).toBe('some-tool-id');
    });

    test('should return null for non-MCP detail URLs', () => {
      expect(parser.extractMcpId('https://tokenflux.ai/mcps')).toBe(null);
      expect(parser.extractMcpId('https://tokenflux.ai/docs/quickstart')).toBe(null);
    });
  });

  describe('parseToolTitle', () => {
    test('should parse tool title with method', () => {
      const result = parser.parseToolTitle('EXA_AI__SEARCHPOSTsearch');
      expect(result.fullName).toBe('EXA_AI__SEARCHPOSTsearch');
      expect(result.toolName).toBe('EXA_AI');
      expect(result.method).toBe('POST');
    });

    test('should handle simple title without method', () => {
      const result = parser.parseToolTitle('SIMPLE_TOOL');
      expect(result.fullName).toBe('SIMPLE_TOOL');
      expect(result.toolName).toBe('SIMPLE_TOOL');
      expect(result.method).toBe('');
    });

    test('should handle GET method', () => {
      const result = parser.parseToolTitle('TOOL__NAMEGETget');
      expect(result.method).toBe('GET');
    });
  });

  describe('extractParametersFromTool', () => {
    test('should extract parameters from tool object', () => {
      const tool = {
        parameters: {
          properties: {
            body: {
              properties: {
                query: { type: 'string', description: 'Search query' },
                limit: { type: 'integer', description: 'Max results' }
              },
              required: ['query'],
              visible: ['query', 'limit']
            }
          }
        }
      };

      const params = parser.extractParametersFromTool(tool);

      expect(params.length).toBeGreaterThan(0);
      expect(params.find(p => p.name.includes('query'))).toBeTruthy();
    });

    test('should return empty array when no parameters', () => {
      expect(parser.extractParametersFromTool({})).toEqual([]);
      expect(parser.extractParametersFromTool({ parameters: {} })).toEqual([]);
      expect(parser.extractParametersFromTool({ parameters: { properties: {} } })).toEqual([]);
    });
  });

  describe('waitForContent', () => {
    test('should wait for content selectors', async () => {
      const page = {
        waitForLoadState: jest.fn().mockResolvedValue(undefined),
        waitForSelector: jest.fn().mockResolvedValue(undefined),
        waitForTimeout: jest.fn().mockResolvedValue(undefined)
      };

      await parser.waitForContent(page);
      expect(page.waitForLoadState).toHaveBeenCalled();
    });

    test('should handle errors gracefully', async () => {
      const page = {
        waitForLoadState: jest.fn().mockRejectedValue(new Error('Timeout')),
        waitForSelector: jest.fn().mockRejectedValue(new Error('No selector')),
        waitForTimeout: jest.fn().mockRejectedValue(new Error('Timeout'))
      };

      await expect(parser.waitForContent(page)).resolves.not.toThrow();
    });
  });

  describe('generateContentFromApiData', () => {
    test('should generate content from MCP data', () => {
      const mcpData = {
        description: 'A search tool',
        security_schemes: { api_key: { location: 'header', name: 'X-API-Key' } },
        tools: [
          { name: 'search', description: 'Search the web', protocol_data: { method: 'POST', path: '/search', server_url: 'https://api.example.com' } }
        ]
      };

      const content = parser.generateContentFromApiData(mcpData);

      expect(content.length).toBeGreaterThan(0);
      expect(content.some(c => c.type === 'text')).toBe(true);
    });

    test('should handle empty data', () => {
      const content = parser.generateContentFromApiData({});
      expect(content).toEqual([]);
    });
  });

  describe('buildApiEndpointsFromApiData', () => {
    test('should build API endpoints from MCP data', () => {
      const mcpData = {
        tools: [
          {
            name: 'search',
            description: 'Search tool',
            protocol_data: { method: 'POST', path: '/search', server_url: 'https://api.example.com' },
            tags: ['search', 'web']
          }
        ]
      };

      const endpoints = parser.buildApiEndpointsFromApiData(mcpData);

      expect(endpoints.length).toBe(1);
      expect(endpoints[0].name).toBe('search');
      expect(endpoints[0].method).toBe('POST');
    });

    test('should handle empty tools', () => {
      expect(parser.buildApiEndpointsFromApiData({ tools: [] })).toEqual([]);
      expect(parser.buildApiEndpointsFromApiData({})).toEqual([]);
    });
  });

  describe('parse', () => {
    test('should return tokenflux-mcp type for MCP detail pages with API data', async () => {
      parser.fetchMcpApiData = jest.fn().mockResolvedValue({
        display_name: 'Exa Search',
        name: 'exa-search',
        description: 'Web search tool',
        tools: [],
        security_schemes: {}
      });

      const mockPage = {
        waitForLoadState: jest.fn().mockResolvedValue(undefined),
        waitForSelector: jest.fn().mockResolvedValue(undefined),
        waitForTimeout: jest.fn().mockResolvedValue(undefined),
        evaluate: jest.fn().mockResolvedValue({ title: '', description: '', links: [] })
      };

      const result = await parser.parse(mockPage, 'https://tokenflux.ai/mcps/exa-search');

      expect(result.type).toBe('tokenflux-mcp');
      expect(result.url).toBe('https://tokenflux.ai/mcps/exa-search');
    });

    test('should return tokenflux-doc type for docs pages', async () => {
      parser.fetchMcpApiData = jest.fn().mockResolvedValue(null);
      parser.expandAndExtractAccordionContent = jest.fn().mockResolvedValue([]);

      const mockPage = {
        waitForLoadState: jest.fn().mockResolvedValue(undefined),
        waitForSelector: jest.fn().mockResolvedValue(undefined),
        waitForTimeout: jest.fn().mockResolvedValue(undefined),
        evaluate: jest.fn().mockResolvedValue({
          title: 'Quickstart Guide',
          description: 'How to get started',
          codeBlocks: [],
          jsonBlocks: [],
          links: ['https://tokenflux.ai/docs/api']
        })
      };

      const result = await parser.parse(mockPage, 'https://tokenflux.ai/docs/quickstart');

      expect(result.type).toBe('tokenflux-doc');
      expect(result.title).toBe('Quickstart Guide');
    });

    test('should return tokenflux-doc type on error', async () => {
      parser.isMcpDetailPage = jest.fn().mockReturnValue(false);
      parser.waitForContent = jest.fn().mockImplementation(async () => {
        await Promise.resolve();
      });
      parser.expandAndExtractAccordionContent = jest.fn().mockImplementation(async () => {
        return await Promise.resolve([]);
      });

      const mockPage = {
        waitForLoadState: jest.fn().mockImplementation(async () => {}),
        waitForSelector: jest.fn().mockImplementation(async () => {}),
        waitForTimeout: jest.fn().mockImplementation(async () => {}),
        evaluate: jest.fn().mockImplementation(async () => {
          return {
            title: '',
            description: '',
            codeBlocks: [],
            jsonBlocks: [],
            links: []
          };
        })
      };

      const result = await parser.parse(mockPage, 'https://tokenflux.ai/docs/quickstart');

      expect(result.type).toBe('tokenflux-doc');
      expect(result.url).toBe('https://tokenflux.ai/docs/quickstart');
    });
  });
});