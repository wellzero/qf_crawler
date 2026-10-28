import { jest } from '@jest/globals';
import TableOnlyParser from '../src/parsers/table-only-parser.js';

jest.mock('../src/parsers/generic-parser.js', () => {
  return jest.fn().mockImplementation(() => ({
    parse: jest.fn().mockResolvedValue({ type: 'generic', title: 'Generic Result' }),
    extractTablesWithPaginationAndVirtual: jest.fn().mockResolvedValue([])
  }));
});

describe('TableOnlyParser', () => {
  let parser;

  beforeEach(() => {
    parser = new TableOnlyParser();
    jest.clearAllMocks();
  });

  describe('matches', () => {
    test('should return true by default', () => {
      expect(parser.matches('https://example.com')).toBe(true);
      expect(parser.matches('https://example.com/page')).toBe(true);
    });

    test('should return true when classification type is table_content_page', () => {
      expect(parser.matches('https://example.com', { classification: { type: 'table_content_page' } })).toBe(true);
    });

    test('should return true even without classification', () => {
      expect(parser.matches('https://example.com', {})).toBe(true);
    });
  });

  describe('getPriority', () => {
    test('should return 5 (low priority)', () => {
      expect(parser.getPriority()).toBe(5);
    });
  });

  describe('isTableOnlyPage', () => {
    test('should return false when page evaluation throws', async () => {
      const page = {
        evaluate: jest.fn().mockRejectedValue(new Error('dom error'))
      };

      await expect(parser.isTableOnlyPage(page)).resolves.toBe(false);
    });

    test('should return false when no tables exist', async () => {
      const page = {
        evaluate: jest.fn().mockResolvedValue({ qualifies: false })
      };

      await expect(parser.isTableOnlyPage(page)).resolves.toBe(false);
    });

    test('should return true for qualifying table pages', async () => {
      const page = {
        evaluate: jest.fn().mockResolvedValue({ qualifies: true })
      };

      await expect(parser.isTableOnlyPage(page)).resolves.toBe(true);
    });

    test('should evaluate page metrics correctly', async () => {
      const page = {
        evaluate: jest.fn().mockImplementation((fn) => {
          return Promise.resolve(fn());
        })
      };

      const result = await parser.isTableOnlyPage(page);
      expect(typeof result).toBe('boolean');
    });
  });

  describe('parse', () => {
    test('should fall back to generic parser when page is not table-only', async () => {
      parser.isTableOnlyPage = jest.fn().mockResolvedValue(false);
      parser.genericParser.parse = jest.fn().mockResolvedValue({ type: 'generic' });

      const result = await parser.parse({}, 'https://example.com/page');

      expect(parser.genericParser.parse).toHaveBeenCalled();
      expect(result).toEqual({ type: 'generic' });
    });

    test('should fall back to generic parser when no tables extracted', async () => {
      parser.isTableOnlyPage = jest.fn().mockResolvedValue(true);
      parser.extractTitle = jest.fn().mockResolvedValue('Title');
      parser.genericParser.extractTablesWithPaginationAndVirtual = jest.fn().mockResolvedValue([]);
      parser.genericParser.parse = jest.fn().mockResolvedValue({ type: 'generic' });

      const result = await parser.parse({}, 'https://example.com/page');

      expect(parser.genericParser.parse).toHaveBeenCalled();
      expect(result).toEqual({ type: 'generic' });
    });

    test('should return table-only payload when tables are available', async () => {
      const tables = [{ headers: ['h1'], rows: [['v1']] }];
      parser.isTableOnlyPage = jest.fn().mockResolvedValue(true);
      parser.extractTitle = jest.fn().mockResolvedValue('表格页');
      parser.genericParser.extractTablesWithPaginationAndVirtual = jest.fn().mockResolvedValue(tables);

      const result = await parser.parse({}, 'https://example.com/table');

      expect(result.type).toBe('table-only');
      expect(result.title).toBe('表格页');
      expect(result.tables).toEqual(tables);
      expect(result.apiData).toBe(0);
    });

    test('should return complete table-only structure', async () => {
      const tables = [{ headers: ['col1', 'col2'], rows: [['a', 'b'], ['c', 'd']] }];
      parser.isTableOnlyPage = jest.fn().mockResolvedValue(true);
      parser.extractTitle = jest.fn().mockResolvedValue('Data Table');
      parser.genericParser.extractTablesWithPaginationAndVirtual = jest.fn().mockResolvedValue(tables);

      const result = await parser.parse({}, 'https://example.com/table');

      expect(result.type).toBe('table-only');
      expect(result.url).toBe('https://example.com/table');
      expect(result.title).toBe('Data Table');
      expect(result.description).toBe('');
      expect(result.headings).toEqual([]);
      expect(result.paragraphs).toEqual([]);
      expect(result.lists).toEqual([]);
      expect(result.tables).toEqual(tables);
      expect(result.codeBlocks).toEqual([]);
      expect(result.images).toEqual([]);
      expect(result.charts).toEqual([]);
      expect(result.chartData).toEqual([]);
      expect(result.blockquotes).toEqual([]);
      expect(result.definitionLists).toEqual([]);
      expect(result.horizontalRules).toEqual([]);
      expect(result.videos).toEqual([]);
      expect(result.audios).toEqual([]);
      expect(result.tabsAndDropdowns).toEqual([]);
      expect(result.dateFilters).toEqual([]);
      expect(result.apiData).toBe(0);
    });

    test('should handle page evaluation with large tables', async () => {
      const mockPage = {
        evaluate: jest.fn().mockResolvedValue({
          qualifies: true
        })
      };

      const isTableOnly = await parser.isTableOnlyPage(mockPage);
      expect(isTableOnly).toBe(true);
    });

    test('should handle page evaluation with small tables', async () => {
      const mockPage = {
        evaluate: jest.fn().mockResolvedValue({
          qualifies: false
        })
      };

      const isTableOnly = await parser.isTableOnlyPage(mockPage);
      expect(isTableOnly).toBe(false);
    });

    test('should fallback to generic on errors', async () => {
      parser.isTableOnlyPage = jest.fn().mockResolvedValue(false);
      parser.genericParser.parse = jest.fn().mockResolvedValue({ type: 'generic' });

      const result = await parser.parse({}, 'https://example.com/table');

      expect(result.type).toBe('generic');
    });

    test('should fallback when no tables', async () => {
      parser.isTableOnlyPage = jest.fn().mockResolvedValue(true);
      parser.extractTitle = jest.fn().mockResolvedValue('Title');
      parser.genericParser.extractTablesWithPaginationAndVirtual = jest.fn().mockResolvedValue([]);
      parser.genericParser.parse = jest.fn().mockResolvedValue({ type: 'generic' });

      const result = await parser.parse({}, 'https://example.com/table');

      expect(result.type).toBe('generic');
    });
  });

  describe('constructor', () => {
    test('should initialize with genericParser', () => {
      expect(parser.genericParser).toBeDefined();
    });
  });
});
