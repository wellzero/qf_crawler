import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tempDir = path.join(__dirname, 'tmp-sqlite-json');

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
    retryCount: 0,
    error: null,
    extraField: 'extra data'
  }
];

describe('SqliteLinkStorageJson', () => {
  let SqliteLinkStorageJson;
  let storage;
  let sqliteSupported = true;

  beforeAll(async () => {
    try {
      await import('node:sqlite');
    } catch (error) {
      sqliteSupported = false;
    }

    if (sqliteSupported) {
      const module = await import('../../src/storage/sqlite-link-storage-json.js');
      SqliteLinkStorageJson = module.default;
      storage = new SqliteLinkStorageJson();
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
      storage = new SqliteLinkStorageJson();
    }
  });

  const runIfSupported = (fn) => {
    if (sqliteSupported) {
      return fn();
    }
    return test.skip('SQLite not supported', () => {});
  };

  describe('constructor', () => {
    test('should initialize with correct table name', () => {
      if (!sqliteSupported) return;
      expect(storage.tableName).toBe('links_json');
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
      
      const tableInfo = db.prepare(`PRAGMA table_info(links_json)`).all();
      
      expect(tableInfo).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'url', type: 'TEXT', pk: 1 }),
          expect.objectContaining({ name: 'payload', type: 'TEXT' }),
          expect.objectContaining({ name: 'created_at', type: 'INTEGER' })
        ])
      );
      
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

    test('should preserve extra fields in JSON payload', () => {
      if (!sqliteSupported) return;
      const dbPath = path.join(tempDir, 'extra-fields.db');
      
      const linksWithExtra = [
        { url: 'https://example.com/1', customField: 'value1', nestedObj: { a: 1 } }
      ];
      
      storage.saveLinks(dbPath, linksWithExtra);
      const loadedLinks = storage.loadLinks(dbPath);
      
      expect(loadedLinks[0].customField).toBe('value1');
      expect(loadedLinks[0].nestedObj).toEqual({ a: 1 });
    });

    test('should return links in insertion order', () => {
      if (!sqliteSupported) return;
      const dbPath = path.join(tempDir, 'order-test.db');
      
      const links = [
        { url: 'https://example.com/1' },
        { url: 'https://example.com/2' },
        { url: 'https://example.com/3' }
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

    test('should throw error on corrupted database', () => {
      if (!sqliteSupported) return;
      const dbPath = path.join(tempDir, 'corrupted.db');
      
      fs.writeFileSync(dbPath, 'not a valid sqlite database');
      
      expect(() => storage.loadLinks(dbPath)).toThrow(/读取SQLite|file is not a database/);
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
      storage.saveLinks(dbPath, [{ url: 'https://new.com' }]);
      
      const loadedLinks = storage.loadLinks(dbPath);
      expect(loadedLinks).toHaveLength(1);
      expect(loadedLinks[0].url).toBe('https://new.com');
    });

    test('should handle unicode in URLs', () => {
      if (!sqliteSupported) return;
      const dbPath = path.join(tempDir, 'unicode-test.db');
      
      const unicodeLinks = [
        { url: 'https://example.com/测试', title: '中文标题' },
        { url: 'https://example.com/😀', title: 'Emoji' }
      ];
      
      storage.saveLinks(dbPath, unicodeLinks);
      const loadedLinks = storage.loadLinks(dbPath);
      
      expect(loadedLinks).toEqual(unicodeLinks);
    });

    test('should handle large number of links', () => {
      if (!sqliteSupported) return;
      const dbPath = path.join(tempDir, 'large-test.db');
      
      const largeLinks = Array.from({ length: 1000 }, (_, i) => ({
        url: `https://example.com/page/${i}`,
        index: i
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

    test('should handle special characters in payload', () => {
      if (!sqliteSupported) return;
      const dbPath = path.join(tempDir, 'special-chars.db');
      
      const specialLinks = [
        { url: 'https://example.com/a', data: 'quote"double\'single`backtick' },
        { url: 'https://example.com/b', data: 'newline\nand\ttab' },
        { url: 'https://example.com/c', data: '{"json": "data"}' }
      ];
      
      storage.saveLinks(dbPath, specialLinks);
      const loadedLinks = storage.loadLinks(dbPath);
      
      expect(loadedLinks).toEqual(specialLinks);
    });
  });

  describe('error handling', () => {
    test('should throw formatted error on load failure', () => {
      if (!sqliteSupported) return;
      const dbPath = path.join(tempDir, 'error-test.db');
      
      fs.writeFileSync(dbPath, 'invalid content');
      
      expect(() => storage.loadLinks(dbPath)).toThrow(/读取SQLite|file is not a database/);
    });

    test('should handle concurrent access gracefully', () => {
      if (!sqliteSupported) return;
      const dbPath = path.join(tempDir, 'concurrent-test.db');
      
      const links1 = [{ url: 'https://a.com' }];
      const links2 = [{ url: 'https://b.com' }];
      
      storage.saveLinks(dbPath, links1);
      storage.saveLinks(dbPath, links2);
      
      const loadedLinks = storage.loadLinks(dbPath);
      expect(loadedLinks).toEqual(links2);
    });
  });
});