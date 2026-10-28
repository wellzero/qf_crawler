import FilePageStorage from './file-page-storage.js';
import LanceDbPageStorage from './lancedb-page-storage.js';

class PageStorage {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.storageType = config.output?.storage?.type || 'file';
    this.backend = null;
  }

  async initialize(projectDir) {
    if (this.storageType === 'lancedb') {
      this.backend = new LanceDbPageStorage(this.config, this.logger);
      await this.backend.initialize(projectDir);
      return;
    }

    this.backend = new FilePageStorage();
  }

  async persistMarkdown({ filepath, url, title, filename }) {
    return this.backend.persistMarkdown({ filepath, url, title, filename });
  }

  isLanceDb() {
    return this.storageType === 'lancedb';
  }
}

export default PageStorage;
