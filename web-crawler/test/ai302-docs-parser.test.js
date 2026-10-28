import Ai302DocsParser from '../src/parsers/ai302-docs-parser.js';

describe('Ai302DocsParser', () => {
  let parser;

  beforeEach(() => {
    parser = new Ai302DocsParser();
  });

  test('matches should only match doc.302.ai urls', () => {
    expect(parser.matches('https://doc.302.ai/218999863e0')).toBe(true);
    expect(parser.matches('http://doc.302.ai/1234567d0')).toBe(true);
    expect(parser.matches('https://api.302.ai/v1/chat/completions')).toBe(false);
    expect(parser.matches('https://example.com/218999863e0')).toBe(false);
  });

  test('extractFromHtml should parse method/baseUrl/auth/status and links', () => {
    const html = `
      <html>
        <body>
          <div>POST /v1/chat/completions</div>
          <div>https://api.302.ai/v1</div>
          <div>Authorization: Bearer YOUR_API_KEY</div>
          <div>200: Success</div>
          <a href="https://doc.302.ai/300113204e0">MCP调用</a>
        </body>
      </html>
    `;

    const result = parser.extractFromHtml(html, 'https://doc.302.ai/218999863e0');

    expect(result.method).toBe('POST');
    expect(result.endpoint).toBe('/v1/chat/completions');
    expect(result.baseUrl).toBe('https://api.302.ai/v1');
    expect(result.authentication).toContain('Bearer YOUR_API_KEY');
    expect(result.responseStatuses.length).toBeGreaterThan(0);
    expect(result.relatedLinks).toEqual([
      { title: 'MCP调用', url: 'https://doc.302.ai/300113204e0' }
    ]);
  });

  test('parse should merge DOM and HTML extraction results', async () => {
    const mockPage = {
      waitForSelector: async () => {},
      waitForTimeout: async () => {},
      content: async () => '<div>https://api.302ai.cn/v1</div>',
      evaluate: async () => ({
        title: 'Chat（LLaMA3.2多模态）',
        description: 'OpenAI兼容的对话接口',
        method: 'post',
        endpoint: '/v1/chat/completions',
        baseUrl: '',
        authentication: 'Bearer YOUR_API_KEY',
        requestHeaders: [{ name: 'Authorization', type: 'string', required: true, description: '鉴权头' }],
        parameters: [{ name: 'model', type: 'string', required: true, description: '模型名' }],
        requestBody: { description: 'JSON body' },
        responseStatuses: [{ code: '200', description: '成功' }],
        responseFields: [{ name: 'id', type: 'string', description: '请求ID' }],
        codeExamples: [{ language: 'bash', code: 'curl ...' }],
        requestExamples: [{ language: 'bash', code: 'curl ...' }],
        responseExamples: [{ language: 'json', code: '{"id":"abc"}' }],
        relatedLinks: [{ title: '首页', url: 'https://doc.302.ai/' }],
        rawContent: 'content'
      })
    };

    const result = await parser.parse(mockPage, 'https://doc.302.ai/218999863e0');

    expect(result.type).toBe('ai302-api-doc');
    expect(result.title).toBe('Chat（LLaMA3.2多模态）');
    expect(result.api.method).toBe('POST');
    expect(result.api.endpoint).toBe('/v1/chat/completions');
    expect(result.api.baseUrl).toBe('https://api.302ai.cn/v1');
    expect(result.requestHeaders).toHaveLength(1);
    expect(result.parameters).toHaveLength(1);
    expect(result.responseFields).toHaveLength(1);
    expect(result.codeExamples).toHaveLength(1);
    expect(result.parser).toBe('Ai302DocsParser');
  });
});
