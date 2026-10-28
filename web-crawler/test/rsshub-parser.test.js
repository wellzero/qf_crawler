import { jest } from '@jest/globals';
import RsshubParser from '../src/parsers/rsshub-parser.js';

describe('RsshubParser', () => {
  let parser;

  beforeEach(() => {
    parser = new RsshubParser();
  });

  describe('matches', () => {
    test('should match RSSHub routes URLs', () => {
      expect(parser.matches('https://docs.rsshub.app/routes/twitter')).toBe(true);
      expect(parser.matches('https://docs.rsshub.app/routes/bilibili/user/dynamic')).toBe(true);
      expect(parser.matches('https://docs.rsshub.app/routes/')).toBe(true);
      expect(parser.matches('http://docs.rsshub.app/routes/youtube')).toBe(true);
    });

    test('should not match non-routes URLs', () => {
      expect(parser.matches('https://docs.rsshub.app/')).toBe(false);
      expect(parser.matches('https://docs.rsshub.app/install')).toBe(false);
      expect(parser.matches('https://rsshub.app/routes/twitter')).toBe(false);
      expect(parser.matches('https://example.com/routes/twitter')).toBe(false);
    });
  });

  describe('getPriority', () => {
    test('should return 100 (high priority)', () => {
      expect(parser.getPriority()).toBe(100);
    });
  });

  describe('generateFilename', () => {
    test('should generate filename from URL path', () => {
      expect(parser.generateFilename('https://docs.rsshub.app/routes/twitter')).toBe('twitter');
      expect(parser.generateFilename('https://docs.rsshub.app/routes/bilibili/user/dynamic')).toBe('bilibili_user_dynamic');
    });

    test('should handle routes root URL', () => {
      expect(parser.generateFilename('https://docs.rsshub.app/routes/')).toBe('routes_overview');
      expect(parser.generateFilename('https://docs.rsshub.app/routes')).toBe('routes_overview');
    });

    test('should handle invalid URLs', () => {
      expect(parser.generateFilename('invalid-url')).toBe('rsshub_doc');
    });
  });

  describe('extractRoutePath', () => {
    test('should extract route path from URL', () => {
      expect(parser.extractRoutePath('https://docs.rsshub.app/routes/twitter')).toBe('twitter');
      expect(parser.extractRoutePath('https://docs.rsshub.app/routes/bilibili/user/dynamic')).toBe('bilibili/user/dynamic');
    });

    test('should return empty string for routes root URL', () => {
      expect(parser.extractRoutePath('https://docs.rsshub.app/routes')).toBe('');
      expect(parser.extractRoutePath('https://docs.rsshub.app/routes/')).toBe('');
    });

    test('should handle invalid URLs', () => {
      expect(parser.extractRoutePath('invalid-url')).toBe('');
    });
  });

  describe('waitForContent', () => {
    test('should wait for content selectors', async () => {
      const page = {
        waitForLoadState: jest.fn().mockResolvedValue(undefined),
        waitForSelector: jest.fn().mockResolvedValue(undefined),
        waitForTimeout: jest.fn().mockResolvedValue(undefined)
      };

      await parser.waitForContent(page);
      expect(page.waitForLoadState).toHaveBeenCalledWith('domcontentloaded', { timeout: 30000 });
      expect(page.waitForSelector).toHaveBeenCalled();
      expect(page.waitForTimeout).toHaveBeenCalled();
    });

    test('should handle errors gracefully', async () => {
      const page = {
        waitForLoadState: jest.fn().mockRejectedValue(new Error('Timeout')),
        waitForSelector: jest.fn().mockResolvedValue(undefined),
        waitForTimeout: jest.fn().mockResolvedValue(undefined)
      };

      await expect(parser.waitForContent(page)).resolves.not.toThrow();
    });
  });

  describe('parse', () => {
    test('should return rsshub-route type with basic data', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockResolvedValue(undefined),
        waitForSelector: jest.fn().mockResolvedValue(undefined),
        waitForTimeout: jest.fn().mockResolvedValue(undefined),
        evaluate: jest.fn().mockResolvedValue({
          title: 'Twitter',
          description: 'Twitter route documentation',
          routes: [],
          parameters: [{ name: 'user', required: true, description: 'User ID' }],
          routeInfo: { path: '/twitter/user/:id', author: 'DIYgod' },
          codeBlocks: [],
          headings: [],
          paragraphs: [],
          lists: [],
          rawContent: 'raw content'
        })
      };

      const result = await parser.parse(mockPage, 'https://docs.rsshub.app/routes/twitter');

      expect(result.type).toBe('rsshub-route');
      expect(result.url).toBe('https://docs.rsshub.app/routes/twitter');
      expect(result.routePath).toBe('twitter');
      expect(result.title).toBe('Twitter');
      expect(result.parameters).toEqual([{ name: 'user', required: true, description: 'User ID' }]);
    });

    test('should handle errors gracefully', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockRejectedValue(new Error('Page error')),
        waitForSelector: jest.fn().mockResolvedValue(undefined),
        waitForTimeout: jest.fn().mockResolvedValue(undefined),
        evaluate: jest.fn().mockRejectedValue(new Error('Parse error'))
      };

      const result = await parser.parse(mockPage, 'https://docs.rsshub.app/routes/twitter');

      expect(result.type).toBe('rsshub-route');
      expect(result.url).toBe('https://docs.rsshub.app/routes/twitter');
      expect(result.title).toBe('');
    });
  });
});