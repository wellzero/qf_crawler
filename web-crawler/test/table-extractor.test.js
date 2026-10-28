import TableExtractor from '../src/parsers/extractors/table-extractor.js';

describe('TableExtractor', () => {
  let extractor;

  beforeEach(() => {
    extractor = new TableExtractor();
  });

  describe('constructor', () => {
    test('should initialize with default options', () => {
      expect(extractor.supportPagination).toBe(true);
      expect(extractor.supportVirtual).toBe(true);
    });

    test('should accept custom options', () => {
      const customExtractor = new TableExtractor({ supportPagination: false, supportVirtual: false });
      expect(customExtractor.supportPagination).toBe(false);
      expect(customExtractor.supportVirtual).toBe(false);
    });
  });

  describe('extract', () => {
    test('should extract tables from context', async () => {
      const mockPage = {
        locator: () => ({
          all: async () => []
        })
      };

      extractor.extractTablesWithPaginationAndVirtual = async () => [
        { index: 0, headers: ['Name', 'Value'], rows: [['item1', '100']] }
      ];

      const context = { page: mockPage, options: {} };
      const result = await extractor.extract(context);

      expect(result.tables).toBeDefined();
      expect(result.tables).toHaveLength(1);
    });
  });

  describe('extractSingleTable', () => {
    test('should extract table with headers and rows', async () => {
      const mockTableEl = {
        evaluate: async (fn, idx) => {
          return fn({
            querySelectorAll: (sel) => [],
            querySelector: (sel) => null
          }, idx);
        }
      };

      const mockTable = {
        querySelectorAll: () => [],
        querySelector: () => null
      };

      const result = await extractor.extractSingleTable({ evaluate: async (fn, idx) => fn(mockTable, idx) }, 0);
      expect(result.index).toBe(0);
      expect(result.headers).toEqual([]);
      expect(result.rows).toEqual([]);
    });
  });

  describe('compareHeaders', () => {
    test('should return true for matching headers', () => {
      expect(extractor.compareHeaders(['A', 'B'], ['A', 'B'])).toBe(true);
    });

    test('should return false for different headers', () => {
      expect(extractor.compareHeaders(['A', 'B'], ['A', 'C'])).toBe(false);
      expect(extractor.compareHeaders(['A', 'B'], ['A', 'B', 'C'])).toBe(false);
    });
  });

  describe('findPaginationControls', () => {
    test('should detect pagination controls', async () => {
      const mockPage = {
        evaluate: async () => ({
          hasPagination: true,
          totalPages: 10,
          nextButtonSelector: '.next'
        })
      };

      const result = await extractor.findPaginationControls(mockPage, {});
      expect(result.hasPagination).toBe(true);
    });

    test('should return false when no pagination', async () => {
      const mockPage = {
        evaluate: async () => ({ hasPagination: false })
      };

      const result = await extractor.findPaginationControls(mockPage, {});
      expect(result.hasPagination).toBe(false);
    });

    test('should handle errors gracefully', async () => {
      const mockPage = {
        evaluate: async () => { throw new Error('error'); }
      };

      const result = await extractor.findPaginationControls(mockPage, {});
      expect(result.hasPagination).toBe(false);
    });
  });

  describe('detectVirtualTable', () => {
    test('should detect virtual table indicators', async () => {
      const mockTableEl = {
        evaluate: async () => true
      };

      const result = await extractor.detectVirtualTable({}, mockTableEl);
      expect(typeof result).toBe('boolean');
    });

    test('should handle errors gracefully', async () => {
      const mockTableEl = {
        evaluate: async () => { throw new Error('error'); }
      };

      const result = await extractor.detectVirtualTable({}, mockTableEl);
      expect(result).toBe(false);
    });
  });

  describe('clickNextPage', () => {
    test('should return false when no next button', async () => {
      const mockPage = {
        locator: () => ({
          first: () => ({
            count: async () => 0
          })
        })
      };

      const result = await extractor.clickNextPage(mockPage, {});
      expect(result).toBe(false);
    });
  });

  describe('extractTablesWithPaginationAndVirtual', () => {
    test('should return empty array on errors', async () => {
      const mockPage = {
        locator: () => ({
          all: async () => { throw new Error('error'); }
        })
      };

      const result = await extractor.extractTablesWithPaginationAndVirtual(mockPage);
      expect(result).toEqual([]);
    });
  });
});