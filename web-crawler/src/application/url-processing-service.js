import UrlStateMachine from '../domain/url-state-machine.js';
import RetryPolicy from '../domain/retry-policy.js';

class UrlProcessingService {
  constructor(linkManager, logger, maxRetries = 3) {
    this.linkManager = linkManager;
    this.logger = logger;
    this.retryPolicy = new RetryPolicy(maxRetries);
  }

  markFetching(url) {
    this.updateStatus(url, 'fetching');
  }

  markFetched(url) {
    this.updateStatus(url, 'fetched');
  }

  handleFailure(url, error) {
    const retryCount = this.linkManager.incrementRetryCount(url);

    if (this.retryPolicy.shouldRetry(retryCount)) {
      this.logger.warn(`Retry ${retryCount}/${this.retryPolicy.maxRetries}, setting back to unfetched`);
      this.updateStatus(url, 'unfetched');
      return;
    }

    this.logger.error(`Failed after ${this.retryPolicy.maxRetries} retries, marking as failed`);
    this.updateStatus(url, 'failed', error?.message || String(error));
  }

  updateStatus(url, status, error = null) {
    const normalizedUrl = url.split('#')[0];
    const link = this.linkManager.links.find(item => item.url === normalizedUrl);

    if (!link) {
      this.linkManager.updateLinkStatus(url, status, error);
      return;
    }

    UrlStateMachine.transition(link, status, { error });
  }
}

export default UrlProcessingService;
