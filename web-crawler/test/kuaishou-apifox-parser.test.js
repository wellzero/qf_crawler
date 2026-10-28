import { jest } from '@jest/globals';
import KuaishouApifoxParser from '../src/parsers/kuaishou-apifox-parser.js';

describe('KuaishouApifoxParser', () => {
  let parser;

  beforeEach(() => {
    parser = new KuaishouApifoxParser();
  });

  describe('matches', () => {
    test('should match kuaishou.apifox.cn URLs', () => {
      expect(parser.matches('https://kuaishou.apifox.cn/')).toBe(true);
      expect(parser.matches('https://kuaishou.apifox.cn/api-123')).toBe(true);
      expect(parser.matches('https://kuaishou.apifox.cn/doc-456')).toBe(true);
    });

    test('should not match other URLs', () => {
      expect(parser.matches('https://apifox.cn')).toBe(false);
      expect(parser.matches('https://example.com')).toBe(false);
      expect(parser.matches('https://kuaishou.com')).toBe(false);
    });
  });

  describe('getPriority', () => {
    test('should return 110', () => {
      expect(parser.getPriority()).toBe(110);
    });
  });

  describe('supportsLinkDiscovery', () => {
    test('should return true', () => {
      expect(parser.supportsLinkDiscovery()).toBe(true);
    });
  });

  describe('discoverLinks', () => {
    test('should discover links from DOM and HTML', async () => {
      const mockPage = {
        waitForTimeout: jest.fn().mockResolvedValue(),
        evaluate: jest.fn().mockResolvedValue([
          'https://kuaishou.apifox.cn/api-123',
          'https://kuaishou.apifox.cn/doc-456'
        ]),
        content: jest.fn().mockResolvedValue('<a href="/api-789">Link</a>')
      };

      const links = await parser.discoverLinks(mockPage);

      expect(links.length).toBeGreaterThan(0);
      expect(links.every(l => l.includes('kuaishou.apifox.cn'))).toBe(true);
    });

    test('should deduplicate links', async () => {
      const mockPage = {
        waitForTimeout: jest.fn().mockResolvedValue(),
        evaluate: jest.fn().mockResolvedValue([
          'https://kuaishou.apifox.cn/api-123',
          'https://kuaishou.apifox.cn/api-123'
        ]),
        content: jest.fn().mockResolvedValue('')
      };

      const links = await parser.discoverLinks(mockPage);

      const uniqueLinks = [...new Set(links)];
      expect(links.length).toBe(uniqueLinks.length);
    });

    test('should extract links from HTML content', async () => {
      const mockPage = {
        waitForTimeout: jest.fn().mockResolvedValue(),
        evaluate: jest.fn().mockResolvedValue([]),
        content: jest.fn().mockResolvedValue('<html><body>/api-123 /doc-456</body></html>')
      };

      const links = await parser.discoverLinks(mockPage);

      expect(links.some(l => l.includes('api-123') || l.includes('doc-456'))).toBe(true);
    });
  });

  describe('parse', () => {
    test('should parse API documentation', async () => {
      const mockPage = {
        waitForFunction: jest.fn().mockResolvedValue(),
        waitForTimeout: jest.fn().mockResolvedValue(),
        evaluate: jest.fn().mockResolvedValue({
          description: 'API Description',
          method: 'GET',
          endpoint: '/api/v1/test',
          baseUrl: 'https://api.kuaishou.com',
          parameters: [{ name: 'param1', type: 'string', required: true, description: 'First param' }],
          responseFields: [{ name: 'field1', type: 'string', description: 'Response field' }],
          codeExamples: [{ language: 'bash', code: 'curl -X GET https://api.kuaishou.com' }],
          rawContent: 'Raw content'
        })
      };

      parser.extractTitle = jest.fn().mockResolvedValue('API Title');

      const result = await parser.parse(mockPage, 'https://kuaishou.apifox.cn/api-123');

      expect(result.type).toBe('kuaishou-apifox-api');
      expect(result.title).toBe('API Title');
      expect(result.api.method).toBe('GET');
      expect(result.parameters.length).toBe(1);
    });

    test('should parse parameters from tables', async () => {
      const mockPage = {
        waitForFunction: jest.fn().mockResolvedValue(),
        waitForTimeout: jest.fn().mockResolvedValue(),
        evaluate: jest.fn().mockResolvedValue({
          description: '',
          method: '',
          endpoint: '',
          baseUrl: '',
          parameters: [
            { name: 'id', type: 'integer', required: true, description: 'Resource ID' },
            { name: 'name', type: 'string', required: false, description: 'Resource name' }
          ],
          responseFields: [],
          codeExamples: [],
          rawContent: ''
        })
      };

      parser.extractTitle = jest.fn().mockResolvedValue('API');

      const result = await parser.parse(mockPage, 'https://kuaishou.apifox.cn/api-123');

      expect(result.parameters.length).toBe(2);
      expect(result.parameters[0].required).toBe(true);
    });

    test('should handle parse errors', async () => {
      const mockPage = {
        waitForFunction: jest.fn().mockRejectedValue(new Error('error')),
        waitForTimeout: jest.fn().mockResolvedValue(),
        evaluate: jest.fn().mockResolvedValue({
          description: '',
          method: '',
          endpoint: '',
          baseUrl: '',
          parameters: [],
          responseFields: [],
          codeExamples: [],
          rawContent: ''
        })
      };

      parser.extractTitle = jest.fn().mockResolvedValue('');

      const result = await parser.parse(mockPage, 'https://kuaishou.apifox.cn/api-123');

      expect(result.type).toBe('kuaishou-apifox-api');
    });

    test('should include metadata from options', async () => {
      const mockPage = {
        waitForFunction: jest.fn().mockResolvedValue(),
        waitForTimeout: jest.fn().mockResolvedValue(),
        evaluate: jest.fn().mockResolvedValue({
          description: '',
          method: '',
          endpoint: '',
          baseUrl: '',
          parameters: [],
          responseFields: [],
          codeExamples: [],
          rawContent: ''
        })
      };

      parser.extractTitle = jest.fn().mockResolvedValue('API');

      const result = await parser.parse(mockPage, 'https://kuaishou.apifox.cn/api-123', {
        metadata: { version: '1.0' }
      });

      expect(result.metadata).toEqual({ version: '1.0' });
    });
  });

  describe('extractTitle', () => {
    test('should extract title from page', async () => {
      const result = await parser.extractTitle({ evaluate: jest.fn().mockResolvedValue('API Title') });
      expect(typeof result).toBe('string');
    });
  });
});