import { jest } from '@jest/globals';
import MassiveApiParser from '../src/parsers/massive-api-parser.js';

describe('MassiveApiParser', () => {
  let parser;

  beforeEach(() => {
    parser = new MassiveApiParser();
  });

  describe('matches', () => {
    test('should match massive.com/docs URLs', () => {
      expect(parser.matches('https://massive.com/docs')).toBe(true);
      expect(parser.matches('https://massive.com/docs/api')).toBe(true);
      expect(parser.matches('https://massive.com/docs/rest')).toBe(true);
    });

    test('should not match other URLs', () => {
      expect(parser.matches('https://massive.com')).toBe(false);
      expect(parser.matches('https://example.com/docs')).toBe(false);
      expect(parser.matches('https://docs.massive.com')).toBe(false);
    });
  });

  describe('getPriority', () => {
    test('should return 100', () => {
      expect(parser.getPriority()).toBe(100);
    });
  });

  describe('generateFilename', () => {
    test('should generate filename from URL path', () => {
      expect(parser.generateFilename('https://massive.com/docs/api/rest')).toBe('api_rest');
      expect(parser.generateFilename('https://massive.com/docs')).toBe('overview');
      expect(parser.generateFilename('https://massive.com/docs/')).toBe('overview');
    });

    test('should handle invalid URLs', () => {
      expect(parser.generateFilename('invalid-url')).toBe('api_doc');
    });
  });

  describe('extractDocPath', () => {
    test('should extract path from URL', () => {
      expect(parser.extractDocPath('https://massive.com/docs/api/rest')).toBe('api/rest');
      expect(parser.extractDocPath('https://massive.com/docs')).toBe('');
    });

    test('should handle invalid URLs', () => {
      expect(parser.extractDocPath('invalid-url')).toBe('');
    });
  });

  describe('waitForContent', () => {
    test('should wait for SPA content', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockResolvedValue(),
        waitForSelector: jest.fn().mockResolvedValue(),
        waitForTimeout: jest.fn().mockResolvedValue()
      };

      await parser.waitForContent(mockPage);

      expect(mockPage.waitForLoadState).toHaveBeenCalledWith('domcontentloaded', { timeout: 30000 });
      expect(mockPage.waitForTimeout).toHaveBeenCalledWith(2000);
    });

    test('should handle timeout gracefully', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockRejectedValue(new Error('timeout')),
        waitForSelector: jest.fn().mockRejectedValue(new Error('timeout')),
        waitForTimeout: jest.fn().mockResolvedValue()
      };

      await parser.waitForContent(mockPage);

      expect(mockPage.waitForLoadState).toHaveBeenCalled();
    });
  });

  describe('parse', () => {
    test('should parse API documentation', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockResolvedValue(),
        waitForSelector: jest.fn().mockResolvedValue(),
        waitForTimeout: jest.fn().mockResolvedValue(),
        evaluate: jest.fn().mockResolvedValue({
          title: 'REST API',
          description: 'API documentation',
          endpoint: '/v1/data',
          method: 'GET',
          parameters: [{ name: 'limit', type: 'integer', required: false, description: 'Max results' }],
          responseAttributes: [{ name: 'id', type: 'string', description: 'Record ID' }],
          requestBody: null,
          responses: [],
          codeExamples: [{ language: 'bash', code: 'curl -X GET', type: 'request' }],
          rawContent: 'API content'
        })
      };

      const result = await parser.parse(mockPage, 'https://massive.com/docs/api');

      expect(result.type).toBe('massive-api');
      expect(result.title).toBe('REST API');
      expect(result.endpoint).toBe('/v1/data');
      expect(result.parameters.length).toBe(1);
    });

    test('should detect language from code examples', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockResolvedValue(),
        waitForSelector: jest.fn().mockResolvedValue(),
        waitForTimeout: jest.fn().mockResolvedValue(),
        evaluate: jest.fn().mockResolvedValue({
          title: 'API',
          description: '',
          endpoint: '',
          method: '',
          parameters: [],
          responseAttributes: [],
          requestBody: null,
          responses: [],
          codeExamples: [
            { language: 'json', code: '{"status": "ok"}', type: 'response' },
            { language: 'python', code: 'import requests', type: 'code' }
          ],
          rawContent: ''
        })
      };

      const result = await parser.parse(mockPage, 'https://massive.com/docs/api');

      expect(result.codeExamples.length).toBe(2);
    });

    test('should handle errors gracefully', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockRejectedValue(new Error('error')),
        waitForSelector: jest.fn().mockResolvedValue(),
        waitForTimeout: jest.fn().mockResolvedValue(),
        evaluate: jest.fn().mockResolvedValue({
          title: '',
          description: '',
          endpoint: '',
          method: '',
          parameters: [],
          responseAttributes: [],
          requestBody: null,
          responses: [],
          codeExamples: [],
          rawContent: ''
        })
      };

      const result = await parser.parse(mockPage, 'https://massive.com/docs/api');

      expect(result.type).toBe('massive-api');
      expect(result.suggestedFilename).toBeDefined();
    });

    test('should parse WebSocket documentation', async () => {
      const mockPage = {
        waitForLoadState: jest.fn().mockResolvedValue(),
        waitForSelector: jest.fn().mockResolvedValue(),
        waitForTimeout: jest.fn().mockResolvedValue(),
        evaluate: jest.fn().mockResolvedValue({
          title: 'WebSocket API',
          description: 'Real-time data',
          endpoint: '',
          method: '',
          parameters: [],
          responseAttributes: [],
          requestBody: null,
          responses: [],
          codeExamples: [{ language: 'javascript', code: 'wss://stream.massive.com', type: 'websocket' }],
          rawContent: ''
        })
      };

      const result = await parser.parse(mockPage, 'https://massive.com/docs/websocket');

      expect(result.codeExamples[0].type).toBe('websocket');
    });
  });
});