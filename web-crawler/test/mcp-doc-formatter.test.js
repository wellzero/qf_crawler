import McpDocFormatter, { formatMcpDoc, formatMcpDocs } from '../src/parsers/formatters/mcp-doc-formatter.js';

const { UNIFIED_MCP_SCHEMA } = McpDocFormatter;

describe('McpDocFormatter', () => {
  describe('UNIFIED_MCP_SCHEMA', () => {
    test('should define all required fields', () => {
      expect(UNIFIED_MCP_SCHEMA.type).toBe('');
      expect(UNIFIED_MCP_SCHEMA.url).toBe('');
      expect(UNIFIED_MCP_SCHEMA.title).toBe('');
      expect(UNIFIED_MCP_SCHEMA.mcp).toBeDefined();
      expect(UNIFIED_MCP_SCHEMA.tools).toEqual([]);
      expect(UNIFIED_MCP_SCHEMA.stats).toBeDefined();
    });
  });

  describe('formatMcpDoc', () => {
    test('should format raw MCP doc data', () => {
      const rawData = {
        type: 'mcp-server',
        url: 'https://example.com/mcp',
        title: 'Test MCP',
        description: 'Test description',
        toolId: 'test-mcp',
        provider: 'Test Provider',
        category: 'tools',
        tools: [{ name: 'tool1', description: 'Tool 1' }],
        stats: { users: '100', calls: '1000' },
        rawContent: 'raw'
      };

      const result = formatMcpDoc(rawData);

      expect(result.type).toBe('mcp-server');
      expect(result.url).toBe('https://example.com/mcp');
      expect(result.title).toBe('Test MCP');
      expect(result.mcp.serverId).toBe('test-mcp');
      expect(result.mcp.provider).toBe('Test Provider');
      expect(result.tools).toHaveLength(1);
    });

    test('should normalize tools', () => {
      const rawData = {
        tools: [
          { name: 'tool1', displayName: 'Tool One', description: 'Desc' },
          'tool2'
        ]
      };

      const result = formatMcpDoc(rawData);

      expect(result.tools).toHaveLength(2);
      expect(result.tools[0].name).toBe('tool1');
      expect(result.tools[1].name).toBe('tool2');
    });

    test('should normalize tools from apiEndpoints', () => {
      const rawData = {
        tools: [],
        metadata: {
          apiEndpoints: [
            { name: 'endpoint1', fullName: 'Endpoint One', method: 'GET', endpoint: '/api' }
          ]
        }
      };

      const result = formatMcpDoc(rawData);

      expect(result.tools).toHaveLength(1);
      expect(result.tools[0].name).toBe('endpoint1');
    });

    test('should normalize stats', () => {
      const rawData = {
        stats: { users: '500', calls: '10000', avgTime: '100ms' }
      };

      const result = formatMcpDoc(rawData);

      expect(result.stats.users).toBe('500');
      expect(result.stats.calls).toBe('10000');
    });

    test('should normalize code examples', () => {
      const rawData = {
        codeExamples: [
          { language: 'bash', code: 'npm install' },
          'pip install package'
        ]
      };

      const result = formatMcpDoc(rawData);

      expect(result.codeExamples.length).toBeGreaterThan(0);
    });

    test('should handle null/undefined input', () => {
      expect(formatMcpDoc(null)).toEqual(UNIFIED_MCP_SCHEMA);
      expect(formatMcpDoc(undefined)).toEqual(UNIFIED_MCP_SCHEMA);
    });

    test('should extract extra fields', () => {
      const rawData = {
        type: 'mcp',
        customData: { key: 'value' },
        serverPath: '/path/to/server'
      };

      const result = formatMcpDoc(rawData);

      expect(result._extra.customData).toEqual({ key: 'value' });
    });

    test('should normalize inputs', () => {
      const rawData = {
        tools: [
          { name: 'tool', inputs: [{ name: 'input1', type: 'string', required: true }] }
        ]
      };

      const result = formatMcpDoc(rawData);

      expect(result.tools[0].inputs).toHaveLength(1);
      expect(result.tools[0].inputs[0].name).toBe('input1');
    });

    test('should handle serviceIntro', () => {
      const rawData = {
        serviceIntro: ['Intro 1', 'Intro 2']
      };

      const result = formatMcpDoc(rawData);

      expect(result.serviceIntro).toHaveLength(2);
    });

    test('should handle string serviceIntro', () => {
      const rawData = {
        serviceIntro: 'Single intro'
      };

      const result = formatMcpDoc(rawData);

      expect(result.serviceIntro).toEqual(['Single intro']);
    });

    test('should merge serverInfo with metadata', () => {
      const rawData = {
        serverInfo: { version: '1.0' },
        metadata: { securitySchemes: [], mcpId: 'mcp-123' }
      };

      const result = formatMcpDoc(rawData);

      expect(result.serverInfo.version).toBe('1.0');
      expect(result.serverInfo.mcpId).toBe('mcp-123');
    });
  });

  describe('formatMcpDocs', () => {
    test('should format array of docs', () => {
      const docs = [
        { type: 'mcp1', title: 'MCP 1' },
        { type: 'mcp2', title: 'MCP 2' }
      ];

      const result = formatMcpDocs(docs);

      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('MCP 1');
      expect(result[1].title).toBe('MCP 2');
    });

    test('should return empty array for invalid input', () => {
      expect(formatMcpDocs(null)).toEqual([]);
      expect(formatMcpDocs(undefined)).toEqual([]);
      expect(formatMcpDocs('string')).toEqual([]);
    });
  });
});