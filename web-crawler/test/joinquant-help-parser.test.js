import { jest } from '@jest/globals';
import JoinquantHelpParser from '../src/parsers/joinquant-help-parser.js';

describe('JoinquantHelpParser', () => {
  let parser;

  beforeEach(() => {
    parser = new JoinquantHelpParser();
  });

  describe('matches', () => {
    test('should match joinquant help URLs', () => {
      expect(parser.matches('https://www.joinquant.com/help/api/help')).toBe(true);
      expect(parser.matches('https://www.joinquant.com/help/api/doc')).toBe(true);
      expect(parser.matches('https://www.joinquant.com/help/api/help?name=JQData')).toBe(true);
    });

    test('should not match other URLs', () => {
      expect(parser.matches('https://www.joinquant.com')).toBe(false);
      expect(parser.matches('https://www.joinquant.com/post')).toBe(false);
      expect(parser.matches('https://example.com')).toBe(false);
    });
  });

  describe('getPriority', () => {
    test('should return 130', () => {
      expect(parser.getPriority()).toBe(130);
    });
  });

  describe('supportsLinkDiscovery', () => {
    test('should return true', () => {
      expect(parser.supportsLinkDiscovery()).toBe(true);
    });
  });

  describe('normalizeHelpUrl', () => {
    test('should normalize valid URLs', () => {
      const result = parser.normalizeHelpUrl('https://www.joinquant.com/help/api/help');
      expect(result).toBe('https://www.joinquant.com/help/api/help');
    });

    test('should return null for invalid URLs', () => {
      expect(parser.normalizeHelpUrl('https://example.com')).toBe(null);
      expect(parser.normalizeHelpUrl('invalid-url')).toBe(null);
    });

    test('should preserve hash parameters', () => {
      const result = parser.normalizeHelpUrl('https://www.joinquant.com/help/api/help#section');
      expect(result).toContain('#section');
    });
  });

  describe('sanitizeFilename', () => {
    test('should remove special characters', () => {
      expect(parser.sanitizeFilename('test#file?name')).toBe('test_file_name');
      expect(parser.sanitizeFilename('file:name=value')).toBe('file_name_value');
    });

    test('should replace spaces with underscores', () => {
      expect(parser.sanitizeFilename('test file name')).toBe('test_file_name');
    });

    test('should collapse multiple underscores', () => {
      expect(parser.sanitizeFilename('test___file')).toBe('test_file');
    });

    test('should truncate long filenames', () => {
      const longName = 'a'.repeat(150);
      expect(parser.sanitizeFilename(longName).length).toBeLessThanOrEqual(120);
    });
  });

  describe('buildSuggestedFilename', () => {
    test('should build filename from URL components', () => {
      const result = parser.buildSuggestedFilename(
        'https://www.joinquant.com/help/api/help?name=JQData#section',
        'Test Title'
      );
      expect(result).toContain('help');
      expect(result).toContain('JQData');
    });

    test('should handle URLs without query params', () => {
      const result = parser.buildSuggestedFilename(
        'https://www.joinquant.com/help/api/doc',
        'Documentation'
      );
      expect(result).toContain('doc');
    });
  });

  describe('waitForJoinquantContent', () => {
    test('should wait for content selectors', async () => {
      const mockPage = {
        waitForSelector: jest.fn().mockResolvedValue(),
        waitForTimeout: jest.fn().mockResolvedValue()
      };

      await parser.waitForJoinquantContent(mockPage);

      expect(mockPage.waitForSelector).toHaveBeenCalled();
    });

    test('should handle timeout gracefully', async () => {
      const mockPage = {
        waitForSelector: jest.fn().mockRejectedValue(new Error('timeout')),
        waitForTimeout: jest.fn().mockResolvedValue()
      };

      await parser.waitForJoinquantContent(mockPage);

      expect(mockPage.waitForTimeout).toHaveBeenCalled();
    });
  });

  describe('discoverLinks', () => {
    test('should discover links from page', async () => {
      const mockPage = {
        waitForSelector: jest.fn().mockResolvedValue(),
        waitForTimeout: jest.fn().mockResolvedValue(),
        url: jest.fn().mockReturnValue('https://www.joinquant.com/help/api/help'),
        evaluate: jest.fn().mockResolvedValue([
          'https://www.joinquant.com/help/api/help#name:JQData',
          'https://www.joinquant.com/help/api/help?name=API'
        ])
      };

      const links = await parser.discoverLinks(mockPage);

      expect(links.length).toBeGreaterThan(0);
    });

    test('should filter invalid links', async () => {
      const mockPage = {
        waitForSelector: jest.fn().mockResolvedValue(),
        waitForTimeout: jest.fn().mockResolvedValue(),
        url: jest.fn().mockReturnValue('https://www.joinquant.com/help/api/help'),
        evaluate: jest.fn().mockResolvedValue([
          'https://example.com',
          'javascript:void(0)',
          'https://www.joinquant.com/help/api/help#name:valid'
        ])
      };

      const links = await parser.discoverLinks(mockPage);

      expect(links.every(l => l.includes('joinquant.com'))).toBe(true);
    });

    test('should sort links alphabetically', async () => {
      const mockPage = {
        waitForSelector: jest.fn().mockResolvedValue(),
        waitForTimeout: jest.fn().mockResolvedValue(),
        url: jest.fn().mockReturnValue('https://www.joinquant.com/help/api/help'),
        evaluate: jest.fn().mockResolvedValue([
          'https://www.joinquant.com/help/api/help?name=B',
          'https://www.joinquant.com/help/api/help?name=A'
        ])
      };

      const links = await parser.discoverLinks(mockPage);

      expect(links[0]).toContain('name=A');
    });
  });

  describe('parse', () => {
    test('should parse page content', async () => {
      const mockPage = {
        waitForSelector: jest.fn().mockResolvedValue(),
        waitForTimeout: jest.fn().mockResolvedValue(),
        url: jest.fn().mockReturnValue('https://www.joinquant.com/help/api/help'),
        evaluate: jest.fn().mockResolvedValue({
          url: 'https://www.joinquant.com/help/api/help',
          actualUrl: 'https://www.joinquant.com/help/api/help',
          title: 'JQData API',
          description: 'API Documentation',
          headings: [],
          paragraphs: ['Introduction text'],
          lists: [],
          tables: [],
          codeBlocks: [],
          blockquotes: [],
          mainContent: []
        })
      };

      const result = await parser.parse(mockPage, 'https://www.joinquant.com/help/api/help');

      expect(result.type).toBe('generic');
      expect(result.parser).toBe('JoinquantHelpParser');
      expect(result.title).toBe('JQData API');
    });

    test('should handle hash-based navigation', async () => {
      const mockPage = {
        waitForSelector: jest.fn().mockResolvedValue(),
        waitForTimeout: jest.fn().mockResolvedValue(),
        url: jest.fn().mockReturnValue('https://www.joinquant.com/help/api/help#section'),
        evaluate: jest.fn().mockResolvedValue({
          url: 'https://www.joinquant.com/help/api/help#section',
          actualUrl: 'https://www.joinquant.com/help/api/help#section',
          pageKind: 'help',
          hash: 'section',
          title: 'Section Title',
          description: '',
          headings: [{ level: 2, text: 'Section', id: 'section' }],
          paragraphs: [],
          lists: [],
          tables: [],
          codeBlocks: [],
          blockquotes: [],
          mainContent: []
        })
      };

      const result = await parser.parse(mockPage, 'https://www.joinquant.com/help/api/help#section');

      expect(result.sectionHash).toBe('section');
    });

    test('should handle parse errors gracefully', async () => {
      const mockPage = {
        waitForSelector: jest.fn().mockRejectedValue(new Error('error')),
        waitForTimeout: jest.fn().mockResolvedValue(),
        url: jest.fn().mockReturnValue('https://www.joinquant.com/help/api/help'),
        evaluate: jest.fn().mockResolvedValue({
          url: '',
          title: '',
          description: '',
          headings: [],
          paragraphs: [],
          lists: [],
          tables: [],
          codeBlocks: [],
          blockquotes: [],
          mainContent: []
        })
      };

      const result = await parser.parse(mockPage, 'https://www.joinquant.com/help/api/help');

      expect(result.type).toBe('generic');
      expect(result.suggestedFilename).toBeDefined();
    });
  });
});