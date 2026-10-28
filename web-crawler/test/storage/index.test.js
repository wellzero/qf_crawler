import * as Storage from '../../src/storage/index.js';

describe('Storage Index Exports', () => {
  test('should export SqliteLinkStorageRow', () => {
    expect(Storage.SqliteLinkStorageRow).toBeDefined();
    expect(typeof Storage.SqliteLinkStorageRow).toBe('function');
  });

  test('should export SqliteLinkStorageJson', () => {
    expect(Storage.SqliteLinkStorageJson).toBeDefined();
    expect(typeof Storage.SqliteLinkStorageJson).toBe('function');
  });

  test('SqliteLinkStorageRow should be a constructor', () => {
    const storage = new Storage.SqliteLinkStorageRow();
    expect(storage).toBeInstanceOf(Storage.SqliteLinkStorageRow);
    expect(storage.tableName).toBe('links');
  });

  test('SqliteLinkStorageJson should be a constructor', () => {
    const storage = new Storage.SqliteLinkStorageJson();
    expect(storage).toBeInstanceOf(Storage.SqliteLinkStorageJson);
    expect(storage.tableName).toBe('links_json');
  });

  test('exports should be consistent', () => {
    const keys = Object.keys(Storage);
    expect(keys.length).toBe(2);
    expect(keys).toContain('SqliteLinkStorageRow');
    expect(keys).toContain('SqliteLinkStorageJson');
  });
});