import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';

/**
 * SQLite 存储实现 B：JSON 文档存储（整条链接对象作为 JSON）
 *
 * 特点：
 * - 对现有 links.txt(JSONL) 结构最贴近
 * - schema 变更时更灵活
 */
class SqliteLinkStorageJson {
  constructor() {
    this.tableName = 'links_json';
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
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL
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
        SELECT payload
        FROM ${this.tableName}
        ORDER BY created_at ASC, rowid ASC
      `).all();

      return rows.map(row => JSON.parse(row.payload));
    } catch (error) {
      throw new Error(`读取SQLite（JSON模式）失败: ${error.message}`);
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
        INSERT INTO ${this.tableName} (url, payload, created_at)
        VALUES (?, ?, ?)
      `);

      for (let index = 0; index < links.length; index += 1) {
        const link = links[index];
        stmt.run(link.url, JSON.stringify(link), index);
      }

      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw new Error(`保存链接到SQLite（JSON模式）失败: ${error.message}`);
    } finally {
      db.close();
    }
  }
}

export default SqliteLinkStorageJson;
