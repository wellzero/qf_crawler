import BaseParser from './base-parser.js';

/**
 * PolyRouter Parser - 解析 PolyRouter API 文档页面
 * PolyRouter 是一个统一的预测市场 API 平台
 * URL 格式: https://docs.polyrouter.io/*
 * 使用 Mintlify 文档框架
 */
class PolyrouterParser extends BaseParser {
  /**
   * 匹配 PolyRouter 文档页面
   * @param {string} url - 页面URL
   * @returns {boolean} 是否匹配
   */
  matches(url) {
    return /^https?:\/\/docs\.polyrouter\.io\/.*/.test(url);
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
      // 替换斜杠为下划线
      const filename = pathname.replace(/\//g, '_') || 'index';
      return filename;
    } catch (e) {
      return 'polyrouter_doc';
    }
  }

  /**
   * 判断是否为 API 文档页面
   * @param {string} url - 页面URL
   * @returns {boolean} 是否为 API 文档
   */
  isApiPage(url) {
    return url.includes('/api-reference/');
  }

  /**
   * 等待页面内容加载完成
   */
  async waitForContent(page) {
    try {
      // 先等待 DOM 内容加载
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
      // 等待网络空闲，但有较短的超时
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {
        console.warn('Network idle timeout, proceeding with loaded content');
      });
      // 等待主内容区域
      await page.waitForSelector('.mdx-content, main, article, h1', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(3000); // 额外等待动态内容
    } catch (error) {
      console.warn('Wait for content error:', error.message);
    }
  }

