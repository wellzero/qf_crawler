import { jest } from '@jest/globals';
import MintlifyParser from '../src/parsers/mintlify-parser.js';

describe('MintlifyParser', () => {
  let parser;

  beforeEach(() => {
    parser = new MintlifyParser();
  });

  describe('matches', () => {
    test('should match docs.polyrouter.io URLs', () => {
      expect(parser.matches('https://docs.polyrouter.io')).toBe(true);
      expect(parser.matches('https://docs.polyrouter.io/api')).toBe(true);
    });

    test('should match URLs containing mintlify', () => {
      expect(parser.matches('https://mintlify.example.com')).toBe(true);
      expect(parser.matches('https://docs.mintlify.com')).toBe(true);
    });

    test('should match URLs containing /docs/', () => {
      expect(parser.matches('https://example.com/docs/api')).toBe(true);
      expect(parser.matches('https://api.example.com/docs/')).toBe(true);
      expect(parser.matches('https://api.example.com/docs')).toBe(false);
    });

    test('should not match other URLs', () => {
      expect(parser.matches('https://example.com')).toBe(false);
      expect(parser.matches('https://api.example.com')).toBe(false);
    });
  });

  describe('getPriority', () => {
    test('should return 50', () => {
      expect(parser.getPriority()).toBe(50);
    });
  });

  describe('parse', () => {
    test('should parse Mintlify page content', async () => {
      const mockPage = {
        waitForSelector: jest.fn().mockResolvedValue(),
        evaluate: jest.fn().mockResolvedValue({
          title: 'API Documentation',
          subtitle: 'Getting started guide',
          description: '',
          sections: [
            { type: 'heading', level: 2, content: 'Introduction', items: [] },
            { type: 'paragraph', content: 'This is the introduction.' }
          ],
          codeBlocks: [{ language: 'bash', code: 'curl -X GET', index: 0 }],
          warnings: ['This API is deprecated'],
          notes: ['Use v2 instead']
        })
      };

      const result = await parser.parse(mockPage, 'https://docs.polyrouter.io/api');

      expect(result.type).toBe('mintlify-doc');
      expect(result.title).toBe('API Documentation');
      expect(result.description).toBe('Getting started guide');
    });

    test('should extract code blocks with language', async () => {
      const mockPage = {
        waitForSelector: jest.fn().mockResolvedValue(),
        evaluate: jest.fn().mockResolvedValue({
          title: 'Code Examples',
          subtitle: '',
          description: '',
          sections: [],
          codeBlocks: [
            { language: 'python', code: 'import requests', index: 0 },
            { language: 'javascript', code: 'fetch("/api")', index: 1 }
          ],
          warnings: [],
          notes: []
        })
      };

      const result = await parser.parse(mockPage, 'https://docs.polyrouter.io');

      expect(result.codeBlocks.length).toBe(2);
      expect(result.codeBlocks[0].language).toBe('python');
    });

    test('should handle warnings and notes', async () => {
      const mockPage = {
        waitForSelector: jest.fn().mockResolvedValue(),
        evaluate: jest.fn().mockResolvedValue({
          title: 'API',
          subtitle: '',
          description: '',
          sections: [],
          codeBlocks: [],
          warnings: ['Deprecated endpoint'],
          notes: ['Use authentication']
        })
      };

      const result = await parser.parse(mockPage, 'https://docs.polyrouter.io');

      expect(result.warnings.length).toBe(1);
      expect(result.notes.length).toBe(1);
    });

    test('should handle parse errors', async () => {
      const mockPage = {
        waitForSelector: jest.fn().mockRejectedValue(new Error('timeout')),
        evaluate: jest.fn().mockRejectedValue(new Error('evaluate error'))
      };

      const result = await parser.parse(mockPage, 'https://docs.polyrouter.io');

      expect(result.type).toBe('mintlify-doc');
      expect(result.error).toContain('evaluate error');
    });

    test('should build structured content', async () => {
      const mockPage = {
        waitForSelector: jest.fn().mockResolvedValue(),
        evaluate: jest.fn().mockResolvedValue({
          title: 'Guide',
          subtitle: 'Quick start',
          description: '',
          sections: [
            { type: 'heading', level: 2, content: 'Setup', items: [{ type: 'paragraph', content: 'Install first' }] },
            { type: 'list', items: ['Step 1', 'Step 2'] }
          ],
          codeBlocks: [],
          warnings: [],
          notes: []
        })
      };

      const result = await parser.parse(mockPage, 'https://docs.polyrouter.io');

      expect(result.content.length).toBeGreaterThan(0);
    });

    test('should extract tables from sections', async () => {
      const mockPage = {
        waitForSelector: jest.fn().mockResolvedValue(),
        evaluate: jest.fn().mockResolvedValue({
          title: 'Parameters',
          subtitle: '',
          description: '',
          sections: [
            { type: 'table', headers: ['Name', 'Type'], rows: [['id', 'string']] }
          ],
          codeBlocks: [],
          warnings: [],
          notes: []
        })
      };

      const result = await parser.parse(mockPage, 'https://docs.polyrouter.io');

      expect(result.content.some(c => c.type === 'table')).toBe(true);
    });

    test('should clean code blocks from button text', async () => {
      const mockPage = {
        waitForSelector: jest.fn().mockResolvedValue(),
        evaluate: jest.fn().mockResolvedValue({
          title: '',
          subtitle: '',
          description: '',
          sections: [],
          codeBlocks: [{ language: '', code: 'actual code', index: 0 }],
          warnings: [],
          notes: []
        })
      };

      const result = await parser.parse(mockPage, 'https://docs.polyrouter.io');

      expect(result.codeBlocks[0].code).toBe('actual code');
      expect(result.codeBlocks[0].code).not.toContain('Copy');
      expect(result.codeBlocks[0].code).not.toContain('Ask AI');
    });
  });
});