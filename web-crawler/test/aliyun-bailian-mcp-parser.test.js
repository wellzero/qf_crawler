import AliyunBailianMcpParser from '../src/parsers/aliyun-bailian-mcp-parser.js';

describe('AliyunBailianMcpParser', () => {
  let parser;

  beforeEach(() => {
    parser = new AliyunBailianMcpParser();
  });

  test('extracts detail links from nested api payloads', () => {
    const payloads = [
      {
        data: {
          DataV2: {
            data: {
              data: {
                mcpServerDetailList: [
                  { serverCode: 'code_interpreter_mcp' },
                  { serverCode: 'amap_map_mcp' }
                ]
              }
            }
          }
        }
      }
    ];

    const links = parser.getDetailLinksFromApiData(payloads);

    expect(links).toContain('https://bailian.console.aliyun.com/cn-beijing/?tab=mcp#/mcp-market/detail/code_interpreter_mcp');
    expect(links).toContain('https://bailian.console.aliyun.com/cn-beijing/?tab=mcp#/mcp-market/detail/amap_map_mcp');
    expect(links).toHaveLength(2);
  });

  test('extracts detail links from json-string payload content', () => {
    const payloads = [
      {
        data: JSON.stringify({
          blocks: [
            { serverCode: 'aliyun_search_mcp' },
            { link: '#/mcp-market/detail/enterprise_query_mcp' }
          ]
        })
      }
    ];

    const links = parser.getDetailLinksFromApiData(payloads);

    expect(links).toContain('https://bailian.console.aliyun.com/cn-beijing/?tab=mcp#/mcp-market/detail/aliyun_search_mcp');
    expect(links).toContain('https://bailian.console.aliyun.com/cn-beijing/?tab=mcp#/mcp-market/detail/enterprise_query_mcp');
    expect(links).toHaveLength(2);
  });
});
