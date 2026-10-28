import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';

/**
 * SQLite 存储实现 A：结构化字段存储（每个字段独立列）
 *
 * 特点：
 * - 查询状态/重试次数等字段更直接
 * - schema 清晰，便于后续扩展索引
 */
class SqliteLinkStorageRow {
  constructor() {
    this.tableName = 'links';
  }

  ensureDatabase(filePath) {
    const dirPath = path.dirname(filePath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    const db = new DatabaseSync(filePath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        url TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        added_at INTEGER NOT NULL,
        fetched_at INTEGER,
        retry_count INTEGER NOT NULL DEFAULT 0,
        error TEXT
      );
    `);

    return db;
  }

  loadLinks(filePath) {
    if (!fs.existsSync(filePath)) {
      return [];
    }

    const db = this.ensureDatabase(filePath);
    try {
      const rows = db.prepare(`
        SELECT url, status, added_at, fetched_at, retry_count, error
        FROM ${this.tableName}
        ORDER BY rowid ASC
      `).all();

      return rows.map(row => ({
        url: row.url,
        status: row.status,
        addedAt: row.added_at,
        fetchedAt: row.fetched_at,
        retryCount: row.retry_count,
        error: row.error
      }));
    } finally {
      db.close();
    }
  }

  saveLinks(filePath, links = []) {
    const db = this.ensureDatabase(filePath);

    try {
      db.exec('BEGIN');
      db.exec(`DELETE FROM ${this.tableName}`);

      const stmt = db.prepare(`
        INSERT INTO ${this.tableName} (
          url, status, added_at, fetched_at, retry_count, error
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const link of links) {
        stmt.run(
          link.url,
          link.status,
          link.addedAt,
          link.fetchedAt,
          link.retryCount ?? 0,
          link.error ?? null
        );
      }

      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw new Error(`保存链接到SQLite（结构化模式）失败: ${error.message}`);
    } finally {
      db.close();
    }
  }
}

export default SqliteLinkStorageRow;
