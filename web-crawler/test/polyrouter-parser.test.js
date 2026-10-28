import { jest } from '@jest/globals';
import PolyrouterParser from '../src/parsers/polyrouter-parser.js';

describe('PolyrouterParser', () => {
  let parser;

  beforeEach(() => {
    parser = new PolyrouterParser();
  });

  describe('matches', () => {
    test('should match docs.polyrouter.io URLs', () => {
      expect(parser.matches('https://docs.polyrouter.io/')).toBe(true);
      expect(parser.matches('https://docs.polyrouter.io/api')).toBe(true);
      expect(parser.matches('https://docs.polyrouter.io/api-reference/markets')).toBe(true);
    });

    test('should not match other URLs', () => {
      expect(parser.matches('https://polyrouter.io')).toBe(false);
      expect(parser.matches('https://api.polyrouter.io')).toBe(false);
      expect(parser.matches('https://example.com')).toBe(false);
    });
  });

  describe('getPriority', () => {
    test('should return 100', () => {
      expect(parser.getPriority()).toBe(100);
    });
  });

  describe('generateFilename', () => {
    test('should generate filename from URL path', () => {
      expect(parser.generateFilename('https://docs.polyrouter.io/api/markets')).toBe('api_markets');
      expect(parser.generateFilename('https://docs.polyrouter.io/')).toBe('index');
      expect(parser.generateFilename('https://docs.polyrouter.io')).toBe('index');
    });

    test('should handle invalid URLs', () => {
      expect(parser.generateFilename('invalid-url')).toBe('polyrouter_doc');
    });
  });

  describe('isApiPage', () => {
    test('should detect API reference pages', () => {
      expect(parser.isApiPage('https://docs.polyrouter.io/api-reference/markets')).toBe(true);
      expect(parser.isApiPage('https://docs.polyrouter.io/api-reference/')).toBe(true);
    });

    test('should return false for non-API pages', () => {
      expect(parser.isApiPage('https://docs.polyrouter.io/introduction')).toBe(false);
      expect(parser.isApiPage('https://docs.polyrouter.io/guide')).toBe(false);
    });
  });

  describe('waitForContent', () => {
    test('should wait for Mintlify content', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockResolvedValue(),
        waitForSelector: jest.fn().mockResolvedValue(),
        waitForTimeout: jest.fn().mockResolvedValue()
      };

      await parser.waitForContent(mockPage);

      expect(mockPage.waitForLoadState).toHaveBeenCalledWith('domcontentloaded', { timeout: 10000 });
      expect(mockPage.waitForTimeout).toHaveBeenCalledWith(3000);
    });

    test('should handle timeout gracefully', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockRejectedValue(new Error('timeout')),
        waitForSelector: jest.fn().mockResolvedValue(),
        waitForTimeout: jest.fn().mockResolvedValue()
      };

      await parser.waitForContent(mockPage);

      expect(mockPage.waitForLoadState).toHaveBeenCalled();
    });
  });

  describe('parse', () => {
    test('should parse API documentation page', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockResolvedValue(),
        waitForSelector: jest.fn().mockResolvedValue(),
        waitForTimeout: jest.fn().mockResolvedValue(),
        evaluate: jest.fn().mockResolvedValue({
          title: 'Markets API',
          subtitle: 'Get market predictions',
          description: 'API for prediction markets',
          endpoint: { method: 'GET', path: '/v1/markets' },
          parameters: [],
          responses: [],
          codeExamples: [{ language: 'json', code: '{"markets": []}' }],
          callouts: [],
          warnings: [],
          notes: [],
          sections: [],
          links: [],
          rawContent: 'API content'
        })
      };

      const result = await parser.parse(mockPage, 'https://docs.polyrouter.io/api-reference/markets');

      expect(result.type).toBe('polyrouter-api');
      expect(result.title).toBe('Markets API');
      expect(result.endpoint.method).toBe('GET');
    });

    test('should parse documentation page without API', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockResolvedValue(),
        waitForSelector: jest.fn().mockResolvedValue(),
        waitForTimeout: jest.fn().mockResolvedValue(),
        evaluate: jest.fn().mockResolvedValue({
          title: 'Introduction',
          subtitle: 'Getting started',
          description: 'PolyRouter documentation',
          endpoint: null,
          parameters: [],
          responses: [],
          codeExamples: [],
          callouts: [],
          warnings: [],
          notes: [],
          sections: [{ level: 2, text: 'Quick Start' }],
          links: [],
          rawContent: 'Introduction content'
        })
      };

      const result = await parser.parse(mockPage, 'https://docs.polyrouter.io/introduction');

      expect(result.type).toBe('polyrouter-doc');
      expect(result.title).toBe('Introduction');
    });

    test('should extract code examples with language detection', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockResolvedValue(),
        waitForSelector: jest.fn().mockResolvedValue(),
        waitForTimeout: jest.fn().mockResolvedValue(),
        evaluate: jest.fn().mockResolvedValue({
          title: '',
          subtitle: '',
          description: '',
          endpoint: null,
          parameters: [],
          responses: [],
          codeExamples: [
            { language: 'bash', code: 'curl -X GET' },
            { language: 'python', code: 'import requests' }
          ],
          callouts: [],
          warnings: [],
          notes: [],
          sections: [],
          links: [],
          rawContent: ''
        })
      };

      const result = await parser.parse(mockPage, 'https://docs.polyrouter.io');

      expect(result.codeExamples.length).toBe(2);
    });

    test('should handle parse errors', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockRejectedValue(new Error('error')),
        waitForSelector: jest.fn().mockResolvedValue(),
        waitForTimeout: jest.fn().mockResolvedValue(),
        evaluate: jest.fn().mockResolvedValue({
          title: '',
          subtitle: '',
          description: '',
          endpoint: null,
          parameters: [],
          responses: [],
          codeExamples: [],
          callouts: [],
          warnings: [],
          notes: [],
          sections: [],
          links: [],
          rawContent: ''
        })
      };

      const result = await parser.parse(mockPage, 'https://docs.polyrouter.io');

      expect(result.type).toBe('polyrouter-doc');
    });

    test('should extract tables as parameters', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockResolvedValue(),
        waitForSelector: jest.fn().mockResolvedValue(),
        waitForTimeout: jest.fn().mockResolvedValue(),
        evaluate: jest.fn().mockResolvedValue({
          title: '',
          subtitle: '',
          description: '',
          endpoint: null,
          parameters: [{ index: 0, headers: ['Name', 'Type', 'Description'], rows: [{ Name: 'market_id', Type: 'string', Description: 'Market ID' }] }],
          responses: [],
          codeExamples: [],
          callouts: [],
          warnings: [],
          notes: [],
          sections: [],
          links: [],
          rawContent: ''
        })
      };

      const result = await parser.parse(mockPage, 'https://docs.polyrouter.io/api-reference');

      expect(result.parameters.length).toBe(1);
    });

    test('should clean title suffixes', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockResolvedValue(),
        waitForSelector: jest.fn().mockResolvedValue(),
        waitForTimeout: jest.fn().mockResolvedValue(),
        evaluate: jest.fn().mockResolvedValue({
          title: 'API Reference',
          subtitle: '',
          description: '',
          endpoint: null,
          parameters: [],
          responses: [],
          codeExamples: [],
          callouts: [],
          warnings: [],
          notes: [],
          sections: [],
          links: [],
          rawContent: ''
        })
      };

      const result = await parser.parse(mockPage, 'https://docs.polyrouter.io');

      expect(result.title).toBe('API Reference');
      expect(result.title).not.toContain('PolyRouter');
    });
  });

  describe('parseResponseExamples', () => {
    test('should parse JSON response examples', () => {
      const codeExamples = [
        { language: 'json', code: '{"status": "ok", "data": []}' },
        { language: 'bash', code: 'curl command' }
      ];

      const responses = parser.parseResponseExamples(codeExamples);

      expect(responses.length).toBe(1);
      expect(responses[0].status).toBe(200);
      expect(responses[0].body).toBeDefined();
    });

    test('should handle invalid JSON', () => {
      const codeExamples = [
        { language: 'json', code: 'invalid json' }
      ];

      const responses = parser.parseResponseExamples(codeExamples);

      expect(responses.length).toBe(0);
    });

    test('should handle empty code examples', () => {
      const responses = parser.parseResponseExamples([]);

      expect(responses).toEqual([]);
    });
  });
});