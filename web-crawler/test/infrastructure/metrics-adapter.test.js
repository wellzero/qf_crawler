import MetricsAdapter from '../../src/infrastructure/metrics-adapter.js';
import { jest } from '@jest/globals';

describe('MetricsAdapter', () => {
  let mockLogger;
  let metricsAdapter;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
    metricsAdapter = new MetricsAdapter(mockLogger);
  });

  describe('constructor', () => {
    test('should initialize with provided logger', () => {
      expect(metricsAdapter.logger).toBe(mockLogger);
    });

    test('should initialize empty counters map', () => {
      expect(metricsAdapter.counters).toBeInstanceOf(Map);
      expect(metricsAdapter.counters.size).toBe(0);
    });
  });

  describe('increment', () => {
    test('should increment counter by default value of 1', () => {
      const result = metricsAdapter.increment('test_counter');
      expect(result).toBe(1);
      expect(metricsAdapter.counters.get('test_counter')).toBe(1);
    });

    test('should increment counter multiple times', () => {
      metricsAdapter.increment('test_counter');
      metricsAdapter.increment('test_counter');
      metricsAdapter.increment('test_counter');
      expect(metricsAdapter.counters.get('test_counter')).toBe(3);
    });

    test('should increment counter by custom value', () => {
      const result = metricsAdapter.increment('test_counter', 5);
      expect(result).toBe(5);
      expect(metricsAdapter.counters.get('test_counter')).toBe(5);
    });

    test('should increment existing counter by custom value', () => {
      metricsAdapter.increment('test_counter', 3);
      const result = metricsAdapter.increment('test_counter', 7);
      expect(result).toBe(10);
      expect(metricsAdapter.counters.get('test_counter')).toBe(10);
    });

    test('should return the new counter value', () => {
      metricsAdapter.increment('counter1', 10);
      expect(metricsAdapter.increment('counter1', 5)).toBe(15);
    });

    test('should handle different counter names independently', () => {
      metricsAdapter.increment('counter1', 5);
      metricsAdapter.increment('counter2', 10);
      metricsAdapter.increment('counter1', 3);
      
      expect(metricsAdapter.counters.get('counter1')).toBe(8);
      expect(metricsAdapter.counters.get('counter2')).toBe(10);
    });

    test('should handle negative increment values', () => {
      metricsAdapter.increment('test_counter', 10);
      metricsAdapter.increment('test_counter', -3);
      expect(metricsAdapter.counters.get('test_counter')).toBe(7);
    });

    test('should handle zero increment value', () => {
      metricsAdapter.increment('test_counter', 5);
      metricsAdapter.increment('test_counter', 0);
      expect(metricsAdapter.counters.get('test_counter')).toBe(5);
    });

    test('should handle increment with value 0 on non-existent counter', () => {
      const result = metricsAdapter.increment('new_counter', 0);
      expect(result).toBe(0);
      expect(metricsAdapter.counters.get('new_counter')).toBe(0);
    });

    test('should handle increment with large values', () => {
      const result = metricsAdapter.increment('test_counter', 1000000);
      expect(result).toBe(1000000);
    });

    test('should handle increment with decimal values', () => {
      metricsAdapter.increment('test_counter', 1.5);
      metricsAdapter.increment('test_counter', 2.5);
      expect(metricsAdapter.counters.get('test_counter')).toBe(4);
    });
  });

  describe('timing', () => {
    test('should log timing metric with debug level', () => {
      metricsAdapter.timing('request_duration', 1500);
      expect(mockLogger.debug).toHaveBeenCalled();
    });

    test('should include metric name and duration in log', () => {
      metricsAdapter.timing('request_duration', 1500);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('request_duration')
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('1500ms')
      );
    });

    test('should include labels in log when provided', () => {
      metricsAdapter.timing('request_duration', 1500, { url: 'https://example.com', method: 'GET' });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('url')
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('https://example.com')
      );
    });

    test('should handle empty labels', () => {
      metricsAdapter.timing('request_duration', 1500, {});
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('{}')
      );
    });

    test('should handle zero duration', () => {
      metricsAdapter.timing('instant_operation', 0);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('0ms')
      );
    });

    test('should handle very large duration', () => {
      metricsAdapter.timing('long_operation', 999999999);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('999999999ms')
      );
    });
  });

  describe('snapshot', () => {
    test('should return empty object when no counters', () => {
      const snapshot = metricsAdapter.snapshot();
      expect(snapshot).toEqual({});
    });

    test('should return all counters as object', () => {
      metricsAdapter.increment('counter1', 5);
      metricsAdapter.increment('counter2', 10);
      metricsAdapter.increment('counter3', 15);
      
      const snapshot = metricsAdapter.snapshot();
      expect(snapshot).toEqual({
        counter1: 5,
        counter2: 10,
        counter3: 15
      });
    });

    test('should return current state of counters', () => {
      metricsAdapter.increment('counter1', 5);
      const snapshot1 = metricsAdapter.snapshot();
      expect(snapshot1.counter1).toBe(5);
      
      metricsAdapter.increment('counter1', 10);
      const snapshot2 = metricsAdapter.snapshot();
      expect(snapshot2.counter1).toBe(15);
    });

    test('should reflect changes after increments', () => {
      metricsAdapter.increment('crawl_success_total', 1);
      metricsAdapter.increment('crawl_failed_total', 1);
      metricsAdapter.increment('crawl_success_total', 1);
      
      const snapshot = metricsAdapter.snapshot();
      expect(snapshot.crawl_success_total).toBe(2);
      expect(snapshot.crawl_failed_total).toBe(1);
    });
  });

  describe('integration scenarios', () => {
    test('should track typical crawl metrics', () => {
      metricsAdapter.increment('crawl_success_total');
      metricsAdapter.increment('crawl_success_total');
      metricsAdapter.increment('crawl_failed_total');
      metricsAdapter.increment('links_discovered_total', 50);
      
      metricsAdapter.timing('page_load_duration', 1500, { url: 'https://example.com' });
      metricsAdapter.timing('parse_duration', 300, { parser: 'article' });
      
      const snapshot = metricsAdapter.snapshot();
      expect(snapshot.crawl_success_total).toBe(2);
      expect(snapshot.crawl_failed_total).toBe(1);
      expect(snapshot.links_discovered_total).toBe(50);
      expect(mockLogger.debug).toHaveBeenCalledTimes(2);
    });

    test('should handle multiple increments and timing calls', () => {
      for (let i = 0; i < 10; i++) {
        metricsAdapter.increment('pages_processed');
        metricsAdapter.timing('page_time', Math.random() * 1000, { page: i });
      }
      
      expect(metricsAdapter.counters.get('pages_processed')).toBe(10);
      expect(mockLogger.debug).toHaveBeenCalledTimes(10);
    });
  });
});