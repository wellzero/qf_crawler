import { jest } from '@jest/globals';
import PortalParser from '../src/parsers/portal-parser.js';

describe('PortalParser', () => {
  let parser;

  beforeEach(() => {
    parser = new PortalParser();
  });

  describe('matches', () => {
    test('should match portal homepage URLs', () => {
      expect(parser.matches('https://qq.com')).toBe(true);
      expect(parser.matches('https://www.qq.com')).toBe(true);
      expect(parser.matches('https://sohu.com')).toBe(true);
      expect(parser.matches('https://hao123.com')).toBe(true);
      expect(parser.matches('https://baidu.com')).toBe(true);
    });

    test('should match homepage paths only', () => {
      expect(parser.matches('https://qq.com/')).toBe(true);
      expect(parser.matches('https://qq.com/index.html')).toBe(true);
      expect(parser.matches('https://www.sina.com.cn/')).toBe(true);
    });

    test('should not match non-homepage paths', () => {
      expect(parser.matches('https://qq.com/news')).toBe(false);
      expect(parser.matches('https://qq.com/article/123')).toBe(false);
      expect(parser.matches('https://baidu.com/search')).toBe(false);
    });

    test('should not match non-portal URLs', () => {
      expect(parser.matches('https://example.com')).toBe(false);
      expect(parser.matches('https://unknown-site.com')).toBe(false);
    });

    test('should handle invalid URLs', () => {
      expect(parser.matches('invalid-url')).toBe(false);
    });
  });

  describe('getPriority', () => {
    test('should return 5', () => {
      expect(parser.getPriority()).toBe(5);
    });
  });

  describe('detectByContent', () => {
    test('should detect portal by navigation count', async () => {
      const mockPage = {
        evaluate: jest.fn().mockImplementation((fn) => {
          return Promise.resolve(30);
        })
      };

      const score = await parser.detectByContent(mockPage);

      expect(mockPage.evaluate).toHaveBeenCalled();
      expect(typeof score).toBe('number');
    });

    test('should detect portal by content blocks', async () => {
      const mockPage = {
        evaluate: jest.fn().mockImplementation((fn) => {
          return Promise.resolve(30);
        })
      };

      const score = await parser.detectByContent(mockPage);

      expect(mockPage.evaluate).toHaveBeenCalled();
      expect(typeof score).toBe('number');
    });

    test('should detect portal by hot topics', async () => {
      const mockPage = {
        evaluate: jest.fn().mockImplementation((fn) => {
          return Promise.resolve(20);
        })
      };

      const score = await parser.detectByContent(mockPage);

      expect(mockPage.evaluate).toHaveBeenCalled();
      expect(typeof score).toBe('number');
    });

    test('should detect portal by link count', async () => {
      const mockPage = {
        evaluate: jest.fn().mockImplementation((fn) => {
          return Promise.resolve(20);
        })
      };

      const score = await parser.detectByContent(mockPage);

      expect(mockPage.evaluate).toHaveBeenCalled();
      expect(typeof score).toBe('number');
    });

    test('should return zero for non-portal content', async () => {
      const mockPage = {
        evaluate: jest.fn().mockImplementation((fn) => {
          return Promise.resolve(0);
        })
      };

      const score = await parser.detectByContent(mockPage);

      expect(score).toBe(0);
    });
  });

  describe('extractSiteInfo', () => {
    test('should extract site information', async () => {
      const mockPage = {
        evaluate: jest.fn().mockResolvedValue({
          title: 'Portal Site',
          description: 'Portal description',
          keywords: 'news,portal',
          logo: { src: 'https://example.com/logo.png', alt: 'Logo' }
        })
      };

      const info = await parser.extractSiteInfo(mockPage);

      expect(info.title).toBe('Portal Site');
      expect(info.description).toBe('Portal description');
    });
  });

  describe('extractNavigation', () => {
    test('should extract navigation menus', async () => {
      const mockPage = {
        evaluate: jest.fn().mockResolvedValue([
          { type: 'main', items: [{ text: 'Home', href: 'https://qq.com' }] },
          { type: 'top', items: [{ text: 'Login', href: 'https://qq.com/login' }] }
        ])
      };

      const navigation = await parser.extractNavigation(mockPage);

      expect(navigation.length).toBeGreaterThan(0);
      expect(navigation[0].type).toBe('main');
    });
  });

  describe('extractContentBlocks', () => {
    test('should extract content blocks', async () => {
      const mockPage = {
        evaluate: jest.fn().mockResolvedValue([
          { title: 'News Block', items: [{ text: 'Article 1', href: 'https://qq.com/news/1' }] }
        ])
      };

      const blocks = await parser.extractContentBlocks(mockPage);

      expect(blocks.length).toBeGreaterThan(0);
      expect(blocks[0].title).toBe('News Block');
    });
  });

  describe('extractHotTopics', () => {
    test('should extract hot topics', async () => {
      const mockPage = {
        evaluate: jest.fn().mockResolvedValue([
          { title: 'Hot Search', items: [{ rank: 1, text: 'Topic 1', href: '', hotScore: '100' }] }
        ])
      };

      const topics = await parser.extractHotTopics(mockPage);

      expect(topics.length).toBeGreaterThan(0);
      expect(topics[0].title).toBe('Hot Search');
    });
  });

  describe('extractChannels', () => {
    test('should extract channel categories', async () => {
      const mockPage = {
        evaluate: jest.fn().mockResolvedValue([
          { title: 'Channels', items: [{ text: 'News', href: 'https://qq.com/news' }] }
        ])
      };

      const channels = await parser.extractChannels(mockPage);

      expect(channels.length).toBeGreaterThan(0);
    });
  });

  describe('extractQuickLinks', () => {
    test('should extract quick links', async () => {
      const mockPage = {
        evaluate: jest.fn().mockResolvedValue([
          { title: 'Services', items: [{ text: 'Email', href: 'https://mail.qq.com' }] }
        ])
      };

      const links = await parser.extractQuickLinks(mockPage);

      expect(links.length).toBeGreaterThan(0);
    });
  });

  describe('extractFooter', () => {
    test('should extract footer information', async () => {
      const mockPage = {
        evaluate: jest.fn().mockResolvedValue({
          copyright: 'Copyright 2024',
          links: [{ text: 'About', href: 'https://qq.com/about' }],
          icp: 'ICP备案号'
        })
      };

      const footer = await parser.extractFooter(mockPage);

      expect(footer.copyright).toBe('Copyright 2024');
    });
  });

  describe('parse', () => {
    test('should parse portal page', async () => {
      const mockPage = {
        waitForContent: jest.fn().mockResolvedValue(),
        extractSiteInfo: jest.fn().mockResolvedValue({ title: 'Portal' }),
        extractNavigation: jest.fn().mockResolvedValue([]),
        extractContentBlocks: jest.fn().mockResolvedValue([]),
        extractHotTopics: jest.fn().mockResolvedValue([]),
        extractChannels: jest.fn().mockResolvedValue([]),
        extractQuickLinks: jest.fn().mockResolvedValue([]),
        extractFooter: jest.fn().mockResolvedValue({}),
        extractSidebars: jest.fn().mockResolvedValue([]),
        extractKeyImages: jest.fn().mockResolvedValue([])
      };

      parser.waitForContent = mockPage.waitForContent;
      parser.extractSiteInfo = mockPage.extractSiteInfo;
      parser.extractNavigation = mockPage.extractNavigation;
      parser.extractContentBlocks = mockPage.extractContentBlocks;
      parser.extractHotTopics = mockPage.extractHotTopics;
      parser.extractChannels = mockPage.extractChannels;
      parser.extractQuickLinks = mockPage.extractQuickLinks;
      parser.extractFooter = mockPage.extractFooter;
      parser.extractSidebars = mockPage.extractSidebars;
      parser.extractKeyImages = mockPage.extractKeyImages;

      const result = await parser.parse(mockPage, 'https://qq.com');

      expect(result.type).toBe('portal');
      expect(result.url).toBe('https://qq.com');
    });

    test('should handle parse errors', async () => {
      const mockPage = {
        waitForContent: jest.fn().mockRejectedValue(new Error('error'))
      };

      parser.waitForContent = mockPage.waitForContent;

      const result = await parser.parse(mockPage, 'https://qq.com');

      expect(result.type).toBe('portal');
      expect(result.title).toBe('');
    });
  });
});