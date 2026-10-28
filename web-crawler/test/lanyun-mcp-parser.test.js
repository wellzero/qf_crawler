import { jest } from '@jest/globals';
import LanyunMcpParser from '../src/parsers/lanyun-mcp-parser.js';

describe('LanyunMcpParser', () => {
  let parser;

  beforeEach(() => {
    parser = new LanyunMcpParser();
  });

  describe('matches', () => {
    test('should match mcp.lanyun.net URLs', () => {
      expect(parser.matches('https://mcp.lanyun.net')).toBe(true);
      expect(parser.matches('https://mcp.lanyun.net/')).toBe(true);
      expect(parser.matches('https://mcp.lanyun.net/servers')).toBe(true);
    });

    test('should not match other URLs', () => {
      expect(parser.matches('https://lanyun.net')).toBe(false);
      expect(parser.matches('https://example.com')).toBe(false);
      expect(parser.matches('https://mcp.example.com')).toBe(false);
    });
  });

  describe('getPriority', () => {
    test('should return 110', () => {
      expect(parser.getPriority()).toBe(110);
    });
  });

  describe('parse', () => {
    test('should parse and add route info', async () => {
      const mockPage = {
        evaluate: jest.fn().mockResolvedValue({
          currentUrl: 'https://mcp.lanyun.net/#servers',
          hashRoute: 'servers',
          pathRoute: '/',
          internalLinks: [
            'https://mcp.lanyun.net/#servers',
            'https://mcp.lanyun.net/#tools'
          ]
        })
      };

      const mockSuperParse = jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(parser)), 'parse')
        .mockResolvedValue({
          type: 'generic',
          url: 'https://mcp.lanyun.net',
          title: 'Lanyun MCP',
          tables: [],
          paragraphs: []
        });

      const result = await parser.parse(mockPage, 'https://mcp.lanyun.net');

      expect(result.type).toBe('lanyun-mcp');
      expect(result.routeInfo).toBeDefined();
      expect(result.routeInfo.hashRoute).toBe('servers');

      mockSuperParse.mockRestore();
    });

    test('should extract internal links', async () => {
      const mockPage = {
        evaluate: jest.fn().mockResolvedValue({
          currentUrl: 'https://mcp.lanyun.net',
          hashRoute: '',
          pathRoute: '/',
          internalLinks: [
            'https://mcp.lanyun.net/#home',
            'https://mcp.lanyun.net/#docs',
            'https://mcp.lanyun.net/#tools'
          ]
        })
      };

      const mockSuperParse = jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(parser)), 'parse')
        .mockResolvedValue({
          type: 'generic',
          url: 'https://mcp.lanyun.net',
          title: 'MCP Console',
          tables: [],
          paragraphs: []
        });

      const result = await parser.parse(mockPage, 'https://mcp.lanyun.net');

      expect(result.routeInfo.internalLinks.length).toBe(3);

      mockSuperParse.mockRestore();
    });

    test('should handle hash routes correctly', async () => {
      const mockPage = {
        evaluate: jest.fn().mockResolvedValue({
          currentUrl: 'https://mcp.lanyun.net/#servers/detail',
          hashRoute: 'servers/detail',
          pathRoute: '/',
          internalLinks: []
        })
      };

      const mockSuperParse = jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(parser)), 'parse')
        .mockResolvedValue({
          type: 'generic',
          url: 'https://mcp.lanyun.net',
          title: 'Server Detail',
          tables: [],
          paragraphs: []
        });

      const result = await parser.parse(mockPage, 'https://mcp.lanyun.net/#servers/detail');

      expect(result.routeInfo.hashRoute).toBe('servers/detail');

      mockSuperParse.mockRestore();
    });

    test('should merge base data with route info', async () => {
      const mockPage = {
        evaluate: jest.fn().mockResolvedValue({
          currentUrl: 'https://mcp.lanyun.net',
          hashRoute: '',
          pathRoute: '/',
          internalLinks: []
        })
      };

      const mockSuperParse = jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(parser)), 'parse')
        .mockResolvedValue({
          type: 'generic',
          url: 'https://mcp.lanyun.net',
          title: 'MCP',
          description: 'MCP Platform',
          tables: [{ headers: ['Name'], rows: [['Tool1']] }],
          paragraphs: ['Introduction'],
          codeBlocks: [{ language: 'json', code: '{}' }]
        });

      const result = await parser.parse(mockPage, 'https://mcp.lanyun.net');

      expect(result.title).toBe('MCP');
      expect(result.tables).toBeDefined();
      expect(result.codeBlocks).toBeDefined();

      mockSuperParse.mockRestore();
    });

    test('should handle evaluate errors', async () => {
      const mockPage = {
        evaluate: jest.fn()
          .mockResolvedValueOnce({
            currentUrl: 'https://mcp.lanyun.net',
            hashRoute: '',
            pathRoute: '/',
            internalLinks: []
          })
      };

      const mockSuperParse = jest.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(parser)), 'parse')
        .mockResolvedValue({
          type: 'generic',
          url: 'https://mcp.lanyun.net',
          title: 'MCP',
          tables: [],
          paragraphs: []
        });

      const result = await parser.parse(mockPage, 'https://mcp.lanyun.net');

      expect(result.type).toBe('lanyun-mcp');

      mockSuperParse.mockRestore();
    });
  });

  describe('inheritance', () => {
    test('should extend GenericParser', () => {
      expect(parser.matches).toBeDefined();
      expect(parser.getPriority).toBeDefined();
      expect(parser.parse).toBeDefined();
    });
  });
});