import { jest } from '@jest/globals';
import PageStorage from '../src/storage/page-storage.js';

describe('PageStorage', () => {
  const logger = { info: jest.fn(), debug: jest.fn(), error: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('默认应使用 file 存储并直接返回 filepath', async () => {
    const storage = new PageStorage({}, logger);

    await storage.initialize(process.cwd());
    const result = await storage.persistMarkdown({
      filepath: '/tmp/test.md',
      url: 'https://example.com',
      title: 'T',
      filename: 'test.md'
    });

    expect(storage.isLanceDb()).toBe(false);
    expect(result).toBe('/tmp/test.md');
  });

  test('storageType 为 lancedb 时 isLanceDb 应返回 true', () => {
    const storage = new PageStorage({
      output: {
        storage: {
          type: 'lancedb'
        }
      }
    }, logger);

    expect(storage.isLanceDb()).toBe(true);
  });

  test('persistMarkdown 应委托给 backend', async () => {
    const storage = new PageStorage({}, logger);
    storage.backend = {
      persistMarkdown: jest.fn(async () => 'mock://saved')
    };

    const payload = {
      filepath: '/tmp/abc.md',
      url: 'https://example.com/abc',
      title: 'ABC',
      filename: 'abc.md'
    };

    const result = await storage.persistMarkdown(payload);

    expect(storage.backend.persistMarkdown).toHaveBeenCalledWith(payload);
    expect(result).toBe('mock://saved');
  });
});
