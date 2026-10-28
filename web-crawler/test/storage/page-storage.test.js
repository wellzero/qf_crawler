import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const mockLancedbPageStorage = {
  initialize: jest.fn(),
  persistMarkdown: jest.fn()
};

jest.unstable_mockModule('../../src/storage/lancedb-page-storage.js', () => ({
  default: jest.fn(() => mockLancedbPageStorage)
}));

const mockFilePageStorage = {
  persistMarkdown: jest.fn()
};

jest.unstable_mockModule('../../src/storage/file-page-storage.js', () => ({
  default: jest.fn(() => mockFilePageStorage)
}));

describe('PageStorage', () => {
  let PageStorage;
  let mockLogger;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    };

    mockFilePageStorage.persistMarkdown.mockResolvedValue('/tmp/test.md');
    mockLancedbPageStorage.persistMarkdown.mockResolvedValue('lancedb://pages/test.md');
    mockLancedbPageStorage.initialize.mockResolvedValue(undefined);

    const module = await import('../../src/storage/page-storage.js');
    PageStorage = module.default;
  });

  describe('constructor', () => {
    test('should initialize with default file storage type', () => {
      const storage = new PageStorage({}, mockLogger);
      
      expect(storage.config).toEqual({});
      expect(storage.logger).toBe(mockLogger);
      expect(storage.storageType).toBe('file');
      expect(storage.backend).toBeNull();
    });

    test('should use lancedb storage type from config', () => {
      const config = {
        output: {
          storage: {
            type: 'lancedb'
          }
        }
      };
      
      const storage = new PageStorage(config, mockLogger);
      
      expect(storage.storageType).toBe('lancedb');
    });

    test('should handle undefined config', () => {
      expect(() => new PageStorage(undefined, mockLogger)).toThrow();
    });

    test('should handle null config', () => {
      expect(() => new PageStorage(null, mockLogger)).toThrow();
    });
  });

  describe('initialize', () => {
    test('should create FilePageStorage backend for file type', async () => {
      const storage = new PageStorage({}, mockLogger);
      
      await storage.initialize(process.cwd());
      
      expect(storage.backend).toBeDefined();
      expect(mockLancedbPageStorage.initialize).not.toHaveBeenCalled();
    });

    test('should create and initialize LanceDbPageStorage for lancedb type', async () => {
      const config = {
        output: {
          storage: {
            type: 'lancedb'
          }
        }
      };
      
      const storage = new PageStorage(config, mockLogger);
      
      await storage.initialize(process.cwd());
      
      expect(mockLancedbPageStorage.initialize).toHaveBeenCalledWith(process.cwd());
    });
  });

  describe('persistMarkdown', () => {
    test('should delegate to backend for file storage', async () => {
      const storage = new PageStorage({}, mockLogger);
      await storage.initialize(process.cwd());
      
      const payload = {
        filepath: '/tmp/test.md',
        url: 'https://example.com',
        title: 'Test',
        filename: 'test.md'
      };
      
      const result = await storage.persistMarkdown(payload);
      
      expect(mockFilePageStorage.persistMarkdown).toHaveBeenCalledWith(payload);
      expect(result).toBe('/tmp/test.md');
    });

    test('should delegate to backend for lancedb storage', async () => {
      const config = {
        output: {
          storage: {
            type: 'lancedb'
          }
        }
      };
      
      const storage = new PageStorage(config, mockLogger);
      await storage.initialize(process.cwd());
      
      const payload = {
        filepath: '/tmp/test.md',
        url: 'https://example.com',
        title: 'Test',
        filename: 'test.md'
      };
      
      const result = await storage.persistMarkdown(payload);
      
      expect(mockLancedbPageStorage.persistMarkdown).toHaveBeenCalledWith(payload);
      expect(result).toBe('lancedb://pages/test.md');
    });

    test('should pass all parameters to backend', async () => {
      const storage = new PageStorage({}, mockLogger);
      await storage.initialize(process.cwd());
      
      const payload = {
        filepath: '/tmp/custom.md',
        url: 'https://custom.com/page',
        title: 'Custom Title',
        filename: 'custom.md'
      };
      
      await storage.persistMarkdown(payload);
      
      expect(mockFilePageStorage.persistMarkdown).toHaveBeenCalledWith(payload);
    });
  });

  describe('isLanceDb', () => {
    test('should return false for file storage', () => {
      const storage = new PageStorage({}, mockLogger);
      
      expect(storage.isLanceDb()).toBe(false);
    });

    test('should return true for lancedb storage', () => {
      const config = {
        output: {
          storage: {
            type: 'lancedb'
          }
        }
      };
      
      const storage = new PageStorage(config, mockLogger);
      
      expect(storage.isLanceDb()).toBe(true);
    });

    test('should return false for unknown storage type', () => {
      const config = {
        output: {
          storage: {
            type: 'unknown'
          }
        }
      };
      
      const storage = new PageStorage(config, mockLogger);
      
      expect(storage.isLanceDb()).toBe(false);
    });
  });

  describe('integration tests', () => {
    test('should handle complete workflow with file storage', async () => {
      mockFilePageStorage.persistMarkdown.mockResolvedValueOnce('/tmp/workflow.md');
      
      const storage = new PageStorage({}, mockLogger);
      
      await storage.initialize(process.cwd());
      
      expect(storage.backend).toBeDefined();
      expect(storage.isLanceDb()).toBe(false);
      
      const result = await storage.persistMarkdown({
        filepath: '/tmp/workflow.md',
        url: 'https://example.com/workflow',
        title: 'Workflow Test',
        filename: 'workflow.md'
      });
      
      expect(mockFilePageStorage.persistMarkdown).toHaveBeenCalledWith({
        filepath: '/tmp/workflow.md',
        url: 'https://example.com/workflow',
        title: 'Workflow Test',
        filename: 'workflow.md'
      });
    });
  });
});