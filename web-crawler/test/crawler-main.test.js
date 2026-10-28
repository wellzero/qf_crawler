import { jest } from '@jest/globals';
import CrawlerMain from '../src/crawler-main.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('CrawlerMain Integration Tests', () => {
  let crawler;
  let testConfigPath;
  let testLinksPath;
  let testOutputDir;

  beforeEach(() => {
    crawler = new CrawlerMain();
    testConfigPath = path.join(__dirname, 'test-config.json');
    testLinksPath = './test-links.txt';
    testOutputDir = path.join(__dirname, 'test-output');

    // Clean up test files
    if (fs.existsSync(testLinksPath)) {
      fs.unlinkSync(testLinksPath);
    }
    if (fs.existsSync(testOutputDir)) {
      fs.rmSync(testOutputDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up
    if (fs.existsSync(testConfigPath)) {
      fs.unlinkSync(testConfigPath);
    }
    if (fs.existsSync(testLinksPath)) {
      fs.unlinkSync(testLinksPath);
    }
    if (fs.existsSync(testOutputDir)) {
      fs.rmSync(testOutputDir, { recursive: true });
    }
    // Clean up project directories created by crawler
    if (fs.existsSync(testOutputDir)) {
      fs.rmSync(testOutputDir, { recursive: true });
    }
  });

  describe('initialize', () => {
    test('should initialize with valid config', async () => {
      const config = {
        name: 'test-crawler',
        seedUrls: ['https://example.com'],
        urlRules: {
          include: ['.*'],
          exclude: []
        },
        login: {
          required: false
        },
        crawler: {
          headless: true,
          timeout: 30000,
          waitBetweenRequests: 100,
          maxRetries: 2
        },
        output: {
          directory: testOutputDir,
          format: 'markdown'
        }
      };

      fs.writeFileSync(testConfigPath, JSON.stringify(config, null, 2));

      await crawler.initialize(testConfigPath);

      expect(crawler.config).toBeDefined();
      expect(crawler.config.name).toBe('test-crawler');
      expect(crawler.linkManager).toBeDefined();
      expect(crawler.browserManager).toBeDefined();
    });

    test('should initialize seed URLs with pending status', async () => {
      const config = {
        name: 'test-crawler',
        seedUrls: ['https://example.com'],
        urlRules: {
          include: ['.*'],
          exclude: []
        },
        login: {
          required: false
        },
        crawler: {
          headless: true,
          timeout: 30000,
          waitBetweenRequests: 100,
          maxRetries: 2
        },
        output: {
          directory: testOutputDir,
          format: 'markdown'
        }
      };

      fs.writeFileSync(testConfigPath, JSON.stringify(config, null, 2));

      await crawler.initialize(testConfigPath);

      const seedLink = crawler.linkManager.links.find(l => l.url === 'https://example.com');
      expect(seedLink).toBeDefined();
      // Initial seed URLs are set to 'pending' status
      expect(seedLink.status).toBe('pending');
    });

    test('should create links.txt with seed URLs if not exists', async () => {
      // Make sure links.txt doesn't exist
      if (fs.existsSync('./links.txt')) {
        fs.unlinkSync('./links.txt');
      }

      const config = {
        name: 'test-crawler',
        seedUrls: ['https://example.com', 'https://test.com'],
        urlRules: {
          include: ['.*'],
          exclude: []
        },
        login: {
          required: false
        },
        crawler: {
          headless: true,
          timeout: 30000,
          waitBetweenRequests: 100,
          maxRetries: 2
        },
        output: {
          directory: testOutputDir,
          format: 'markdown'
        }
      };

      fs.writeFileSync(testConfigPath, JSON.stringify(config, null, 2));

      await crawler.initialize(testConfigPath);

      // Check that links were added to the link manager
      expect(crawler.linkManager.links.length).toBeGreaterThan(0);
      const urls = crawler.linkManager.links.map(l => l.url);
      expect(urls).toContain('https://example.com');
      expect(urls).toContain('https://test.com');

      // Clean up
      if (fs.existsSync('./links.txt')) {
        fs.unlinkSync('./links.txt');
      }
    });
  });

  describe('processUrl', () => {
    test('should update link status on failure', async () => {
      const config = {
        name: 'test-crawler',
        seedUrls: ['https://example.com'],
        urlRules: {
          include: ['.*'],
          exclude: []
        },
        login: {
          required: false
        },
        crawler: {
          headless: true,
          timeout: 1000,
          waitBetweenRequests: 100,
          maxRetries: 0
        },
        output: {
          directory: testOutputDir,
          format: 'markdown'
        }
      };

      fs.writeFileSync(testConfigPath, JSON.stringify(config, null, 2));
      await crawler.initialize(testConfigPath);

      // Add a link to test
      crawler.linkManager.addLink('https://example.com', 'pending');

      // Mock browser manager to throw error
      crawler.browserManager.newPage = async () => {
        throw new Error('Test error');
      };

      // First failure - should set to unfetched with retryCount=1
      const result = await crawler.processUrl('https://example.com');

      expect(result).toBe(false);
      let link = crawler.linkManager.links.find(l => l.url === 'https://example.com');
      expect(link.status).toBe('unfetched');
      expect(link.retryCount).toBe(1);

      // Second failure - should set to unfetched with retryCount=2
      await crawler.processUrl('https://example.com');
      link = crawler.linkManager.links.find(l => l.url === 'https://example.com');
      expect(link.status).toBe('unfetched');
      expect(link.retryCount).toBe(2);

      // Third failure - should set to failed with retryCount=3
      await crawler.processUrl('https://example.com');
      link = crawler.linkManager.links.find(l => l.url === 'https://example.com');
      expect(link.status).toBe('failed');
      expect(link.retryCount).toBe(3);
    }, 10000); // 10 second timeout
  });

  describe('generateStats', () => {
    test('should generate accurate statistics', async () => {
      const config = {
        name: 'test-crawler',
        seedUrls: ['https://example.com'],
        urlRules: {
          include: ['.*'],
          exclude: []
        },
        login: {
          required: false
        },
        crawler: {
          headless: true,
          timeout: 30000,
          waitBetweenRequests: 100,
          maxRetries: 2
        },
        output: {
          directory: testOutputDir,
          format: 'markdown'
        }
      };

      fs.writeFileSync(testConfigPath, JSON.stringify(config, null, 2));
      await crawler.initialize(testConfigPath);

      crawler.statsTracker.stats.totalUrls = 10;
      crawler.statsTracker.stats.crawledUrls = 7;
      crawler.statsTracker.stats.failedUrls = 3;
      crawler.statsTracker.stats.newLinksFound = 15;
      crawler.statsTracker.stats.filesGenerated = 7;
      crawler.statsTracker.stats.startTime = Date.now() - 5000;
      crawler.statsTracker.stats.endTime = Date.now();
      crawler.statsTracker.stats.duration = 5;

      const stats = crawler.generateStats();

      expect(stats.totalUrls).toBe(10);
      expect(stats.crawledUrls).toBe(7);
      expect(stats.failedUrls).toBe(3);
      expect(stats.newLinksFound).toBe(15);
      expect(stats.filesGenerated).toBe(7);
      expect(stats.duration).toBe(5);
    });
  });

  describe('logProgress', () => {
    test('should log progress correctly', async () => {
      const config = {
        name: 'test-crawler',
        seedUrls: ['https://example.com'],
        urlRules: {
          include: ['.*'],
          exclude: []
        },
        login: {
          required: false
        },
        crawler: {
          headless: true,
          timeout: 30000,
          waitBetweenRequests: 100,
          maxRetries: 2
        },
        output: {
          directory: testOutputDir,
          format: 'markdown'
        }
      };

      fs.writeFileSync(testConfigPath, JSON.stringify(config, null, 2));
      await crawler.initialize(testConfigPath);

      // Should not throw
      expect(() => crawler.logProgress(5, 10)).not.toThrow();
      expect(() => crawler.logProgress(10, 10)).not.toThrow();
    });
  });

  describe('logError', () => {
    test('should log errors correctly', async () => {
      const config = {
        name: 'test-crawler',
        seedUrls: ['https://example.com'],
        urlRules: {
          include: ['.*'],
          exclude: []
        },
        login: {
          required: false
        },
        crawler: {
          headless: true,
          timeout: 30000,
          waitBetweenRequests: 100,
          maxRetries: 2
        },
        output: {
          directory: testOutputDir,
          format: 'markdown'
        }
      };

      fs.writeFileSync(testConfigPath, JSON.stringify(config, null, 2));
      await crawler.initialize(testConfigPath);

      const error = new Error('Test error');

      // Should not throw
      expect(() => crawler.logError('https://example.com', error)).not.toThrow();
    });
  });

  describe('login behavior', () => {
    test('should not attempt login when not required', async () => {
      const config = {
        name: 'test-crawler',
        seedUrls: ['https://example.com'],
        urlRules: {
          include: ['.*'],
          exclude: []
        },
        login: {
          required: false
        },
        crawler: {
          headless: true,
          timeout: 30000,
          waitBetweenRequests: 100,
          maxRetries: 2
        },
        output: {
          directory: testOutputDir,
          format: 'markdown'
        }
      };

      fs.writeFileSync(testConfigPath, JSON.stringify(config, null, 2));
      await crawler.initialize(testConfigPath);

      // When login is not required, isLoggedIn should remain false
      expect(crawler.isLoggedIn).toBe(false);
      expect(crawler.config.login.required).toBe(false);
    });
  });
});