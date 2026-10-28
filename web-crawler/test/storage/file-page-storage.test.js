import FilePageStorage from '../../src/storage/file-page-storage.js';

describe('FilePageStorage', () => {
  let storage;

  beforeEach(() => {
    storage = new FilePageStorage();
  });

  describe('persistMarkdown', () => {
    test('should return the filepath unchanged', async () => {
      const filepath = '/tmp/test.md';
      const result = await storage.persistMarkdown({ filepath });
      expect(result).toBe(filepath);
    });

    test('should handle empty filepath', async () => {
      const filepath = '';
      const result = await storage.persistMarkdown({ filepath });
      expect(result).toBe('');
    });

    test('should handle filepath with special characters', async () => {
      const filepath = '/tmp/测试-file_123.md';
      const result = await storage.persistMarkdown({ filepath });
      expect(result).toBe(filepath);
    });

    test('should handle filepath with spaces', async () => {
      const filepath = '/tmp/my test file.md';
      const result = await storage.persistMarkdown({ filepath });
      expect(result).toBe(filepath);
    });

    test('should ignore extra parameters', async () => {
      const filepath = '/tmp/test.md';
      const result = await storage.persistMarkdown({
        filepath,
        url: 'https://example.com',
        title: 'Test Title',
        filename: 'test.md'
      });
      expect(result).toBe(filepath);
    });

    test('should return same filepath for multiple calls', async () => {
      const filepath = '/tmp/test.md';
      const result1 = await storage.persistMarkdown({ filepath });
      const result2 = await storage.persistMarkdown({ filepath });
      expect(result1).toBe(filepath);
      expect(result2).toBe(filepath);
    });

    test('should handle relative filepath', async () => {
      const filepath = './output/test.md';
      const result = await storage.persistMarkdown({ filepath });
      expect(result).toBe(filepath);
    });

    test('should handle Windows-style filepath', async () => {
      const filepath = 'C:\\Users\\test\\output.md';
      const result = await storage.persistMarkdown({ filepath });
      expect(result).toBe(filepath);
    });
  });
});