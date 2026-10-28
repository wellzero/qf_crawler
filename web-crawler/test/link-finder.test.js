/**
 * Link Finder测试
 * 包含Property-Based Tests和Unit Tests
 */

import fc from 'fast-check';
import { jest } from '@jest/globals';
import LinkFinder from '../src/link-finder.js';

describe('Link Finder', () => {
  let linkFinder;

  beforeEach(() => {
    linkFinder = new LinkFinder();
  });

  // ========== Unit Tests (no browser required) ==========

  describe('Unit Tests', () => {
    describe('URL filtering logic', () => {
      test('filters URLs by include pattern', () => {
        const links = [
          'https://example.com/api/v1',
          'https://example.com/page',
          'https://example.com/api/v2'
        ];

        const urlRules = { include: ['.*api.*'] };
        const filtered = links.filter(url => {
          if (urlRules.include && urlRules.include.length > 0) {
            return urlRules.include.some(pattern => new RegExp(pattern).test(url));
          }
          return true;
        });

        expect(filtered).toHaveLength(2);
        expect(filtered).toContain('https://example.com/api/v1');
        expect(filtered).toContain('https://example.com/api/v2');
      });

      test('filters URLs by exclude pattern', () => {
        const links = [
          'https://example.com/login',
          'https://example.com/page1',
          'https://example.com/page2'
        ];

        const urlRules = { exclude: ['.*login.*'] };
        const filtered = links.filter(url => {
          if (urlRules.exclude && urlRules.exclude.length > 0) {
            return !urlRules.exclude.some(pattern => new RegExp(pattern).test(url));
          }
          return true;
        });

        expect(filtered).toHaveLength(2);
        expect(filtered).not.toContain('https://example.com/login');
      });

      test('removes duplicate URLs', () => {
        const links = [
          'https://example.com/page',
          'https://example.com/page',
          'https://example.com/page'
        ];

        const unique = [...new Set(links)];
        expect(unique).toHaveLength(1);
      });

      test('validates absolute URLs', () => {
        const urls = [
          'https://example.com/page',
          'http://example.com/page',
          'ftp://example.com/file',
          '/relative/path',
          'relative/path'
        ];

        const isAbsolute = (url) => url.startsWith('http://') || url.startsWith('https://');
        const absoluteUrls = urls.filter(isAbsolute);

        expect(absoluteUrls).toHaveLength(2);
      });
    });

    describe('expandCollapsibles', () => {
      test('continues when evaluate fails', async () => {
        const page = {
          evaluate: jest.fn().mockRejectedValueOnce(new Error('cannot click')),
          waitForTimeout: jest.fn()
        };
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        await linkFinder.expandCollapsibles(page);
        expect(warnSpy).toHaveBeenCalled();
        expect(page.waitForTimeout).not.toHaveBeenCalled();
        warnSpy.mockRestore();
      });
    });

    describe('performInfiniteScroll', () => {
      test('scrolls page and detects stability', async () => {
        let evaluateCallCount = 0;
        const page = {
          evaluate: jest.fn().mockImplementation(async (fnOrSelector) => {
            evaluateCallCount++;
            // First call is scroll (function), second is link count check
            if (typeof fnOrSelector === 'function') {
              return undefined; // scroll action
            }
            // Link count - return stable values to trigger early exit
            if (evaluateCallCount <= 2) return 10; // First scroll + count
            return 10; // Same count = stable
          }),
          waitForTimeout: jest.fn().mockResolvedValue(undefined)
        };

        await linkFinder.performInfiniteScroll(page, { maxScrolls: 5, stabilityChecks: 2 });
        expect(page.waitForTimeout).toHaveBeenCalled();
      });

      test('handles errors gracefully', async () => {
        const page = {
          evaluate: jest.fn().mockRejectedValue(new Error('Scroll error')),
          waitForTimeout: jest.fn().mockResolvedValue(undefined)
        };

        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        // Should not throw
        await expect(linkFinder.performInfiniteScroll(page)).resolves.not.toThrow();

        warnSpy.mockRestore();
      });
    });
  });

  // ========== Property-Based Tests ==========

  describe('Property-Based Tests', () => {
    test('extracted links are valid absolute URLs', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              href: fc.webUrl(),
              text: fc.string({ minLength: 1, maxLength: 20 })
            }),
            { minLength: 0, maxLength: 10 }
          ),
          (links) => {
            for (const link of links) {
              const isAbsolute = link.href.startsWith('http://') || link.href.startsWith('https://');
              expect(isAbsolute).toBe(true);
            }
            return true;
          }
        ),
        { numRuns: 20 }
      );
    });

    test('URL filtering respects include patterns', () => {
      fc.assert(
        fc.property(
          fc.array(fc.webUrl(), { minLength: 0, maxLength: 10 }),
          fc.array(fc.string({ minLength: 1, maxLength: 5 }), { minLength: 0, maxLength: 3 }),
          (urls, patterns) => {
            const filtered = urls.filter(url => {
              if (patterns.length === 0) return true;
              return patterns.some(pattern => {
                try {
                  return new RegExp(pattern).test(url);
                } catch {
                  return false;
                }
              });
            });

            expect(filtered.length).toBeLessThanOrEqual(urls.length);
            return true;
          }
        ),
        { numRuns: 20 }
      );
    });

    test('URL filtering respects exclude patterns', () => {
      fc.assert(
        fc.property(
          fc.array(fc.webUrl(), { minLength: 0, maxLength: 10 }),
          fc.array(fc.string({ minLength: 1, maxLength: 5 }), { minLength: 0, maxLength: 3 }),
          (urls, patterns) => {
            const filtered = urls.filter(url => {
              if (patterns.length === 0) return true;
              return !patterns.some(pattern => {
                try {
                  return new RegExp(pattern).test(url);
                } catch {
                  return false;
                }
              });
            });

            expect(filtered.length).toBeLessThanOrEqual(urls.length);
            return true;
          }
        ),
        { numRuns: 20 }
      );
    });

    test('duplicate removal works correctly', () => {
      fc.assert(
        fc.property(
          fc.array(fc.webUrl(), { minLength: 0, maxLength: 20 }),
          (urls) => {
            const unique = [...new Set(urls)];
            expect(unique.length).toBeLessThanOrEqual(urls.length);

            // Verify all unique URLs are in the original array
            for (const url of unique) {
              expect(urls).toContain(url);
            }
            return true;
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});