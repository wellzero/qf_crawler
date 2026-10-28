import CrawlJobService from '../src/application/crawl-job-service.js';

describe('CrawlJobService', () => {
  test('should prioritize shallow and numeric urls', () => {
    const linkManager = {
      links: [
        { url: 'https://example.com/a/10', status: 'unfetched' },
        { url: 'https://example.com/a/b', status: 'unfetched' },
        { url: 'https://example.com/root', status: 'unfetched' }
      ],
      getUnfetchedLinks() {
        return this.links.filter(l => l.status === 'unfetched');
      },
      addLink() {}
    };

    const service = new CrawlJobService({
      linkManager,
      config: { seedUrls: [] }
    });

    const result = service.buildLinksToProcess(3).map(l => l.url);
    expect(result[0]).toBe('https://example.com/root');
    expect(result[1]).toBe('https://example.com/a/10');
  });
});
