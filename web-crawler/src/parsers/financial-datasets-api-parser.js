import BaseParser from './base-parser.js';

/**
 * Financial Datasets API Parser - 专门解析 docs.financialdatasets.ai API 文档页面
 * 适用于 Mintlify 风格的文档站点
 */
class FinancialDatasetsApiParser extends BaseParser {
  /**
   * 匹配 Financial Datasets API 文档页面
   * @param {string} url - 页面URL
   * @returns {boolean} 是否匹配
   */
  matches(url) {
    return /^https?:\/\/docs\.financialdatasets\.ai\/api\//.test(url);
  }

  /**
   * 获取优先级
   * @returns {number} 优先级
   */
  getPriority() {
    return 100;
  }

  /**
   * 根据 URL 生成有意义的文件名
   * @param {string} url - 页面URL
   * @returns {string} 文件名
   */
  generateFilename(url) {
    try {
      const urlObj = new URL(url);
      let pathname = urlObj.pathname;
      // 移除 /api 前缀
      pathname = pathname.replace(/^\/api\/?/, '');
      pathname = pathname.replace(/\/$/, '');
      const filename = pathname.replace(/\//g, '_') || 'api_overview';
      return filename;
    } catch (e) {
      return 'api_doc';
    }
  }

  /**
   * 解析 Financial Datasets API 文档页面
   * @param {Page} page - Playwright页面对象
   * @param {string} url - 页面URL
   * @param {Object} options - 解析选项
   * @returns {Promise<Object>} 解析后的页面数据
   */
  async parse(page, url, options = {}) {
    try {
      // 等待内容加载完成
      await this.waitForContent(page);

      // 从页面提取内容
      const data = await page.evaluate(() => {
        const result = {
          title: '',
          description: '',
          method: 'GET',
          endpoint: '',
          requestParams: [],
          responseFields: [],
          codeExamples: [],
          rawContent: ''
        };

        const contentSelectors = [
          '.mdx-content',
          'article',
          'main',
          '[class*="docs-content"]',
          '[class*="prose"]',
          '[class*="article"]'
        ];

        let mainContent = null;
        for (const selector of contentSelectors) {
          const el = document.querySelector(selector);
          if (el && el.innerText && el.innerText.trim().length > 50) {
            mainContent = el;
            break;
          }
        }
        if (!mainContent) mainContent = document.body;

        const cleanText = (text) => (text || '')
          .replace(/\u200B/g, '')
          .replace(/\s+/g, ' ')
          .trim();

        const sanitizeNodeText = (node) => {
          const clone = node.cloneNode(true);
          clone.querySelectorAll('script, style, nav, footer, button, [role="navigation"], [aria-label*="breadcrumb" i]').forEach(el => el.remove());
          return (clone.innerText || '').replace(/\u200B/g, '').trim();
        };

        const rawText = sanitizeNodeText(mainContent);
        const allText = cleanText(rawText);

        const h1 = mainContent.querySelector('h1');
        if (h1) result.title = cleanText(h1.textContent);

        const paragraphs = Array.from(mainContent.querySelectorAll('p'));
        for (const p of paragraphs) {
          const text = cleanText(p.textContent);
          if (text.length > 20 && !/^(copy|ask ai)$/i.test(text)) {
            result.description = text;
            break;
          }
        }

        const methodEndpointPatterns = [
          /\b(GET|POST|PUT|DELETE|PATCH)\s+(https?:\/\/api\.financialdatasets\.ai[^\s'"`<>]*)/i,
          /\b(GET|POST|PUT|DELETE|PATCH)\s+(\/[a-zA-Z0-9\-_/{}.?=&%:]+)/i
        ];
        for (const pattern of methodEndpointPatterns) {
          const matched = allText.match(pattern);
          if (matched) {
            result.method = matched[1].toUpperCase();
            result.endpoint = matched[2];
            break;
          }
        }

        if (!result.endpoint) {
          const endpointOnly = allText.match(/https?:\/\/api\.financialdatasets\.ai[^\s'"`<>]*/i);
          if (endpointOnly) result.endpoint = endpointOnly[0];
        }

        const requestParamMap = new Map();
        const responseFieldMap = new Map();
        const saveRow = (map, row) => {
          const key = cleanText(row.name).toLowerCase();
          if (!key || key === 'name' || key === 'field') return;
          if (/^(copy|ask ai|hide child attributes|show child attributes)$/i.test(key)) return;
          if (map.has(key)) {
            const prev = map.get(key);
            map.set(key, {
              ...prev,
              type: prev.type || row.type,
              required: prev.required || row.required,
              description: prev.description || row.description
            });
            return;
          }
          map.set(key, {
            name: cleanText(row.name),
            type: cleanText(row.type),
            required: cleanText(row.required),
            description: cleanText(row.description)
          });
        };

        const getSectionLabel = (tableEl) => {
          let node = tableEl;
          for (let i = 0; i < 6 && node; i++) {
            node = node.previousElementSibling;
            if (!node) break;
            if (/^H[2-4]$/.test(node.tagName)) return cleanText(node.textContent).toLowerCase();
          }
          return '';
        };

        const tables = Array.from(mainContent.querySelectorAll('table'));
        for (const table of tables) {
          const rows = Array.from(table.querySelectorAll('tr'));
          if (rows.length < 2) continue;
          const headers = Array.from(rows[0].querySelectorAll('th,td')).map(cell => cleanText(cell.textContent).toLowerCase());
          if (!headers.length) continue;

          const nameIdx = headers.findIndex(h => /^(name|parameter|param|field|property|key)$/i.test(h));
          const typeIdx = headers.findIndex(h => /type|format|schema/.test(h));
          const requiredIdx = headers.findIndex(h => /required|mandatory/.test(h));
          const descriptionIdx = headers.findIndex(h => /description|details|notes?/.test(h));
          if (nameIdx === -1) continue;

          const sectionLabel = getSectionLabel(table);
          const shouldTreatAsResponse = /response|output|returns?|example response|response fields/i.test(sectionLabel);

          for (const row of rows.slice(1)) {
            const cells = Array.from(row.querySelectorAll('td,th'));
            if (!cells.length) continue;
            const rowData = {
              name: cleanText(cells[nameIdx]?.textContent || ''),
              type: cleanText(cells[typeIdx]?.textContent || ''),
              required: cleanText(cells[requiredIdx]?.textContent || ''),
              description: cleanText(cells[descriptionIdx]?.textContent || cells[typeIdx + 1]?.textContent || '')
            };
            if (!rowData.name) continue;
            if (shouldTreatAsResponse || rowData.name.includes('.') || rowData.name.includes('[')) {
              saveRow(responseFieldMap, rowData);
            } else {
              saveRow(requestParamMap, rowData);
            }
          }
        }

        const blocks = rawText.split(/\n{2,}/).map(cleanText).filter(Boolean);
        for (let i = 0; i < blocks.length - 1; i++) {
          const name = blocks[i];
          const typeLine = blocks[i + 1];
          if (!/^[a-zA-Z_][\w.\[\]-]{0,120}$/.test(name)) continue;
          const typeMatch = typeLine.match(/^(string|boolean|number|integer|object|array|enum(?:<[^>]+>)?)(?:\s*header)?(?:\s*required)?$/i);
          if (!typeMatch) continue;
          const description = cleanText(blocks[i + 2] || '');
          const rowData = {
            name,
            type: typeMatch[1],
            required: /required/i.test(typeLine) ? '是' : '',
            description
          };
          if (/^(x-api-key|authorization)$/i.test(name)) {
            rowData.required = '是';
          }
          if (name.includes('.') || /response/i.test(description)) {
            saveRow(responseFieldMap, rowData);
          } else {
            saveRow(requestParamMap, rowData);
          }
        }

        if (!requestParamMap.has('x-api-key') && /x-api-key/i.test(allText)) {
          saveRow(requestParamMap, {
            name: 'X-API-KEY',
            type: 'string',
            required: '是',
            description: 'API key for authentication. (Header参数)'
          });
        }

        result.requestParams = Array.from(requestParamMap.values());
        result.responseFields = Array.from(responseFieldMap.values());

        // 提取代码示例
        const codeBlocks = mainContent.querySelectorAll('pre code, pre');
        for (const block of codeBlocks) {
          const code = (block.textContent || '').trim();
          if (code && code.length > 10) {
            let language = 'text';
            const classList = block.className || '';
            const langMatch = classList.match(/language-(\w+)/);
            if (langMatch) {
              language = langMatch[1];
            } else if (code.startsWith('curl') || code.includes('curl ')) {
              language = 'bash';
            } else if (code.startsWith('{') || code.startsWith('[')) {
              language = 'json';
            } else if (code.startsWith('import') || code.startsWith('from') || code.includes('import ')) {
              language = 'python';
            } else if (code.startsWith('const') || code.startsWith('let') || code.startsWith('function')) {
              language = 'javascript';
            }

            result.codeExamples.push({ language, code });
          }
        }

        result.rawContent = rawText;

        return result;
      });

      return {
        type: 'financial-datasets-api',
        url,
        title: data.title,
        description: data.description,
        requestMethod: data.method,
        endpoint: data.endpoint,
        requestParams: data.requestParams,
        responseFields: data.responseFields,
        codeExamples: data.codeExamples,
        rawContent: data.rawContent,
        suggestedFilename: this.generateFilename(url)
      };
    } catch (error) {
      console.error('Failed to parse Financial Datasets API doc page:', error.message);
      return {
        type: 'financial-datasets-api',
        url,
        title: '',
        description: '',
        requestMethod: '',
        endpoint: '',
        requestParams: [],
        responseFields: [],
        codeExamples: [],
        rawContent: '',
        suggestedFilename: this.generateFilename(url)
      };
    }
  }

  /**
   * 等待内容加载完成
   */
  async waitForContent(page) {
    try {
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 });

      // 等待主要内容元素出现
      const contentSelectors = [
        'main',
        'article',
        'h1',
        '[class*="content"]',
        '[class*="prose"]'
      ];

      for (const selector of contentSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 5000 });
          break;
        } catch (e) {
          // 继续尝试下一个选择器
        }
      }

      // 额外等待动态内容加载
      await page.waitForTimeout(3000);
    } catch (error) {
      console.warn('Wait for content timeout, proceeding anyway:', error.message);
    }
  }
}

export default FinancialDatasetsApiParser;
