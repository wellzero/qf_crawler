class MetricsAdapter {
  constructor(logger) {
    this.logger = logger;
    this.counters = new Map();
  }

  increment(name, value = 1) {
    const current = this.counters.get(name) || 0;
    const next = current + value;
    this.counters.set(name, next);
    return next;
  }

  timing(name, durationMs, labels = {}) {
    this.logger.debug(`[metrics] ${name}=${durationMs}ms ${JSON.stringify(labels)}`);
  }

  snapshot() {
    return Object.fromEntries(this.counters.entries());
  }
}

export default MetricsAdapter;
