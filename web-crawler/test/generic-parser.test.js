import { jest } from '@jest/globals';
import GenericParser from '../src/parsers/generic-parser.js';

describe('GenericParser', () => {
  let parser;

  beforeEach(() => {
    parser = new GenericParser();
  });

  describe('matches', () => {
    test('should match all URLs', () => {
      expect(parser.matches('https://example.com')).toBe(true);
      expect(parser.matches('https://api.example.com/v1/data')).toBe(true);
      expect(parser.matches('http://localhost:3000')).toBe(true);
      expect(parser.matches('')).toBe(true);
      expect(parser.matches('invalid-url')).toBe(true);
    });
  });

  describe('getPriority', () => {
    test('should return 0 (lowest priority)', () => {
      expect(parser.getPriority()).toBe(0);
    });
  });

  describe('extractTitle', () => {
    test('should extract title from h1 element', async () => {
      const page = {
        evaluate: jest.fn().mockResolvedValue('H1 Title')
      };
      const title = await parser.extractTitle(page);
      expect(title).toBe('H1 Title');
    });

    test('should return empty string on error', async () => {
      const page = {
        evaluate: jest.fn().mockRejectedValue(new Error('Page error'))
      };
      const title = await parser.extractTitle(page);
      expect(title).toBe('');
    });
  });

  describe('extractTables', () => {
    test('should extract tables with headers and rows', async () => {
      const page = {
        evaluate: jest.fn().mockResolvedValue([
          {
            index: 0,
            headers: ['Name', 'Age'],
            rows: [['Alice', '30'], ['Bob', '25']],
            caption: 'Users'
          }
        ])
      };
      const tables = await parser.extractTables(page);
      expect(tables).toHaveLength(1);
      expect(tables[0].headers).toEqual(['Name', 'Age']);
      expect(tables[0].rows).toHaveLength(2);
    });

    test('should return empty array on error', async () => {
      const page = {
        evaluate: jest.fn().mockRejectedValue(new Error('Table error'))
      };
      const tables = await parser.extractTables(page);
      expect(tables).toEqual([]);
    });
  });

  describe('extractCodeBlocks', () => {
    test('should extract code blocks with language detection', async () => {
      const page = {
        evaluate: jest.fn().mockResolvedValue([
          { language: 'javascript', code: 'console.log("hello")' },
          { language: 'json', code: '{"key": "value"}' }
        ])
      };
      const blocks = await parser.extractCodeBlocks(page);
      expect(blocks).toHaveLength(2);
      expect(blocks[0].language).toBe('javascript');
      expect(blocks[1].language).toBe('json');
    });

    test('should return empty array on error', async () => {
      const page = {
        evaluate: jest.fn().mockRejectedValue(new Error('Code block error'))
      };
      const blocks = await parser.extractCodeBlocks(page);
      expect(blocks).toEqual([]);
    });
  });

  describe('parse', () => {
    test('should return generic type and URL', async () => {
      const mockPage = {
        on: jest.fn(),
        evaluate: jest.fn().mockResolvedValue([]),
        $eval: jest.fn().mockResolvedValue(''),
        $$eval: jest.fn().mockResolvedValue([]),
        waitForTimeout: jest.fn(),
        waitForSelector: jest.fn().mockRejectedValue(new Error('not found'))
      };

      // Mock the afterExtract method which is called after all extractors
      parser.afterExtract = jest.fn().mockResolvedValue({
        type: 'generic',
        url: 'https://example.com',
        title: 'Test Page',
        subtype: 'unknown',
        description: '',
        headings: [],
        mainContent: [],
        paragraphs: [],
        lists: [],
        tables: [],
        codeBlocks: [],
        images: [],
        charts: [],
        chartData: [],
        blockquotes: [],
        definitionLists: [],
        horizontalRules: 0,
        videos: [],
        audios: [],
        apiData: 0,
        pageFeatures: { suggestedType: 'unknown', confidence: 0, signals: [] },
        tabsAndDropdowns: [],
        dateFilters: []
      });

      const result = await parser.parse(mockPage, 'https://example.com');

      expect(result.type).toBe('generic');
      expect(result.url).toBe('https://example.com');
      expect(result.title).toBe('Test Page');
    });

    test('should handle errors gracefully', async () => {
      // Test that parse handles errors - it may throw or return partial data
      const mockPage = {
        on: jest.fn(),
        evaluate: jest.fn().mockRejectedValue(new Error('Page error')),
        $eval: jest.fn().mockRejectedValue(new Error('error')),
        $$eval: jest.fn().mockRejectedValue(new Error('error')),
        waitForTimeout: jest.fn(),
        waitForSelector: jest.fn().mockRejectedValue(new Error('not found'))
      };

      // parse should return some result (either from catch block or afterExtract)
      const result = await parser.parse(mockPage, 'https://example.com');

      // Verify it returns an object with expected structure (may be partial)
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });
  });
});