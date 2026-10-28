import { jest } from '@jest/globals';
import UrlProcessingService from '../src/application/url-processing-service.js';

describe('UrlProcessingService', () => {
  const createLinkManager = () => ({
    links: [{ url: 'https://example.com', status: 'unfetched', retryCount: 0, error: null }],
    incrementRetryCount(url) {
      const link = this.links.find(item => item.url === url);
      link.retryCount += 1;
      return link.retryCount;
    },
    updateLinkStatus(url, status, error) {
      const link = this.links.find(item => item.url === url);
      link.status = status;
      link.error = error || null;
    }
  });

  const logger = {
    warn: jest.fn(),
    error: jest.fn()
  };

  beforeEach(() => {
    logger.warn.mockClear();
    logger.error.mockClear();
  });

  test('should reset to unfetched when retries are available', () => {
    const linkManager = createLinkManager();
    const service = new UrlProcessingService(linkManager, logger, 3);

    service.markFetching('https://example.com');
    service.handleFailure('https://example.com', new Error('oops'));

    expect(linkManager.links[0].status).toBe('unfetched');
    expect(linkManager.links[0].retryCount).toBe(1);
  });

  test('should mark failed when retries are exhausted', () => {
    const linkManager = createLinkManager();
    linkManager.links[0].retryCount = 2;
    const service = new UrlProcessingService(linkManager, logger, 3);

    service.markFetching('https://example.com');
    service.handleFailure('https://example.com', new Error('boom'));

    expect(linkManager.links[0].status).toBe('failed');
    expect(linkManager.links[0].error).toBe('boom');
    expect(linkManager.links[0].retryCount).toBe(3);
  });
});
