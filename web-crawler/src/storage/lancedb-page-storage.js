import fs from 'fs';
import path from 'path';

class LanceDbPageStorage {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.table = null;
    this.tableName = config.output?.storage?.lancedb?.table || 'pages';
    this.uri = config.output?.storage?.lancedb?.uri || 'lancedb';
  }

  async initialize(projectDir) {
    const dbDir = path.resolve(projectDir, this.uri);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    let lancedb;
    try {
      lancedb = await import('@lancedb/lancedb');
    } catch (error) {
      throw new Error(`LanceDB backend unavailable, please install @lancedb/lancedb: ${error.message}`);
    }

    const db = await lancedb.connect(dbDir);
    try {
      this.table = await db.openTable(this.tableName);
    } catch {
      this.table = await db.createTable(this.tableName, []);
    }

    this.logger.info(`LanceDB storage enabled: ${dbDir}/${this.tableName}`);
  }

  async persistMarkdown({ filepath, url, title, filename }) {
    const content = fs.readFileSync(filepath, 'utf-8');

    await this.table.add([
      {
        url,
        title: title || 'Untitled',
        filename,
        content,
        contentLength: content.length,
        crawledAt: new Date().toISOString()
      }
    ]);

    fs.unlinkSync(filepath);
    return `lancedb://${this.tableName}/${filename}`;
  }
}

export default LanceDbPageStorage;
