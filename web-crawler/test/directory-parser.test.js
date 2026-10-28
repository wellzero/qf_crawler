import DirectoryParser from '../src/parsers/directory-parser.js';

describe('DirectoryParser', () => {
  let parser;

  beforeEach(() => {
    parser = new DirectoryParser();
  });

  describe('matches', () => {
    test('should match URLs with directory keywords', () => {
      expect(parser.matches('https://example.com/directory')).toBe(true);
      expect(parser.matches('https://example.com/directory/apis')).toBe(true);
      expect(parser.matches('https://example.com/index')).toBe(true);
      expect(parser.matches('https://example.com/guide')).toBe(true);
      expect(parser.matches('https://example.com/catalog')).toBe(true);
    });

    test('should match with classification option', () => {
      expect(parser.matches('https://example.com/any', { classification: { type: 'directory_page' } })).toBe(true);
    });

    test('should not match other URLs', () => {
      expect(parser.matches('https://example.com/api')).toBe(false);
      expect(parser.matches('https://example.com/article')).toBe(false);
    });
  });

  describe('getPriority', () => {
    test('should return 80', () => {
      expect(parser.getPriority()).toBe(80);
    });
  });

  describe('countNodes', () => {
    test('should count total nodes including children', () => {
      const tree = [
        { name: 'Node 1', children: [{ name: 'Child 1', children: [] }, { name: 'Child 2', children: [{ name: 'Grandchild', children: [] }] }] },
        { name: 'Node 2', children: [] }
      ];

      expect(parser.countNodes(tree)).toBe(5);
    });

    test('should handle empty tree', () => {
      expect(parser.countNodes([])).toBe(0);
    });
  });

  describe('parse', () => {
    test('should parse directory structure', async () => {
      const mockPage = {
        evaluate: async () => [
          { name: 'API Reference', url: '/api/reference', children: [{ name: 'Users', url: '/api/users', children: [] }] },
          { name: 'Guides', url: '/guides', children: [] }
        ]
      };

      parser.extractTitle = async () => 'Documentation';

      const result = await parser.parse(mockPage, 'https://example.com/directory');

      expect(result.type).toBe('directory-page');
      expect(result.url).toBe('https://example.com/directory');
      expect(result.title).toBe('Documentation');
      expect(result.tree).toHaveLength(2);
      expect(result.directoryMeta.nodeCount).toBe(3);
    });

    test('should handle empty directory', async () => {
      const mockPage = {
        evaluate: async () => []
      };

      parser.extractTitle = async () => 'Empty Directory';

      const result = await parser.parse(mockPage, 'https://example.com/directory');

      expect(result.type).toBe('directory-page');
      expect(result.tree).toEqual([]);
      expect(result.directoryMeta.nodeCount).toBe(0);
    });
  });
});