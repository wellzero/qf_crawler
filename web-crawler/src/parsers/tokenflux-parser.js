import BaseParser from './base-parser.js';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * TokenFlux Parser - 解析 tokenflux.ai 的 docs 与 MCP 页面
 * 对于 MCP 详情页，直接从 API 获取数据
 */
class TokenfluxParser extends BaseParser {
  matches(url) {
    return /^https?:\/\/tokenflux\.ai\/(docs\/quickstart|mcps(?:\/.*)?)/.test(url);
  }

  getPriority() {
    return 110;
  }

  generateFilename(url) {
    try {
      const urlObj = new URL(url);
      let pathname = urlObj.pathname.replace(/^\//, '').replace(/\/$/, '');
      if (!pathname) return 'tokenflux_index';
      return pathname.replace(/\//g, '_');
    } catch (e) {
      return 'tokenflux_page';
    }
  }

  /**
   * 检查是否为 MCP 详情页 URL
   */
  isMcpDetailPage(url) {
    return /^https?:\/\/tokenflux\.ai\/mcps\/[^/]+$/.test(url);
  }

  /**
   * 从 MCP ID 提取 ID
   */
  extractMcpId(url) {
    const match = url.match(/\/mcps\/([^/]+)$/);
    return match ? match[1] : null;
  }

  /**
   * 直接从 API 获取 MCP 数据
   */
  async fetchMcpApiData(mcpId) {
    const apiUrl = `https://tokenflux.ai/v1/mcps/${mcpId}`;
    try {
      console.log(`  从 API 获取 MCP 数据: ${apiUrl}`);
      const response = await fetch(apiUrl, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'stock-website-crawler/1.0'
        }
      });
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }
      const data = await response.json();
      if (data.success && data.data) {
        console.log(`  ✓ API 返回 ${data.data.tools?.length || 0} 个工具`);
        return data.data;
      }
      return null;
    } catch (error) {
      console.error(`  ✗ API 获取失败: ${error.message}`);
      console.log('  尝试使用 curl 回退获取...');
      try {
        const { stdout } = await execFileAsync('curl', ['-sS', '--fail', '--location', apiUrl], {
          maxBuffer: 10 * 1024 * 1024
        });
        const data = JSON.parse(stdout);
        if (data.success && data.data) {
          console.log(`  ✓ curl 回退成功，返回 ${data.data.tools?.length || 0} 个工具`);
          return data.data;
        }
      } catch (fallbackError) {
        console.error(`  ✗ curl 回退失败: ${fallbackError.message}`);
      }
      return null;
    }
  }

  /**
   * 从工具参数结构中提取参数定义
   * 支持两种结构: body.properties 和 query.properties
   */
  extractParametersFromTool(tool) {
    const parameters = [];
    const params = tool.parameters;

    if (!params?.properties) return parameters;

    const flattenSchema = (schema, prefix = '', inheritedRequired = false, inheritedVisible = true) => {
      if (!schema || typeof schema !== 'object') return;

      const hasProperties = schema.properties && typeof schema.properties === 'object';
      if (!hasProperties) return;

      const requiredList = Array.isArray(schema.required) ? schema.required : [];
      const visibleList = Array.isArray(schema.visible) ? schema.visible : Object.keys(schema.properties);

      for (const [paramName, paramDef] of Object.entries(schema.properties)) {
        const fullName = prefix ? `${prefix}.${paramName}` : paramName;
        const isRequired = inheritedRequired || requiredList.includes(paramName);
        const isVisible = inheritedVisible && visibleList.includes(paramName);

        if (paramDef?.type === 'object' && paramDef.properties) {
          flattenSchema(paramDef, fullName, isRequired, isVisible);
          continue;
        }

        const inferredType = paramDef?.type || (paramDef?.items?.type ? `array<${paramDef.items.type}>` : 'string');
        parameters.push({
          name: fullName,
          type: inferredType,
          required: isRequired,
          description: paramDef?.description || '',
          enum: Array.isArray(paramDef?.enum) ? paramDef.enum : [],
          default: paramDef?.default,
          visible: isVisible
        });
      }
    };

    ['body', 'query', 'path', 'header'].forEach((section) => {
      if (params.properties[section]) {
        flattenSchema(params.properties[section], section);
      }
    });

    return parameters;
  }

  /**
   * 从 API 数据生成内容
   */
  generateContentFromApiData(mcpData) {
    const content = [];

    // 添加描述
    if (mcpData.description) {
      content.push({ type: 'text', content: mcpData.description });
    }

    // 添加认证信息
    if (mcpData.security_schemes?.api_key) {
      const auth = mcpData.security_schemes.api_key;
      content.push({ type: 'heading', content: 'Authentication' });
      content.push({
        type: 'text',
        content: `API Key authentication via ${auth.location}: ${auth.name}`
      });
    }

    // 添加每个工具的详细信息
    if (mcpData.tools && mcpData.tools.length > 0) {
      content.push({ type: 'heading', content: 'Available Tools' });

      for (const tool of mcpData.tools) {
        content.push({ type: 'heading', content: tool.name });
        content.push({ type: 'text', content: tool.description });

        // 添加端点信息
        if (tool.protocol_data) {
          const { method, path, server_url } = tool.protocol_data;
          content.push({
            type: 'code',
            language: 'text',
            code: `${method} ${server_url}${path}`
          });
        }

        // 提取参数
        const parameters = this.extractParametersFromTool(tool);

        if (parameters.length > 0) {
          content.push({ type: 'heading', content: 'Parameters' });

          const paramTexts = [];

          for (const param of parameters) {
            const type = param.type || 'string';
            const required = param.required ? 'Required' : 'Optional';
            const desc = (param.description || '').replace(/\n/g, ' ');
            let paramText = `${param.name} (${type}) [${required}]\n  ${desc}`;

            // 添加 enum 值
            if (param.enum && param.enum.length > 0) {
              paramText += `\n  Options: ${param.enum.slice(0, 20).join(', ')}${param.enum.length > 20 ? '...' : ''}`;
            }

            // 添加默认值
            if (param.default !== undefined) {
              paramText += `\n  Default: ${param.default}`;
            }

            paramTexts.push(paramText);
          }

          content.push({ type: 'text', content: paramTexts.join('\n\n') });
        }

        // 添加示例代码
        if (tool.protocol_data && mcpData.security_schemes?.api_key) {
          const { method, path, server_url } = tool.protocol_data;
          const authHeader = mcpData.security_schemes.api_key.name;
          const hasBody = tool.parameters?.properties?.body;
          const hasQuery = tool.parameters?.properties?.query;

          content.push({ type: 'heading', content: 'Example Request' });

          if (hasBody && method !== 'GET') {
            // POST/PUT 请求使用 JSON body
            const exampleBody = {};
            const bodyProps = tool.parameters.properties.body.properties || {};
            const visibleList = tool.parameters.properties.body.visible || Object.keys(bodyProps);
            for (const key of visibleList.slice(0, 3)) {
              if (bodyProps[key]) {
                if (bodyProps[key].type === 'string') {
                  exampleBody[key] = key === 'query' ? 'your search query' : `example_${key}`;
                } else if (bodyProps[key].type === 'integer') {
                  exampleBody[key] = bodyProps[key].default || 10;
                } else if (bodyProps[key].type === 'boolean') {
                  exampleBody[key] = bodyProps[key].default || false;
                }
              }
            }

            content.push({
              type: 'code',
              language: 'bash',
              code: `curl -X ${method} "${server_url}${path}" \\
  -H "${authHeader}: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(exampleBody, null, 2)}'`
            });
          } else if (hasQuery) {
            // GET 请求使用 query 参数
            const queryParams = Object.keys(tool.parameters.properties.query.properties || {}).slice(0, 2);
            const queryString = queryParams.map(p => `${p}=value`).join('&');

            content.push({
              type: 'code',
              language: 'bash',
              code: `curl -X ${method} "${server_url}${path}?${queryString}" \\
  -H "${authHeader}: YOUR_API_KEY" \\
  -H "Accept: application/json"`
            });
          } else {
            content.push({
              type: 'code',
              language: 'bash',
              code: `curl -X ${method} "${server_url}${path}" \\
  -H "${authHeader}: YOUR_API_KEY"`
            });
          }
        }
      }
    }

    return content;
  }

  /**
   * 构建 API 端点数据用于结构化输出
   */
  buildApiEndpointsFromApiData(mcpData) {
    const apiEndpoints = [];

    if (mcpData.tools && mcpData.tools.length > 0) {
      for (const tool of mcpData.tools) {
        const parameters = this.extractParametersFromTool(tool);

        const endpoint = {
          name: tool.name,
          description: tool.description,
          method: tool.protocol_data?.method || '',
          endpoint: tool.protocol_data ? `${tool.protocol_data.server_url}${tool.protocol_data.path}` : '',
          parameters: parameters,
          tags: tool.tags || []
        };

        apiEndpoints.push(endpoint);
      }
    }

    return apiEndpoints;
  }

  async waitForContent(page) {
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await page.waitForSelector('main, #app, h1', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500).catch(() => {});
  }

  /**
   * 解析单个 API 工具的名称和类型
   * 例如: "EXA_AI__SEARCHPOSTsearch" -> { name: "EXA_AI__SEARCH", method: "POST", operation: "search" }
   */
  parseToolTitle(titleText) {
    // 匹配格式: EXA_AI__SEARCHPOSTsearch
    // 格式: {TOOL_NAME}__{OPERATION}{METHOD}{operationLower}
    const match = titleText.match(/^(.+)__(.+)(GET|POST|PUT|DELETE|PATCH)(.+)$/i);
    if (match) {
      return {
        fullName: titleText,
        toolName: match[1],
        operation: match[2],
        method: match[3].toUpperCase(),
        operationLower: match[4]
      };
    }
    return { fullName: titleText, toolName: titleText, method: '', operation: '', operationLower: '' };
  }

  /**
   * 展开并提取折叠内容（Radix UI Accordion 是 single 模式，同时只能展开一个）
   * 必须逐个点击并立即提取内容，否则下一个点击会关闭前一个
   */
  async expandAndExtractAccordionContent(page) {
    console.log('  展开并提取 Accordion 内容...');

    // 1. 展开所有 <details> 元素
    const detailsCount = await page.evaluate(() => {
      const detailsElements = document.querySelectorAll('details:not([open])');
      detailsElements.forEach(el => el.setAttribute('open', ''));
      return detailsElements.length;
    });
    if (detailsCount > 0) {
      console.log(`    ✓ 展开了 ${detailsCount} 个 details 元素`);
    }

    // 2. 逐个点击 Accordion 触发器并立即提取内容
    const apiTools = [];
    const accordionTriggers = await page.locator('[data-slot="accordion-trigger"]').all();
    console.log(`    发现 ${accordionTriggers.length} 个 Accordion 触发器`);

    for (let i = 0; i < accordionTriggers.length; i++) {
      try {
        const trigger = accordionTriggers[i];
        await trigger.click();
        await page.waitForTimeout(800); // 等待内容加载

        // 立即提取当前展开的内容（结构化解析）
        const toolData = await page.evaluate(() => {
          const text = (el) => (el?.textContent || '').trim();

          // 找到当前展开的 accordion 项
          const openH3 = document.querySelector('h3[data-state="open"]');
          if (!openH3) return null;

          const titleText = text(openH3);

          // 找到内容区域
          const accordionItem = openH3.closest('.border') || openH3.parentElement?.parentElement;
          if (!accordionItem) return { title: titleText };

          const contentRegion = accordionItem.querySelector('[role="region"]');
          if (!contentRegion) return { title: titleText, content: text(accordionItem).replace(titleText, '').trim() };

          // 解析结构化内容
          const result = {
            title: titleText,
            description: '',
            method: '',
            endpoint: '',
            parameters: [],
            responseFields: []
          };

          // 1. 提取描述
          const descEl = contentRegion.querySelector('p.text-muted-foreground');
          if (descEl) {
            result.description = text(descEl);
          }

          // 2. 提取 Method 和 Endpoint
          // 页面结构中有 type 和 Endpoint 信息
          const allText = text(contentRegion);

          // 尝试从分隔线后面的内容提取
          const sections = contentRegion.querySelectorAll('.space-y-4 > div, .pb-4 > div');

          // 查找 Method（通常是 GET/POST/PUT/DELETE/PATCH）
          const methodMatch = allText.match(/\b(GET|POST|PUT|DELETE|PATCH)\b/i);
          if (methodMatch) {
            result.method = methodMatch[1].toUpperCase();
          }

          // 查找 Endpoint URL
          const endpointMatch = allText.match(/(https?:\/\/[^\s<>"']+)/i);
          if (endpointMatch) {
            result.endpoint = endpointMatch[1];
          }

          // 3. 提取参数
          const paramSections = contentRegion.querySelectorAll('.bg-muted.p-3.rounded-lg.border');
          paramSections.forEach(paramEl => {
            // 参数名称
            const nameEl = paramEl.querySelector('.font-mono.font-semibold');
            const paramName = nameEl ? text(nameEl) : '';

            // 参数类型
            const typeBadge = paramEl.querySelector('[data-slot="badge"][data-variant="secondary"]');
            const paramType = typeBadge ? text(typeBadge) : '';

            // 参数描述
            const descP = paramEl.querySelector('p.text-muted-foreground, p.text-sm:last-child');
            const paramDesc = descP ? text(descP) : '';

            // 判断是否必需（根据父容器是否有 "Required" 标题）
            const parentDiv = paramEl.closest('.space-y-2');
            const prevH5 = parentDiv?.previousElementSibling;
            const isRequired = prevH5 && text(prevH5).toLowerCase().includes('required');

            if (paramName) {
              result.parameters.push({
                name: paramName,
                type: paramType,
                required: isRequired,
                description: paramDesc
              });
            }
          });

          // 4. 检查是否有 Required/Optional 参数分组
          const paramGroups = contentRegion.querySelectorAll('h4 + div h5');
          paramGroups.forEach(h5 => {
            const groupLabel = text(h5).toLowerCase();
            const isRequired = groupLabel.includes('required');
            const groupContainer = h5.nextElementSibling;
            if (groupContainer) {
              const params = groupContainer.querySelectorAll('.bg-muted.p-3.rounded-lg.border');
              params.forEach(paramEl => {
                const nameEl = paramEl.querySelector('.font-mono.font-semibold');
                const paramName = nameEl ? text(nameEl) : '';
                const typeBadge = paramEl.querySelector('[data-slot="badge"][data-variant="secondary"]');
                const paramType = typeBadge ? text(typeBadge) : '';

                // 更新必需状态
                const existing = result.parameters.find(p => p.name === paramName);
                if (existing) {
                  existing.required = isRequired;
                }
              });
            }
          });

          // 5. 提取响应字段（如果有）
          const responseSection = contentRegion.querySelector('h4:not(:first-child)');
          if (responseSection && text(responseSection).toLowerCase().includes('response')) {
            const responseContainer = responseSection.nextElementSibling;
            if (responseContainer) {
              const responseParams = responseContainer.querySelectorAll('.bg-muted.p-3.rounded-lg.border');
              responseParams.forEach(paramEl => {
                const nameEl = paramEl.querySelector('.font-mono.font-semibold');
                const fieldName = nameEl ? text(nameEl) : '';
                const typeBadge = paramEl.querySelector('[data-slot="badge"]');
                const fieldType = typeBadge ? text(typeBadge) : '';
                const descP = paramEl.querySelector('p.text-muted-foreground, p.text-sm:last-child');
                const fieldDesc = descP ? text(descP) : '';

                if (fieldName) {
                  result.responseFields.push({
                    name: fieldName,
                    type: fieldType,
                    description: fieldDesc
                  });
                }
              });
            }
          }

          return result;
        });

        if (toolData && toolData.title) {
          // 解析工具标题
          const parsedTitle = this.parseToolTitle(toolData.title);
          const apiTool = {
            name: parsedTitle.toolName || toolData.title,
            fullName: toolData.title,
            description: toolData.description || '',
            method: toolData.method || parsedTitle.method,
            endpoint: toolData.endpoint || '',
            parameters: toolData.parameters || [],
            responseFields: toolData.responseFields || []
          };

          apiTools.push(apiTool);
          const paramCount = apiTool.parameters.length;
          console.log(`    ✓ 提取: ${apiTool.name.substring(0, 40)}... (${paramCount} params, method: ${apiTool.method})`);
        }
      } catch (e) {
        console.log(`    ⚠ 触发器 ${i + 1} 提取失败: ${e.message}`);
        continue;
      }
    }

    console.log(`  ✓ Accordion 内容提取完成，共 ${apiTools.length} 个工具`);
    return apiTools;
  }

  async parse(page, url, options = {}) {
    // 检查是否为 MCP 详情页，如果是则直接从 API 获取数据
    if (this.isMcpDetailPage(url)) {
      const mcpId = this.extractMcpId(url);
      console.log(`检测到 MCP 详情页: ${mcpId}`);

      const mcpData = await this.fetchMcpApiData(mcpId);

      if (mcpData) {
        const content = this.generateContentFromApiData(mcpData);
        const apiEndpoints = this.buildApiEndpointsFromApiData(mcpData);

        return {
          type: 'tokenflux-mcp',
          url,
          title: mcpData.display_name || mcpData.name,
          description: mcpData.description || '',
          content,
          links: [],
          metadata: {
            platform: 'tokenflux',
            mcpId: mcpData.name,
            provider: mcpData.provider,
            version: mcpData.version,
            toolsCount: mcpData.tools?.length || 0,
            categories: mcpData.categories || [],
            securitySchemes: mcpData.security_schemes,
            apiEndpoints
          }
        };
      }

      // 如果 API 获取失败，回退到页面解析
      console.log('  API 获取失败，回退到页面解析');
    }

    await this.waitForContent(page);

    // 展开并提取折叠内容（返回结构化的 API 工具数据）
    const extractedApiTools = await this.expandAndExtractAccordionContent(page);

    const data = await page.evaluate(() => {
      const text = (el) => (el?.textContent || '').trim();
      const unique = (items) => [...new Set(items.filter(Boolean))];

      const title = text(document.querySelector('h1')) ||
        text(document.querySelector('title')) ||
        'Untitled';

      const description =
        document.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() || '';

      const main = document.querySelector('main') || document.querySelector('#app') || document.body;

      const links = unique(
        Array.from(document.querySelectorAll('a[href]'))
          .map((a) => a.getAttribute('href'))
          .map((href) => {
            if (!href) return null;
            if (href.startsWith('http')) return href;
            if (href.startsWith('/')) return `${location.origin}${href}`;
            return null;
          })
      );

      // 提取代码块
      const codeBlocks = Array.from(main.querySelectorAll('pre, code'))
        .map((el) => text(el))
        .filter((code) => code.length > 20)
        .slice(0, 50)
        .map((code) => ({ language: '', code }));

      // 提取 JSON 配置块（页面底部通常有）
      const jsonBlocks = Array.from(main.querySelectorAll('pre, code'))
        .filter(el => {
          const content = text(el);
          return content.includes('"name"') && content.includes('"baseUrl"');
        })
        .map(el => text(el));

      return {
        title,
        description,
        codeBlocks,
        jsonBlocks,
        links
      };
    });

    // 构建内容数组
    const content = [];

    if (data.description) {
      content.push({ type: 'text', content: data.description });
    }

    // 构建结构化 API 数据
    const apiEndpoints = [];

    // 添加已提取的 API 工具内容（使用新的结构化格式）
    extractedApiTools.forEach(tool => {
      // 添加标题
      if (tool.name) {
        content.push({ type: 'heading', content: tool.name });
      }

      // 添加描述
      if (tool.description) {
        content.push({ type: 'text', content: tool.description });
      }

      // 构建结构化 API 端点数据
      const apiEndpoint = {
        name: tool.name,
        fullName: tool.fullName,
        method: tool.method,
        endpoint: tool.endpoint,
        parameters: tool.parameters || [],
        responseFields: tool.responseFields || [],
        description: tool.description
      };
      apiEndpoints.push(apiEndpoint);

      // 添加参数信息到内容
      if (tool.parameters && tool.parameters.length > 0) {
        const paramText = tool.parameters.map(p => {
          const req = p.required ? '[必需]' : '[可选]';
          return `${p.name} (${p.type || 'unknown'}) ${req}: ${p.description}`;
        }).join('\n');
        content.push({ type: 'text', content: `参数:\n${paramText}` });
      }
    });

    // 添加 JSON 配置块
    data.jsonBlocks.forEach(jsonStr => {
      content.push({ type: 'code', language: 'json', code: jsonStr });
    });

    // 添加其他代码块
    data.codeBlocks.filter(b => !data.jsonBlocks.includes(b.code)).forEach((block) => {
      content.push({ type: 'code', language: block.language || 'text', code: block.code });
    });

    // 构建返回结果，包含结构化的 API 数据
    const result = {
      type: 'tokenflux-doc',
      url,
      title: data.title,
      description: data.description,
      content,
      links: data.links,
      metadata: {
        platform: 'tokenflux',
        section: url.includes('/mcps') ? 'mcps' : 'docs',
        apiEndpoints // 添加结构化的 API 端点数据
      }
    };

    // 如果只有一个 API 端点，将其字段提升到顶层以便格式化器处理
    if (apiEndpoints.length === 1) {
      const api = apiEndpoints[0];
      result.method = api.method;
      result.endpoint = api.endpoint;
      result.parameters = api.parameters;
      result.responseFields = api.responseFields;
    }

    return result;
  }
}

export default TokenfluxParser;
