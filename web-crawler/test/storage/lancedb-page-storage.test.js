import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const mockLancedb = {
  connect: jest.fn()
};

const mockTable = {
  add: jest.fn()
};

const mockDb = {
  openTable: jest.fn(),
  createTable: jest.fn()
};

jest.unstable_mockModule('@lancedb/lancedb', () => ({
  default: mockLancedb,
  connect: mockLancedb.connect
}));

describe('LanceDbPageStorage', () => {
  let LanceDbPageStorage;
  let storage;
  let mockLogger;
  const tempDir = path.join(process.cwd(), 'test-lancedb-tmp');

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    };
    
    mockLancedb.connect.mockResolvedValue(mockDb);
    mockDb.openTable.mockResolvedValue(mockTable);
    mockDb.createTable.mockResolvedValue(mockTable);
    mockTable.add.mockResolvedValue(undefined);
  });

  beforeAll(() => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('constructor', () => {
    test('should initialize with default config values', async () => {
      const module = await import('../../src/storage/lancedb-page-storage.js');
      LanceDbPageStorage = module.default;
      
      storage = new LanceDbPageStorage({}, mockLogger);
      
      expect(storage.config).toEqual({});
      expect(storage.logger).toBe(mockLogger);
      expect(storage.table).toBeNull();
      expect(storage.tableName).toBe('pages');
      expect(storage.uri).toBe('lancedb');
    });

    test('should use custom config values', async () => {
      const module = await import('../../src/storage/lancedb-page-storage.js');
      LanceDbPageStorage = module.default;
      
      const config = {
        output: {
          storage: {
            lancedb: {
              table: 'custom_table',
              uri: 'custom_db'
            }
          }
        }
      };
      
      storage = new LanceDbPageStorage(config, mockLogger);
      
      expect(storage.tableName).toBe('custom_table');
      expect(storage.uri).toBe('custom_db');
    });

    test('should handle partial config', async () => {
      const module = await import('../../src/storage/lancedb-page-storage.js');
      LanceDbPageStorage = module.default;
      
      const config = {
        output: {
          storage: {
            lancedb: {
              table: 'only_table'
            }
          }
        }
      };
      
      storage = new LanceDbPageStorage(config, mockLogger);
      
      expect(storage.tableName).toBe('only_table');
      expect(storage.uri).toBe('lancedb');
    });
  });

  describe('initialize', () => {
    test('should create directory if not exists', async () => {
      const module = await import('../../src/storage/lancedb-page-storage.js');
      LanceDbPageStorage = module.default;
      
      storage = new LanceDbPageStorage({}, mockLogger);
      
      const newDir = path.join(tempDir, 'new-lancedb-dir');
      if (fs.existsSync(newDir)) {
        fs.rmSync(newDir, { recursive: true, force: true });
      }
      
      await storage.initialize(newDir);
      
      expect(fs.existsSync(path.join(newDir, 'lancedb'))).toBe(true);
      
      fs.rmSync(newDir, { recursive: true, force: true });
    });

    test('should open existing table', async () => {
      const module = await import('../../src/storage/lancedb-page-storage.js');
      LanceDbPageStorage = module.default;
      
      storage = new LanceDbPageStorage({}, mockLogger);
      await storage.initialize(tempDir);
      
      expect(mockDb.openTable).toHaveBeenCalledWith('pages');
      expect(storage.table).toBe(mockTable);
    });

    test('should create new table if open fails', async () => {
      const module = await import('../../src/storage/lancedb-page-storage.js');
      LanceDbPageStorage = module.default;
      
      mockDb.openTable.mockRejectedValueOnce(new Error('Table not found'));
      
      storage = new LanceDbPageStorage({}, mockLogger);
      await storage.initialize(tempDir);
      
      expect(mockDb.createTable).toHaveBeenCalledWith('pages', []);
      expect(storage.table).toBe(mockTable);
    });

    test('should log info message after initialization', async () => {
      const module = await import('../../src/storage/lancedb-page-storage.js');
      LanceDbPageStorage = module.default;
      
      storage = new LanceDbPageStorage({}, mockLogger);
      await storage.initialize(tempDir);
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('LanceDB storage enabled')
      );
    });

    test('should throw error if lancedb module not available', async () => {
      const module = await import('../../src/storage/lancedb-page-storage.js');
      LanceDbPageStorage = module.default;
      
      const connectError = new Error('Cannot find module');
      mockLancedb.connect.mockRejectedValueOnce(connectError);
      
      storage = new LanceDbPageStorage({}, mockLogger);
      
      await expect(storage.initialize(tempDir)).rejects.toThrow(
        /LanceDB backend unavailable|Cannot find module/
      );
    });
  });

  describe('persistMarkdown', () => {
    test('should add document to table and return lancedb uri', async () => {
      const module = await import('../../src/storage/lancedb-page-storage.js');
      LanceDbPageStorage = module.default;
      
      const testFile = path.join(tempDir, 'test-persist.md');
      fs.writeFileSync(testFile, 'Test content');
      
      storage = new LanceDbPageStorage({}, mockLogger);
      await storage.initialize(tempDir);
      
      const result = await storage.persistMarkdown({
        filepath: testFile,
        url: 'https://example.com',
        title: 'Test Title',
        filename: 'test.md'
      });
      
      expect(mockTable.add).toHaveBeenCalledWith([
        expect.objectContaining({
          url: 'https://example.com',
          title: 'Test Title',
          filename: 'test.md',
          content: 'Test content',
          contentLength: 12
        })
      ]);
      
      expect(result).toBe('lancedb://pages/test.md');
      expect(fs.existsSync(testFile)).toBe(false);
    });

    test('should use default title if not provided', async () => {
      const module = await import('../../src/storage/lancedb-page-storage.js');
      LanceDbPageStorage = module.default;
      
      const testFile = path.join(tempDir, 'test-no-title.md');
      fs.writeFileSync(testFile, 'Content');
      
      storage = new LanceDbPageStorage({}, mockLogger);
      await storage.initialize(tempDir);
      
      await storage.persistMarkdown({
        filepath: testFile,
        url: 'https://example.com/no-title',
        title: null,
        filename: 'no-title.md'
      });
      
      expect(mockTable.add).toHaveBeenCalledWith([
        expect.objectContaining({
          title: 'Untitled'
        })
      ]);
      
      fs.rmSync(testFile, { force: true });
    });

    test('should include crawledAt timestamp', async () => {
      const module = await import('../../src/storage/lancedb-page-storage.js');
      LanceDbPageStorage = module.default;
      
      const testFile = path.join(tempDir, 'test-timestamp.md');
      fs.writeFileSync(testFile, 'Timestamp test');
      
      const beforeTime = new Date().toISOString();
      
      storage = new LanceDbPageStorage({}, mockLogger);
      await storage.initialize(tempDir);
      
      await storage.persistMarkdown({
        filepath: testFile,
        url: 'https://example.com/timestamp',
        title: 'Timestamp Test',
        filename: 'timestamp.md'
      });
      
      const afterTime = new Date().toISOString();
      
      const addCall = mockTable.add.mock.calls[0][0][0];
      expect(addCall.crawledAt).toBeDefined();
      expect(addCall.crawledAt >= beforeTime).toBe(true);
      expect(addCall.crawledAt <= afterTime).toBe(true);
    });

    test('should handle utf-8 content', async () => {
      const module = await import('../../src/storage/lancedb-page-storage.js');
      LanceDbPageStorage = module.default;
      
      const testFile = path.join(tempDir, 'test-utf8.md');
      const utf8Content = '# 中文标题\n\n这是一些中文内容。';
      fs.writeFileSync(testFile, utf8Content);
      
      storage = new LanceDbPageStorage({}, mockLogger);
      await storage.initialize(tempDir);
      
      await storage.persistMarkdown({
        filepath: testFile,
        url: 'https://example.com/utf8',
        title: 'UTF-8 测试',
        filename: 'utf8.md'
      });
      
      const addCall = mockTable.add.mock.calls[0][0][0];
      expect(addCall.content).toBe(utf8Content);
      expect(addCall.contentLength).toBe(utf8Content.length);
    });
  });
});