import UrlStateMachine from '../../src/domain/url-state-machine.js';

describe('UrlStateMachine', () => {
  describe('validateTransition', () => {
    test('should allow same status transition', () => {
      expect(UrlStateMachine.validateTransition('unfetched', 'unfetched')).toBe(true);
      expect(UrlStateMachine.validateTransition('fetching', 'fetching')).toBe(true);
      expect(UrlStateMachine.validateTransition('fetched', 'fetched')).toBe(true);
      expect(UrlStateMachine.validateTransition('failed', 'failed')).toBe(true);
    });

    test('should allow unfetched -> fetching transition', () => {
      expect(UrlStateMachine.validateTransition('unfetched', 'fetching')).toBe(true);
    });

    test('should allow unfetched -> failed transition', () => {
      expect(UrlStateMachine.validateTransition('unfetched', 'failed')).toBe(true);
    });

    test('should allow fetching -> unfetched transition', () => {
      expect(UrlStateMachine.validateTransition('fetching', 'unfetched')).toBe(true);
    });

    test('should allow fetching -> fetched transition', () => {
      expect(UrlStateMachine.validateTransition('fetching', 'fetched')).toBe(true);
    });

    test('should allow fetching -> failed transition', () => {
      expect(UrlStateMachine.validateTransition('fetching', 'failed')).toBe(true);
    });

    test('should allow failed -> unfetched transition', () => {
      expect(UrlStateMachine.validateTransition('failed', 'unfetched')).toBe(true);
    });

    test('should not allow unfetched -> fetched transition', () => {
      expect(UrlStateMachine.validateTransition('unfetched', 'fetched')).toBe(false);
    });

    test('should not allow fetched -> fetching transition', () => {
      expect(UrlStateMachine.validateTransition('fetched', 'fetching')).toBe(false);
    });

    test('should not allow fetched -> unfetched transition', () => {
      expect(UrlStateMachine.validateTransition('fetched', 'unfetched')).toBe(false);
    });

    test('should not allow fetched -> failed transition', () => {
      expect(UrlStateMachine.validateTransition('fetched', 'failed')).toBe(false);
    });

    test('should not allow failed -> fetching transition', () => {
      expect(UrlStateMachine.validateTransition('failed', 'fetching')).toBe(false);
    });

    test('should not allow failed -> fetched transition', () => {
      expect(UrlStateMachine.validateTransition('failed', 'fetched')).toBe(false);
    });

    test('should return false for unknown status', () => {
      expect(UrlStateMachine.validateTransition('unknown', 'fetching')).toBe(false);
      expect(UrlStateMachine.validateTransition('unfetched', 'unknown')).toBe(false);
    });
  });

  describe('transition', () => {
    test('should transition unfetched -> fetching -> fetched', () => {
      const link = { url: 'https://example.com', status: 'unfetched', retryCount: 0, error: null, fetchedAt: null };

      UrlStateMachine.transition(link, 'fetching');
      expect(link.status).toBe('fetching');
      expect(link.fetchedAt).toBeNull();

      UrlStateMachine.transition(link, 'fetched');
      expect(link.status).toBe('fetched');
      expect(link.fetchedAt).toBeTruthy();
      expect(link.error).toBeNull();
    });

    test('should transition unfetched -> fetching -> failed', () => {
      const link = { url: 'https://example.com', status: 'unfetched', retryCount: 0, error: null, fetchedAt: null };

      UrlStateMachine.transition(link, 'fetching');
      expect(link.status).toBe('fetching');

      UrlStateMachine.transition(link, 'failed', { error: 'Network error' });
      expect(link.status).toBe('failed');
      expect(link.error).toBe('Network error');
    });

    test('should transition fetching -> unfetched (retry)', () => {
      const link = { url: 'https://example.com', status: 'fetching', retryCount: 0, error: 'some error', fetchedAt: null };

      UrlStateMachine.transition(link, 'unfetched');
      expect(link.status).toBe('unfetched');
      expect(link.error).toBeNull();
    });

    test('should transition failed -> unfetched (retry)', () => {
      const link = { url: 'https://example.com', status: 'failed', retryCount: 1, error: 'Previous error', fetchedAt: null };

      UrlStateMachine.transition(link, 'unfetched');
      expect(link.status).toBe('unfetched');
      expect(link.error).toBeNull();
    });

    test('should throw on invalid transition', () => {
      const link = { url: 'https://example.com', status: 'fetched', retryCount: 0, error: null };
      expect(() => UrlStateMachine.transition(link, 'fetching')).toThrow('Invalid URL state transition: fetched -> fetching');
    });

    test('should throw on invalid transition with proper error message', () => {
      const link = { url: 'https://example.com', status: 'unfetched', retryCount: 0, error: null };
      expect(() => UrlStateMachine.transition(link, 'fetched')).toThrow('Invalid URL state transition: unfetched -> fetched');
    });

    test('should set fetchedAt timestamp when transitioning to fetched', () => {
      const link = { url: 'https://example.com', status: 'fetching', retryCount: 0, error: null, fetchedAt: null };
      const before = Date.now();
      
      UrlStateMachine.transition(link, 'fetched');
      
      expect(link.fetchedAt).toBeGreaterThanOrEqual(before);
      expect(link.fetchedAt).toBeLessThanOrEqual(Date.now());
    });

    test('should clear error when transitioning to fetched', () => {
      const link = { url: 'https://example.com', status: 'fetching', retryCount: 0, error: 'Previous error', fetchedAt: null };
      
      UrlStateMachine.transition(link, 'fetched');
      
      expect(link.error).toBeNull();
    });

    test('should set error from context when transitioning to failed', () => {
      const link = { url: 'https://example.com', status: 'fetching', retryCount: 0, error: null, fetchedAt: null };
      
      UrlStateMachine.transition(link, 'failed', { error: 'Connection timeout' });
      
      expect(link.error).toBe('Connection timeout');
    });

    test('should preserve existing error if context error not provided', () => {
      const link = { url: 'https://example.com', status: 'fetching', retryCount: 0, error: 'Existing error', fetchedAt: null };
      
      UrlStateMachine.transition(link, 'failed', {});
      
      expect(link.error).toBe('Existing error');
    });

    test('should clear error when transitioning to unfetched', () => {
      const link = { url: 'https://example.com', status: 'fetching', retryCount: 0, error: 'Error to clear', fetchedAt: null };
      
      UrlStateMachine.transition(link, 'unfetched');
      
      expect(link.error).toBeNull();
    });

    test('should return the modified link', () => {
      const link = { url: 'https://example.com', status: 'unfetched', retryCount: 0, error: null, fetchedAt: null };
      
      const result = UrlStateMachine.transition(link, 'fetching');
      
      expect(result).toBe(link);
      expect(result.status).toBe('fetching');
    });

    test('should allow same-status transition without error', () => {
      const link = { url: 'https://example.com', status: 'fetching', retryCount: 0, error: null, fetchedAt: null };
      
      UrlStateMachine.transition(link, 'fetching');
      
      expect(link.status).toBe('fetching');
    });

    test('should update fetchedAt on same-status transition to fetched', () => {
      const link = { url: 'https://example.com', status: 'fetched', retryCount: 0, error: null, fetchedAt: 1000 };
      
      UrlStateMachine.transition(link, 'fetched');
      
      expect(link.fetchedAt).not.toBe(1000);
    });
  });

  describe('isTerminal', () => {
    test('should return true for fetched status', () => {
      expect(UrlStateMachine.isTerminal('fetched')).toBe(true);
    });

    test('should return true for failed status', () => {
      expect(UrlStateMachine.isTerminal('failed')).toBe(true);
    });

    test('should return false for unfetched status', () => {
      expect(UrlStateMachine.isTerminal('unfetched')).toBe(false);
    });

    test('should return false for fetching status', () => {
      expect(UrlStateMachine.isTerminal('fetching')).toBe(false);
    });

    test('should return false for unknown status', () => {
      expect(UrlStateMachine.isTerminal('unknown')).toBe(false);
      expect(UrlStateMachine.isTerminal('pending')).toBe(false);
      expect(UrlStateMachine.isTerminal('')).toBe(false);
    });
  });

  describe('integration scenarios', () => {
    test('should handle complete crawl lifecycle', () => {
      const link = { url: 'https://example.com', status: 'unfetched', retryCount: 0, error: null, fetchedAt: null };
      
      UrlStateMachine.transition(link, 'fetching');
      expect(link.status).toBe('fetching');
      
      UrlStateMachine.transition(link, 'fetched');
      expect(link.status).toBe('fetched');
      expect(link.fetchedAt).toBeTruthy();
      expect(UrlStateMachine.isTerminal(link.status)).toBe(true);
    });

    test('should handle retry lifecycle', () => {
      const link = { url: 'https://example.com', status: 'unfetched', retryCount: 0, error: null, fetchedAt: null };
      
      UrlStateMachine.transition(link, 'fetching');
      UrlStateMachine.transition(link, 'failed', { error: 'Timeout' });
      expect(link.status).toBe('failed');
      expect(link.error).toBe('Timeout');
      
      UrlStateMachine.transition(link, 'unfetched');
      expect(link.status).toBe('unfetched');
      expect(link.error).toBeNull();
      
      UrlStateMachine.transition(link, 'fetching');
      UrlStateMachine.transition(link, 'fetched');
      expect(link.status).toBe('fetched');
      expect(UrlStateMachine.isTerminal(link.status)).toBe(true);
    });

    test('should handle multiple retries', () => {
      const link = { url: 'https://example.com', status: 'unfetched', retryCount: 0, error: null, fetchedAt: null };
      
      for (let i = 0; i < 3; i++) {
        UrlStateMachine.transition(link, 'fetching');
        UrlStateMachine.transition(link, 'failed', { error: `Error ${i}` });
        expect(link.status).toBe('failed');
        
        UrlStateMachine.transition(link, 'unfetched');
        expect(link.status).toBe('unfetched');
      }
      
      UrlStateMachine.transition(link, 'fetching');
      UrlStateMachine.transition(link, 'fetched');
      expect(link.status).toBe('fetched');
    });
  });
});