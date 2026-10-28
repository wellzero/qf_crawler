import { jest } from '@jest/globals';
import InfowayApiParser from '../src/parsers/infoway-api-parser.js';

describe('InfowayApiParser', () => {
  let parser;

  beforeEach(() => {
    parser = new InfowayApiParser();
  });

  describe('matches', () => {
    test('should match docs.infoway.io URLs', () => {
      expect(parser.matches('https://docs.infoway.io/api')).toBe(true);
      expect(parser.matches('https://docs.infoway.io/')).toBe(true);
      expect(parser.matches('https://docs.infoway.io/introduction')).toBe(true);
    });

    test('should not match other URLs', () => {
      expect(parser.matches('https://example.com')).toBe(false);
      expect(parser.matches('https://infoway.io')).toBe(false);
      expect(parser.matches('https://api.infoway.io')).toBe(false);
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
      expect(parser.generateFilename('https://docs.infoway.io/api/introduction')).toBe('api_introduction');
      expect(parser.generateFilename('https://docs.infoway.io/')).toBe('overview');
      expect(parser.generateFilename('https://docs.infoway.io/market-data')).toBe('market-data');
    });

    test('should handle invalid URLs', () => {
      expect(parser.generateFilename('invalid-url')).toBe('api_doc');
    });
  });

  describe('extractDocPath', () => {
    test('should extract path from URL', () => {
      expect(parser.extractDocPath('https://docs.infoway.io/api/introduction')).toBe('api/introduction');
      expect(parser.extractDocPath('https://docs.infoway.io/')).toBe('');
    });

    test('should handle invalid URLs', () => {
      expect(parser.extractDocPath('invalid-url')).toBe('');
    });
  });

  describe('discoverLinks', () => {
    test('should discover links from sidebar', async () => {
      const mockPage = {
        waitForSelector: jest.fn().mockResolvedValue(),
        evaluate: jest.fn().mockResolvedValue(['/api', '/market', '/docs'])
      };

      const links = await parser.discoverLinks(mockPage);

      expect(links.length).toBeGreaterThan(0);
      expect(links.every(l => l.startsWith('https://docs.infoway.io'))).toBe(true);
    });

    test('should handle discovery errors', async () => {
      const mockPage = {
        waitForSelector: jest.fn().mockRejectedValue(new Error('timeout')),
        evaluate: jest.fn().mockRejectedValue(new Error('evaluate error'))
      };

      const links = await parser.discoverLinks(mockPage);

      expect(links).toEqual([]);
    });

    test('should filter out gitbook internal links', async () => {
      const mockPage = {
        waitForSelector: jest.fn().mockResolvedValue(),
        evaluate: jest.fn().mockResolvedValue(['/api', '~gitbook/image', '~gitbook/config'])
      };

      const links = await parser.discoverLinks(mockPage);

      expect(links).not.toContain('https://docs.infoway.io/~gitbook/image');
    });
  });

  describe('parse', () => {
    test('should parse GitBook page content', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockResolvedValue(),
        waitForSelector: jest.fn().mockResolvedValue(),
        waitForFunction: jest.fn().mockResolvedValue(),
        waitForTimeout: jest.fn().mockResolvedValue(),
        evaluate: jest.fn().mockResolvedValue({
          title: 'API Introduction',
          description: 'Introduction to the API',
          sections: [{ type: 'text', value: 'Content' }],
          codeExamples: [],
          tables: [],
          parameters: [],
          rawContent: 'Raw content'
        })
      };

      const result = await parser.parse(mockPage, 'https://docs.infoway.io/api');

      expect(result.type).toBe('infoway-api');
      expect(result.title).toBe('API Introduction');
      expect(result.url).toBe('https://docs.infoway.io/api');
    });

    test('should handle parse errors', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockRejectedValue(new Error('load error')),
        waitForSelector: jest.fn().mockResolvedValue(),
        waitForFunction: jest.fn().mockResolvedValue(),
        waitForTimeout: jest.fn().mockResolvedValue(),
        evaluate: jest.fn().mockResolvedValue({
          title: '',
          description: '',
          sections: [],
          codeExamples: [],
          tables: [],
          parameters: [],
          rawContent: ''
        })
      };

      const result = await parser.parse(mockPage, 'https://docs.infoway.io/api');

      expect(result.type).toBe('infoway-api');
      expect(result.suggestedFilename).toBe('api');
    });

    test('should extract code examples with language detection', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockResolvedValue(),
        waitForSelector: jest.fn().mockResolvedValue(),
        waitForFunction: jest.fn().mockResolvedValue(),
        waitForTimeout: jest.fn().mockResolvedValue(),
        evaluate: jest.fn().mockResolvedValue({
          title: 'API',
          description: '',
          sections: [],
          codeExamples: [
            { language: 'bash', value: 'curl -X GET https://api.infoway.io' },
            { language: 'json', value: '{"key": "value"}' }
          ],
          tables: [],
          parameters: [],
          rawContent: ''
        })
      };

      const result = await parser.parse(mockPage, 'https://docs.infoway.io/api');

      expect(result.codeExamples.length).toBeGreaterThan(0);
    });
  });

  describe('convertToMarkdown', () => {
    test('should convert data to markdown', () => {
      const data = {
        title: 'API Documentation',
        description: 'API Description',
        sections: [
          { type: 'heading', level: 2, title: 'Section', content: [] },
          { type: 'text', value: 'Paragraph text' },
          { type: 'code', language: 'json', value: '{"key": "value"}' }
        ]
      };

      const markdown = parser.convertToMarkdown(data);

      expect(markdown).toContain('# API Documentation');
      expect(markdown).toContain('API Description');
      expect(markdown).toContain('## Section');
    });

    test('should format tables in markdown', () => {
      const data = {
        title: 'API',
        sections: [
          { type: 'table', data: [['Header1', 'Header2'], ['Row1', 'Row2']] }
        ]
      };

      const markdown = parser.convertToMarkdown(data);

      expect(markdown).toContain('| Header1 | Header2 |');
      expect(markdown).toContain('| --- | --- |');
    });

    test('should format lists in markdown', () => {
      const data = {
        title: 'API',
        sections: [
          { type: 'list', ordered: false, items: ['Item 1', 'Item 2'] }
        ]
      };

      const markdown = parser.convertToMarkdown(data);

      expect(markdown).toContain('- Item 1');
      expect(markdown).toContain('- Item 2');
    });

    test('should handle raw content fallback', () => {
      const data = {
        title: 'API',
        sections: [],
        rawContent: 'This is raw content\n\nWith multiple paragraphs.'
      };

      const markdown = parser.convertToMarkdown(data);

      expect(markdown).toContain('This is raw content');
    });
  });

  describe('_formatTable', () => {
    test('should format table data as markdown', () => {
      const lines = [];
      const tableData = [['Name', 'Type'], ['param1', 'string'], ['param2', 'number']];

      parser._formatTable(lines, tableData);

      expect(lines.length).toBeGreaterThan(0);
      expect(lines[0]).toContain('| Name | Type |');
    });

    test('should handle empty table', () => {
      const lines = [];
      const tableData = [];

      parser._formatTable(lines, tableData);

      expect(lines.length).toBe(0);
    });

    test('should pad rows to match header length', () => {
      const lines = [];
      const tableData = [['Name', 'Type', 'Description'], ['param1', 'string']];

      parser._formatTable(lines, tableData);

      expect(lines[2]).toContain('| param1 | string |  |');
    });
  });

  describe('waitForContent', () => {
    test('should wait for GitBook content', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockResolvedValue(),
        waitForSelector: jest.fn().mockResolvedValue(),
        waitForFunction: jest.fn().mockResolvedValue(),
        waitForTimeout: jest.fn().mockResolvedValue()
      };

      await parser.waitForContent(mockPage);

      expect(mockPage.waitForLoadState).toHaveBeenCalledWith('domcontentloaded', { timeout: 30000 });
    });

    test('should handle timeout gracefully', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockRejectedValue(new Error('timeout')),
        waitForSelector: jest.fn().mockRejectedValue(new Error('timeout')),
        waitForFunction: jest.fn().mockRejectedValue(new Error('timeout')),
        waitForTimeout: jest.fn().mockResolvedValue()
      };

      await parser.waitForContent(mockPage);
    });
  });
});