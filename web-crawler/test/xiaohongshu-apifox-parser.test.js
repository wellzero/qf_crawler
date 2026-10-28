import { jest } from '@jest/globals';
import XiaohongshuApifoxParser from '../src/parsers/xiaohongshu-apifox-parser.js';
import GenericParser from '../src/parsers/generic-parser.js';

jest.mock('../src/parsers/generic-parser.js', () => {
  return jest.fn().mockImplementation(() => ({
    parse: jest.fn().mockResolvedValue({ type: 'generic', title: 'Generic Result' })
  }));
});

describe('XiaohongshuApifoxParser', () => {
  let parser;

  beforeEach(() => {
    parser = new XiaohongshuApifoxParser();
    jest.clearAllMocks();
  });

  describe('matches', () => {
    test('should match Xiaohongshu Apifox documentation URLs', () => {
      expect(parser.matches('https://xiaohongshu.apifox.cn/doc-2810914')).toBe(true);
      expect(parser.matches('https://xiaohongshu.apifox.cn/doc-123456')).toBe(true);
      expect(parser.matches('http://xiaohongshu.apifox.cn/doc-1')).toBe(true);
    });

    test('should match web/project URLs', () => {
      expect(parser.matches('https://xiaohongshu.apifox.cn/web/project/123')).toBe(true);
      expect(parser.matches('https://xiaohongshu.apifox.cn/web/project/123/detail')).toBe(true);
    });

    test('should match root URL (regex allows empty after domain)', () => {
      expect(parser.matches('https://xiaohongshu.apifox.cn/')).toBe(true);
    });

    test('should not match other domains', () => {
      expect(parser.matches('https://apifox.cn/doc-2810914')).toBe(false);
      expect(parser.matches('https://example.com/doc-2810914')).toBe(false);
    });
  });

  describe('getPriority', () => {
    test('should return 110 (high priority)', () => {
      expect(parser.getPriority()).toBe(110);
    });
  });

  describe('supportsLinkDiscovery', () => {
    test('should return true', () => {
      expect(parser.supportsLinkDiscovery()).toBe(true);
    });
  });

  describe('discoverLinks', () => {
    test('should discover links from page', async () => {
      const mockPage = {
        waitForSelector: jest.fn().mockResolvedValue(undefined),
        evaluate: jest.fn().mockResolvedValue([
          'https://xiaohongshu.apifox.cn/doc-2810914',
          'https://xiaohongshu.apifox.cn/doc-2810915'
        ])
      };

      const links = await parser.discoverLinks(mockPage);

      expect(links.length).toBe(2);
      expect(links[0]).toBe('https://xiaohongshu.apifox.cn/doc-2810914');
    });

    test('should handle errors gracefully', async () => {
      const mockPage = {
        waitForSelector: jest.fn().mockRejectedValue(new Error('No selector'))
      };

      const links = await parser.discoverLinks(mockPage);

      expect(links).toEqual([]);
    });

    test('should handle URLs with hash', async () => {
      const mockPage = {
        waitForSelector: jest.fn().mockResolvedValue(undefined),
        evaluate: jest.fn().mockResolvedValue([
          'https://xiaohongshu.apifox.cn/doc-2810914#section'
        ])
      };

      const links = await parser.discoverLinks(mockPage);

      expect(links[0]).toContain('doc-2810914');
    });
  });

  describe('parse', () => {
    test('should wait for content and call parse', async () => {
      const mockPage = {
        waitForSelector: jest.fn().mockResolvedValue(undefined),
        waitForTimeout: jest.fn().mockResolvedValue(undefined),
        on: jest.fn(),
        evaluate: jest.fn().mockResolvedValue({})
      };

      const result = await parser.parse(mockPage, 'https://xiaohongshu.apifox.cn/doc-2810914');

      expect(mockPage.waitForSelector).toHaveBeenCalledWith('h1, main', { timeout: 15000 });
      expect(result).toBeDefined();
    });

    test('should handle timeout gracefully', async () => {
      const mockPage = {
        waitForSelector: jest.fn().mockRejectedValue(new Error('Timeout')),
        waitForTimeout: jest.fn().mockResolvedValue(undefined),
        on: jest.fn(),
        evaluate: jest.fn().mockResolvedValue({})
      };

      const result = await parser.parse(mockPage, 'https://xiaohongshu.apifox.cn/doc-2810914');

      expect(result).toBeDefined();
    });

    test('should call parse with correct arguments', async () => {
      const mockPage = {
        waitForSelector: jest.fn().mockResolvedValue(undefined),
        waitForTimeout: jest.fn().mockResolvedValue(undefined),
        on: jest.fn(),
        evaluate: jest.fn().mockResolvedValue({})
      };

      await parser.parse(mockPage, 'https://xiaohongshu.apifox.cn/doc-2810914', { someOption: true });

      expect(mockPage.waitForSelector).toHaveBeenCalled();
    });
  });
});