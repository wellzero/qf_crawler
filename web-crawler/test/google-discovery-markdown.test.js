import MarkdownGenerator from '../src/parsers/markdown-generator.js';

describe('Google discovery markdown output', () => {
  test('should preserve key fields and keep markdown table safe', () => {
    const generator = new MarkdownGenerator();
    const pageData = {
      type: 'google-discovery-doc',
      title: 'Financial Services API Discovery (v1)',
      url: 'https://financialservices.googleapis.com/$discovery/rest?version=v1',
      serviceName: 'financialservices',
      canonicalName: 'FinancialServices',
      version: 'v1',
      revision: '20260301',
      protocol: 'rest',
      discoveryVersion: 'v1',
      rootUrl: 'https://financialservices.googleapis.com/',
      baseUrl: 'https://financialservices.googleapis.com/',
      servicePath: '',
      basePath: '',
      batchPath: 'batch',
      resourcesCount: 2,
      schemasCount: 5,
      parametersCount: 3,
      topLevelMethodCount: 1,
      endpointCount: 2,
      authScopes: [
        { name: 'scope|read', description: 'line1\nline2' }
      ],
      urlRuleInterfaces: [
        {
          resource: 'operations',
          id: 'financialservices.operations.get',
          httpMethod: 'GET',
          path: 'v1/{+name}',
          fullUrlTemplate: 'https://financialservices.googleapis.com/v1/{+name}',
          parameterCount: 2,
          parameterNames: ['name', 'view|mode'],
          requestRef: 'GetRequest',
          responseRef: 'Operation'
        }
      ],
      rawContent: '{"name":"financialservices"}'
    };

    const markdown = generator.generateGoogleDiscoveryDoc(pageData);
    expect(markdown).toContain('## 完整性摘要');
    expect(markdown).toContain('资源总数（含嵌套）: 2');
    expect(markdown).toContain('scope\\|read');
    expect(markdown).toContain('line1<br>line2');
    expect(markdown).toContain('view\\|mode');
    expect(markdown).toContain('## Discovery 原始内容');
  });
});
