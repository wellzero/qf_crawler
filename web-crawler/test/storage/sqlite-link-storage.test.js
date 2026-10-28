import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tempDir = path.join(__dirname, 'tmp-sqlite-links');

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
  }
];

describe('SQLite link storage implementations', () => {
  let sqliteSupported = true;

  beforeAll(async () => {
    try {
      await import('node:sqlite');
    } catch (error) {
      sqliteSupported = false;
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

  test('row storage should save/load links', async () => {
    if (!sqliteSupported) {
      return;
    }

    const { default: SqliteLinkStorageRow } = await import('../../src/storage/sqlite-link-storage-row.js');
    const storage = new SqliteLinkStorageRow();
    const dbPath = path.join(tempDir, 'row-links.db');

    storage.saveLinks(dbPath, sampleLinks);
    const loaded = storage.loadLinks(dbPath);

    expect(loaded).toEqual(sampleLinks);
  });

  test('json storage should save/load links', async () => {
    if (!sqliteSupported) {
      return;
    }

    const { default: SqliteLinkStorageJson } = await import('../../src/storage/sqlite-link-storage-json.js');
    const storage = new SqliteLinkStorageJson();
    const dbPath = path.join(tempDir, 'json-links.db');

    storage.saveLinks(dbPath, sampleLinks);
    const loaded = storage.loadLinks(dbPath);

    expect(loaded).toEqual(sampleLinks);
  });
});
