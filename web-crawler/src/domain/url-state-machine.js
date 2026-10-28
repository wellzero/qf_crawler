const TERMINAL_STATES = new Set(['fetched', 'failed']);

class UrlStateMachine {
  static validateTransition(fromStatus, toStatus) {
    if (fromStatus === toStatus) {
      return true;
    }

    const validTransitions = {
      unfetched: new Set(['fetching', 'failed']),
      fetching: new Set(['unfetched', 'fetched', 'failed']),
      fetched: new Set([]),
      failed: new Set(['unfetched'])
    };

    return validTransitions[fromStatus]?.has(toStatus) || false;
  }

  static transition(link, toStatus, context = {}) {
    const fromStatus = link.status;

    if (!UrlStateMachine.validateTransition(fromStatus, toStatus)) {
      throw new Error(`Invalid URL state transition: ${fromStatus} -> ${toStatus}`);
    }

    link.status = toStatus;

    if (toStatus === 'fetched') {
      link.fetchedAt = Date.now();
      link.error = null;
    } else if (toStatus === 'failed') {
      link.error = context.error || link.error || null;
    } else if (toStatus === 'unfetched') {
      link.error = null;
    }

    return link;
  }

  static isTerminal(status) {
    return TERMINAL_STATES.has(status);
  }
}

export default UrlStateMachine;
