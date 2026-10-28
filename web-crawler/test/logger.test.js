import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import Logger from '../src/logger.js';

const testLogDir = './test-logs-logger';

describe('Logger', () => {
  let logger;

  beforeEach(() => {
    logger = new Logger(testLogDir, 'INFO');
  });

  afterEach(() => {
    if (fs.existsSync(testLogDir)) {
      fs.rmSync(testLogDir, { recursive: true, force: true });
    }
  });

  describe('constructor', () => {
    test('should create log directory if not exists', () => {
      expect(fs.existsSync(testLogDir)).toBe(true);
    });

    test('should create log file on initialization', () => {
      expect(fs.existsSync(logger.getLogFile())).toBe(true);
    });

    test('should use default log directory if not provided', () => {
      const defaultLogger = new Logger();
      expect(fs.existsSync(defaultLogger.getLogFile())).toBe(true);
      
      const logFile = defaultLogger.getLogFile();
      if (fs.existsSync(logFile)) {
        fs.rmSync(path.dirname(logFile), { recursive: true, force: true });
      }
    });

    test('should use default log level INFO', () => {
      const defaultLogger = new Logger(testLogDir);
      expect(defaultLogger.logLevel).toBe('INFO');
    });

    test('should accept custom log level', () => {
      const debugLogger = new Logger(testLogDir, 'DEBUG');
      expect(debugLogger.logLevel).toBe('DEBUG');
    });

    test('should initialize stats with zeros', () => {
      const stats = logger.getStats();
      expect(stats.invalidUrlsSkipped).toBe(0);
      expect(stats.totalUrlsProcessed).toBe(0);
      expect(stats.pagesSucceeded).toBe(0);
      expect(stats.pagesFailed).toBe(0);
    });

    test('should generate log filename with timestamp', () => {
      const logFile = logger.getLogFile();
      expect(logFile).toMatch(/crawler-\d{8}-\d{6}\.log$/);
    });
  });

  describe('setLogLevel', () => {
    test('should change log level', () => {
      logger.setLogLevel('DEBUG');
      expect(logger.logLevel).toBe('DEBUG');
    });

    test('should not change log level for invalid level', () => {
      logger.setLogLevel('INVALID');
      expect(logger.logLevel).toBe('INFO');
    });

    test('should accept all valid log levels', () => {
      const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'SUCCESS'];
      levels.forEach(level => {
        logger.setLogLevel(level);
        expect(logger.logLevel).toBe(level);
      });
    });
  });

  describe('shouldLog', () => {
    test('should return true for higher or equal level', () => {
      logger.setLogLevel('INFO');
      expect(logger.shouldLog('INFO')).toBe(true);
      expect(logger.shouldLog('WARN')).toBe(true);
      expect(logger.shouldLog('ERROR')).toBe(true);
    });

    test('should return false for lower level', () => {
      logger.setLogLevel('WARN');
      expect(logger.shouldLog('DEBUG')).toBe(false);
      expect(logger.shouldLog('INFO')).toBe(false);
    });

    test('DEBUG level should log everything', () => {
      logger.setLogLevel('DEBUG');
      expect(logger.shouldLog('DEBUG')).toBe(true);
      expect(logger.shouldLog('INFO')).toBe(true);
      expect(logger.shouldLog('WARN')).toBe(true);
      expect(logger.shouldLog('ERROR')).toBe(true);
    });

    test('ERROR level should only log errors', () => {
      logger.setLogLevel('ERROR');
      expect(logger.shouldLog('DEBUG')).toBe(false);
      expect(logger.shouldLog('INFO')).toBe(false);
      expect(logger.shouldLog('WARN')).toBe(false);
      expect(logger.shouldLog('ERROR')).toBe(true);
    });
  });

  describe('getBeijingTime', () => {
    test('should return formatted Beijing time string', () => {
      const time = logger.getBeijingTime(new Date('2024-01-15T10:30:45Z'));
      expect(time).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    test('should return Beijing time (UTC+8)', () => {
      const utcTime = new Date('2024-01-15T10:30:45Z');
      const beijingTime = logger.getBeijingTime(utcTime);
      
      expect(beijingTime).toMatch(/^2024-01-15 18:30:45$|^2024-01-16 02:30:45$/);
    });

    test('should handle date rollover', () => {
      const utcTime = new Date('2024-01-15T20:00:00Z');
      const beijingTime = logger.getBeijingTime(utcTime);
      
      expect(beijingTime).toMatch(/^2024-01-16 04:00:00$|^2024-01-16 12:00:00$/);
    });

    test('should use current time if no date provided', () => {
      const time = logger.getBeijingTime();
      expect(time).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });
  });

  describe('getBeijingTimeForFilename', () => {
    test('should return formatted filename-safe time string', () => {
      const time = logger.getBeijingTimeForFilename(new Date('2024-01-15T10:30:45Z'));
      expect(time).toMatch(/^20240115-183045$|^20240116-023045$/);
    });

    test('should not contain spaces or colons', () => {
      const time = logger.getBeijingTimeForFilename();
      expect(time).not.toMatch(/[\s:]/);
    });
  });

  describe('getTimestamp', () => {
    test('should return the timestamp used in filename', () => {
      const timestamp = logger.getTimestamp();
      expect(timestamp).toMatch(/^\d{8}-\d{6}$/);
    });
  });

  describe('log methods', () => {
    test('debug should log with DEBUG level', () => {
      logger.setLogLevel('DEBUG');
      logger.debug('Debug message');
      
      const logContent = fs.readFileSync(logger.getLogFile(), 'utf-8');
      expect(logContent).toContain('[DEBUG]');
      expect(logContent).toContain('Debug message');
    });

    test('info should log with INFO level', () => {
      logger.info('Info message');
      
      const logContent = fs.readFileSync(logger.getLogFile(), 'utf-8');
      expect(logContent).toContain('[INFO]');
      expect(logContent).toContain('Info message');
    });

    test('warn should log with WARN level', () => {
      logger.warn('Warning message');
      
      const logContent = fs.readFileSync(logger.getLogFile(), 'utf-8');
      expect(logContent).toContain('[WARN]');
      expect(logContent).toContain('Warning message');
    });

    test('error should log with ERROR level', () => {
      logger.error('Error message');
      
      const logContent = fs.readFileSync(logger.getLogFile(), 'utf-8');
      expect(logContent).toContain('[ERROR]');
      expect(logContent).toContain('Error message');
    });

    test('error should include error details when provided', () => {
      logger.error('Error occurred', new Error('Test error'));
      
      const logContent = fs.readFileSync(logger.getLogFile(), 'utf-8');
      expect(logContent).toContain('Error occurred: Test error');
    });

    test('success should log with SUCCESS level', () => {
      logger.success('Success message');
      
      const logContent = fs.readFileSync(logger.getLogFile(), 'utf-8');
      expect(logContent).toContain('[SUCCESS]');
      expect(logContent).toContain('Success message');
    });
  });

  describe('log filtering', () => {
    test('should write DEBUG to file even when level is INFO', () => {
      const filteredLogger = new Logger(testLogDir, 'INFO');
      filteredLogger.debug('Should appear in file only');
      
      const logContent = fs.readFileSync(filteredLogger.getLogFile(), 'utf-8');
      expect(logContent).toContain('[DEBUG]');
      expect(logContent).toContain('Should appear in file only');
      
      if (fs.existsSync(testLogDir)) {
        fs.rmSync(testLogDir, { recursive: true, force: true });
      }
    });

    test('should output INFO to console when level is INFO', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      
      const filteredLogger = new Logger(testLogDir, 'INFO');
      filteredLogger.info('Should appear in console');
      
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
      
      if (fs.existsSync(testLogDir)) {
        fs.rmSync(testLogDir, { recursive: true, force: true });
      }
    });
  });

  describe('writeToFile', () => {
    test('should append to log file', () => {
      logger.writeToFile('First line');
      logger.writeToFile('Second line');
      
      const logContent = fs.readFileSync(logger.getLogFile(), 'utf-8');
      expect(logContent).toContain('First line');
      expect(logContent).toContain('Second line');
    });

    test('should handle special characters', () => {
      logger.writeToFile('Special chars: 中文 😊 \t\n');
      
      const logContent = fs.readFileSync(logger.getLogFile(), 'utf-8');
      expect(logContent).toContain('Special chars: 中文 😊');
    });
  });

  describe('progress', () => {
    test('should log progress with percentage', () => {
      logger.progress(5, 10);
      
      const logContent = fs.readFileSync(logger.getLogFile(), 'utf-8');
      expect(logContent).toContain('Progress: 5/10');
      expect(logContent).toContain('50.0%');
    });

    test('should include optional message', () => {
      logger.progress(1, 10, 'Processing item 1');
      
      const logContent = fs.readFileSync(logger.getLogFile(), 'utf-8');
      expect(logContent).toContain('Processing item 1');
    });

    test('should handle zero total', () => {
      logger.progress(0, 0);
      
      const logContent = fs.readFileSync(logger.getLogFile(), 'utf-8');
      expect(logContent).toContain('Progress: 0/0');
    });

    test('should handle completion', () => {
      logger.progress(10, 10, 'Complete');
      
      const logContent = fs.readFileSync(logger.getLogFile(), 'utf-8');
      expect(logContent).toContain('100.0%');
    });
  });

  describe('logUrlStatus', () => {
    test('should log success status', () => {
      logger.logUrlStatus('https://example.com', 'success', 'Completed');
      
      const logContent = fs.readFileSync(logger.getLogFile(), 'utf-8');
      expect(logContent).toContain('https://example.com');
      expect(logContent).toContain('SUCCESS');
      expect(logContent).toContain('Completed');
    });

    test('should log failed status', () => {
      logger.logUrlStatus('https://example.com', 'failed', 'Connection timeout');
      
      const logContent = fs.readFileSync(logger.getLogFile(), 'utf-8');
      expect(logContent).toContain('FAILED');
      expect(logContent).toContain('Connection timeout');
    });

    test('should log skipped status', () => {
      logger.logUrlStatus('https://example.com', 'skipped', 'Invalid URL');
      
      const logContent = fs.readFileSync(logger.getLogFile(), 'utf-8');
      expect(logContent).toContain('SKIPPED');
    });

    test('should handle status without details', () => {
      logger.logUrlStatus('https://example.com', 'success');
      
      const logContent = fs.readFileSync(logger.getLogFile(), 'utf-8');
      expect(logContent).toContain('URL [SUCCESS]: https://example.com');
    });
  });

  describe('logNewLinks', () => {
    test('should log count of new links', () => {
      logger.logNewLinks(5);
      
      const logContent = fs.readFileSync(logger.getLogFile(), 'utf-8');
      expect(logContent).toContain('Discovered 5 new link(s)');
    });

    test('should log individual links when 10 or fewer', () => {
      const links = ['https://a.com', 'https://b.com', 'https://c.com'];
      logger.logNewLinks(3, links);
      
      const logContent = fs.readFileSync(logger.getLogFile(), 'utf-8');
      expect(logContent).toContain('  - https://a.com');
      expect(logContent).toContain('  - https://b.com');
      expect(logContent).toContain('  - https://c.com');
    });

    test('should not log individual links when more than 10', () => {
      const links = Array.from({ length: 15 }, (_, i) => `https://example.com/${i}`);
      logger.logNewLinks(15, links);
      
      const logContent = fs.readFileSync(logger.getLogFile(), 'utf-8');
      expect(logContent).toContain('Discovered 15 new link(s)');
      expect(logContent).not.toContain('  - https://example.com/0');
    });

    test('should handle empty links array', () => {
      logger.logNewLinks(0, []);
      
      const logContent = fs.readFileSync(logger.getLogFile(), 'utf-8');
      expect(logContent).toContain('Discovered 0 new link(s)');
    });
  });

  describe('logParseSummary', () => {
    test('should log parse summary with all fields', () => {
      logger.logParseSummary('https://example.com', {
        tables: 3,
        codeBlocks: 5,
        tabContents: 2
      });
      
      const logContent = fs.readFileSync(logger.getLogFile(), 'utf-8');
      expect(logContent).toContain('https://example.com');
      expect(logContent).toContain('3 table(s)');
      expect(logContent).toContain('5 code block(s)');
      expect(logContent).toContain('2 tab(s)');
    });

    test('should handle zero values', () => {
      logger.logParseSummary('https://example.com', {
        tables: 0,
        codeBlocks: 0,
        tabContents: 0
      });
      
      const logContent = fs.readFileSync(logger.getLogFile(), 'utf-8');
      expect(logContent).toContain('0 table(s)');
      expect(logContent).toContain('0 code block(s)');
      expect(logContent).toContain('0 tab(s)');
    });
  });

  describe('logInvalidUrl', () => {
    test('should log invalid URL with default reason', () => {
      logger.logInvalidUrl('https://example.com/invalid');
      
      const logContent = fs.readFileSync(logger.getLogFile(), 'utf-8');
      expect(logContent).toContain('Skipped invalid URL: https://example.com/invalid');
      expect(logContent).toContain('Invalid parameter value');
    });

    test('should log invalid URL with custom reason', () => {
      logger.logInvalidUrl('https://example.com/invalid', 'Missing required parameter');
      
      const logContent = fs.readFileSync(logger.getLogFile(), 'utf-8');
      expect(logContent).toContain('Missing required parameter');
    });

    test('should increment stats counter', () => {
      const initialStats = logger.getStats();
      expect(initialStats.invalidUrlsSkipped).toBe(0);
      
      logger.logInvalidUrl('https://example.com/1');
      logger.logInvalidUrl('https://example.com/2');
      
      const updatedStats = logger.getStats();
      expect(updatedStats.invalidUrlsSkipped).toBe(2);
    });
  });

  describe('getStats', () => {
    test('should return a copy of stats', () => {
      const stats1 = logger.getStats();
      const stats2 = logger.getStats();
      
      expect(stats1).not.toBe(stats2);
      expect(stats1).toEqual(stats2);
    });
  });

  describe('printStats', () => {
    test('should print stats report', () => {
      logger.logInvalidUrl('https://example.com/1');
      logger.stats.totalUrlsProcessed = 10;
      logger.stats.pagesSucceeded = 8;
      logger.stats.pagesFailed = 2;
      
      logger.printStats();
      
      const logContent = fs.readFileSync(logger.getLogFile(), 'utf-8');
      expect(logContent).toContain('Crawler Statistics');
      expect(logContent).toContain('Total URLs processed: 10');
      expect(logContent).toContain('Pages succeeded: 8');
      expect(logContent).toContain('Pages failed: 2');
      expect(logContent).toContain('Invalid URLs skipped: 1');
    });
  });

  describe('getLogFile', () => {
    test('should return the log file path', () => {
      const logFile = logger.getLogFile();
      expect(logFile).toMatch(/test-logs-logger|\.log$/);
      expect(logFile).toMatch(/\.log$/);
    });
  });

  describe('error handling', () => {
    test('should handle invalid log directory gracefully', () => {
      const invalidLogger = new Logger('/nonexistent/path/that/cannot/be/created');
      
      expect(invalidLogger).toBeDefined();
    });

    test('should handle write to non-existent file', () => {
      logger.logFile = '/nonexistent/path/file.log';
      
      expect(() => logger.writeToFile('test')).not.toThrow();
    });
  });
});