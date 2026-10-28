class RetryPolicy {
  constructor(maxRetries = 3) {
    this.maxRetries = maxRetries;
  }

  shouldRetry(retryCount) {
    return retryCount < this.maxRetries;
  }
}

export default RetryPolicy;
