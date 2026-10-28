import AlltickApiParser from '../src/parsers/alltick-api-parser.js';

describe('AlltickApiParser', () => {
  let parser;

  beforeEach(() => {
    parser = new AlltickApiParser();
  });

  describe('matches', () => {
    test('should match apis.alltick.co URLs', () => {
      expect(parser.matches('https://apis.alltick.co/')).toBe(true);
      expect(parser.matches('https://apis.alltick.co/get-token')).toBe(true);
      expect(parser.matches('http://apis.alltick.co')).toBe(true);
    });

    test('should not match other URLs', () => {
      expect(parser.matches('https://example.com')).toBe(false);
      expect(parser.matches('https://alltick.com')).toBe(false);
      expect(parser.matches('https://api.alltick.com')).toBe(false);
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
      expect(parser.generateFilename('https://apis.alltick.co/get-token')).toBe('get-token');
      expect(parser.generateFilename('https://apis.alltick.co/get-token/')).toBe('get-token');
      expect(parser.generateFilename('https://apis.alltick.co/')).toBe('overview');
    });

    test('should handle invalid URLs', () => {
      expect(parser.generateFilename('invalid-url')).toBe('api_doc');
    });
  });

  describe('extractDocPath', () => {
    test('should extract path from URL', () => {
      expect(parser.extractDocPath('https://apis.alltick.co/get-token')).toBe('get-token');
      expect(parser.extractDocPath('https://apis.alltick.co/')).toBe('');
    });

    test('should return empty string for invalid URLs', () => {
      expect(parser.extractDocPath('invalid-url')).toBe('');
    });
  });

  describe('parse', () => {
    test('should parse GitBook page content', async () => {
      const mockPage = {
        waitForSelector: async () => {},
        waitForLoadState: async () => {},
        waitForTimeout: async () => {},
        evaluate: async () => ({
          title: 'API Documentation',
          description: 'This is the API documentation.',
          sections: [
            { type: 'heading', level: 2, title: 'Overview', content: [] },
            { type: 'text', value: 'Some text content' }
          ],
          codeExamples: [{ language: 'json', value: '{"key": "value"}' }],
          tables: [],
          parameters: [],
          rawContent: 'raw content'
        })
      };

      const result = await parser.parse(mockPage, 'https://apis.alltick.co/get-token');

      expect(result.type).toBe('alltick-api');
      expect(result.url).toBe('https://apis.alltick.co/get-token');
      expect(result.title).toBe('API Documentation');
      expect(result.sections).toHaveLength(2);
      expect(result.codeExamples).toHaveLength(1);
    });

    test('should handle parse errors gracefully', async () => {
      const mockPage = {
        waitForSelector: async () => { throw new Error('timeout'); },
        waitForLoadState: async () => {},
        waitForTimeout: async () => {},
        evaluate: async () => { throw new Error('evaluate error'); }
      };

      const result = await parser.parse(mockPage, 'https://apis.alltick.co/get-token');

      expect(result.type).toBe('alltick-api');
      expect(result.url).toBe('https://apis.alltick.co/get-token');
      expect(result.title).toBe('');
      expect(result.error).toBeUndefined();
    });
  });

  describe('convertToMarkdown', () => {
    test('should convert data to markdown', () => {
      const data = {
        title: 'Test Title',
        description: 'Test description',
        sections: [
          { type: 'heading', level: 2, title: 'Section 1', content: [{ type: 'text', value: 'Content' }] },
          { type: 'text', value: 'Plain text' }
        ],
        codeExamples: []
      };

      const markdown = parser.convertToMarkdown(data);

      expect(markdown).toContain('# Test Title');
      expect(markdown).toContain('Test description');
      expect(markdown).toContain('## Section 1');
      expect(markdown).toContain('Content');
    });
  });

  describe('_formatTable', () => {
    test('should format table as markdown', () => {
      const lines = [];
      const tableData = [
        ['Name', 'Type'],
        ['param1', 'string'],
        ['param2', 'number']
      ];

      parser._formatTable(lines, tableData);

      expect(lines).toContain('| Name | Type |');
      expect(lines).toContain('| --- | --- |');
      expect(lines).toContain('| param1 | string |');
      expect(lines).toContain('| param2 | number |');
    });

    test('should handle empty table', () => {
      const lines = [];
      parser._formatTable(lines, []);
      expect(lines).toHaveLength(0);
    });

    test('should pad rows to match header length', () => {
      const lines = [];
      const tableData = [
        ['Name', 'Type', 'Description'],
        ['param1', 'string']
      ];

      parser._formatTable(lines, tableData);

      expect(lines[2]).toContain('| param1 | string |');
    });
  });
});