import ApiDocFormatter, { formatApiDoc, formatApiDocs } from '../src/parsers/formatters/api-doc-formatter.js';

const { UNIFIED_SCHEMA } = ApiDocFormatter;

describe('ApiDocFormatter', () => {
  describe('UNIFIED_SCHEMA', () => {
    test('should define all required fields', () => {
      expect(UNIFIED_SCHEMA.type).toBe('');
      expect(UNIFIED_SCHEMA.url).toBe('');
      expect(UNIFIED_SCHEMA.title).toBe('');
      expect(UNIFIED_SCHEMA.api).toBeDefined();
      expect(UNIFIED_SCHEMA.parameters).toEqual([]);
      expect(UNIFIED_SCHEMA.codeExamples).toEqual([]);
    });
  });

  describe('formatApiDoc', () => {
    test('should format raw API doc data', () => {
      const rawData = {
        type: 'test-api',
        url: 'https://example.com/api',
        title: 'Test API',
        description: 'Test description',
        method: 'GET',
        endpoint: '/api/test',
        parameters: [{ name: 'param', type: 'string', required: true }],
        codeExamples: [{ language: 'json', code: '{}' }],
        rawContent: 'raw'
      };

      const result = formatApiDoc(rawData);

      expect(result.type).toBe('test-api');
      expect(result.url).toBe('https://example.com/api');
      expect(result.title).toBe('Test API');
      expect(result.api.method).toBe('GET');
      expect(result.parameters).toHaveLength(1);
    });

    test('should normalize parameters', () => {
      const rawData = {
        parameters: [
          { name: 'param1', type: 'string', required: true },
          'param2'
        ]
      };

      const result = formatApiDoc(rawData);

      expect(result.parameters).toHaveLength(2);
      expect(result.parameters[0].name).toBe('param1');
      expect(result.parameters[1].name).toBe('param2');
    });

    test('should normalize response fields', () => {
      const rawData = {
        responseFields: [
          { name: 'field1', type: 'string', description: 'desc' },
          'field2'
        ]
      };

      const result = formatApiDoc(rawData);

      expect(result.responseFields).toHaveLength(2);
    });

    test('should normalize code examples', () => {
      const rawData = {
        codeExamples: [
          { language: 'python', code: 'import x' },
          'curl https://api.com'
        ],
        curlExample: 'curl -X GET https://api.com',
        jsonExample: '{"key": "value"}'
      };

      const result = formatApiDoc(rawData);

      expect(result.codeExamples.length).toBeGreaterThan(0);
    });

    test('should handle null/undefined input', () => {
      expect(formatApiDoc(null)).toEqual(UNIFIED_SCHEMA);
      expect(formatApiDoc(undefined)).toEqual(UNIFIED_SCHEMA);
    });

    test('should extract extra fields', () => {
      const rawData = {
        type: 'test',
        customField: 'custom value',
        anotherCustom: { nested: true }
      };

      const result = formatApiDoc(rawData);

      expect(result._extra.customField).toBe('custom value');
      expect(result._extra.anotherCustom).toEqual({ nested: true });
    });

    test('should handle responses field', () => {
      const rawData = {
        responses: [
          { code: '200', description: 'Success' },
          { code: '404', description: 'Not Found' }
        ]
      };

      const result = formatApiDoc(rawData);

      expect(result.responseStatuses).toHaveLength(2);
    });

    test('should normalize request headers', () => {
      const rawData = {
        requestHeaders: [
          { name: 'Authorization', type: 'string', required: true }
        ]
      };

      const result = formatApiDoc(rawData);

      expect(result.requestHeaders).toHaveLength(1);
      expect(result.requestHeaders[0].name).toBe('Authorization');
    });

    test('should normalize notes', () => {
      const rawData = {
        notes: [
          'Note text',
          { type: 'warning', content: 'Warning text' }
        ]
      };

      const result = formatApiDoc(rawData);

      expect(result.notes).toHaveLength(2);
    });

    test('should normalize related links', () => {
      const rawData = {
        relatedLinks: [
          'https://example.com',
          { title: 'Link', url: 'https://link.com' }
        ]
      };

      const result = formatApiDoc(rawData);

      expect(result.relatedLinks).toHaveLength(2);
    });

    test('should generate markdown from raw content', () => {
      const rawData = {
        title: 'API',
        description: 'Desc',
        method: 'GET',
        endpoint: '/api',
        rawContent: 'Content here'
      };

      const result = formatApiDoc(rawData);

      expect(result.markdownContent).toContain('# API');
      expect(result.markdownContent).toContain('Desc');
    });
  });

  describe('formatApiDocs', () => {
    test('should format array of docs', () => {
      const docs = [
        { type: 'api1', title: 'API 1' },
        { type: 'api2', title: 'API 2' }
      ];

      const result = formatApiDocs(docs);

      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('API 1');
      expect(result[1].title).toBe('API 2');
    });

    test('should return empty array for invalid input', () => {
      expect(formatApiDocs(null)).toEqual([]);
      expect(formatApiDocs(undefined)).toEqual([]);
      expect(formatApiDocs('string')).toEqual([]);
    });
  });
});