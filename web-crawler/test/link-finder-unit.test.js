import { jest } from '@jest/globals';
import LinkFinder from '../src/link-finder.js';

describe('LinkFinder unit', () => {
  let finder;

  beforeEach(() => {
    finder = new LinkFinder();
  });

  describe('expandCollapsibles', () => {
    test('continues when evaluate fails', async () => {
      const page = {
        evaluate: jest.fn()
          .mockRejectedValueOnce(new Error('cannot click')),
        waitForTimeout: jest.fn()
      };

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      await finder.expandCollapsibles(page);

      expect(warnSpy).toHaveBeenCalled();
      expect(page.waitForTimeout).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });

  describe('performInfiniteScroll', () => {
    test('scrolls page and detects stability', async () => {
      let linkCount = 0;
      const page = {
        evaluate: jest.fn()
          .mockImplementation(async (fn) => {
            if (typeof fn === 'function') {
              // First call is scroll, second is link count check
              return fn();
            }
            return linkCount;
          })
          .mockImplementationOnce(async () => {}) // scroll
          .mockImplementationOnce(async () => { linkCount = 5; return 5; }) // first count
          .mockImplementationOnce(async () => {}) // scroll
          .mockImplementationOnce(async () => 5) // same count - stable
          .mockImplementationOnce(async () => {}) // scroll
          .mockImplementationOnce(async () => 5), // same count - stable
        waitForTimeout: jest.fn()
      };

      await finder.performInfiniteScroll(page, { maxScrolls: 5, stabilityChecks: 2 });

      expect(page.waitForTimeout).toHaveBeenCalled();
    });
  });
});
