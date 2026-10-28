import { jest } from '@jest/globals';
import LLMDataExtractor from '../src/parsers/llm-data-extractor.js';

describe('LLMDataExtractor', () => {
  let extractor;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      warn: jest.fn(),
      info: jest.fn()
    };
    extractor = new LLMDataExtractor({ enabled: true }, mockLogger);
  });

  describe('constructor', () => {
    test('should initialize with options', () => {
      expect(extractor.options).toEqual({ enabled: true });
      expect(extractor.logger).toBe(mockLogger);
    });

    test('should work without logger', () => {
      const noLoggerExtractor = new LLMDataExtractor({ enabled: true });
      expect(noLoggerExtractor.logger).toBeNull();
    });
  });

  describe('isEnabled', () => {
    test('should return true when enabled', () => {
      expect(extractor.isEnabled()).toBe(true);
    });

    test('should return false when disabled', () => {
      const disabledExtractor = new LLMDataExtractor({ enabled: false });
      expect(disabledExtractor.isEnabled()).toBe(false);
    });

    test('should return false by default', () => {
      const defaultExtractor = new LLMDataExtractor({});
      expect(defaultExtractor.isEnabled()).toBe(false);
    });
  });

  describe('extract', () => {
    test('should return null when disabled', async () => {
      const disabledExtractor = new LLMDataExtractor({ enabled: false });
      const result = await disabledExtractor.extract({});
      expect(result).toBeNull();
    });

    test('should return null when no API key', async () => {
      const result = await extractor.extract({});
      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    test('should use API key from options', async () => {
      const extractorWithKey = new LLMDataExtractor({
        enabled: true,
        apiKey: 'test-key'
      }, mockLogger);

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: '{"records": []}' } }]
        })
      });

      const result = await extractorWithKey.extract({ tables: [] });

      expect(fetch).toHaveBeenCalled();
    });

    test('should use API key from environment', async () => {
      process.env.LLM_API_KEY = 'env-key';
      const envExtractor = new LLMDataExtractor({ enabled: true }, mockLogger);

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: '{"records": []}' } }]
        })
      });

      await envExtractor.extract({ tables: [] });

      expect(fetch).toHaveBeenCalled();
      delete process.env.LLM_API_KEY;
    });

    test('should handle HTTP errors', async () => {
      const extractorWithKey = new LLMDataExtractor({
        enabled: true,
        apiKey: 'test-key'
      }, mockLogger);

      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: jest.fn().mockResolvedValue('Internal Server Error')
      });

      const result = await extractorWithKey.extract({ tables: [] });

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    test('should handle network errors', async () => {
      const extractorWithKey = new LLMDataExtractor({
        enabled: true,
        apiKey: 'test-key'
      }, mockLogger);

      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const result = await extractorWithKey.extract({ tables: [] });

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    test('should handle empty response', async () => {
      const extractorWithKey = new LLMDataExtractor({
        enabled: true,
        apiKey: 'test-key'
      }, mockLogger);

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: null } }]
        })
      });

      const result = await extractorWithKey.extract({ tables: [] });

      expect(result).toBeNull();
    });

    test('should return extracted records', async () => {
      const extractorWithKey = new LLMDataExtractor({
        enabled: true,
        apiKey: 'test-key'
      }, mockLogger);

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [{
            message: {
              content: '{"records": [{"date": "2024-01-01", "metric": "price", "value": 100}], "schema": {"fields": ["date", "metric", "value"]}, "notes": "test"}'
            }
          }]
        })
      });

      const result = await extractorWithKey.extract({ tables: [] });

      expect(result.records.length).toBe(1);
      expect(result.schema).toBeDefined();
    });
  });

  describe('buildPrompt', () => {
    test('should build prompt with page data', () => {
      const pageData = {
        title: 'Test Page',
        type: 'api',
        tables: [{ headers: ['col1'], rows: [['val1']] }],
        chartData: [],
        tabsAndDropdowns: []
      };

      const prompt = extractor.buildPrompt(pageData, { url: 'https://example.com' }, 50);

      expect(prompt).toContain('Test Page');
      expect(prompt).toContain('https://example.com');
    });

    test('should include sample tables', () => {
      const pageData = {
        tables: [
          { headers: ['Name', 'Value'], rows: [['a', '1'], ['b', '2'], ['c', '3']] }
        ]
      };

      const prompt = extractor.buildPrompt(pageData, {}, 50);

      expect(prompt).toContain('sampleTables');
    });

    test('should limit records count', () => {
      const pageData = { tables: [] };
      const prompt = extractor.buildPrompt(pageData, {}, 10);

      expect(prompt).toContain('10');
    });

    test('should use custom user prompt', () => {
      const customExtractor = new LLMDataExtractor({
        enabled: true,
        userPrompt: 'Custom extraction instruction'
      });

      const prompt = customExtractor.buildPrompt({}, {}, 50);

      expect(prompt).toContain('Custom extraction instruction');
    });
  });

  describe('safeParseJson', () => {
    test('should parse valid JSON', () => {
      const result = extractor.safeParseJson('{"key": "value"}');
      expect(result).toEqual({ key: 'value' });
    });

    test('should handle invalid JSON', () => {
      const result = extractor.safeParseJson('invalid json');
      expect(result).toBeNull();
    });

    test('should parse fenced JSON', () => {
      const result = extractor.safeParseJson('```json\n{"key": "value"}\n```');
      expect(result).toEqual({ key: 'value' });
    });

    test('should parse generic fenced content', () => {
      const result = extractor.safeParseJson('```\n{"key": "value"}\n```');
      expect(result).toEqual({ key: 'value' });
    });

    test('should handle invalid fenced JSON', () => {
      const result = extractor.safeParseJson('```json\ninvalid\n```');
      expect(result).toBeNull();
    });
  });

  describe('configuration options', () => {
    test('should use custom endpoint', () => {
      const customExtractor = new LLMDataExtractor({
        enabled: true,
        apiKey: 'key',
        endpoint: 'https://custom.llm.api'
      }, mockLogger);

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ choices: [{ message: { content: '{"records": []}' } }] })
      });

      customExtractor.extract({ tables: [] });

      expect(fetch).toHaveBeenCalledWith('https://custom.llm.api', expect.any(Object));
    });

    test('should use custom model', () => {
      const customExtractor = new LLMDataExtractor({
        enabled: true,
        apiKey: 'key',
        model: 'custom-model'
      }, mockLogger);

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ choices: [{ message: { content: '{"records": []}' } }] })
      });

      customExtractor.extract({ tables: [] });

      const callArgs = JSON.parse(fetch.mock.calls[0][1].body);
      expect(callArgs.model).toBe('custom-model');
    });

    test('should use environment endpoint', () => {
      process.env.LLM_API_ENDPOINT = 'https://env.endpoint';
      const envExtractor = new LLMDataExtractor({ enabled: true, apiKey: 'key' }, mockLogger);

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ choices: [{ message: { content: '{"records": []}' } }] })
      });

      envExtractor.extract({ tables: [] });

      expect(fetch).toHaveBeenCalledWith('https://env.endpoint', expect.any(Object));
      delete process.env.LLM_API_ENDPOINT;
    });

    test('should use environment model', () => {
      process.env.LLM_MODEL = 'env-model';
      const envExtractor = new LLMDataExtractor({ enabled: true, apiKey: 'key' }, mockLogger);

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ choices: [{ message: { content: '{"records": []}' } }] })
      });

      envExtractor.extract({ tables: [] });

      const callArgs = JSON.parse(fetch.mock.calls[0][1].body);
      expect(callArgs.model).toBe('env-model');
      delete process.env.LLM_MODEL;
    });
  });
});