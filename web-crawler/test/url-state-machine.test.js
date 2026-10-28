import UrlStateMachine from '../src/domain/url-state-machine.js';

describe('UrlStateMachine', () => {
  test('should allow unfetched -> fetching -> fetched transitions', () => {
    const link = { url: 'https://example.com', status: 'unfetched', retryCount: 0, error: null, fetchedAt: null };

    UrlStateMachine.transition(link, 'fetching');
    expect(link.status).toBe('fetching');

    UrlStateMachine.transition(link, 'fetched');
    expect(link.status).toBe('fetched');
    expect(link.fetchedAt).toBeTruthy();
    expect(link.error).toBeNull();
  });

  test('should throw on invalid transition', () => {
    const link = { url: 'https://example.com', status: 'fetched', retryCount: 0, error: null };
    expect(() => UrlStateMachine.transition(link, 'fetching')).toThrow('Invalid URL state transition');
  });
});
