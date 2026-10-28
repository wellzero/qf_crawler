import CrawlJobService from '../../src/application/crawl-job-service.js';
import { jest } from '@jest/globals';

describe('CrawlJobService', () => {
  let mockLinkManager;
  let mockConfig;
  let crawlJobService;

  beforeEach(() => {
    mockLinkManager = {
      links: [],
      getUnfetchedLinks: jest.fn(),
      addLink: jest.fn()
    };
    mockConfig = {
      seedUrls: []
    };
    crawlJobService = new CrawlJobService({ linkManager: mockLinkManager, config: mockConfig });
  });

  describe('constructor', () => {
    test('should initialize with linkManager and config', () => {
      expect(crawlJobService.linkManager).toBe(mockLinkManager);
      expect(crawlJobService.config).toBe(mockConfig);
    });
  });

  describe('buildLinksToProcess', () => {
    test('should return empty array when no links and no seed URLs', () => {
      mockLinkManager.getUnfetchedLinks.mockReturnValue([]);
      mockConfig.seedUrls = [];

      const result = crawlJobService.buildLinksToProcess(10);
      expect(result).toEqual([]);
    });

    test('should return seed URLs when no unfetched links', () => {
      mockLinkManager.getUnfetchedLinks.mockReturnValue([]);
      mockLinkManager.links = [];
      mockConfig.seedUrls = ['https://example.com/page1', 'https://example.com/page2'];

      const result = crawlJobService.buildLinksToProcess(10);
      expect(result).toHaveLength(2);
      expect(result[0].url).toBe('https://example.com/page1');
      expect(result[1].url).toBe('https://example.com/page2');
    });

    test('should respect batchSize limit', () => {
      mockLinkManager.getUnfetchedLinks.mockReturnValue([]);
      mockLinkManager.links = [];
      mockConfig.seedUrls = ['https://example.com/1', 'https://example.com/2', 'https://example.com/3'];

      const result = crawlJobService.buildLinksToProcess(2);
      expect(result).toHaveLength(2);
    });

    test('should include unfetched links after seed URLs', () => {
      mockLinkManager.links = [];
      mockConfig.seedUrls = ['https://example.com/seed'];
      mockLinkManager.getUnfetchedLinks.mockReturnValue([
        { url: 'https://example.com/page1', status: 'unfetched' },
        { url: 'https://example.com/page2', status: 'unfetched' }
      ]);

      const result = crawlJobService.buildLinksToProcess(10);
      expect(result).toHaveLength(3);
      expect(result[0].url).toBe('https://example.com/seed');
      expect(result[1].url).toBe('https://example.com/page1');
    });

    test('should not add duplicate URLs', () => {
      mockLinkManager.links = [{ url: 'https://example.com/seed', status: 'unfetched' }];
      mockConfig.seedUrls = ['https://example.com/seed'];
      mockLinkManager.getUnfetchedLinks.mockReturnValue([
        { url: 'https://example.com/seed', status: 'unfetched' }
      ]);

      const result = crawlJobService.buildLinksToProcess(10);
      expect(result).toHaveLength(1);
    });

    test('should use links array when getUnfetchedLinks is not available', () => {
      mockLinkManager.getUnfetchedLinks = undefined;
      mockLinkManager.links = [
        { url: 'https://example.com/page1', status: 'unfetched' },
        { url: 'https://example.com/page2', status: 'fetched' },
        { url: 'https://example.com/page3', status: 'unfetched' }
      ];
      mockConfig.seedUrls = [];

      const result = crawlJobService.buildLinksToProcess(10);
      expect(result).toHaveLength(2);
      expect(result[0].url).toBe('https://example.com/page1');
      expect(result[1].url).toBe('https://example.com/page3');
    });
  });

  describe('collectSeedLinks', () => {
    test('should return empty array when no seed URLs', () => {
      mockConfig.seedUrls = [];
      mockLinkManager.links = [];

      const result = crawlJobService.collectSeedLinks();
      expect(result).toEqual([]);
    });

    test('should return empty array when seedUrls is undefined', () => {
      mockConfig.seedUrls = undefined;
      mockLinkManager.links = [];

      const result = crawlJobService.collectSeedLinks();
      expect(result).toEqual([]);
    });

    test('should add new seed URLs to linkManager', () => {
      mockConfig.seedUrls = ['https://example.com/new'];
      mockLinkManager.links = [];

      const result = crawlJobService.collectSeedLinks();
      expect(mockLinkManager.addLink).toHaveBeenCalledWith('https://example.com/new', 'unfetched');
      expect(result).toHaveLength(1);
    });

    test('should use existing unfetched link when seed URL already exists', () => {
      mockConfig.seedUrls = ['https://example.com/existing'];
      mockLinkManager.links = [{ url: 'https://example.com/existing', status: 'unfetched' }];

      const result = crawlJobService.collectSeedLinks();
      expect(mockLinkManager.addLink).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].url).toBe('https://example.com/existing');
    });

    test('should skip existing fetched seed URLs', () => {
      mockConfig.seedUrls = ['https://example.com/fetched'];
      mockLinkManager.links = [{ url: 'https://example.com/fetched', status: 'fetched' }];

      const result = crawlJobService.collectSeedLinks();
      expect(result).toHaveLength(0);
    });

    test('should skip existing failed seed URLs', () => {
      mockConfig.seedUrls = ['https://example.com/failed'];
      mockLinkManager.links = [{ url: 'https://example.com/failed', status: 'failed' }];

      const result = crawlJobService.collectSeedLinks();
      expect(result).toHaveLength(0);
    });

    test('should handle multiple seed URLs', () => {
      mockConfig.seedUrls = ['https://example.com/1', 'https://example.com/2', 'https://example.com/3'];
      mockLinkManager.links = [];

      const result = crawlJobService.collectSeedLinks();
      expect(result).toHaveLength(3);
    });
  });

  describe('sortLinksByPriority', () => {
    test('should sort by path depth (shorter first)', () => {
      const links = [
        { url: 'https://example.com/api/v1/users/details' },
        { url: 'https://example.com/api' },
        { url: 'https://example.com/api/v1' }
      ];

      const result = crawlJobService.sortLinksByPriority(links);
      expect(result[0].url).toBe('https://example.com/api');
      expect(result[1].url).toBe('https://example.com/api/v1');
      expect(result[2].url).toBe('https://example.com/api/v1/users/details');
    });

    test('should prioritize URLs with numeric segments', () => {
      const links = [
        { url: 'https://example.com/api/users' },
        { url: 'https://example.com/api/123' },
        { url: 'https://example.com/api/items' }
      ];

      const result = crawlJobService.sortLinksByPriority(links);
      expect(result[0].url).toBe('https://example.com/api/123');
    });

    test('should prioritize URLs without query params', () => {
      const links = [
        { url: 'https://example.com/api?page=1' },
        { url: 'https://example.com/api' }
      ];

      const result = crawlJobService.sortLinksByPriority(links);
      expect(result[0].url).toBe('https://example.com/api');
    });

    test('should sort by URL length as final tiebreaker', () => {
      const links = [
        { url: 'https://example.com/api/v1/users/list' },
        { url: 'https://example.com/api/v1/users' }
      ];

      const result = crawlJobService.sortLinksByPriority(links);
      expect(result[0].url).toBe('https://example.com/api/v1/users');
    });

    test('should not modify original array', () => {
      const links = [
        { url: 'https://example.com/a/b/c' },
        { url: 'https://example.com/a' }
      ];

      crawlJobService.sortLinksByPriority(links);
      expect(links[0].url).toBe('https://example.com/a/b/c');
    });

    test('should handle empty array', () => {
      const result = crawlJobService.sortLinksByPriority([]);
      expect(result).toEqual([]);
    });

    test('should handle single element array', () => {
      const links = [{ url: 'https://example.com' }];
      const result = crawlJobService.sortLinksByPriority(links);
      expect(result).toHaveLength(1);
    });
  });

  describe('getPathDepth', () => {
    test('should return correct depth for root path', () => {
      const depth = crawlJobService.getPathDepth('https://example.com');
      expect(depth).toBe(1);
    });

    test('should return correct depth for single path segment', () => {
      const depth = crawlJobService.getPathDepth('https://example.com/api');
      expect(depth).toBe(1);
    });

    test('should return correct depth for multiple path segments', () => {
      const depth = crawlJobService.getPathDepth('https://example.com/api/v1/users');
      expect(depth).toBe(3);
    });

    test('should handle trailing slash', () => {
      const depth = crawlJobService.getPathDepth('https://example.com/api/');
      expect(depth).toBe(2);
    });

    test('should handle invalid URL gracefully', () => {
      const depth = crawlJobService.getPathDepth('not-a-valid-url');
      expect(typeof depth).toBe('number');
    });

    test('should handle URL with query params', () => {
      const depth = crawlJobService.getPathDepth('https://example.com/api?page=1');
      expect(depth).toBe(1);
    });

    test('should handle URL with hash', () => {
      const depth = crawlJobService.getPathDepth('https://example.com/api#section');
      expect(depth).toBe(1);
    });
  });

  describe('hasQueryParams', () => {
    test('should return true for URL with question mark', () => {
      const result = crawlJobService.hasQueryParams('https://example.com?page=1');
      expect(result).toBe(true);
    });

    test('should return true for URL with ampersand', () => {
      const result = crawlJobService.hasQueryParams('https://example.com?page=1&limit=10');
      expect(result).toBe(true);
    });

    test('should return true for URL with equals sign', () => {
      const result = crawlJobService.hasQueryParams('https://example.com?search=test');
      expect(result).toBe(true);
    });

    test('should return false for URL without query params', () => {
      const result = crawlJobService.hasQueryParams('https://example.com/api/users');
      expect(result).toBe(false);
    });

    test('should return false for simple URL', () => {
      const result = crawlJobService.hasQueryParams('https://example.com');
      expect(result).toBe(false);
    });

    test('should detect equals sign in path (edge case)', () => {
      const result = crawlJobService.hasQueryParams('https://example.com/path=test');
      expect(result).toBe(true);
    });
  });

  describe('integration scenarios', () => {
    test('should build correct batch from mixed sources', () => {
      mockLinkManager.links = [
        { url: 'https://example.com/seed', status: 'fetched' }
      ];
      mockConfig.seedUrls = ['https://example.com/new-seed'];
      mockLinkManager.getUnfetchedLinks.mockReturnValue([
        { url: 'https://example.com/deep/path/page', status: 'unfetched' },
        { url: 'https://example.com/shallow', status: 'unfetched' },
        { url: 'https://example.com/api/123', status: 'unfetched' }
      ]);

      const result = crawlJobService.buildLinksToProcess(5);
      
      expect(result[0].url).toBe('https://example.com/new-seed');
      expect(result.length).toBeGreaterThan(0);
    });

    test('should handle large batch size', () => {
      mockLinkManager.links = [];
      mockConfig.seedUrls = ['https://example.com/seed'];
      const unfetchedLinks = [];
      for (let i = 0; i < 100; i++) {
        unfetchedLinks.push({ url: `https://example.com/page${i}`, status: 'unfetched' });
      }
      mockLinkManager.getUnfetchedLinks.mockReturnValue(unfetchedLinks);

      const result = crawlJobService.buildLinksToProcess(50);
      expect(result.length).toBeLessThanOrEqual(50);
    });

    test('should handle zero batch size', () => {
      mockLinkManager.getUnfetchedLinks.mockReturnValue([]);
      mockConfig.seedUrls = ['https://example.com/seed'];

      const result = crawlJobService.buildLinksToProcess(0);
      expect(result).toEqual([]);
    });
  });
});