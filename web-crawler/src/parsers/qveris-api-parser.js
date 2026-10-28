import BaseParser from './base-parser.js';

/**
 * QVeris API Parser - 解析 qveris.ai/docs 文档页面
 * QVeris 是一个工具搜索+执行层，为 LLM agents 提供 API
 * 文档是 Next.js SPA，所有内容嵌入在 JavaScript chunk 文件中
 *
 * 优化策略：
 * 1. 直接从 Next.js 的 JS chunk 文件提取文档数据（更快更可靠）
 * 2. 如果失败，回退到 Playwright 渲染页面
 */
class QverisApiParser extends BaseParser {
  /**
   * 匹配 QVeris API 文档页面
   * @param {string} url - 页面URL
   * @returns {boolean} 是否匹配
   */
  matches(url) {
    return /^https?:\/\/qveris\.ai\/docs\/?$/.test(url);
  }

  /**
   * 获取优先级
   * @returns {number} 优先级
   */
  getPriority() {
    return 100;
  }

  /**
   * 是否支持链接发现
   * QVeris 文档是单页面，不需要发现其他链接
   * @returns {boolean}
   */
  supportsLinkDiscovery() {
    return false;
  }

  /**
   * 根据 URL 生成有意义的文件名
   * @param {string} url - 页面URL
   * @returns {string} 文件名
   */
  generateFilename(url) {
    return 'qveris-api-docs';
  }

  /**
   * 解析 QVeris API 文档页面
   * 优先从 JS chunk 文件直接提取数据，失败则回退到页面渲染
   * @param {Page} page - Playwright页面对象
   * @param {string} url - 页面URL
   * @param {Object} options - 解析选项
   * @returns {Promise<Object>} 解析后的页面数据
   */
  async parse(page, url, options = {}) {
    try {
      await this.waitForContent(page);
      await this.expandInteractiveContent(page);

      const renderedData = await this.extractFromRenderedPage(page, url);
      const jsChunkData = await this.extractFromJsChunk(url);

      const merged = this.mergeRenderedAndChunkData(renderedData, jsChunkData, url);
      if (merged) {
        return merged;
      }

      return {
        type: 'qveris-api',
        url,
        title: 'QVeris Documentation',
        description: '',
        sections: [],
        codeExamples: [],
        endpoints: [],
        apiInfo: {},
        rawContent: '',
        suggestedFilename: this.generateFilename(url)
      };
    } catch (error) {
      console.error('Failed to parse QVeris API doc page:', error.message);
      return {
        type: 'qveris-api',
        url,
        title: '',
        description: '',
        sections: [],
        codeExamples: [],
        endpoints: [],
        apiInfo: {},
        rawContent: '',
        suggestedFilename: this.generateFilename(url)
      };
    }
  }

  async expandInteractiveContent(page) {
    try {
      for (let round = 0; round < 3; round++) {
        await page.evaluate(() => {
          document.querySelectorAll('details:not([open])').forEach((el) => el.setAttribute('open', ''));
        });

        const selectors = [
          '[aria-expanded="false"]',
          'button:has-text("Show more")',
          'button:has-text("展开")',
          'button:has-text("More")',
          'button:has-text("Expand")',
          'summary'
        ];

        let clicked = 0;
        for (const selector of selectors) {
          const elements = await page.locator(selector).all();
          for (const element of elements.slice(0, 30)) {
            try {
              if (await element.isVisible()) {
                await element.click({ timeout: 1500 });
                clicked++;
              }
            } catch {
              // 忽略无法点击的元素
            }
          }
        }

        if (clicked === 0) break;
        await page.waitForTimeout(600);
      }
    } catch (error) {
      console.warn('Failed to expand interactive content:', error.message);
    }
  }