  /**
   * 解析 PolyRouter 文档页面
   * @param {Page} page - Playwright页面对象
   * @param {string} url - 页面URL
   * @param {Object} options - 解析选项
   * @returns {Promise<Object>} 解析后的页面数据
   */
  async parse(page, url, options = {}) {
    try {
      await this.waitForContent(page);

      const isApi = this.isApiPage(url);

      // 获取页面原始数据
      const rawData = await page.evaluate(() => {
        const result = {
          title: '',
          subtitle: '',
          description: '',
          endpoint: null,
          parameters: [],
          responses: [],
          codeExamples: [],
          rawContent: '',
          links: [],
          callouts: [],
          sections: [],
          warnings: [],
          notes: []
        };

        // 获取主内容区域 - Mintlify 使用 .mdx-content
        const main = document.querySelector('.mdx-content') ||
                     document.querySelector('main, article, [class*="content"]');

        // 提取标题 - 首先在整个文档中查找 h1
        let h1 = document.querySelector('h1');
        if (h1) {
          result.title = h1.textContent.trim();
        }
        // 如果 h1 为空或不存在，尝试从页面标题或其他元素获取
        if (!result.title) {
          const pageTitle = document.querySelector('title');
          if (pageTitle) {
            // 移除 " | PolyRouter" 等后缀
            result.title = pageTitle.textContent.split('|')[0].trim();
          }
        }
        // 如果还是没有，尝试从 header 或特定的标题类获取
        if (!result.title) {
          const headerTitle = document.querySelector('[class*="title"], header h1, .prose h1');
          if (headerTitle) {
            result.title = headerTitle.textContent.trim();
          }
        }
        // 清理标题中的常见后缀
        if (result.title) {
          result.title = result.title
            .replace(/\s*[-|]\s*PolyRouter\s*$/i, '')
            .replace(/\s*[-|]\s*Documentation\s*$/i, '')
            .replace(/\s*[-|]\s*Docs\s*$/i, '')
            .trim();
        }

        // 提取副标题/描述 - Mintlify 页面结构：
        // 结构：HEADER > DIV(h1 parent) + DIV(description parent with mt-2 text-lg prose)
        // 注意：HEADER 在 .mdx-content 之外，所以需要在整个文档中查找

        // 方法1: 在整个文档中查找 text-lg prose 容器中的段落
        let subtitleEl = document.querySelector('[class*="text-lg"][class*="prose"] p');
        if (subtitleEl && !subtitleEl.className.includes('font-semibold')) {
          const text = subtitleEl.textContent.trim();
          // 确保这不是一个 section header
          if (text.length > 10 &&
              !text.match(/^Get Your/i) &&
              !text.match(/^Make Your/i) &&
              !text.match(/^Explore/i) &&
              !text.includes('Response Example')) {
            result.subtitle = text;
            result.description = text;
          }
        }

        // 方法2: 查找 HEADER 中 h1 后的描述段落
        if (!result.description && h1) {
          // h1 在一个 header 内，查找 header 内的其他段落
          const header = h1.closest('header');
          if (header) {
            const headerPs = header.querySelectorAll('p');
            for (const p of headerPs) {
              const text = p.textContent.trim();
              const pClasses = p.className || '';
              // 跳过 font-semibold 的段落（这些是 section headers）
              if (text.length > 10 &&
                  !pClasses.includes('font-semibold') &&
                  !pClasses.includes('font-bold') &&
                  !text.includes('Search') &&
                  !text.includes('Ask AI') &&
                  !text.match(/^Get Your/i) &&
                  !text.match(/^Make Your/i) &&
                  !text.match(/^Explore/i) &&
                  !text.includes('Response Example')) {
                result.subtitle = text;
                result.description = text;
                break;
              }
            }
          }
        }

        // 方法3: 查找 h1 后紧跟的文本节点或段落
        if (!result.description && h1) {
          let nextEl = h1.nextElementSibling;
          while (nextEl) {
            const text = nextEl.textContent.trim();

            if (nextEl.tagName === 'P') {
              const classes = nextEl.className || '';
              if (text.length > 15 &&
                  !classes.includes('font-semibold') &&
                  !classes.includes('font-bold') &&
                  !text.includes('Search') &&
                  !text.includes('Ask AI') &&
                  !text.match(/^Get Your/i) &&
                  !text.match(/^Make Your/i) &&
                  !text.match(/^Explore/i)) {
                result.subtitle = text;
                result.description = text;
                break;
              }
            }

            // 如果是 div 或 section，检查其内部是否有描述段落
            if (nextEl.tagName === 'DIV' || nextEl.tagName === 'SECTION') {
              const paragraphs = nextEl.querySelectorAll('p');
              for (const p of paragraphs) {
                const pText = p.textContent.trim();
                const pClasses = p.className || '';
                if (pText.length > 15 &&
                    !pClasses.includes('font-semibold') &&
                    !pClasses.includes('font-bold') &&
                    !pText.includes('Search') &&
                    !pText.includes('Ask AI')) {
                  result.subtitle = pText;
                  result.description = pText;
                  break;
                }
              }
              if (result.description) break;
            }
            nextEl = nextEl.nextElementSibling;
          }
        }

        // 如果没有副标题，从主内容区域提取描述
        if (!result.description) {
          const contentArea = main || document;
          const paragraphs = contentArea.querySelectorAll('p');
          for (const p of paragraphs) {
            const text = p.textContent.trim();
            const classes = p.className || '';
            // 排除导航、UI 元素和 section headers (font-semibold)
            if (text && text.length > 15 &&
                !classes.includes('font-semibold') &&
                !classes.includes('font-bold') &&
                !classes.includes('font-medium') &&
                !text.includes('Search...') &&
                !text.includes('Ask AI') &&
                !text.includes('Response Example') &&
                !text.match(/^Get Your/i) &&
                !text.match(/^Make Your/i) &&
                !text.match(/^Explore/i)) {
              result.description = text;
              break;
            }
          }
        }

        // 提取所有有意义的文本内容段落（排除导航和UI）
        const contentParagraphs = [];
        const excludePatterns = [
          'Search...', 'Ask AI', 'Get API Key', '⌘K', 'Copy page',
          'Questions? Email us', 'PolyRouter home page', 'Copy',
          'On this page', 'Powered by', 'Mintlify',
          '⌘I', 'x', 'github', 'linkedin'
        ];
        const seenTexts = new Set();

        const contentArea = main || document;
        contentArea.querySelectorAll('p, li').forEach(el => {
          const text = el.textContent.trim();
          // 排除导航和 UI 元素
          const shouldExclude = excludePatterns.some(pattern => text.includes(pattern)) ||
                               text.length < 15 ||
                               seenTexts.has(text) ||
                               text.match(/^(GET|POST|PUT|DELETE|PATCH)\s/); // 排除 API 端点文本

          if (!shouldExclude) {
            contentParagraphs.push(text);
            seenTexts.add(text);
          }
        });
        result.rawContent = contentParagraphs.join('\n\n');

        // 提取 API 端点信息
        const endpointBlock = contentArea.querySelector('[class*="endpoint"], [class*="method"], pre:has(code)');
        if (endpointBlock) {
          const endpointText = endpointBlock.textContent.trim();
          // 解析 HTTP 方法和路径
          const methodMatch = endpointText.match(/^(GET|POST|PUT|DELETE|PATCH)\s+(\/[\w\/{}-]+)/i);
          if (methodMatch) {
            result.endpoint = {
              method: methodMatch[1].toUpperCase(),
              path: methodMatch[2]
            };
          }
        }

        // 提取所有代码块
        const codeBlocks = contentArea.querySelectorAll('pre code, pre');
        const seenCode = new Set();
        codeBlocks.forEach(block => {
          const code = block.textContent.trim();
          if (code && !seenCode.has(code) && code.length > 10) {
            let language = 'text';
            const classList = block.className || '';
            const langMatch = classList.match(/language-(\w+)/);
            if (langMatch) {
              language = langMatch[1];
            } else if (code.startsWith('{') || code.startsWith('[')) {
              language = 'json';
            } else if (code.startsWith('curl')) {
              language = 'bash';
            } else if (code.includes('async ') || code.includes('await ') || code.includes('const ')) {
              language = 'javascript';
            } else if (code.includes('import ') && code.includes('requests')) {
              language = 'python';
            }
            result.codeExamples.push({ language, code });
            seenCode.add(code);
          }
        });

        // 提取表格数据（参数表格）
        const tables = contentArea.querySelectorAll('table');
        tables.forEach((table, index) => {
          const headers = [];
          const rows = [];

          const headerRow = table.querySelector('thead tr') || table.querySelector('tr');
          if (headerRow) {
            const headerCells = headerRow.querySelectorAll('th, td');
            headerCells.forEach(cell => headers.push(cell.textContent.trim()));
          }

          const bodyRows = table.querySelectorAll('tbody tr');
          const rowsToProcess = bodyRows.length > 0 ? bodyRows : table.querySelectorAll('tr');

          rowsToProcess.forEach((row, rowIndex) => {
            if (rowIndex === 0 && bodyRows.length === 0) return;

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

          if (rows.length > 0) {
            result.parameters.push({ index, headers, rows });
          }
        });

        // 提取提示/警告框
        const callouts = contentArea.querySelectorAll('[class*="callout"], [class*="note"], [class*="warning"], [class*="info"]');
        callouts.forEach(callout => {
          const type = callout.className.match(/(?:callout|note|warning|info)-?(\w+)/)?.[1] || 'note';
          const content = callout.textContent.trim();
          if (content) {
            result.callouts.push({ type, content });
          }
        });

        // 提取 Mintlify 特定的警告和提示框 (使用颜色类)
        document.querySelectorAll('[class*="prose"][class*="yellow"], [class*="prose"][class*="warning"]').forEach(el => {
          const text = el.textContent.trim();
          if (text && text.length > 10) {
            result.warnings.push(text);
          }
        });
        document.querySelectorAll('[class*="prose"][class*="blue"], [class*="prose"][class*="info"]').forEach(el => {
          const text = el.textContent.trim();
          if (text && text.length > 10) {
            result.notes.push(text);
          }
        });

        // 提取所有链接
        const links = contentArea.querySelectorAll('a[href]');
        const seenLinks = new Set();
        links.forEach(link => {
          const href = link.href;
          const text = link.textContent.trim();
          if (text && !seenLinks.has(href) && href.includes('polyrouter.io')) {
            result.links.push({ text, href });
            seenLinks.add(href);
          }
        });

        // 提取章节标题
        const headings = contentArea.querySelectorAll('h2, h3');
        const uiSections = ['Get API Key', 'Discord Community', 'Follow on X', 'On this page', 'API Reference', 'Copy page'];
        headings.forEach(heading => {
          const level = parseInt(heading.tagName.substring(1));
          const text = heading.textContent.trim();
          // 过滤掉特殊字符开头的标题和 UI 相关的标题
          if (text && !text.startsWith('​') && !uiSections.includes(text)) {
            result.sections.push({ level, text });
          }
        });

        return result;
      });

      // 解析 API 响应示例
      const responseExamples = this.parseResponseExamples(rawData.codeExamples);

      return {
        type: isApi ? 'polyrouter-api' : 'polyrouter-doc',
        url,
        title: rawData.title,
        subtitle: rawData.subtitle,
        description: rawData.description,
        endpoint: rawData.endpoint,
        parameters: rawData.parameters,
        responses: responseExamples,
        codeExamples: rawData.codeExamples,
        callouts: rawData.callouts,
        warnings: rawData.warnings,
        notes: rawData.notes,
        sections: rawData.sections,
        links: rawData.links,
        rawContent: rawData.rawContent,
        suggestedFilename: this.generateFilename(url)
      };
    } catch (error) {
      console.error('Failed to parse PolyRouter page:', error.message);
      return {
        type: 'polyrouter-doc',
        url,
        title: '',
        subtitle: '',
        description: '',
        endpoint: null,
        parameters: [],
        responses: [],
        codeExamples: [],
        callouts: [],
        warnings: [],
        notes: [],
        sections: [],
        links: [],
        rawContent: '',
        suggestedFilename: this.generateFilename(url)
      };
    }
  }

  /**
   * 从代码示例中解析响应示例
   * @param {Array} codeExamples - 代码示例数组
   * @returns {Array} 响应示例
   */
  parseResponseExamples(codeExamples) {
    const responses = [];
    codeExamples.forEach(example => {
      if (example.language === 'json' && example.code.startsWith('{')) {
        try {
          const parsed = JSON.parse(example.code);
          responses.push({
            status: 200,
            body: parsed,
            raw: example.code
          });
        } catch (e) {
          // JSON 解析失败，保留原始代码
        }
      }
    });
    return responses;
  }
}

export default PolyrouterParser;