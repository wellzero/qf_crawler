import { jest } from '@jest/globals';
import ItickApiParser from '../src/parsers/itick-api-parser.js';

describe('ItickApiParser', () => {
  let parser;

  beforeEach(() => {
    parser = new ItickApiParser();
  });

  describe('matches', () => {
    test('should match docs.itick.org URLs', () => {
      expect(parser.matches('https://docs.itick.org')).toBe(true);
      expect(parser.matches('https://docs.itick.org/api')).toBe(true);
      expect(parser.matches('https://docs.itick.org/introduction')).toBe(true);
    });

    test('should not match other URLs', () => {
      expect(parser.matches('https://itick.org')).toBe(false);
      expect(parser.matches('https://api.itick.org')).toBe(false);
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
      expect(parser.generateFilename('https://docs.itick.org/api/introduction')).toBe('api_introduction');
      expect(parser.generateFilename('https://docs.itick.org/')).toBe('api_overview');
      expect(parser.generateFilename('https://docs.itick.org/stocks')).toBe('stocks');
    });

    test('should handle invalid URLs', () => {
      expect(parser.generateFilename('invalid-url')).toBe('itick_doc');
    });
  });

  describe('waitForContent', () => {
    test('should wait for page content', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockResolvedValue(),
        waitForSelector: jest.fn().mockResolvedValue(),
        waitForTimeout: jest.fn().mockResolvedValue()
      };

      await parser.waitForContent(mockPage);

      expect(mockPage.waitForLoadState).toHaveBeenCalledWith('networkidle', { timeout: 30000 });
    });

    test('should handle timeout gracefully', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockRejectedValue(new Error('timeout')),
        waitForSelector: jest.fn().mockRejectedValue(new Error('timeout')),
        waitForTimeout: jest.fn().mockResolvedValue()
      };

      await parser.waitForContent(mockPage);
    });
  });

  describe('parse', () => {
    test('should parse API documentation page', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockResolvedValue(),
        waitForSelector: jest.fn().mockResolvedValue(),
        waitForTimeout: jest.fn().mockResolvedValue(),
        evaluate: jest.fn().mockResolvedValue({
          title: 'Stock API',
          description: 'Get stock data',
          endpoint: '/api/stocks',
          method: 'GET',
          parameters: [{ name: 'symbol', type: 'string', required: true, description: 'Stock symbol' }],
          responseFields: [{ name: 'price', type: 'number', description: 'Current price' }],
          codeExamples: [{ language: 'bash', code: 'curl https://api.itick.io/stocks' }],
          rawContent: '',
          sections: [],
          markdownContent: ''
        })
      };

      const result = await parser.parse(mockPage, 'https://docs.itick.org/api/stocks');

      expect(result.type).toBe('itick-api');
      expect(result.title).toBe('Stock API');
      expect(result.api.method).toBe('GET');
      expect(result.api.endpoint).toBe('/api/stocks');
      expect(result.parameters.length).toBe(1);
    });

    test('should parse documentation page without API info', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockResolvedValue(),
        waitForSelector: jest.fn().mockResolvedValue(),
        waitForTimeout: jest.fn().mockResolvedValue(),
        evaluate: jest.fn().mockResolvedValue({
          title: 'Documentation',
          description: 'General docs',
          endpoint: '',
          method: 'GET',
          parameters: [],
          responseFields: [],
          codeExamples: [],
          rawContent: '',
          sections: [{ title: 'Introduction', content: 'Welcome' }],
          markdownContent: '# Introduction\nWelcome'
        })
      };

      const result = await parser.parse(mockPage, 'https://docs.itick.org/docs');

      expect(result.type).toBe('itick-doc');
      expect(result.sections.length).toBe(1);
    });

    test('should handle parse errors', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockRejectedValue(new Error('load error')),
        waitForSelector: jest.fn().mockResolvedValue(),
        waitForTimeout: jest.fn().mockResolvedValue(),
        evaluate: jest.fn().mockResolvedValue({
          title: '',
          description: '',
          endpoint: '',
          method: 'GET',
          parameters: [],
          responseFields: [],
          codeExamples: [],
          rawContent: '',
          sections: [],
          markdownContent: ''
        })
      };

      const result = await parser.parse(mockPage, 'https://docs.itick.org/docs');

      expect(result.type).toBe('itick-doc');
      expect(result.suggestedFilename).toBe('docs');
    });

    test('should detect API pages by URL pattern', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockResolvedValue(),
        waitForSelector: jest.fn().mockResolvedValue(),
        waitForTimeout: jest.fn().mockResolvedValue(),
        evaluate: jest.fn().mockResolvedValue({
          title: 'API',
          description: '',
          endpoint: '',
          method: 'GET',
          parameters: [],
          responseFields: [],
          codeExamples: [],
          rawContent: '',
          sections: [],
          markdownContent: ''
        })
      };

      const result = await parser.parse(mockPage, 'https://docs.itick.org/api/endpoint');

      expect(result.type).toBe('itick-api');
    });

    test('should extract tables as parameters', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockResolvedValue(),
        waitForSelector: jest.fn().mockResolvedValue(),
        waitForTimeout: jest.fn().mockResolvedValue(),
        evaluate: jest.fn().mockResolvedValue({
          title: 'API',
          description: '',
          endpoint: '/api/test',
          method: 'GET',
          parameters: [
            { name: 'param1', type: 'string', required: true, description: 'First param' },
            { name: 'param2', type: 'number', required: false, description: 'Second param' }
          ],
          responseFields: [],
          codeExamples: [],
          rawContent: '',
          sections: [],
          markdownContent: ''
        })
      };

      const result = await parser.parse(mockPage, 'https://docs.itick.org/api');

      expect(result.parameters.length).toBe(2);
      expect(result.parameters[0].required).toBe(true);
      expect(result.parameters[1].required).toBe(false);
    });

    test('should extract code examples', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockResolvedValue(),
        waitForSelector: jest.fn().mockResolvedValue(),
        waitForTimeout: jest.fn().mockResolvedValue(),
        evaluate: jest.fn().mockResolvedValue({
          title: 'API',
          description: '',
          endpoint: '/api/test',
          method: 'GET',
          parameters: [],
          responseFields: [],
          codeExamples: [
            { language: 'python', code: 'import requests' },
            { language: 'json', code: '{"data": "value"}' }
          ],
          rawContent: '',
          sections: [],
          markdownContent: ''
        })
      };

      const result = await parser.parse(mockPage, 'https://docs.itick.org/api');

      expect(result.codeExamples.length).toBe(2);
    });
  });
});