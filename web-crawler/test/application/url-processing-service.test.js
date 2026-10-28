import UrlProcessingService from '../../src/application/url-processing-service.js';
import { jest } from '@jest/globals';

describe('UrlProcessingService', () => {
  let mockLinkManager;
  let mockLogger;
  let urlProcessingService;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockLinkManager = {
      links: [],
      incrementRetryCount: jest.fn().mockReturnValue(1),
      updateLinkStatus: jest.fn()
    };
    
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    urlProcessingService = new UrlProcessingService(mockLinkManager, mockLogger, 3);
  });

  describe('constructor', () => {
    test('should initialize with linkManager and logger', () => {
      expect(urlProcessingService.linkManager).toBe(mockLinkManager);
      expect(urlProcessingService.logger).toBe(mockLogger);
    });

    test('should create RetryPolicy with default maxRetries', () => {
      const service = new UrlProcessingService(mockLinkManager, mockLogger);
      expect(service.retryPolicy.maxRetries).toBe(3);
    });

    test('should create RetryPolicy with custom maxRetries', () => {
      const service = new UrlProcessingService(mockLinkManager, mockLogger, 5);
      expect(service.retryPolicy.maxRetries).toBe(5);
    });

    test('should create RetryPolicy with zero maxRetries', () => {
      const service = new UrlProcessingService(mockLinkManager, mockLogger, 0);
      expect(service.retryPolicy.maxRetries).toBe(0);
    });
  });

  describe('markFetching', () => {
    test('should call updateStatus with fetching', () => {
      const url = 'https://example.com/page';
      mockLinkManager.links = [{ url: 'https://example.com/page', status: 'unfetched' }];

      urlProcessingService.markFetching(url);

      expect(mockLinkManager.links[0].status).toBe('fetching');
    });

    test('should handle URL with hash fragment', () => {
      const url = 'https://example.com/page#section';
      mockLinkManager.links = [{ url: 'https://example.com/page', status: 'unfetched' }];

      urlProcessingService.markFetching(url);

      expect(mockLinkManager.links[0].status).toBe('fetching');
    });

    test('should handle URL not found in links', () => {
      const url = 'https://example.com/new';
      mockLinkManager.links = [];

      urlProcessingService.markFetching(url);

      expect(mockLinkManager.updateLinkStatus).toHaveBeenCalledWith(url, 'fetching', null);
    });
  });

  describe('markFetched', () => {
    test('should call updateStatus with fetched', () => {
      const url = 'https://example.com/page';
      mockLinkManager.links = [{ url: 'https://example.com/page', status: 'fetching', fetchedAt: null }];

      urlProcessingService.markFetched(url);

      expect(mockLinkManager.links[0].status).toBe('fetched');
      expect(mockLinkManager.links[0].fetchedAt).toBeTruthy();
      expect(mockLinkManager.links[0].error).toBeNull();
    });

    test('should handle URL not in linkManager', () => {
      const url = 'https://example.com/notfound';
      mockLinkManager.links = [];

      urlProcessingService.markFetched(url);

      expect(mockLinkManager.updateLinkStatus).toHaveBeenCalledWith(url, 'fetched', null);
    });
  });

  describe('handleFailure', () => {
    test('should increment retry count', () => {
      mockLinkManager.links = [{ url: 'https://example.com/page', status: 'fetching', retryCount: 0 }];
      mockLinkManager.incrementRetryCount.mockReturnValue(1);

      urlProcessingService.handleFailure('https://example.com/page', new Error('Timeout'));

      expect(mockLinkManager.incrementRetryCount).toHaveBeenCalledWith('https://example.com/page');
    });

    test('should set status to unfetched when retry is possible', () => {
      mockLinkManager.links = [{ url: 'https://example.com/page', status: 'fetching', retryCount: 0 }];
      mockLinkManager.incrementRetryCount.mockReturnValue(1);

      urlProcessingService.handleFailure('https://example.com/page', new Error('Timeout'));

      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Retry'));
      expect(mockLinkManager.links[0].status).toBe('unfetched');
      expect(mockLinkManager.links[0].error).toBeNull();
    });

    test('should set status to failed when retry limit reached', () => {
      mockLinkManager.links = [{ url: 'https://example.com/page', status: 'fetching', retryCount: 3 }];
      mockLinkManager.incrementRetryCount.mockReturnValue(3);

      urlProcessingService.handleFailure('https://example.com/page', new Error('Connection refused'));

      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Failed after'));
      expect(mockLinkManager.links[0].status).toBe('failed');
      expect(mockLinkManager.links[0].error).toBe('Connection refused');
    });

    test('should handle non-Error error object', () => {
      mockLinkManager.links = [{ url: 'https://example.com/page', status: 'fetching', retryCount: 3 }];
      mockLinkManager.incrementRetryCount.mockReturnValue(3);

      urlProcessingService.handleFailure('https://example.com/page', 'string error');

      expect(mockLinkManager.links[0].error).toBe('string error');
    });

    test('should handle null error as string', () => {
      mockLinkManager.links = [{ url: 'https://example.com/page', status: 'fetching', retryCount: 3 }];
      mockLinkManager.incrementRetryCount.mockReturnValue(3);

      urlProcessingService.handleFailure('https://example.com/page', null);

      expect(mockLinkManager.links[0].error).toBe('null');
    });

    test('should handle undefined error as string', () => {
      mockLinkManager.links = [{ url: 'https://example.com/page', status: 'fetching', retryCount: 3 }];
      mockLinkManager.incrementRetryCount.mockReturnValue(3);

      urlProcessingService.handleFailure('https://example.com/page', undefined);

      expect(mockLinkManager.links[0].error).toBe('undefined');
    });

    test('should use error message from Error object', () => {
      mockLinkManager.links = [{ url: 'https://example.com/page', status: 'fetching', retryCount: 3 }];
      mockLinkManager.incrementRetryCount.mockReturnValue(3);

      const error = new Error('Specific error message');
      urlProcessingService.handleFailure('https://example.com/page', error);

      expect(mockLinkManager.links[0].error).toBe('Specific error message');
    });

    test('should handle URL not found in links', () => {
      mockLinkManager.links = [];
      mockLinkManager.incrementRetryCount.mockReturnValue(3);

      urlProcessingService.handleFailure('https://example.com/new', new Error('Error'));

      expect(mockLinkManager.updateLinkStatus).toHaveBeenCalledWith('https://example.com/new', 'failed', 'Error');
    });
  });

  describe('updateStatus', () => {
    test('should normalize URL by removing hash fragment', () => {
      const url = 'https://example.com/page#section';
      mockLinkManager.links = [{ url: 'https://example.com/page', status: 'unfetched' }];

      urlProcessingService.updateStatus(url, 'fetching');

      expect(mockLinkManager.links[0].status).toBe('fetching');
    });

    test('should find link by normalized URL', () => {
      const url = 'https://example.com/page#section';
      const link = { url: 'https://example.com/page', status: 'unfetched' };
      mockLinkManager.links = [link];

      urlProcessingService.updateStatus(url, 'fetching');

      expect(link.status).toBe('fetching');
    });

    test('should call updateLinkStatus when link not found', () => {
      const url = 'https://example.com/new-page';
      mockLinkManager.links = [];

      urlProcessingService.updateStatus(url, 'fetching', 'some error');

      expect(mockLinkManager.updateLinkStatus).toHaveBeenCalledWith(url, 'fetching', 'some error');
    });

    test('should pass error to transition for failed status', () => {
      const url = 'https://example.com/page';
      const link = { url: 'https://example.com/page', status: 'fetching', error: null };
      mockLinkManager.links = [link];

      urlProcessingService.updateStatus(url, 'failed', 'Network error');

      expect(link.status).toBe('failed');
      expect(link.error).toBe('Network error');
    });

    test('should call updateLinkStatus for URL not in links', () => {
      const url = 'https://example.com#/new/page';
      mockLinkManager.links = [];

      urlProcessingService.updateStatus(url, 'fetching');

      expect(mockLinkManager.updateLinkStatus).toHaveBeenCalled();
    });

    test('should clear error when transitioning to fetched', () => {
      const link = { url: 'https://example.com/page', status: 'fetching', error: 'previous error' };
      mockLinkManager.links = [link];

      urlProcessingService.updateStatus('https://example.com/page', 'fetched');

      expect(link.error).toBeNull();
      expect(link.fetchedAt).toBeTruthy();
    });

    test('should clear error when transitioning to unfetched', () => {
      const link = { url: 'https://example.com/page', status: 'failed', error: 'previous error' };
      mockLinkManager.links = [link];

      urlProcessingService.updateStatus('https://example.com/page', 'unfetched');

      expect(link.error).toBeNull();
    });
  });

  describe('integration scenarios', () => {
    test('should handle complete fetching lifecycle', () => {
      const url = 'https://example.com/page';
      const link = { url: 'https://example.com/page', status: 'unfetched', fetchedAt: null, error: null };
      mockLinkManager.links = [link];

      urlProcessingService.markFetching(url);
      expect(link.status).toBe('fetching');

      urlProcessingService.markFetched(url);
      expect(link.status).toBe('fetched');
      expect(link.fetchedAt).toBeTruthy();
    });

    test('should handle retry cycle', () => {
      const url = 'https://example.com/page';
      const link = { url: 'https://example.com/page', status: 'fetching', retryCount: 0, error: null };
      mockLinkManager.links = [link];
      mockLinkManager.incrementRetryCount.mockReturnValue(1);

      urlProcessingService.handleFailure(url, new Error('Timeout'));

      expect(link.status).toBe('unfetched');
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    test('should handle multiple URLs independently', () => {
      mockLinkManager.links = [
        { url: 'https://example.com/page1', status: 'unfetched' },
        { url: 'https://example.com/page2', status: 'unfetched' }
      ];

      urlProcessingService.markFetching('https://example.com/page1');
      urlProcessingService.markFetching('https://example.com/page2');

      expect(mockLinkManager.links[0].status).toBe('fetching');
      expect(mockLinkManager.links[1].status).toBe('fetching');
    });

    test('should handle maxRetries correctly', () => {
      const service = new UrlProcessingService(mockLinkManager, mockLogger, 2);
      const link = { url: 'https://example.com/page', status: 'fetching', retryCount: 0, error: null };
      mockLinkManager.links = [link];
      
      mockLinkManager.incrementRetryCount.mockReturnValue(1);
      service.handleFailure('https://example.com/page', new Error('Error'));
      expect(link.status).toBe('unfetched');

      mockLinkManager.incrementRetryCount.mockReturnValue(2);
      service.handleFailure('https://example.com/page', new Error('Error'));
      expect(link.status).toBe('failed');
    });
  });
});