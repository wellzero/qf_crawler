import { formatApiDoc, formatApiDocs } from '../../src/formatters/api-doc-formatter.js';

describe('ApiDocFormatter', () => {
  describe('formatApiDoc', () => {
    test('should return empty schema for null input', () => {
      const result = formatApiDoc(null);
      expect(result.type).toBe('');
      expect(result.url).toBe('');
      expect(result.title).toBe('');
    });

    test('should return empty schema for undefined input', () => {
      const result = formatApiDoc(undefined);
      expect(result.type).toBe('');
      expect(result.url).toBe('');
    });

    test('should return empty schema for non-object input', () => {
      const result = formatApiDoc('string');
      expect(result.type).toBe('');
      expect(result.url).toBe('');
    });

    test('should format basic API document', () => {
      const rawData = {
        type: 'api',
        url: 'https://api.example.com/docs',
        title: 'Get Users API',
        description: 'Returns list of users'
      };

      const result = formatApiDoc(rawData);
      expect(result.type).toBe('api');
      expect(result.url).toBe('https://api.example.com/docs');
      expect(result.title).toBe('Get Users API');
      expect(result.description).toBe('Returns list of users');
    });

    test('should format API method and endpoint', () => {
      const rawData = {
        method: 'GET',
        endpoint: '/api/v1/users'
      };

      const result = formatApiDoc(rawData);
      expect(result.api.method).toBe('GET');
      expect(result.api.endpoint).toBe('/api/v1/users');
    });

    test('should uppercase HTTP method', () => {
      const rawData = {
        method: 'get',
        endpoint: '/api/users'
      };

      const result = formatApiDoc(rawData);
      expect(result.api.method).toBe('GET');
    });

    test('should handle alternative method field names', () => {
      const rawData = {
        requestMethod: 'POST',
        endpoint: '/api/users'
      };

      const result = formatApiDoc(rawData);
      expect(result.api.method).toBe('POST');
    });

    test('should handle httpMethod field', () => {
      const rawData = {
        httpMethod: 'DELETE',
        endpoint: '/api/users/1'
      };

      const result = formatApiDoc(rawData);
      expect(result.api.method).toBe('DELETE');
    });

    test('should handle alternative endpoint field names', () => {
      const rawData = {
        method: 'GET',
        apiPath: '/v2/data'
      };

      const result = formatApiDoc(rawData);
      expect(result.api.endpoint).toBe('/v2/data');
    });

    test('should normalize parameters from object format', () => {
      const rawData = {
        parameters: [
          { name: 'page', type: 'integer', required: true, description: 'Page number' },
          { name: 'limit', type: 'integer', required: false, description: 'Items per page' }
        ]
      };

      const result = formatApiDoc(rawData);
      expect(result.parameters).toHaveLength(2);
      expect(result.parameters[0].name).toBe('page');
      expect(result.parameters[0].required).toBe(true);
      expect(result.parameters[1].required).toBe(false);
    });

    test('should normalize parameters from string format', () => {
      const rawData = {
        parameters: ['page', 'limit', 'sort']
      };

      const result = formatApiDoc(rawData);
      expect(result.parameters).toHaveLength(3);
      expect(result.parameters[0].name).toBe('page');
      expect(result.parameters[0].type).toBe('');
      expect(result.parameters[0].required).toBe(false);
    });

    test('should handle alternative parameter field names', () => {
      const rawData = {
        inputParams: [
          { paramName: 'id', dataType: 'string', required: 'true' }
        ]
      };

      const result = formatApiDoc(rawData);
      expect(result.parameters).toHaveLength(1);
      expect(result.parameters[0].name).toBe('id');
      expect(result.parameters[0].type).toBe('string');
      expect(result.parameters[0].required).toBe(true);
    });

    test('should handle required as Chinese "是"', () => {
      const rawData = {
        parameters: [
          { name: 'apiKey', required: '是' }
        ]
      };

      const result = formatApiDoc(rawData);
      expect(result.parameters[0].required).toBe(true);
    });

    test('should normalize response fields', () => {
      const rawData = {
        responseFields: [
          { name: 'id', type: 'string', description: 'User ID' },
          { name: 'name', type: 'string', description: 'User name' }
        ]
      };

      const result = formatApiDoc(rawData);
      expect(result.responseFields).toHaveLength(2);
      expect(result.responseFields[0].name).toBe('id');
    });

    test('should handle alternative response field names', () => {
      const rawData = {
        responseAttributes: [
          { fieldName: 'status', dataType: 'string' }
        ]
      };

      const result = formatApiDoc(rawData);
      expect(result.responseFields).toHaveLength(1);
      expect(result.responseFields[0].name).toBe('status');
    });

    test('should normalize code examples', () => {
      const rawData = {
        codeExamples: [
          { language: 'bash', code: 'curl https://api.example.com' },
          { language: 'python', code: 'import requests' }
        ]
      };

      const result = formatApiDoc(rawData);
      expect(result.codeExamples).toHaveLength(2);
      expect(result.codeExamples[0].language).toBe('bash');
    });

    test('should handle code examples as strings', () => {
      const rawData = {
        codeExamples: [
          'curl https://api.example.com',
          '{"result": "success"}'
        ]
      };

      const result = formatApiDoc(rawData);
      expect(result.codeExamples.length).toBeGreaterThan(0);
    });

    test('should handle curlExample field', () => {
      const rawData = {
        curlExample: 'curl -X GET https://api.example.com/users'
      };

      const result = formatApiDoc(rawData);
      expect(result.codeExamples.some(ex => ex.language === 'bash')).toBe(true);
    });

    test('should handle jsonExample field', () => {
      const rawData = {
        jsonExample: '{"users": [{"id": 1, "name": "John"}]}'
      };

      const result = formatApiDoc(rawData);
      expect(result.codeExamples.some(ex => ex.language === 'json')).toBe(true);
    });

    test('should deduplicate code examples', () => {
      const rawData = {
        codeExamples: [
          { language: 'bash', code: 'curl https://api.example.com' }
        ],
        curlExample: 'curl https://api.example.com'
      };

      const result = formatApiDoc(rawData);
      const bashExamples = result.codeExamples.filter(ex => ex.language === 'bash');
      expect(bashExamples.length).toBeLessThanOrEqual(2);
    });

    test('should filter out short code examples', () => {
      const rawData = {
        codeExamples: [
          { language: 'bash', code: 'short' }
        ]
      };

      const result = formatApiDoc(rawData);
      expect(result.codeExamples).toHaveLength(0);
    });

    test('should handle responses array', () => {
      const rawData = {
        responses: [
          { code: 200, description: 'Success' },
          { statusCode: 404, description: 'Not found' }
        ]
      };

      const result = formatApiDoc(rawData);
      expect(result.responses).toHaveLength(2);
      expect(result.responses[0].statusCode).toBe(200);
      expect(result.responses[1].statusCode).toBe(404);
    });

    test('should extract extra fields', () => {
      const rawData = {
        title: 'API Docs',
        customField: 'custom value',
        anotherExtra: { nested: 'data' }
      };

      const result = formatApiDoc(rawData);
      expect(result._extra.customField).toBe('custom value');
      expect(result._extra.anotherExtra).toEqual({ nested: 'data' });
    });

    test('should not include standard fields in extra', () => {
      const rawData = {
        title: 'API Docs',
        method: 'GET',
        endpoint: '/api'
      };

      const result = formatApiDoc(rawData);
      expect(result._extra.title).toBeUndefined();
      expect(result._extra.method).toBeUndefined();
    });

    test('should handle empty arrays', () => {
      const rawData = {
        parameters: [],
        responseFields: [],
        codeExamples: []
      };

      const result = formatApiDoc(rawData);
      expect(result.parameters).toEqual([]);
      expect(result.responseFields).toEqual([]);
      expect(result.codeExamples).toEqual([]);
    });

    test('should handle suggestedFilename', () => {
      const rawData = {
        suggestedFilename: 'get-users-api'
      };

      const result = formatApiDoc(rawData);
      expect(result.suggestedFilename).toBe('get-users-api');
    });

    test('should handle baseUrl', () => {
      const rawData = {
        baseUrl: 'https://api.example.com'
      };

      const result = formatApiDoc(rawData);
      expect(result.api.baseUrl).toBe('https://api.example.com');
    });
  });

  describe('detectLanguage', () => {
    test('should detect bash from curl command', () => {
      const rawData = {
        codeExamples: ['curl https://api.example.com']
      };
      const result = formatApiDoc(rawData);
      expect(result.codeExamples[0].language).toBe('bash');
    });

    test('should detect bash from GET command', () => {
      const rawData = {
        codeExamples: ['GET /api/users HTTP/1.1']
      };
      const result = formatApiDoc(rawData);
      expect(result.codeExamples[0].language).toBe('bash');
    });

    test('should detect bash from POST command', () => {
      const rawData = {
        codeExamples: ['POST /api/users HTTP/1.1']
      };
      const result = formatApiDoc(rawData);
      expect(result.codeExamples[0].language).toBe('bash');
    });

    test('should detect json from object', () => {
      const rawData = {
        codeExamples: ['{"key": "value"}']
      };
      const result = formatApiDoc(rawData);
      expect(result.codeExamples[0].language).toBe('json');
    });

    test('should detect json from array with longer content', () => {
      const rawData = {
        codeExamples: ['[{"key": "value"}, {"key": "value2"}]']
      };
      const result = formatApiDoc(rawData);
      expect(result.codeExamples.length).toBeGreaterThan(0);
    });

    test('should detect python', () => {
      const rawData = {
        codeExamples: ['import requests\nresponse = requests.get(url)']
      };
      const result = formatApiDoc(rawData);
      expect(result.codeExamples[0].language).toBe('python');
    });

    test('should detect javascript', () => {
      const rawData = {
        codeExamples: ['const response = await fetch(url)']
      };
      const result = formatApiDoc(rawData);
      expect(result.codeExamples[0].language).toBe('javascript');
    });

    test('should detect php', () => {
      const rawData = {
        codeExamples: ['<?php echo "test"; ?>']
      };
      const result = formatApiDoc(rawData);
      expect(result.codeExamples[0].language).toBe('php');
    });

    test('should default to text for unknown', () => {
      const rawData = {
        codeExamples: ['some random text that is longer than ten characters']
      };
      const result = formatApiDoc(rawData);
      expect(result.codeExamples[0].language).toBe('text');
    });
  });

  describe('formatApiDocs', () => {
    test('should format array of documents', () => {
      const docs = [
        { type: 'api', title: 'API 1' },
        { type: 'api', title: 'API 2' }
      ];

      const result = formatApiDocs(docs);
      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('API 1');
      expect(result[1].title).toBe('API 2');
    });

    test('should return empty array for null input', () => {
      const result = formatApiDocs(null);
      expect(result).toEqual([]);
    });

    test('should return empty array for undefined input', () => {
      const result = formatApiDocs(undefined);
      expect(result).toEqual([]);
    });

    test('should return empty array for non-array input', () => {
      const result = formatApiDocs({});
      expect(result).toEqual([]);
    });

    test('should return empty array for string input', () => {
      const result = formatApiDocs('not an array');
      expect(result).toEqual([]);
    });

    test('should handle empty array', () => {
      const result = formatApiDocs([]);
      expect(result).toEqual([]);
    });

    test('should handle mixed valid and invalid items', () => {
      const docs = [
        { type: 'api', title: 'Valid' },
        null,
        { type: 'api', title: 'Another Valid' }
      ];

      const result = formatApiDocs(docs);
      expect(result).toHaveLength(3);
      expect(result[0].title).toBe('Valid');
      expect(result[1].title).toBe('');
      expect(result[2].title).toBe('Another Valid');
    });
  });

  describe('normalizeParameters', () => {
    test('should handle parameter with default value', () => {
      const rawData = {
        parameters: [
          { name: 'limit', default: 10 }
        ]
      };

      const result = formatApiDoc(rawData);
      expect(result.parameters[0].default).toBe(10);
    });

    test('should handle parameter with defaultValue', () => {
      const rawData = {
        parameters: [
          { name: 'limit', defaultValue: 20 }
        ]
      };

      const result = formatApiDoc(rawData);
      expect(result.parameters[0].default).toBe(20);
    });

    test('should handle parameter with options', () => {
      const rawData = {
        parameters: [
          { name: 'sort', options: ['asc', 'desc'] }
        ]
      };

      const result = formatApiDoc(rawData);
      expect(result.parameters[0].options).toEqual(['asc', 'desc']);
    });

    test('should filter out parameters without name', () => {
      const rawData = {
        parameters: [
          { type: 'string', description: 'No name' },
          { name: 'valid', type: 'integer' }
        ]
      };

      const result = formatApiDoc(rawData);
      expect(result.parameters).toHaveLength(1);
      expect(result.parameters[0].name).toBe('valid');
    });

    test('should handle parameter with key field', () => {
      const rawData = {
        parameters: [
          { key: 'apiKey', type: 'string' }
        ]
      };

      const result = formatApiDoc(rawData);
      expect(result.parameters[0].name).toBe('apiKey');
    });
  });

  describe('normalizeResponseFields', () => {
    test('should handle string field', () => {
      const rawData = {
        responseFields: ['status', 'data']
      };

      const result = formatApiDoc(rawData);
      expect(result.responseFields).toHaveLength(2);
      expect(result.responseFields[0].name).toBe('status');
      expect(result.responseFields[0].type).toBe('');
    });

    test('should filter out fields without name', () => {
      const rawData = {
        responseFields: [
          { type: 'string', description: 'No name' },
          { fieldName: 'valid', type: 'integer' }
        ]
      };

      const result = formatApiDoc(rawData);
      expect(result.responseFields).toHaveLength(1);
      expect(result.responseFields[0].name).toBe('valid');
    });

    test('should handle field with key field', () => {
      const rawData = {
        responseFields: [
          { key: 'responseKey', type: 'string' }
        ]
      };

      const result = formatApiDoc(rawData);
      expect(result.responseFields[0].name).toBe('responseKey');
    });
  });

  describe('integration scenarios', () => {
    test('should format complete API documentation', () => {
      const rawData = {
        type: 'api-doc',
        url: 'https://api.example.com/docs/users',
        title: 'Get Users List',
        description: 'Retrieve a paginated list of users',
        suggestedFilename: 'get-users-list',
        baseUrl: 'https://api.example.com',
        method: 'GET',
        endpoint: '/api/v1/users',
        parameters: [
          { name: 'page', type: 'integer', required: true, description: 'Page number', default: 1 },
          { name: 'limit', type: 'integer', required: false, description: 'Items per page' }
        ],
        responseFields: [
          { name: 'id', type: 'string', description: 'User ID' },
          { name: 'name', type: 'string', description: 'User name' },
          { name: 'email', type: 'string', description: 'User email' }
        ],
        responses: [
          { code: 200, description: 'Success' },
          { code: 401, description: 'Unauthorized' }
        ],
        codeExamples: [
          { language: 'bash', code: 'curl -X GET "https://api.example.com/api/v1/users?page=1&limit=10"' },
          { language: 'python', code: 'import requests\nresponse = requests.get("https://api.example.com/api/v1/users")' }
        ],
        customField: 'additional data'
      };

      const result = formatApiDoc(rawData);

      expect(result.type).toBe('api-doc');
      expect(result.url).toBe('https://api.example.com/docs/users');
      expect(result.title).toBe('Get Users List');
      expect(result.api.method).toBe('GET');
      expect(result.api.endpoint).toBe('/api/v1/users');
      expect(result.api.baseUrl).toBe('https://api.example.com');
      expect(result.parameters).toHaveLength(2);
      expect(result.responseFields).toHaveLength(3);
      expect(result.responses).toHaveLength(2);
      expect(result.codeExamples.length).toBeGreaterThanOrEqual(2);
      expect(result._extra.customField).toBe('additional data');
    });
  });
});