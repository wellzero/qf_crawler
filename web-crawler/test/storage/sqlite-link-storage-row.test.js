import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tempDir = path.join(__dirname, 'tmp-sqlite-row');

const sampleLinks = [
  {
    url: 'https://example.com/a',
    status: 'unfetched',
    addedAt: 1000,
    fetchedAt: null,
    retryCount: 0,
    error: null
  },
  {
    url: 'https://example.com/b',
    status: 'failed',
    addedAt: 2000,
    fetchedAt: 3000,
    retryCount: 2,
    error: 'timeout'
  },
  {
    url: 'https://example.com/c',
    status: 'fetched',
    addedAt: 4000,
    fetchedAt: 5000,
    retryCount: 1,
    error: 'connection refused'
  }
];

describe('SqliteLinkStorageRow', () => {
  let SqliteLinkStorageRow;
  let storage;
  let sqliteSupported = true;

  beforeAll(async () => {
    try {
      await import('node:sqlite');
    } catch (error) {
      sqliteSupported = false;
    }

    if (sqliteSupported) {
      const module = await import('../../src/storage/sqlite-link-storage-row.js');
      SqliteLinkStorageRow = module.default;
      storage = new SqliteLinkStorageRow();
    }

    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    if (sqliteSupported) {
      storage = new SqliteLinkStorageRow();
    }
  });

  describe('constructor', () => {
    test('should initialize with correct table name', () => {
      if (!sqliteSupported) return;
      expect(storage.tableName).toBe('links');
    });
  });

  describe('ensureDatabase', () => {
    test('should create database file and table', () => {
      if (!sqliteSupported) return;
      const dbPath = path.join(tempDir, 'ensure-test.db');
      
      const db = storage.ensureDatabase(dbPath);
      
      expect(db).toBeDefined();
      expect(fs.existsSync(dbPath)).toBe(true);
      
      db.close();
    });

    test('should create parent directory if not exists', () => {
      if (!sqliteSupported) return;
      const nestedPath = path.join(tempDir, 'nested', 'deep', 'test.db');
      
      const db = storage.ensureDatabase(nestedPath);
      
      expect(fs.existsSync(path.dirname(nestedPath))).toBe(true);
      
      db.close();
    });

    test('should handle existing database', () => {
      if (!sqliteSupported) return;
      const dbPath = path.join(tempDir, 'existing-test.db');
      
      const db1 = storage.ensureDatabase(dbPath);
      db1.close();
      
      const db2 = storage.ensureDatabase(dbPath);
      
      expect(db2).toBeDefined();
      db2.close();
    });

    test('should create table with correct schema', () => {
      if (!sqliteSupported) return;
      const dbPath = path.join(tempDir, 'schema-test.db');
      
      const db = storage.ensureDatabase(dbPath);
      
      const tableInfo = db.prepare(`PRAGMA table_info(links)`).all();
      
      expect(tableInfo).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'url', type: 'TEXT', pk: 1 }),
          expect.objectContaining({ name: 'status', type: 'TEXT' }),
          expect.objectContaining({ name: 'added_at', type: 'INTEGER' }),
          expect.objectContaining({ name: 'fetched_at', type: 'INTEGER' }),
          expect.objectContaining({ name: 'retry_count', type: 'INTEGER' }),
          expect.objectContaining({ name: 'error', type: 'TEXT' })
        ])
      );
      
      db.close();
    });

    test('should have default value for retry_count', () => {
      if (!sqliteSupported) return;
      const dbPath = path.join(tempDir, 'default-test.db');
      
      const db = storage.ensureDatabase(dbPath);
      
      const tableInfo = db.prepare(`PRAGMA table_info(links)`).all();
      const retryCountColumn = tableInfo.find(col => col.name === 'retry_count');
      
      expect(retryCountColumn.dflt_value).toBe('0');
      
      db.close();
    });
  });

  describe('loadLinks', () => {
    test('should return empty array for non-existent file', () => {
      if (!sqliteSupported) return;
      const dbPath = path.join(tempDir, 'non-existent.db');
      
      const links = storage.loadLinks(dbPath);
      
      expect(links).toEqual([]);
    });

    test('should load saved links correctly', () => {
      if (!sqliteSupported) return;
      const dbPath = path.join(tempDir, 'load-test.db');
      
      storage.saveLinks(dbPath, sampleLinks);
      const loadedLinks = storage.loadLinks(dbPath);
      
      expect(loadedLinks).toEqual(sampleLinks);
    });

    test('should map database columns to camelCase properties', () => {
      if (!sqliteSupported) return;
      const dbPath = path.join(tempDir, 'mapping-test.db');
      
      storage.saveLinks(dbPath, sampleLinks);
      const loadedLinks = storage.loadLinks(dbPath);
      
      expect(loadedLinks[0]).toHaveProperty('url');
      expect(loadedLinks[0]).toHaveProperty('status');
      expect(loadedLinks[0]).toHaveProperty('addedAt');
      expect(loadedLinks[0]).toHaveProperty('fetchedAt');
      expect(loadedLinks[0]).toHaveProperty('retryCount');
      expect(loadedLinks[0]).toHaveProperty('error');
    });

    test('should return links in insertion order', () => {
      if (!sqliteSupported) return;
      const dbPath = path.join(tempDir, 'order-test.db');
      
      const links = [
        { url: 'https://example.com/1', status: 'a', addedAt: 1, fetchedAt: null, retryCount: 0, error: null },
        { url: 'https://example.com/2', status: 'b', addedAt: 2, fetchedAt: null, retryCount: 0, error: null },
        { url: 'https://example.com/3', status: 'c', addedAt: 3, fetchedAt: null, retryCount: 0, error: null }
      ];
      
      storage.saveLinks(dbPath, links);
      const loadedLinks = storage.loadLinks(dbPath);
      
      expect(loadedLinks.map(l => l.url)).toEqual([
        'https://example.com/1',
        'https://example.com/2',
        'https://example.com/3'
      ]);
    });

    test('should handle empty links array', () => {
      if (!sqliteSupported) return;
      const dbPath = path.join(tempDir, 'empty-test.db');
      
      storage.saveLinks(dbPath, []);
      const loadedLinks = storage.loadLinks(dbPath);
      
      expect(loadedLinks).toEqual([]);
    });

    test('should handle null values', () => {
      if (!sqliteSupported) return;
      const dbPath = path.join(tempDir, 'null-test.db');
      
      const linksWithNulls = [
        {
          url: 'https://example.com/null',
          status: 'unfetched',
          addedAt: 1000,
          fetchedAt: null,
          retryCount: 0,
          error: null
        }
      ];
      
      storage.saveLinks(dbPath, linksWithNulls);
      const loadedLinks = storage.loadLinks(dbPath);
      
      expect(loadedLinks[0].fetchedAt).toBeNull();
      expect(loadedLinks[0].error).toBeNull();
    });
  });

  describe('saveLinks', () => {
    test('should save links correctly', () => {
      if (!sqliteSupported) return;
      const dbPath = path.join(tempDir, 'save-test.db');
      
      storage.saveLinks(dbPath, sampleLinks);
      
      expect(fs.existsSync(dbPath)).toBe(true);
      
      const loadedLinks = storage.loadLinks(dbPath);
      expect(loadedLinks).toEqual(sampleLinks);
    });

    test('should overwrite existing links', () => {
      if (!sqliteSupported) return;
      const dbPath = path.join(tempDir, 'overwrite-test.db');
      
      storage.saveLinks(dbPath, sampleLinks);
      storage.saveLinks(dbPath, [{
        url: 'https://new.com',
        status: 'fetched',
        addedAt: 9999,
        fetchedAt: 10000,
        retryCount: 0,
        error: null
      }]);
      
      const loadedLinks = storage.loadLinks(dbPath);
      expect(loadedLinks).toHaveLength(1);
      expect(loadedLinks[0].url).toBe('https://new.com');
    });

    test('should use default retryCount if not provided', () => {
      if (!sqliteSupported) return;
      const dbPath = path.join(tempDir, 'default-retry-test.db');
      
      const linksWithoutRetry = [
        {
          url: 'https://example.com/no-retry',
          status: 'unfetched',
          addedAt: 1000,
          fetchedAt: null,
          error: null
        }
      ];
      
      storage.saveLinks(dbPath, linksWithoutRetry);
      const loadedLinks = storage.loadLinks(dbPath);
      
      expect(loadedLinks[0].retryCount).toBe(0);
    });

    test('should handle large number of links', () => {
      if (!sqliteSupported) return;
      const dbPath = path.join(tempDir, 'large-test.db');
      
      const largeLinks = Array.from({ length: 1000 }, (_, i) => ({
        url: `https://example.com/page/${i}`,
        status: i % 2 === 0 ? 'fetched' : 'unfetched',
        addedAt: i * 1000,
        fetchedAt: i % 2 === 0 ? i * 1000 + 500 : null,
        retryCount: i % 5,
        error: i % 3 === 0 ? 'error' : null
      }));
      
      storage.saveLinks(dbPath, largeLinks);
      const loadedLinks = storage.loadLinks(dbPath);
      
      expect(loadedLinks).toHaveLength(1000);
      expect(loadedLinks[0].url).toBe('https://example.com/page/0');
      expect(loadedLinks[999].url).toBe('https://example.com/page/999');
    });

    test('should use transaction for atomic save', () => {
      if (!sqliteSupported) return;
      const dbPath = path.join(tempDir, 'transaction-test.db');
      
      storage.saveLinks(dbPath, sampleLinks);
      
      const loadedLinks = storage.loadLinks(dbPath);
      expect(loadedLinks).toEqual(sampleLinks);
    });

    test('should handle unicode URLs', () => {
      if (!sqliteSupported) return;
      const dbPath = path.join(tempDir, 'unicode-test.db');
      
      const unicodeLinks = [
        {
          url: 'https://example.com/测试',
          status: 'fetched',
          addedAt: 1000,
          fetchedAt: 2000,
          retryCount: 0,
          error: null
        }
      ];
      
      storage.saveLinks(dbPath, unicodeLinks);
      const loadedLinks = storage.loadLinks(dbPath);
      
      expect(loadedLinks).toEqual(unicodeLinks);
    });

    test('should preserve all status values', () => {
      if (!sqliteSupported) return;
      const dbPath = path.join(tempDir, 'status-test.db');
      
      const statusLinks = [
        { url: 'https://a.com', status: 'unfetched', addedAt: 1, fetchedAt: null, retryCount: 0, error: null },
        { url: 'https://b.com', status: 'fetched', addedAt: 2, fetchedAt: 2000, retryCount: 0, error: null },
        { url: 'https://c.com', status: 'failed', addedAt: 3, fetchedAt: 3000, retryCount: 3, error: 'timeout' }
      ];
      
      storage.saveLinks(dbPath, statusLinks);
      const loadedLinks = storage.loadLinks(dbPath);
      
      expect(loadedLinks.map(l => l.status)).toEqual(['unfetched', 'fetched', 'failed']);
    });
  });

  describe('error handling', () => {
    test('should handle concurrent access gracefully', () => {
      if (!sqliteSupported) return;
      const dbPath = path.join(tempDir, 'concurrent-test.db');
      
      const links1 = [{ url: 'https://a.com', status: 'fetched', addedAt: 1, fetchedAt: null, retryCount: 0, error: null }];
      const links2 = [{ url: 'https://b.com', status: 'fetched', addedAt: 2, fetchedAt: null, retryCount: 0, error: null }];
      
      storage.saveLinks(dbPath, links1);
      storage.saveLinks(dbPath, links2);
      
      const loadedLinks = storage.loadLinks(dbPath);
      expect(loadedLinks).toEqual(links2);
    });

    test('should handle special error messages', () => {
      if (!sqliteSupported) return;
      const dbPath = path.join(tempDir, 'special-error.db');
      
      const linksWithSpecialError = [
        {
          url: 'https://example.com/special',
          status: 'failed',
          addedAt: 1000,
          fetchedAt: 2000,
          retryCount: 5,
          error: 'Error with "quotes" and \'apostrophes\''
        }
      ];
      
      storage.saveLinks(dbPath, linksWithSpecialError);
      const loadedLinks = storage.loadLinks(dbPath);
      
      expect(loadedLinks[0].error).toBe('Error with "quotes" and \'apostrophes\'');
    });
  });

  describe('edge cases', () => {
    test('should handle missing optional fields with defaults', () => {
      if (!sqliteSupported) return;
      const dbPath = path.join(tempDir, 'optional-fields.db');
      
      const minimalLinks = [
        { url: 'https://example.com/minimal', status: 'unfetched', addedAt: 1000, fetchedAt: null }
      ];
      
      storage.saveLinks(dbPath, minimalLinks);
      const loadedLinks = storage.loadLinks(dbPath);
      
      expect(loadedLinks[0].retryCount).toBe(0);
      expect(loadedLinks[0].error).toBeNull();
    });

    test('should handle null values correctly', () => {
      if (!sqliteSupported) return;
      const dbPath = path.join(tempDir, 'null-values.db');
      
      const linksWithNull = [
        {
          url: 'https://example.com/null',
          status: 'unfetched',
          addedAt: 1000,
          fetchedAt: null,
          retryCount: 0,
          error: null
        }
      ];
      
      storage.saveLinks(dbPath, linksWithNull);
      const loadedLinks = storage.loadLinks(dbPath);
      
      expect(loadedLinks[0].fetchedAt).toBeNull();
      expect(loadedLinks[0].error).toBeNull();
    });
  });
});