  async extractFromRenderedPage(page, url) {
    const data = await page.evaluate(() => {
      const cleanText = (text) => (text || '').replace(/\s+/g, ' ').trim();
      const root = document.querySelector('main') || document.body;

      const titleEl = root.querySelector('h1');
      const title = cleanText(titleEl?.textContent) || document.title || 'QVeris Documentation';

      const paragraphs = [...root.querySelectorAll('p')].map((p) => cleanText(p.textContent)).filter(Boolean);
      const description = paragraphs.find((text) => text.length > 20) || '';

      const toc = [...document.querySelectorAll('nav button, nav a, [role="tablist"] button, button.w-full.text-left')]
        .map((el) => cleanText(el.textContent))
        .filter((v) => v.length > 1);

      const sections = [...root.querySelectorAll('h2, h3, h4')].map((heading) => {
        const headingText = cleanText(heading.textContent);
        let content = '';
        let sibling = heading.nextElementSibling;
        while (sibling && !/^H[1-4]$/.test(sibling.tagName)) {
          const text = cleanText(sibling.textContent);
          if (text) content += `${text}\n`;
          sibling = sibling.nextElementSibling;
          if (content.length > 5000) break;
        }
        return { title: headingText, content: content.trim() };
      }).filter((section) => section.title);

      const codeExamples = [...root.querySelectorAll('pre, code')]
        .map((node) => {
          const code = node.textContent?.trim() || '';
          if (code.length < 30) return null;
          const className = node.className || '';
          return { className, code };
        })
        .filter(Boolean);

      const links = [...root.querySelectorAll('a[href]')]
        .map((a) => ({ title: cleanText(a.textContent) || a.href, url: a.href }))
        .filter((item) => item.url && /^https?:\/\//.test(item.url));

      return {
        title,
        description,
        toc: [...new Set(toc)],
        sections,
        codeExamples,
        links: [...new Map(links.map((item) => [item.url, item])).values()],
        rawContent: (root.innerText || '').trim()
      };
    });

    const endpoints = this.extractEndpointsFromText(data.rawContent || '');
    const apiInfo = this.extractApiInfo(data.rawContent || '');
    const codeExamples = this.normalizeCodeExamples(data.codeExamples || []);
    const parameterSet = new Set((apiInfo.endpoints || []).flatMap((ep) => ep.params || []));
    const parameters = [...parameterSet].map((name) => ({ name, type: '', required: false, description: '' }));

    const markdownContent = [
      data.toc?.length ? `## 目录\n${data.toc.map((item) => `- ${item}`).join('\n')}\n` : '',
      data.sections?.length ? `## 章节\n${data.sections.map((s) => `### ${s.title}\n${s.content || ''}`).join('\n\n')}` : '',
    ].filter(Boolean).join('\n');

    return {
      type: 'qveris-api',
      url,
      title: data.title,
      description: data.description,
      sections: data.sections || [],
      codeExamples,
      endpoints,
      apiInfo,
      baseUrl: apiInfo.baseUrl || '',
      authMethod: apiInfo.authMethod || '',
      authentication: apiInfo.authMethod ? `使用 ${apiInfo.authMethod}` : '',
      endpoint: endpoints[0] || '',
      parameters,
      requestHeaders: apiInfo.authMethod ? [{ name: 'Authorization', type: 'string', required: true, description: 'Bearer Token' }] : [],
      relatedLinks: data.links || [],
      markdownContent,
      rawContent: data.rawContent || '',
      suggestedFilename: this.generateFilename(url),
      source: 'rendered-page'
    };
  }

  mergeRenderedAndChunkData(renderedData, jsChunkData, url) {
    if (!renderedData && !jsChunkData) return null;
    if (!renderedData) return jsChunkData;
    if (!jsChunkData) return renderedData;

    const mergeUnique = (a = [], b = []) => {
      const merged = [...a, ...b];
      const seen = new Set();
      return merged.filter((item) => {
        const key = typeof item === 'string'
          ? item
          : `${item.language || 'text'}:${(item.code || item.path || item.url || JSON.stringify(item)).slice(0, 160)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };

    const mergedEndpoints = mergeUnique(renderedData.endpoints, jsChunkData.endpoints);
    const mergedApiEndpoints = mergeUnique(renderedData.apiInfo?.endpoints, jsChunkData.apiInfo?.endpoints);
    const mergedCodeExamples = mergeUnique(renderedData.codeExamples, jsChunkData.codeExamples);
    const mergedParams = mergeUnique(renderedData.parameters, (jsChunkData.apiInfo?.endpoints || []).flatMap((ep) => (ep.params || []).map((name) => ({ name }))));

    return {
      ...jsChunkData,
      ...renderedData,
      url,
      title: renderedData.title || jsChunkData.title || 'QVeris API Documentation',
      description: renderedData.description || jsChunkData.description || '',
      endpoints: mergedEndpoints,
      codeExamples: mergedCodeExamples,
      parameters: mergedParams.map((param) => ({
        name: param.name || param,
        type: param.type || '',
        required: Boolean(param.required),
        description: param.description || ''
      })).filter((param) => param.name),
      apiInfo: {
        ...jsChunkData.apiInfo,
        ...renderedData.apiInfo,
        baseUrl: renderedData.apiInfo?.baseUrl || jsChunkData.apiInfo?.baseUrl || 'https://qveris.ai/api/v1',
        authMethod: renderedData.apiInfo?.authMethod || jsChunkData.apiInfo?.authMethod || 'Bearer Token',
        endpoints: mergedApiEndpoints
      },
      baseUrl: renderedData.baseUrl || jsChunkData.baseUrl || jsChunkData.apiInfo?.baseUrl || 'https://qveris.ai/api/v1',
      authMethod: renderedData.authMethod || jsChunkData.authMethod || 'Bearer Token',
      authentication: renderedData.authentication || jsChunkData.authentication || 'Bearer Token',
      markdownContent: [renderedData.markdownContent, jsChunkData.markdownContent].filter(Boolean).join('\n\n'),
      source: 'rendered+js-chunk'
    };
  }

  extractEndpointsFromText(text) {
    const endpointPattern = /\b(GET|POST|PUT|PATCH|DELETE)\s+(\/[^\s\n`"]+)/g;
    const endpoints = [];
    const seen = new Set();
    let match;
    while ((match = endpointPattern.exec(text)) !== null) {
      const path = match[2].replace(/[),.;]+$/, '');
      if (!seen.has(path)) {
        seen.add(path);
        endpoints.push(path);
      }
    }
    return endpoints;
  }

  normalizeCodeExamples(codeExamples) {
    const seen = new Set();
    return codeExamples
      .map((item) => {
        const code = item.code || '';
        const className = item.className || '';
        let language = 'text';
        if (/typescript|ts-/i.test(className) || /export\s+(async\s+)?function|const\s+\w+\s*:\s*\w+/i.test(code)) language = 'typescript';
        else if (/python|py-/i.test(className) || /import requests|def\s+\w+\(/i.test(code)) language = 'python';
        else if (/bash|shell|sh-/i.test(className) || /\bcurl\s+/i.test(code)) language = 'bash';
        else if (/json/i.test(className) || /^[\[{]/.test(code.trim())) language = 'json';
        else if (/javascript|js-/i.test(className)) language = 'javascript';
        return { language, code };
      })
      .filter((item) => item.code.length >= 30)
      .filter((item) => {
        const key = `${item.language}:${item.code.slice(0, 120)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  /**
   * 从文本中提取 API 信息
   * @param {string} content - 页面文本内容
   * @returns {Object} API 信息
   */
  extractApiInfo(content) {
    const apiInfo = {
      baseUrl: '',
      authMethod: '',
      endpoints: []
    };

    // 提取 Base URL
    const baseUrlMatch = content.match(/https:\/\/qveris\.ai\/api\/v1/);
    if (baseUrlMatch) {
      apiInfo.baseUrl = 'https://qveris.ai/api/v1';
    }

    // 提取认证方式
    if (content.includes('Authorization: Bearer')) {
      apiInfo.authMethod = 'Bearer Token';
    }

    // 提取端点信息
    const endpointDetails = [];

    // Search endpoint
    if (content.includes('POST /search')) {
      endpointDetails.push({
        method: 'POST',
        path: '/search',
        description: 'Search for tools using natural language query',
        params: ['query', 'limit']
      });
    }

    // Execute endpoint
    if (content.includes('POST /tools/execute')) {
      endpointDetails.push({
        method: 'POST',
        path: '/tools/execute',
        description: 'Execute a tool by tool_id with parameters',
        params: ['tool_id', 'search_id', 'parameters', 'max_response_size']
      });
    }

    apiInfo.endpoints = endpointDetails;

    return apiInfo;
  }

  /**
   * 从 Next.js JS chunk 文件直接提取文档数据
   * @param {string} url - 文档页面 URL
   * @returns {Promise<Object|null>} 提取的数据，失败返回 null
   */
  async extractFromJsChunk(url) {
    try {
      // 1. 获取 HTML 页面，找到 JS chunk 文件路径
      const htmlResponse = await fetch(url);
      const html = await htmlResponse.text();

      // 2. 查找文档页面的 JS chunk 文件路径
      // 格式: /_next/static/chunks/app/docs/page-[hash].js
      const jsChunkMatch = html.match(/\/_next\/static\/chunks\/app\/docs\/page-[^"]+\.js/);
      if (!jsChunkMatch) {
        console.log('Could not find docs JS chunk file');
        return null;
      }

      const jsChunkUrl = `https://qveris.ai${jsChunkMatch[0]}`;
      console.log(`Found JS chunk: ${jsChunkUrl}`);

      // 3. 下载 JS chunk 文件
      const jsResponse = await fetch(jsChunkUrl);
      const jsContent = await jsResponse.text();

      // 4. 从 JS 中提取文档数据
      return this.parseJsChunkContent(jsContent, url);
    } catch (error) {
      console.error('Error extracting from JS chunk:', error.message);
      return null;
    }
  }

  /**
   * 解析 JS chunk 文件内容，提取文档数据
   * @param {string} jsContent - JS 文件内容
   * @param {string} url - 原始 URL
   * @returns {Object} 解析后的数据
   */
  parseJsChunkContent(jsContent, url) {
    const codeExamples = [];
    const endpoints = [];
    const sections = [];

    // 提取代码块 - 匹配双引号中的多行代码（包含 \n 转义）
    const extractStringContent = (str) => {
      // 处理 JS 字符串中的转义字符
      return str
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    };

    // 提取 API URL 和示例
    const apiUrlPattern = /"(https:\/\/qveris\.ai\/api\/v1[^"]*)"/g;
    let match;
    const seenUrls = new Set();
    while ((match = apiUrlPattern.exec(jsContent)) !== null) {
      const apiUrl = match[1];
      if (!seenUrls.has(apiUrl)) {
        seenUrls.add(apiUrl);
      }
    }

    // 提取认证示例
    const authPattern = /"(Authorization: Bearer[^"]*)"/g;
    while ((match = authPattern.exec(jsContent)) !== null) {
      const code = match[1];
      if (!codeExamples.find(e => e.code.includes('Authorization: Bearer'))) {
        codeExamples.push({ language: 'text', code });
      }
    }

    // 提取 JSON 请求/响应示例 - 匹配多行字符串
    // 格式1: "key": "value" 或 "key": {...}
    const jsonPatterns = [
      // 匹配完整的 JSON 对象字符串
      /"\{[^"]*\\"query\\"[^"]*\}"/g,
      /"\{[^"]*\\"tool_id\\"[^"]*\}"/g,
      /"\{[^"]*\\"search_id\\"[^"]*\}"/g,
      /"\{[^"]*\\"execution_id\\"[^"]*\}"/g,
      // 匹配 sample_parameters
      /"(sample_parameters[^"]*})"/g
    ];

    // 提取内嵌的 JSON 数据结构
    const seenCode = new Set();

    // 提取 shell/bash 命令示例
    // curl 命令可能直接嵌入在代码中，不一定是字符串
    const bashPatterns = [
      /curl -sS -X POST[^,}\]]{50,500}/g,
      /curl -X POST[^,}\]]{50,500}/g
    ];
    for (const pattern of bashPatterns) {
      while ((match = pattern.exec(jsContent)) !== null) {
        let code = match[0];
        // 处理转义字符
        code = code
          .replace(/\\n/g, '\n')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\')
          .trim();
        if (code.length > 50) {
          const codeHash = code.substring(0, 80);
          if (!seenCode.has(codeHash)) {
            seenCode.add(codeHash);
            codeExamples.push({ language: 'bash', code });
          }
        }
      }
    }

    // 提取 Python 代码示例
    const pythonPattern = /import requests[^,}\]]{100,1000}/g;
    while ((match = pythonPattern.exec(jsContent)) !== null) {
      let code = match[0];
      code = code
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
        .trim();
      if (code.length > 50) {
        const codeHash = code.substring(0, 80);
        if (!seenCode.has(codeHash)) {
          seenCode.add(codeHash);
          codeExamples.push({ language: 'python', code });
        }
      }
    }

    // 提取 TypeScript 代码示例
    const tsPattern = /"(export\s+(async\s+)?function[^"]+)"/g;
    while ((match = tsPattern.exec(jsContent)) !== null) {
      let code = extractStringContent(match[1]);
      if (code.length > 50) {
        const codeHash = code.substring(0, 80);
        if (!seenCode.has(codeHash)) {
          seenCode.add(codeHash);
          codeExamples.push({ language: 'typescript', code });
        }
      }
    }

    // 提取 JSON 示例（包含 \n 转义的字符串格式）
    // 这些是直接嵌入在 JS 代码中的 JSON 字符串
    // 需要提取完整的嵌套 JSON 对象
    const extractCompleteJson = (str, startPos) => {
      let depth = 0;
      let inString = false;
      let escape = false;
      let result = '';

      for (let i = startPos; i < str.length; i++) {
        const char = str[i];

        if (escape) {
          result += char;
          escape = false;
          continue;
        }

        if (char === '\\') {
          result += char;
          escape = true;
          continue;
        }

        if (char === '"' && !escape) {
          inString = !inString;
          result += char;
          continue;
        }

        result += char;

        if (!inString) {
          if (char === '{' || char === '[') depth++;
          if (char === '}' || char === ']') {
            depth--;
            if (depth === 0) {
              return result;
            }
          }
        }
      }
      return result;
    };

    // 查找所有 JSON 对象的起始位置
    const jsonStartPattern = /\{\\n\s*"/g;
    let jsonMatch;
    while ((jsonMatch = jsonStartPattern.exec(jsContent)) !== null) {
      const completeJson = extractCompleteJson(jsContent, jsonMatch.index);
      if (completeJson && completeJson.length > 30) {
        let code = completeJson
          .replace(/\\n/g, '\n')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\')
          .trim();
        const codeHash = code.substring(0, 80);
        if (!seenCode.has(codeHash)) {
          seenCode.add(codeHash);
          codeExamples.push({ language: 'json', code });
        }
      }
    }

    // 提取简单的 JSON 对象（不包含 \n）
    const simpleJsonPattern = /\{"query":\s*"[^"]+[^}]*\}/g;
    while ((match = simpleJsonPattern.exec(jsContent)) !== null) {
      const code = match[0];
      const codeHash = code.substring(0, 80);
      if (!seenCode.has(codeHash)) {
        seenCode.add(codeHash);
        codeExamples.push({ language: 'json', code });
      }
    }

    // 提取 API 端点 - 改进正则表达式，支持下划线
    const endpointPatterns = [
      /"POST\s+(\/[a-z_\-\/{}?=]+)"/gi,
      /"GET\s+(\/[a-z_\-\/{}?=]+)"/gi
    ];
    const seenEndpoints = new Set();
    for (const pattern of endpointPatterns) {
      let m;
      while ((m = pattern.exec(jsContent)) !== null) {
        // 清理端点路径：移除 {} 和查询参数
        let endpoint = m[1]
          .replace(/[{}]/g, '')
          .split('?')[0];  // 移除查询参数部分
        if (!seenEndpoints.has(endpoint)) {
          seenEndpoints.add(endpoint);
          endpoints.push(endpoint);
        }
      }
    }

    // 如果没有从正则提取到端点，手动添加已知的端点
    if (endpoints.length === 0) {
      endpoints.push('/search', '/tools/execute', '/tools/by-ids');
    }

    // 提取文档章节结构
    const sectionPattern = /\{id:"([^"]+)",title:"([^"]+)"/g;
    let secMatch;
    while ((secMatch = sectionPattern.exec(jsContent)) !== null) {
      const [, id, title] = secMatch;
      if (title && title.length > 2) {
        sections.push({ id, title });
      }
    }

    // 去重代码示例 - 基于内容相似度和价值
    const uniqueCodeExamples = [];
    const uniqueCodeSet = new Set();

    for (const example of codeExamples) {
      // 跳过过长的示例（超过 2000 字符通常是嵌套太多）
      if (example.code.length > 2000) continue;
      // 跳过过短的示例
      if (example.code.length < 40) continue;

      // 清理 JSON 中的空白和格式差异进行比较
      const normalizedCode = example.code
        .replace(/\s+/g, ' ')
        .replace(/\s*([{}[\]:,])\s*/g, '$1')
        .trim();
      const codeHash = normalizedCode.substring(0, 80);

      let isDuplicate = false;
      for (const existing of uniqueCodeExamples) {
        const existingNormalized = existing.code
          .replace(/\s+/g, ' ')
          .replace(/\s*([{}[\]:,])\s*/g, '$1')
          .trim();

        // 如果新代码是现有代码的子集，跳过
        if (existingNormalized.includes(normalizedCode.substring(0, 50))) {
          isDuplicate = true;
          break;
        }
        // 如果现有代码是新代码的子集，替换
        if (normalizedCode.includes(existingNormalized.substring(0, 50))) {
          const idx = uniqueCodeExamples.indexOf(existing);
          uniqueCodeExamples[idx] = example;
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        uniqueCodeSet.add(codeHash);
        uniqueCodeExamples.push(example);
      }
    }

    // 按优先级排序，确保多样化的示例
    const langPriority = { typescript: 1, bash: 2, python: 3, json: 4, text: 5 };
    uniqueCodeExamples.sort((a, b) => {
      const pa = langPriority[a.language] || 5;
      const pb = langPriority[b.language] || 5;
      if (pa !== pb) return pa - pb;
      return b.code.length - a.code.length;
    });

    // 限制最多保留 20 个最有价值的示例
    const finalExamples = uniqueCodeExamples.slice(0, 20);

    // 提取 Base URL
    const baseUrl = 'https://qveris.ai/api/v1';

    // 构建 API 信息
    const apiInfo = {
      baseUrl,
      authMethod: 'Bearer Token',
      endpoints: [
        {
          method: 'POST',
          path: '/search',
          description: 'Search for tools using natural language query',
          params: ['query', 'limit', 'session_id']
        },
        {
          method: 'POST',
          path: '/tools/execute',
          description: 'Execute a tool by tool_id with parameters',
          params: ['tool_id', 'search_id', 'parameters', 'max_response_size']
        },
        {
          method: 'POST',
          path: '/tools/by-ids',
          description: 'Get descriptions of tools based on tool_id',
          params: ['tool_ids', 'search_id', 'session_id']
        }
      ]
    };

    // 生成原始内容文本
    const rawContent = this.generateRawContent(finalExamples, apiInfo, sections);

    return {
      type: 'qveris-api',
      url,
      title: 'QVeris API Documentation',
      description: 'QVeris is a tool search and execution layer that provides APIs for LLM agents to discover and execute tools.',
      sections,
      codeExamples: finalExamples,
      endpoints,
      apiInfo,
      baseUrl,
      authMethod: 'Bearer Token',
      authentication: 'Bearer Token',
      endpoint: endpoints[0] || '',
      parameters: apiInfo.endpoints.flatMap((ep) => ep.params || []).map((name) => ({ name })),
      requestHeaders: [{ name: 'Authorization', type: 'string', required: true, description: 'Bearer Token' }],
      rawContent,
      suggestedFilename: this.generateFilename(url),
      source: 'js-chunk'
    };
  }

  /**
   * 生成原始内容文本
   */
  generateRawContent(codeExamples, apiInfo, sections) {
    let content = '# QVeris API Documentation\n\n';

    content += '## Base URL\n';
    content += `${apiInfo.baseUrl}\n\n`;

    content += '## Authentication\n';
    content += 'All API requests require authentication via Bearer Token:\n';
    content += 'Authorization: Bearer YOUR_API_KEY\n\n';

    content += '## API Endpoints\n\n';
    for (const endpoint of apiInfo.endpoints) {
      content += `### ${endpoint.method} ${endpoint.path}\n`;
      content += `${endpoint.description}\n`;
      content += `Parameters: ${endpoint.params.join(', ')}\n\n`;
    }

    content += '## Code Examples\n\n';
    for (const example of codeExamples) {
      content += `### ${example.language}\n`;
      content += '```\n';
      content += example.code;
      content += '\n```\n\n';
    }

    return content;
  }

  /**
   * 等待页面内容加载完成并切换到 API tab
   * @param {Page} page - Playwright页面对象
   */
  async waitForContent(page) {
    try {
      await page.waitForLoadState('networkidle', { timeout: 30000 });
      // 等待 Next.js 渲染
      await page.waitForTimeout(2000);

      // 尝试点击 API tab 以显示完整的 API 文档
      try {
        // 查找 API tab - 可能是按钮、链接或 tab 组件
        const apiTabSelectors = [
          'button:has-text("API")',
          'a:has-text("API")',
          '[role="tab"]:has-text("API")',
          '[role="tabbutton"]:has-text("API")',
          'div[role="tablist"] button:has-text("API")',
          '.tab:has-text("API")',
          '[class*="tab"]:has-text("API")'
        ];

        let tabClicked = false;
        for (const selector of apiTabSelectors) {
          try {
            const tab = await page.$(selector);
            if (tab) {
              // 检查是否已经是激活状态
              const isActive = await tab.evaluate(el => {
                return el.getAttribute('aria-selected') === 'true' ||
                       el.classList.contains('active') ||
                       el.classList.contains('selected') ||
                       el.getAttribute('data-state') === 'active';
              });

              if (!isActive) {
                await tab.click();
                console.log('Clicked API tab');
                tabClicked = true;
                // 等待 tab 内容加载
                await page.waitForTimeout(2000);
              } else {
                console.log('API tab already active');
              }
              break;
            }
          } catch (e) {
            // 继续尝试下一个选择器
          }
        }

        if (!tabClicked) {
          console.log('Could not find API tab, proceeding with default content');
        }
      } catch (tabError) {
        console.warn('Error switching to API tab:', tabError.message);
      }

      // 额外等待确保动态内容完全加载
      await page.waitForTimeout(1500);
    } catch (error) {
      console.warn('Wait for content timeout, proceeding anyway:', error.message);
    }
  }
}

export default QverisApiParser;
