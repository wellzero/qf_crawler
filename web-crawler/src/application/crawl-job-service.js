class CrawlJobService {
  constructor({ linkManager, config }) {
    this.linkManager = linkManager;
    this.config = config;
  }

  buildLinksToProcess(batchSize) {
    const unfetchedLinks = typeof this.linkManager.getUnfetchedLinks === 'function'
      ? this.linkManager.getUnfetchedLinks()
      : (this.linkManager.links || []).filter(link => link.status === 'unfetched');
    const linksToProcess = this.collectSeedLinks();
    const sortedUnfetchedLinks = this.sortLinksByPriority(unfetchedLinks);

    for (const link of sortedUnfetchedLinks) {
      if (!linksToProcess.find(item => item.url === link.url)) {
        linksToProcess.push(link);
      }
    }

    return linksToProcess.slice(0, batchSize);
  }

  collectSeedLinks() {
    const seedLinks = [];
    if (!this.config.seedUrls || this.config.seedUrls.length === 0) {
      return seedLinks;
    }

    for (const seedUrl of this.config.seedUrls) {
      const existingLink = this.linkManager.links.find(link => link.url === seedUrl);
      if (existingLink) {
        if (existingLink.status === 'unfetched') {
          seedLinks.push(existingLink);
        }
        continue;
      }

      this.linkManager.addLink(seedUrl, 'unfetched');
      seedLinks.push({ url: seedUrl, status: 'unfetched' });
    }

    return seedLinks;
  }

  sortLinksByPriority(unfetchedLinks) {
    return [...unfetchedLinks].sort((a, b) => {
      const aDepth = this.getPathDepth(a.url);
      const bDepth = this.getPathDepth(b.url);
      if (aDepth !== bDepth) {
        return aDepth - bDepth;
      }

      const aHasNumericSegment = /\/\d+(?:\/|$)/.test(a.url);
      const bHasNumericSegment = /\/\d+(?:\/|$)/.test(b.url);
      if (aHasNumericSegment !== bHasNumericSegment) {
        return aHasNumericSegment ? -1 : 1;
      }

      const aHasParams = this.hasQueryParams(a.url);
      const bHasParams = this.hasQueryParams(b.url);
      if (aHasParams !== bHasParams) {
        return aHasParams ? 1 : -1;
      }

      return a.url.length - b.url.length;
    });
  }

  getPathDepth(url) {
    try {
      const urlObj = new URL(url);
      return (urlObj.pathname.match(/\//g) || []).length;
    } catch {
      return (url.match(/\//g) || []).length;
    }
  }

  hasQueryParams(url) {
    return url.includes('?') || url.includes('&') || url.includes('=');
  }
}

export default CrawlJobService;
