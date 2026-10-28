import BaseParser from './base-parser.js';

/**
 * Brave Search API Parser - 解析 Brave Search API 文档页面
 * Brave Search 提供 Web Search API 服务
 * 文档地址: https://api-dashboard.search.brave.com/documentation
 * 子页面如: https://api-dashboard.search.brave.com/documentation/services/web-search
 */
class BraveSearchParser extends BaseParser {
  /**
   * 匹配 Brave Search API 文档页面
   * 支持 /documentation 和 /api-reference 两种路径
   * @param {string} url - 页面URL
   * @returns {boolean} 是否匹配
   */
  matches(url) {
    return /^https?:\/\/api-dashboard\.search\.brave\.com\/(documentation|api-reference)/.test(url);
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
    // 从 URL 提取路径部分作为文件名
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(p => p);
    if (pathParts.length >= 3) {
      return pathParts.slice(-2).join('-');
    } else if (pathParts.length > 0) {
      return pathParts.join('-');
    }
    return 'brave-search-api';
  }

  /**
   * 解析 Brave Search API 文档页面
   * @param {Page} page - Playwright页面对象
   * @param {string} url - 页面URL
   * @param {Object} options - 解析选项
   * @returns {Promise<Object>} 解析后的页面数据
   */
  async parse(page, url, options = {}) {
    try {
      // 等待页面加载完成 - SPA 需要更长时间
      await this.waitForContent(page);

      // 从页面提取内容
      const data = await page.evaluate(() => {
        const result = {
          title: '',
          description: '',
          endpoint: 'https://api.search.brave.com/res/v1/web/search',
          method: 'GET',
          sections: [],
          tables: [],
          examples: [],
          rawContent: ''
        };

        // 提取标题 - 优先从 document.title 获取
        result.title = document.title || '';

        // 如果标题包含 " - Brave Search API"，提取前面部分
        const titleMatch = result.title.match(/^(.+?)\s*[-|]\s*Brave/);
        if (titleMatch) {
          result.title = titleMatch[1].trim();
        }

        // 提取面包屑导航来确定页面路径
        const breadcrumbs = [];
        document.querySelectorAll('nav[aria-label="breadcrumb"] a, .breadcrumb a, [class*="breadcrumb"] a').forEach(a => {
          breadcrumbs.push(a.textContent.trim());
        });

        // 提取所有 H2/H3 标题及其内容
        const headings = document.querySelectorAll('h2, h3');
        headings.forEach(heading => {
          const section = {
            level: heading.tagName,
            title: heading.textContent.trim(),
            content: [],
            codeBlocks: []
          };

          // 获取标题后面的内容直到下一个同级或更高级标题
          let sibling = heading.nextElementSibling;
          while (sibling && !['H1', 'H2'].includes(sibling.tagName) &&
                 !(heading.tagName === 'H2' && sibling.tagName === 'H2') &&
                 !(heading.tagName === 'H3' && (sibling.tagName === 'H2' || sibling.tagName === 'H3'))) {
            if (sibling.tagName === 'P') {
              const text = sibling.textContent.trim();
              if (text.length > 10) {
                section.content.push(text);
              }
            } else if (sibling.tagName === 'UL' || sibling.tagName === 'OL') {
              const items = [];
              sibling.querySelectorAll('li').forEach(li => {
                items.push(li.textContent.trim());
              });
              if (items.length > 0) {
                section.content.push('• ' + items.join('\n• '));
              }
            } else if (sibling.tagName === 'PRE') {
              const code = sibling.textContent.trim();
              if (code.length > 5) {
                section.codeBlocks.push(code);
              }
            } else if (sibling.tagName === 'DIV') {
              // 处理卡片式内容（如 pricing 页面的定价卡片）
              const divText = sibling.textContent.trim();
              // 检查是否包含定价或特殊信息
              if (divText.length > 20 && divText.length < 2000) {
                // 检查是否是定价卡片（包含 $ 符号或特定关键词）
                const hasPrice = divText.includes('$') || divText.includes('per') || divText.includes('requests');
                const isCard = sibling.className && (
                  sibling.className.includes('card') ||
                  sibling.className.includes('plan') ||
                  sibling.className.includes('pricing') ||
                  sibling.className.includes('tier')
                );
                if (hasPrice || isCard || divText.length < 500) {
                  section.content.push(divText);
                }
              }
            }
            sibling = sibling.nextElementSibling;
          }

          // 只保留有内容的section
          if (section.content.length > 0 || section.codeBlocks.length > 0) {
            result.sections.push(section);
          }
        });

        // 提取所有表格
        document.querySelectorAll('table').forEach((table, idx) => {
          const headers = [];
          const rows = [];

          // 提取表头
          table.querySelectorAll('thead th, thead td').forEach(th => {
            headers.push(th.textContent.trim());
          });

          // 如果没有 thead，尝试从第一行获取
          if (headers.length === 0) {
            const firstRow = table.querySelector('tr');
            if (firstRow) {
              firstRow.querySelectorAll('th, td').forEach(cell => {
                headers.push(cell.textContent.trim());
              });
            }
          }

          // 提取数据行
          const tbody = table.querySelector('tbody');
          const rowElements = tbody ? tbody.querySelectorAll('tr') : table.querySelectorAll('tr');

          rowElements.forEach((row, rowIdx) => {
            // 如果没有 thead，跳过第一行（作为表头）
            if (!tbody && rowIdx === 0 && table.querySelector('thead') === null) {
              return;
            }

            const rowData = [];
            row.querySelectorAll('td').forEach(td => {
              rowData.push(td.textContent.trim());
            });

            if (rowData.length > 0) {
              rows.push(rowData);
            }
          });

          if (headers.length > 0 || rows.length > 0) {
            result.tables.push({
              index: idx,
              headers,
              rows
            });
          }
        });

        // 提取代码示例 (curl 命令)
        document.querySelectorAll('pre, code').forEach(el => {
          const code = el.textContent.trim();
          if (code.includes('curl') && code.includes('api.search.brave.com')) {
            result.examples.push({
              type: 'request',
              language: 'bash',
              code
            });
          } else if (code.startsWith('{') || code.startsWith('[')) {
            // JSON 响应
            try {
              JSON.parse(code);
              result.examples.push({
                type: 'response',
                language: 'json',
                code
              });
            } catch (e) {
              // 不是有效的 JSON
            }
          }
        });

        // 提取原始内容作为备份
        const allText = [];
        document.querySelectorAll('h2, h3, h4, p, li').forEach(el => {
          const text = el.textContent.trim();
          if (text && text.length > 5 && !allText.includes(text)) {
            allText.push(text);
          }
        });

        // 对于卡片式页面（如 pricing），也提取卡片内容
        document.querySelectorAll('div[class*="card"], div[class*="plan"], div[class*="pricing"], div[class*="tier"]').forEach(el => {
          const text = el.textContent.trim();
          if (text && text.length > 20 && text.length < 2000 && !allText.some(t => t.includes(text.slice(0, 50)))) {
            allText.push(text);
          }
        });

        result.rawContent = allText.join('\n\n');

        // 如果没有提取到足够内容，尝试从主内容区域提取所有文本
        if (result.rawContent.length < 500) {
          const mainContent = document.querySelector('main') ||
                             document.querySelector('article') ||
                             document.querySelector('[role="main"]') ||
                             document.querySelector('.content');
          if (mainContent) {
            const mainText = mainContent.textContent.trim();
            if (mainText.length > result.rawContent.length) {
              result.rawContent = mainText;
            }
          }
        }

        return result;
      });

      // 尝试从代码示例中提取 API 端点
      if (data.examples.length > 0) {
        const firstRequest = data.examples.find(e => e.type === 'request');
        if (firstRequest) {
          const urlMatch = firstRequest.code.match(/https:\/\/[^\s"']+/);
          if (urlMatch) {
            data.endpoint = urlMatch[0];
          }
        }
      }

      return {
        type: 'brave-search-api',
        url,
        title: data.title,
        description: data.sections[0]?.content?.[0] || '',
        endpoint: data.endpoint,
        method: data.method,
        sections: data.sections,
        tables: data.tables,
        examples: data.examples,
        rawContent: data.rawContent,
        suggestedFilename: this.generateFilename(url)
      };
    } catch (error) {
      console.error('Failed to parse Brave Search API page:', error.message);
      return {
        type: 'brave-search-api',
        url,
        title: '',
        description: '',
        endpoint: '',
        method: 'GET',
        sections: [],
        tables: [],
        examples: [],
        rawContent: '',
        suggestedFilename: this.generateFilename(url)
      };
    }
  }

  /**
   * 等待页面内容加载完成 - 针对SPA优化
   */
  async waitForContent(page) {
    try {
      // 等待网络空闲
      await page.waitForLoadState('networkidle', { timeout: 30000 });
      // 等待主要内容出现（更宽松的选择器）
      await page.waitForSelector('h2, h3, table, pre, main, article, p', { timeout: 15000 });
      // 额外等待确保动态内容加载
      await page.waitForTimeout(3000);
    } catch (error) {
      console.warn('Wait for content timeout, proceeding anyway:', error.message);
    }
  }
}

export default BraveSearchParser;