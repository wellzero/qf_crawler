import BaseParser from './base-parser.js';

/**
 * iTick API Parser - 专门解析 docs.itick.org API 文档页面
 * iTick 提供金融数据 API 服务
 * 文档可能使用常见的 API 文档格式（如 Swagger/Redoc、ReadMe、GitBook 等）
 */
class ItickApiParser extends BaseParser {
  /**
   * 匹配 iTick API 文档页面
   * @param {string} url - 页面URL
   * @returns {boolean} 是否匹配
   */
  matches(url) {
    return /^https?:\/\/docs\.itick\.org/.test(url);
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
      // 移除开头和结尾的斜杠
      pathname = pathname.replace(/^\//, '').replace(/\/$/, '');
      // 转换为文件名
      const filename = pathname.replace(/\//g, '_') || 'api_overview';
      return filename;
    } catch (e) {
      return 'itick_doc';
    }
  }

  /**
   * 等待页面内容加载完成
   */
  async waitForContent(page) {
    try {
      await page.waitForLoadState('networkidle', { timeout: 30000 });
      // 等待主要内容区域（尽量避免命中导航类容器）
      await page.waitForSelector('main article, main h1, article h1, .vp-doc h1, .theme-doc-markdown h1, pre code, table', { timeout: 15000 });
      await page.waitForTimeout(3000); // 额外等待动态内容
    } catch (error) {
      console.warn('Wait for content timeout, proceeding anyway:', error.message);
    }
  }

  /**
   * 解析 iTick API 文档页面
   * @param {Page} page - Playwright页面对象
   * @param {string} url - 页面URL
   * @param {Object} options - 解析选项
   * @returns {Promise<Object>} 解析后的页面数据
   */
  async parse(page, url, options = {}) {
    try {
      await this.waitForContent(page);

      // 提取页面内容
      const data = await page.evaluate(() => {
        const NOISE_SELECTOR = [
          'script', 'style', 'noscript', 'svg[aria-hidden="true"]',
          'header', 'footer', 'nav', 'aside',
          '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
          '[class*="nav"]', '[class*="sidebar"]', '[class*="menu"]',
          '[class*="footer"]', '[class*="breadcrumb"]', '[class*="toc"]'
        ].join(', ');

        const cleanText = (value) => (value || '').replace(/\s+/g, ' ').trim();

        const pickBestContentRoot = () => {
          const candidates = Array.from(document.querySelectorAll('main article, article, main, .vp-doc, .theme-doc-markdown, .markdown, [class*="doc"]'));
          if (candidates.length === 0) return document.body;

          let best = candidates[0];
          let bestScore = 0;

          for (const node of candidates) {
            const clone = node.cloneNode(true);
            clone.querySelectorAll(NOISE_SELECTOR).forEach(el => el.remove());
            const headingCount = clone.querySelectorAll('h1, h2, h3').length;
            const paragraphCount = clone.querySelectorAll('p').length;
            const codeCount = clone.querySelectorAll('pre').length;
            const tableCount = clone.querySelectorAll('table').length;
            const textLen = cleanText(clone.textContent).length;
            const score = textLen + headingCount * 300 + paragraphCount * 120 + codeCount * 120 + tableCount * 180;
            if (score > bestScore) {
              best = node;
              bestScore = score;
            }
          }

          return best;
        };

        const toMarkdownFromNode = (root) => {
          const clone = root.cloneNode(true);
          clone.querySelectorAll(NOISE_SELECTOR).forEach(el => el.remove());

          const lines = [];
          const push = (text = '') => {
            if (!text && lines[lines.length - 1] === '') return;
            lines.push(text);
          };

          const tableToMarkdown = (table) => {
            const rows = Array.from(table.querySelectorAll('tr'))
              .map(tr => Array.from(tr.querySelectorAll('th, td')).map(td => cleanText(td.textContent).replace(/\|/g, '\\|')))
              .filter(row => row.length > 0 && row.some(Boolean));
            if (rows.length === 0) return [];

            const header = rows[0];
            const body = rows.slice(1);
            const out = [
              `| ${header.join(' | ')} |`,
              `| ${header.map(() => '---').join(' | ')} |`
            ];
            body.forEach(row => out.push(`| ${row.join(' | ')} |`));
            return out;
          };

          const convertElement = (el) => {
            const tag = (el.tagName || '').toUpperCase();
            const text = cleanText(el.textContent);
            if (!text && tag !== 'PRE' && tag !== 'TABLE') return;

            if (tag === 'H1') push(`# ${text}`);
            else if (tag === 'H2') push(`## ${text}`);
            else if (tag === 'H3') push(`### ${text}`);
            else if (tag === 'H4') push(`#### ${text}`);
            else if (tag === 'P') push(text);
            else if (tag === 'UL') {
              Array.from(el.querySelectorAll(':scope > li')).forEach(li => push(`- ${cleanText(li.textContent)}`));
            } else if (tag === 'OL') {
              Array.from(el.querySelectorAll(':scope > li')).forEach((li, idx) => push(`${idx + 1}. ${cleanText(li.textContent)}`));
            } else if (tag === 'PRE') {
              const codeEl = el.querySelector('code');
              const code = (codeEl ? codeEl.textContent : el.textContent || '').trim();
              if (!code) return;
              const className = `${el.className || ''} ${codeEl?.className || ''}`;
              let language = '';
              if (/json/i.test(className)) language = 'json';
              else if (/bash|shell/i.test(className)) language = 'bash';
              else if (/javascript|\bjs\b/i.test(className)) language = 'javascript';
              else if (/python|py/.test(className)) language = 'python';
              push(`\`\`\`${language}`.trim());
              push(code);
              push('```');
            } else if (tag === 'TABLE') {
              tableToMarkdown(el).forEach(line => push(line));
            }
            push('');
          };

          const allowed = new Set(['H1', 'H2', 'H3', 'H4', 'P', 'UL', 'OL', 'PRE', 'TABLE']);
          Array.from(clone.querySelectorAll('h1, h2, h3, h4, p, ul, ol, pre, table'))
            .forEach(el => {
              if (!allowed.has((el.tagName || '').toUpperCase())) return;
              convertElement(el);
            });

          return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
        };

        const result = {
          title: '',
          description: '',
          endpoint: '',
          method: 'GET',
          parameters: [],
          responseFields: [],
          codeExamples: [],
          rawContent: '',
          sections: [],
          markdownContent: ''
        };

        // 辅助函数：获取元素的文本内容
        const getText = (selector, parent = document) => {
          const el = parent.querySelector(selector);
          return el ? el.textContent.trim() : '';
        };

        // 辅助函数：提取所有匹配元素的文本
        const getAllText = (selector, parent = document) => {
          return Array.from(parent.querySelectorAll(selector)).map(el => el.textContent.trim()).filter(t => t);
        };

        // 辅助函数：检测 HTTP 方法
        const detectMethod = (text) => {
          const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
          const upper = text.toUpperCase();
          for (const m of methods) {
            if (upper.includes(m)) return m;
          }
          return 'GET';
        };

        const isValidEndpoint = (value) => {
          if (!value) return false;
          const endpoint = value.trim();
          if (endpoint.length < 4) return false;
          if (/^[=:.,;]+$/.test(endpoint)) return false;
          return endpoint.startsWith('http') || endpoint.startsWith('/') || endpoint.includes('/');
        };

        // 辅助函数：提取 API 端点 URL
        const extractEndpoint = (text) => {
          const patterns = [
            /(?:endpoint|url|path)[:\s]*[`'"]?([^`'"\s\n]+)[`'"]?/i,
            /(https?:\/\/[^\s<>"']+)/,
            /\/api\/[^\s<>"']*/,
            /\/v\d+\/[^\s<>"']*/
          ];
          for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) return match[1];
          }
          return '';
        };

        // 1. 提取标题
        const contentRoot = pickBestContentRoot();
        const h1 = contentRoot.querySelector('h1') || document.querySelector('h1');
        if (h1) {
          result.title = cleanText(h1.textContent);
        }

        // 2. 提取描述（h1 后的第一段或 meta description）
        if (h1) {
          let sibling = h1.nextElementSibling;
          while (sibling) {
            if (sibling.tagName === 'P') {
              const text = cleanText(sibling.textContent);
              if (text.length > 30 && !text.includes('Endpoint') && !text.includes('http')) {
                result.description = text;
                break;
              }
            }
            sibling = sibling.nextElementSibling;
          }
        }

        // 如果没有找到描述，尝试从 meta 标签获取
        if (!result.description) {
          const metaDesc = document.querySelector('meta[name="description"]');
          if (metaDesc) {
            result.description = cleanText(metaDesc.getAttribute('content') || '');
          }
        }

        // 3. 提取 API 端点信息
        // 查找常见的端点显示模式
        const endpointPatterns = [
          // 代码块中的端点
          'pre code',
          'code',
          // 端点标签
          '[class*="endpoint"]',
          '[class*="url"]',
          '[class*="path"]',
          // HTTP 方法标签
          '[class*="method"]',
          // 集合格式的端点
          '.opblock-summary-path',
          '.opblock-tag'
        ];

        for (const pattern of endpointPatterns) {
          const elements = document.querySelectorAll(pattern);
          for (const el of elements) {
            const text = el.textContent.trim();

            // 检测 HTTP 方法
            const method = detectMethod(text);
            if (method && method !== result.method) {
              result.method = method;
            }

            // 提取端点
            if (!result.endpoint) {
              const endpoint = extractEndpoint(text);
              if (isValidEndpoint(endpoint)) {
                result.endpoint = endpoint;
              }
            }
          }
        }

        // 4. 提取参数表格
        const tables = document.querySelectorAll('table');
        for (const table of tables) {
          const headers = [];
          const rows = [];

          // 提取表头
          const headerRow = table.querySelector('thead tr') || table.querySelector('tr');
          if (headerRow) {
            const headerCells = headerRow.querySelectorAll('th, td');
            headerCells.forEach(cell => headers.push(cell.textContent.trim().toLowerCase()));
          }

          // 检查是否是参数表格
          const isParamTable = headers.some(h =>
            h.includes('param') || h.includes('name') || h.includes('field') ||
            h.includes('参数') || h.includes('名称') || h.includes('字段')
          );

          // 提取数据行
          const bodyRows = table.querySelectorAll('tbody tr');
          const rowsToProcess = bodyRows.length > 0 ? bodyRows : table.querySelectorAll('tr');

          rowsToProcess.forEach((row, rowIndex) => {
            if (rowIndex === 0 && bodyRows.length === 0) return; // 跳过表头

            const cells = row.querySelectorAll('td, th');
            if (cells.length > 0) {
              const rowData = {};
              cells.forEach((cell, cellIndex) => {
                const headerName = headers[cellIndex] || `column_${cellIndex}`;
                rowData[headerName] = cell.textContent.trim();
              });
              rows.push(rowData);
            }
          });

          // 将表格数据转换为参数或响应字段
          if (isParamTable && rows.length > 0) {
            for (const row of rows) {
              const param = {
                name: row['name'] || row['parameter'] || row['参数'] || row['名称'] || row['column_0'] || '',
                type: row['type'] || row['data type'] || row['类型'] || row['column_1'] || '',
                required: (row['required'] || row['必填'] || row['column_2'] || '').toLowerCase().includes('true') ||
                          (row['required'] || row['必填'] || row['column_2'] || '').includes('是'),
                description: row['description'] || row['desc'] || row['描述'] || row['说明'] || row['column_3'] || ''
              };
              if (param.name) {
                result.parameters.push(param);
              }
            }
          } else if (rows.length > 0) {
            // 可能是响应字段表格
            for (const row of rows) {
              const field = {
                name: row['field'] || row['name'] || row['字段'] || row['名称'] || row['column_0'] || '',
                type: row['type'] || row['类型'] || row['column_1'] || '',
                description: row['description'] || row['描述'] || row['column_2'] || ''
              };
              if (field.name) {
                result.responseFields.push(field);
              }
            }
          }
        }

        // 5. 提取代码示例
        const codeBlocks = contentRoot.querySelectorAll('pre, code');
        for (const block of codeBlocks) {
          const code = block.textContent.trim();
          if (code.length > 30) {
            // 检测语言
            let language = 'text';
            const classList = block.className || '';
            if (classList.includes('json') || code.trim().startsWith('{') || code.trim().startsWith('[')) {
              language = 'json';
            } else if (classList.includes('bash') || classList.includes('shell') || code.includes('curl ')) {
              language = 'bash';
            } else if (classList.includes('python') || code.includes('import ') || code.includes('def ')) {
              language = 'python';
            } else if (classList.includes('javascript') || classList.includes('js') || code.includes('fetch(')) {
              language = 'javascript';
            }

            // 避免重复
            if (!result.codeExamples.find(e => e.code === code)) {
              result.codeExamples.push({ language, code });
            }
          }
        }

        // 6. 提取章节内容（用于非 API 文档页面）
        const mainContent = contentRoot;
        if (mainContent) {
          const headings = mainContent.querySelectorAll('h2, h3');
          for (const heading of headings) {
            const sectionTitle = heading.textContent.trim();
            const sectionContent = [];

            // 收集该标题下的内容
            let sibling = heading.nextElementSibling;
            while (sibling && !['H1', 'H2', 'H3'].includes(sibling.tagName)) {
              const text = sibling.textContent.trim();
              if (text && text.length > 10) {
                sectionContent.push(text);
              }
              sibling = sibling.nextElementSibling;
            }

            if (sectionTitle && sectionContent.length > 0) {
              result.sections.push({
                title: sectionTitle,
                content: sectionContent.join('\n\n')
              });
            }
          }
        }

        // 7. 提取原始内容作为后备
        result.markdownContent = toMarkdownFromNode(contentRoot);
        result.rawContent = cleanText(contentRoot.innerText || document.body.innerText);

        return result;
      });

      // 判断是否是 API 文档页面
      const isApiDoc = data.parameters.length > 0 ||
                       data.responseFields.length > 0 ||
                       data.codeExamples.length > 0 ||
                       data.endpoint !== '' ||
                       url.includes('/api/');

      if (isApiDoc) {
        // API 文档格式
        return {
          type: 'itick-api',
          url,
          title: data.title,
          description: data.description,
          api: {
            method: data.method,
            endpoint: data.endpoint,
            baseUrl: 'https://api.itick.io'
          },
          parameters: data.parameters,
          responseFields: data.responseFields,
          codeExamples: data.codeExamples,
          markdownContent: data.markdownContent,
          rawContent: data.rawContent,
          suggestedFilename: this.generateFilename(url)
        };
      } else {
        // 普通文档格式 - 提取核心内容
        return {
          type: 'itick-doc',
          url,
          title: data.title,
          description: data.description,
          sections: data.sections,
          markdownContent: data.markdownContent,
          rawContent: data.rawContent,
          suggestedFilename: this.generateFilename(url)
        };
      }
    } catch (error) {
      console.error('Failed to parse iTick API doc page:', error.message);
      return {
        type: 'itick-api',
        url,
        title: '',
        description: '',
        api: { method: 'GET', endpoint: '', baseUrl: '' },
        parameters: [],
        responseFields: [],
        codeExamples: [],
        rawContent: '',
        suggestedFilename: this.generateFilename(url)
      };
    }
  }
}

export default ItickApiParser;
