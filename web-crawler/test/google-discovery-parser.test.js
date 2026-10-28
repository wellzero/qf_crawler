import GoogleDiscoveryParser from '../src/parsers/google-discovery-parser.js';

describe('GoogleDiscoveryParser', () => {
  test('should extract top-level and nested methods with important fields', async () => {
    const parser = new GoogleDiscoveryParser();
    const discoveryDoc = {
      title: 'Financial Services API',
      name: 'financialservices',
      version: 'v1',
      rootUrl: 'https://financialservices.googleapis.com/',
      servicePath: '',
      revision: '20260301',
      resources: {
        operations: {
          methods: {
            get: {
              id: 'financialservices.operations.get',
              path: 'v1/{+name}',
              httpMethod: 'GET',
              parameters: { name: { type: 'string' } },
              response: { $ref: 'Operation' }
            }
          }
        }
      },
      methods: {
        listLocations: {
          id: 'financialservices.listLocations',
          path: 'v1/{+name}/locations',
          httpMethod: 'GET',
          parameters: { name: { type: 'string' } },
          response: { $ref: 'ListLocationsResponse' }
        }
      },
      schemas: {
        Operation: { id: 'Operation', type: 'object' }
      },
      parameters: {
        '$.xgafv': { type: 'string' }
      },
      auth: {
        oauth2: {
          scopes: {
            'https://www.googleapis.com/auth/cloud-platform': {
              description: 'See, edit, configure'
            }
          }
        }
      }
    };

    const page = {
      evaluate: async (fn) => {
        const script = fn.toString();
        if (script.includes('details:not([open])')) {
          return null;
        }
        return JSON.stringify(discoveryDoc, null, 2);
      }
    };

    const result = await parser.parse(page, 'https://financialservices.googleapis.com/$discovery/rest?version=v1');

    expect(result.type).toBe('google-discovery-doc');
    expect(result.schemasCount).toBe(1);
    expect(result.parametersCount).toBe(1);
    expect(result.topLevelMethodCount).toBe(1);
    expect(result.endpointCount).toBe(2);
    expect(result.authScopes).toHaveLength(1);
    expect(result.urlRuleInterfaces.some((item) => item.methodName === 'listLocations')).toBe(true);
    expect(result.urlRuleInterfaces.some((item) => item.methodName === 'get')).toBe(true);
  });

  test('should keep json intact when wrapped by other text', async () => {
    const parser = new GoogleDiscoveryParser();
    const source = 'prefix\n{\n  "name": "financialservices",\n  "version": "v1"\n}\nfooter';

    const page = {
      evaluate: async (fn) => {
        const script = fn.toString();
        if (script.includes('details:not([open])')) {
          return null;
        }
        return source;
      }
    };

    const result = await parser.parse(page, 'https://financialservices.googleapis.com/$discovery/rest?version=v1');
    expect(result.serviceName).toBe('financialservices');
    expect(result.version).toBe('v1');
    expect(result.rawContent.trim().startsWith('{')).toBe(true);
    expect(result.rawContent.trim().endsWith('}')).toBe(true);
  });
});
