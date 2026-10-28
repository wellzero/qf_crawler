import fc from 'fast-check';
import fs from 'fs';
import Logger from '../src/logger.js';
import StatsTracker from '../src/stats-tracker.js';

describe('Logger and Stats', () => {
  const testLogDir = './test-logs';

  afterEach(() => {
    // Clean up test log directory
    if (fs.existsSync(testLogDir)) {
      fs.rmSync(testLogDir, { recursive: true, force: true });
    }
  });

  describe('Property 19: 错误日志记录完整性', () => {
    /**
     * Feature: stock-website-crawler, Property 19: 错误日志记录完整性
     * **Validates: Requirements 7.6, 8.6**
     * 
     * For any error that occurs during crawling, the error should be logged 
     * with the URL, error message, and timestamp
     */
    test('error logs contain URL, message, and timestamp', () => {
      fc.assert(
        fc.property(
          fc.webUrl(),
          fc.string({ minLength: 1, maxLength: 100 }),
          (url, errorMessage) => {
            const logger = new Logger(testLogDir);
            
            // Log an error
            logger.error(`Failed to process ${url}`, new Error(errorMessage));

            // Read log file
            const logFile = logger.getLogFile();
            expect(fs.existsSync(logFile)).toBe(true);

            const logContent = fs.readFileSync(logFile, 'utf-8');

            // Should contain URL
            expect(logContent).toContain(url);

            // Should contain error message
            expect(logContent).toContain(errorMessage);

            // Should contain timestamp (format: YYYY-MM-DD HH:MM:SS)
            expect(logContent).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);

            // Should contain ERROR level
            expect(logContent).toContain('[ERROR]');
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Property 20: 统计信息准确性', () => {
    /**
     * Feature: stock-website-crawler, Property 20: 统计信息准确性
     * **Validates: Requirements 8.3, 8.5**
     * 
     * For any crawling session, the generated statistics should accurately 
     * reflect the total number of URLs, successfully crawled URLs, failed URLs, 
     * and new links discovered
     */
    test('statistics accurately reflect crawling session', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }),
          fc.integer({ min: 0, max: 50 }),
          fc.integer({ min: 0, max: 50 }),
          (totalUrls, crawledUrls, failedUrls) => {
            // Ensure crawled + failed <= total
            const actualCrawled = Math.min(crawledUrls, totalUrls);
            const actualFailed = Math.min(failedUrls, totalUrls - actualCrawled);

            const tracker = new StatsTracker();
            tracker.start();
            tracker.setTotalUrls(totalUrls);

            // Simulate crawling
            for (let i = 0; i < actualCrawled; i++) {
              tracker.incrementCrawled();
            }

            for (let i = 0; i < actualFailed; i++) {
              tracker.incrementFailed();
            }

            tracker.end();

            const stats = tracker.getStats();

            // Verify accuracy
            expect(stats.totalUrls).toBe(totalUrls);
            expect(stats.crawledUrls).toBe(actualCrawled);
            expect(stats.failedUrls).toBe(actualFailed);
            expect(stats.startTime).toBeLessThanOrEqual(stats.endTime);
            expect(stats.duration).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Logger Unit Tests', () => {
    test('should create log file on initialization', () => {
      const logger = new Logger(testLogDir);
      const logFile = logger.getLogFile();

      expect(fs.existsSync(logFile)).toBe(true);
    });

    test('should log info messages', () => {
      const logger = new Logger(testLogDir);
      logger.info('Test info message');

      const logContent = fs.readFileSync(logger.getLogFile(), 'utf-8');
      expect(logContent).toContain('[INFO]');
      expect(logContent).toContain('Test info message');
    });

    test('should log warning messages', () => {
      const logger = new Logger(testLogDir);
      logger.warn('Test warning message');

      const logContent = fs.readFileSync(logger.getLogFile(), 'utf-8');
      expect(logContent).toContain('[WARN]');
      expect(logContent).toContain('Test warning message');
    });

    test('should log error messages', () => {
      const logger = new Logger(testLogDir);
      logger.error('Test error message', new Error('Error details'));

      const logContent = fs.readFileSync(logger.getLogFile(), 'utf-8');
      expect(logContent).toContain('[ERROR]');
      expect(logContent).toContain('Test error message');
      expect(logContent).toContain('Error details');
    });

    test('should log success messages', () => {
      const logger = new Logger(testLogDir);
      logger.success('Test success message');

      const logContent = fs.readFileSync(logger.getLogFile(), 'utf-8');
      expect(logContent).toContain('[SUCCESS]');
      expect(logContent).toContain('Test success message');
    });

    test('should log progress', () => {
      const logger = new Logger(testLogDir);
      logger.progress(5, 10, 'Processing');

      const logContent = fs.readFileSync(logger.getLogFile(), 'utf-8');
      expect(logContent).toContain('Progress: 5/10');
      expect(logContent).toContain('50.0%');
      expect(logContent).toContain('Processing');
    });

    test('should log URL status', () => {
      const logger = new Logger(testLogDir);
      logger.logUrlStatus('https://example.com', 'success', 'Completed');

      const logContent = fs.readFileSync(logger.getLogFile(), 'utf-8');
      expect(logContent).toContain('https://example.com');
      expect(logContent).toContain('SUCCESS');
      expect(logContent).toContain('Completed');
    });

    test('should log new links', () => {
      const logger = new Logger(testLogDir);
      logger.logNewLinks(5, ['https://example.com/1', 'https://example.com/2']);

      const logContent = fs.readFileSync(logger.getLogFile(), 'utf-8');
      expect(logContent).toContain('Discovered 5 new link(s)');
    });

    test('should log parse summary', () => {
      const logger = new Logger(testLogDir);
      logger.logParseSummary('https://example.com', {
        tables: 2,
        codeBlocks: 3,
        tabContents: 1
      });

      const logContent = fs.readFileSync(logger.getLogFile(), 'utf-8');
      expect(logContent).toContain('https://example.com');
      expect(logContent).toContain('2 table(s)');
      expect(logContent).toContain('3 code block(s)');
      expect(logContent).toContain('1 tab(s)');
    });
  });

  describe('StatsTracker Unit Tests', () => {
    test('should initialize with zero stats', () => {
      const tracker = new StatsTracker();
      const stats = tracker.getStats();

      expect(stats.totalUrls).toBe(0);
      expect(stats.crawledUrls).toBe(0);
      expect(stats.failedUrls).toBe(0);
      expect(stats.newLinksFound).toBe(0);
      expect(stats.filesGenerated).toBe(0);
    });

    test('should track total URLs', () => {
      const tracker = new StatsTracker();
      tracker.setTotalUrls(10);

      expect(tracker.getStats().totalUrls).toBe(10);
    });

    test('should increment crawled count', () => {
      const tracker = new StatsTracker();
      tracker.incrementCrawled();
      tracker.incrementCrawled();

      expect(tracker.getStats().crawledUrls).toBe(2);
    });

    test('should increment failed count', () => {
      const tracker = new StatsTracker();
      tracker.incrementFailed();

      expect(tracker.getStats().failedUrls).toBe(1);
    });

    test('should add new links count', () => {
      const tracker = new StatsTracker();
      tracker.addNewLinks(5);
      tracker.addNewLinks(3);

      expect(tracker.getStats().newLinksFound).toBe(8);
    });

    test('should increment files generated', () => {
      const tracker = new StatsTracker();
      tracker.incrementFilesGenerated();
      tracker.incrementFilesGenerated();

      expect(tracker.getStats().filesGenerated).toBe(2);
    });

    test('should track duration', () => {
      const tracker = new StatsTracker();
      tracker.start();
      
      // Wait a bit
      const startTime = Date.now();
      while (Date.now() - startTime < 100) {
        // Busy wait
      }
      
      tracker.end();

      const stats = tracker.getStats();
      expect(stats.duration).toBeGreaterThanOrEqual(0);
      expect(stats.startTime).toBeLessThanOrEqual(stats.endTime);
    });

    test('should generate report', () => {
      const tracker = new StatsTracker();
      tracker.start();
      tracker.setTotalUrls(10);
      tracker.incrementCrawled();
      tracker.incrementCrawled();
      tracker.incrementFailed();
      tracker.addNewLinks(5);
      tracker.incrementFilesGenerated();
      tracker.end();

      const report = tracker.generateReport();

      expect(report).toContain('Total URLs: 10');
      expect(report).toContain('Successfully Crawled: 2');
      expect(report).toContain('Failed: 1');
      expect(report).toContain('New Links Discovered: 5');
      expect(report).toContain('Files Generated: 1');
      expect(report).toContain('Success Rate:');
    });

    test('should reset stats', () => {
      const tracker = new StatsTracker();
      tracker.setTotalUrls(10);
      tracker.incrementCrawled();
      tracker.reset();

      const stats = tracker.getStats();
      expect(stats.totalUrls).toBe(0);
      expect(stats.crawledUrls).toBe(0);
    });
  });
});
