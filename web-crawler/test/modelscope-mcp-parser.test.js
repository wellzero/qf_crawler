import { jest } from '@jest/globals';
import ModelscopeMcpParser from '../src/parsers/modelscope-mcp-parser.js';

describe('ModelscopeMcpParser', () => {
  let parser;

  beforeEach(() => {
    parser = new ModelscopeMcpParser();
  });

  describe('matches', () => {
    test('should match modelscope.cn/mcp URLs', () => {
      expect(parser.matches('https://modelscope.cn/mcp')).toBe(true);
      expect(parser.matches('https://modelscope.cn/mcp/servers')).toBe(true);
      expect(parser.matches('https://modelscope.cn/mcp/servers/@modelcontextprotocol/fetch')).toBe(true);
    });

    test('should not match other URLs', () => {
      expect(parser.matches('https://modelscope.cn')).toBe(false);
      expect(parser.matches('https://modelscope.cn/models')).toBe(false);
      expect(parser.matches('https://example.com/mcp')).toBe(false);
    });
  });

  describe('getPriority', () => {
    test('should return 100', () => {
      expect(parser.getPriority()).toBe(100);
    });
  });

  describe('supportsLinkDiscovery', () => {
    test('should return true', () => {
      expect(parser.supportsLinkDiscovery()).toBe(true);
    });
  });

  describe('generateFilename', () => {
    test('should generate filename from URL path', () => {
      expect(parser.generateFilename('https://modelscope.cn/mcp/servers/test')).toBe('test');
      expect(parser.generateFilename('https://modelscope.cn/mcp')).toBe('mcp_overview');
      expect(parser.generateFilename('https://modelscope.cn/mcp/servers/@org/tool')).toBe('@org_tool');
    });

    test('should handle invalid URLs', () => {
      expect(parser.generateFilename('invalid-url')).toBe('modelscope_mcp_doc');
    });
  });

  describe('extractServerPath', () => {
    test('should extract path from URL', () => {
      expect(parser.extractServerPath('https://modelscope.cn/mcp/servers/test')).toBe('servers/test');
      expect(parser.extractServerPath('https://modelscope.cn/mcp')).toBe('');
    });

    test('should handle invalid URLs', () => {
      expect(parser.extractServerPath('invalid-url')).toBe('');
    });
  });

  describe('discoverLinks', () => {
    test('should discover MCP links from page', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockResolvedValue(),
        waitForSelector: jest.fn().mockResolvedValue(),
        waitForFunction: jest.fn().mockResolvedValue(),
        waitForTimeout: jest.fn().mockResolvedValue(),
        mouse: { wheel: jest.fn().mockResolvedValue() },
        evaluate: jest.fn().mockResolvedValue([
          'https://modelscope.cn/mcp/servers/tool1',
          'https://modelscope.cn/mcp/servers/tool2'
        ])
      };

      const links = await parser.discoverLinks(mockPage);

      expect(links.length).toBeGreaterThan(0);
      expect(links.every(l => l.includes('modelscope.cn/mcp'))).toBe(true);
    });

    test('should filter non-MCP links', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockResolvedValue(),
        waitForSelector: jest.fn().mockResolvedValue(),
        waitForFunction: jest.fn().mockResolvedValue(),
        waitForTimeout: jest.fn().mockResolvedValue(),
        mouse: { wheel: jest.fn().mockResolvedValue() },
        evaluate: jest.fn().mockResolvedValue([
          'https://modelscope.cn/mcp/servers/test',
          'https://modelscope.cn/models',
          'https://example.com'
        ])
      };

      const links = await parser.discoverLinks(mockPage);

      expect(links.every(l => l.includes('/mcp'))).toBe(true);
    });

    test('should handle discovery errors', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockRejectedValue(new Error('error')),
        waitForSelector: jest.fn().mockResolvedValue(),
        waitForFunction: jest.fn().mockResolvedValue(),
        waitForTimeout: jest.fn().mockResolvedValue(),
        mouse: { wheel: jest.fn().mockResolvedValue() },
        evaluate: jest.fn().mockResolvedValue([])
      };

      const links = await parser.discoverLinks(mockPage);

      expect(links).toEqual([]);
    });
  });

  describe('parseToolsFromText', () => {
    test('should parse Chinese tool names', () => {
      const text = '地理编码 map_geocode\n输入: address 地址字符串';
      const tools = parser.parseToolsFromText(text);

      expect(tools.length).toBeGreaterThan(0);
      expect(tools[0].name).toBe('map_geocode');
      expect(tools[0].displayName).toBe('地理编码');
    });

    test('should parse PascalCase tool names', () => {
      const text = 'List_console_messages\n获取控制台消息列表';
      const tools = parser.parseToolsFromText(text);

      expect(tools.some(t => t.name === 'List_console_messages')).toBe(true);
    });

    test('should parse English tool format', () => {
      const text = 'get_data - Fetch data from API';
      const tools = parser.parseToolsFromText(text);

      expect(tools.some(t => t.name === 'get_data')).toBe(true);
    });

    test('should parse input parameters', () => {
      const text = '地理编码 map_geocode\n输入: param1 First parameter\n输入: param2 Second parameter';
      const tools = parser.parseToolsFromText(text);

      expect(tools.length).toBeGreaterThan(0);
      expect(tools[0].inputs.length).toBeGreaterThan(0);
    });

    test('should filter invalid tool names', () => {
      const text = 'Local\nHosted\nGitHub\nvalid_tool_name';
      const tools = parser.parseToolsFromText(text);

      expect(tools.every(t => !['Local', 'Hosted', 'GitHub'].includes(t.name))).toBe(true);
    });

    test('should handle empty text', () => {
      const tools = parser.parseToolsFromText('');

      expect(tools).toEqual([]);
    });
  });

  describe('parseInstallation', () => {
    test('should extract installation section', () => {
      const text = 'Getting Started\nInstall the package first...\nConfiguration\nSet up config...';
      const result = parser.parseInstallation(text);

      expect(result).toContain('Getting Started');
    });

    test('should handle missing installation', () => {
      const text = 'Other content without setup instructions';
      const result = parser.parseInstallation(text);

      expect(result).toBe('');
    });
  });

  describe('parseConfiguration', () => {
    test('should extract configuration section', () => {
      const text = 'Configuration\nAdd to your config file...\nService details';
      const result = parser.parseConfiguration(text);

      expect(result).toContain('Configuration');
    });

    test('should handle missing configuration', () => {
      const text = 'No settings section available';
      const result = parser.parseConfiguration(text);

      expect(result).toBe('');
    });
  });

  describe('parse', () => {
    test('should parse server detail page', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockResolvedValue(),
        waitForSelector: jest.fn().mockResolvedValue(),
        waitForFunction: jest.fn().mockResolvedValue(),
        waitForTimeout: jest.fn().mockResolvedValue(),
        mouse: { wheel: jest.fn().mockResolvedValue() },
        $: jest.fn().mockResolvedValue(null),
        keyboard: { press: jest.fn().mockResolvedValue() },
        evaluate: jest.fn().mockResolvedValue({
          title: 'Fetch MCP Server',
          description: 'Fetch web content',
          serverInfo: { '开发者': 'modelcontextprotocol' },
          tags: ['web', 'fetch'],
          codeBlocks: [{ language: 'json', code: '{"mcpServers": {"fetch": {}}}' }],
          tables: [],
          rawContent: 'MCP Server content\n工具\nfetch - Fetch content',
          links: []
        })
      };

      const result = await parser.parse(mockPage, 'https://modelscope.cn/mcp/servers/@modelcontextprotocol/fetch');

      expect(result.type).toBe('modelscope-mcp-server');
      expect(result.title).toBe('Fetch MCP Server');
      expect(result.isServerDetail).toBe(true);
    });

    test('should handle parse errors', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockRejectedValue(new Error('error')),
        waitForSelector: jest.fn().mockResolvedValue(),
        waitForFunction: jest.fn().mockResolvedValue(),
        waitForTimeout: jest.fn().mockResolvedValue(),
        mouse: { wheel: jest.fn().mockResolvedValue() },
        evaluate: jest.fn().mockResolvedValue({
          title: '',
          description: '',
          serverInfo: {},
          tags: [],
          codeBlocks: [],
          tables: [],
          rawContent: '',
          links: []
        })
      };

      const result = await parser.parse(mockPage, 'https://modelscope.cn/mcp');

      expect(result.type).toBe('modelscope-mcp-server');
      expect(result.suggestedFilename).toBeDefined();
    });
  });
});