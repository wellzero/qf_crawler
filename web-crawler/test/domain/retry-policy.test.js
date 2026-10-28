import RetryPolicy from '../../src/domain/retry-policy.js';

describe('RetryPolicy', () => {
  describe('constructor', () => {
    test('should initialize with default maxRetries of 3', () => {
      const policy = new RetryPolicy();
      expect(policy.maxRetries).toBe(3);
    });

    test('should initialize with custom maxRetries', () => {
      const policy = new RetryPolicy(5);
      expect(policy.maxRetries).toBe(5);
    });

    test('should initialize with maxRetries of 0', () => {
      const policy = new RetryPolicy(0);
      expect(policy.maxRetries).toBe(0);
    });

    test('should initialize with maxRetries of 1', () => {
      const policy = new RetryPolicy(1);
      expect(policy.maxRetries).toBe(1);
    });
  });

  describe('shouldRetry', () => {
    test('should return true when retryCount is less than maxRetries', () => {
      const policy = new RetryPolicy(3);
      expect(policy.shouldRetry(0)).toBe(true);
      expect(policy.shouldRetry(1)).toBe(true);
      expect(policy.shouldRetry(2)).toBe(true);
    });

    test('should return false when retryCount equals maxRetries', () => {
      const policy = new RetryPolicy(3);
      expect(policy.shouldRetry(3)).toBe(false);
    });

    test('should return false when retryCount exceeds maxRetries', () => {
      const policy = new RetryPolicy(3);
      expect(policy.shouldRetry(4)).toBe(false);
      expect(policy.shouldRetry(10)).toBe(false);
    });

    test('should work correctly with maxRetries of 0', () => {
      const policy = new RetryPolicy(0);
      expect(policy.shouldRetry(0)).toBe(false);
      expect(policy.shouldRetry(1)).toBe(false);
    });

    test('should work correctly with maxRetries of 1', () => {
      const policy = new RetryPolicy(1);
      expect(policy.shouldRetry(0)).toBe(true);
      expect(policy.shouldRetry(1)).toBe(false);
    });

    test('should work correctly with large maxRetries', () => {
      const policy = new RetryPolicy(100);
      expect(policy.shouldRetry(0)).toBe(true);
      expect(policy.shouldRetry(99)).toBe(true);
      expect(policy.shouldRetry(100)).toBe(false);
    });

    test('should handle negative retryCount', () => {
      const policy = new RetryPolicy(3);
      expect(policy.shouldRetry(-1)).toBe(true);
      expect(policy.shouldRetry(-100)).toBe(true);
    });
  });

  describe('edge cases', () => {
    test('should handle very large retryCount values', () => {
      const policy = new RetryPolicy(3);
      expect(policy.shouldRetry(Number.MAX_SAFE_INTEGER)).toBe(false);
    });

    test('should handle NaN retryCount', () => {
      const policy = new RetryPolicy(3);
      expect(policy.shouldRetry(NaN)).toBe(false);
    });

    test('should handle Infinity retryCount', () => {
      const policy = new RetryPolicy(3);
      expect(policy.shouldRetry(Infinity)).toBe(false);
    });
  });
});