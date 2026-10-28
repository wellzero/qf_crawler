import BaseParser from './base-parser.js';

/**
 * RSSHub Routes Parser - 专门解析 RSSHub 路由文档页面
 * RSSHub 文档使用 VitePress 构建，路由文档位于 /routes/ 下
 * 例如: https://docs.rsshub.app/routes/twitter
 */
class RsshubParser extends BaseParser {
  /**
   * 匹配 RSSHub 路由文档页面
   * @param {string} url - 页面URL
   * @returns {boolean} 是否匹配
   */
  matches(url) {
    return /^https?:\/\/docs\.rsshub\.app\/routes/.test(url);
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
      // 移除 /routes 前缀
      pathname = pathname.replace(/^\/routes\/?/, '');
      pathname = pathname.replace(/\/$/, '');
      const filename = pathname.replace(/\//g, '_') || 'routes_overview';
      return filename;
    } catch (e) {
      return 'rsshub_doc';
    }
  }

  /**
   * 从 URL 提取路由路径
   * @param {string} url - 页面URL
   * @returns {string} 路由路径
   */
  extractRoutePath(url) {
    try {
      const urlObj = new URL(url);
      let pathname = urlObj.pathname;
      pathname = pathname.replace(/^\/routes\/?/, '');
      return pathname;
    } catch (e) {
      return '';
    }
  }

  /**
   * 等待文档内容加载完成
   */
  async waitForContent(page) {
    try {
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
      // VitePress 使用多种内容容器类
      await page.waitForSelector('.vp-doc, .content, article, .theme-default-content, main', { timeout: 15000 });
      // 等待一下让内容完全渲染
      await page.waitForTimeout(3000);
    } catch (error) {
      console.warn('Wait for content timeout, proceeding anyway:', error.message);
    }
  }

  /**
   * 解析 RSSHub 路由文档页面
   * @param {Page} page - Playwright页面对象
   * @param {string} url - 页面URL
   * @param {Object} options - 解析选项
   * @returns {Promise<Object>} 解析后的页面数据
   */
  async parse(page, url, options = {}) {
    try {
      await this.waitForContent(page);

      const routePath = this.extractRoutePath(url);

      const data = await page.evaluate((targetPath) => {
        const result = {
          title: '',
          description: '',
          routes: [],
          parameters: [],
          routeInfo: {},
          codeBlocks: [],
          headings: [],
          paragraphs: [],
          lists: [],
          rawContent: ''
        };

        // VitePress 文档内容选择器（按优先级尝试）
        const selectors = [
          '.vp-doc',
          '.content',
          'article',
          '.theme-default-content',
          'main .content',
          'main'
        ];

        let contentContainer = null;
        for (const selector of selectors) {
          const el = document.querySelector(selector);
          if (el && el.innerText.trim().length > 50) {
            contentContainer = el;
            break;
          }
        }

        // 如果找不到任何内容容器，尝试获取整个 body
        if (!contentContainer) {
          contentContainer = document.body;
        }

        // 提取标题
        const h1 = contentContainer.querySelector('h1');
        if (h1) {
          result.title = h1.textContent.trim();
        } else {
          // 如果没有 h1，尝试从页面标题获取
          const pageTitle = document.querySelector('title');
          if (pageTitle) {
            const titleText = pageTitle.textContent.trim();
            // 移除 " | RSSHub" 后缀
            result.title = titleText.replace(/\s*\|\s*RSSHub\s*$/, '').trim();
          }
        }

        // 获取原始文本内容用于解析
        const rawText = contentContainer.innerText;

        // 解析路由信息（RSSHub 文档格式）
        // 格式: 🛎️ Route: /path/:param?
        const routeMatch = rawText.match(/🛎️\s*Route:\s*([^\n]+)/);
        if (routeMatch) {
          result.routeInfo.path = routeMatch[1].trim();
        }

        // 解析作者信息
        // 格式: 👨‍💻 Author: name
        const authorMatch = rawText.match(/👨‍💻\s*Author:\s*([^\n]+)/);
        if (authorMatch) {
          result.routeInfo.author = authorMatch[1].trim();
        }

        // 解析示例 URL
        // 格式: 💡 Example: https://rsshub.app/...
        const exampleMatch = rawText.match(/💡\s*Example:\s*([^\n]+)/);
        if (exampleMatch) {
          result.routeInfo.example = exampleMatch[1].trim();
        }

        // 解析源代码路径
        // 格式: 🐙 Source Code: /path/file.ts
        const sourceMatch = rawText.match(/🐙\s*Source Code:\s*([^\n]+)/);
        if (sourceMatch) {
          result.routeInfo.sourceCode = sourceMatch[1].trim();
        }

        // 解析参数部分
        // 格式: 🔗 Parameters: 后面跟着参数定义
        const paramsMatch = rawText.match(/🔗\s*Parameters:\s*([\s\S]*?)(?=\n🐙|\nON THIS PAGE|\n##|$)/);
        if (paramsMatch) {
          const paramsText = paramsMatch[1];
          // 参数格式：参数名 后面跟着 Required/Optional 和 Description
          const paramLines = paramsText.split('\n').filter(line => line.trim());

          let currentParam = null;
          for (let i = 0; i < paramLines.length; i++) {
            const line = paramLines[i].trim();

            // 检测新参数（不以空格或特殊词开头的行）
            if (line && !line.startsWith('Required') && !line.startsWith('Optional') &&
                !line.startsWith('Default:') && !line.startsWith('Options:') &&
                !line.startsWith('Description:')) {

              // 保存上一个参数
              if (currentParam) {
                result.parameters.push(currentParam);
              }

              currentParam = {
                name: line,
                required: false,
                default: '',
                options: '',
                description: ''
              };
            } else if (currentParam) {
              if (line.startsWith('Required')) {
                currentParam.required = true;
              } else if (line.startsWith('Optional')) {
                currentParam.required = false;
              } else if (line.startsWith('Default:')) {
                currentParam.default = line.replace('Default:', '').trim();
              } else if (line.startsWith('Options:')) {
                currentParam.options = line.replace('Options:', '').trim();
              } else if (line.startsWith('Description:')) {
                currentParam.description = line.replace('Description:', '').trim();
              }
            }
          }

          // 保存最后一个参数
          if (currentParam) {
            result.parameters.push(currentParam);
          }
        }

        // 提取描述（h1 后的第一段）
        if (h1) {
          let nextElement = h1.nextElementSibling;
          while (nextElement && nextElement.tagName === 'P') {
            const text = nextElement.textContent.trim();
            if (text) {
              result.description += text + '\n\n';
            }
            nextElement = nextElement.nextElementSibling;
          }
          result.description = result.description.trim();
        }

        // 提取所有标题
        const headings = contentContainer.querySelectorAll('h1, h2, h3, h4, h5, h6');
        headings.forEach(h => {
          const level = parseInt(h.tagName.charAt(1));
          const text = h.textContent.trim();
          // 跳过重复的 h1
          if (level !== 1 || text !== result.title) {
            result.headings.push({ level, text });
          }
        });

        // 提取段落
        const paragraphs = contentContainer.querySelectorAll('p');
        paragraphs.forEach(p => {
          const text = p.textContent.trim();
          if (text && text.length > 10) {
            result.paragraphs.push(text);
          }
        });

        // 提取列表 - 但排除参数相关的内容
        const lists = contentContainer.querySelectorAll('ul, ol');
        lists.forEach(list => {
          const items = [];
          list.querySelectorAll('li').forEach(li => {
            const text = li.textContent.trim();
            if (text) items.push(text);
          });
          if (items.length > 0) {
            result.lists.push({
              type: list.tagName.toLowerCase(),
              items
            });
          }
        });

        // 提取所有路由表格
        const tables = contentContainer.querySelectorAll('table');
        tables.forEach((table, index) => {
          const headers = [];
          const rows = [];

          // 提取表头
          const thead = table.querySelector('thead');
          if (thead) {
            const headerCells = thead.querySelectorAll('th, td');
            headerCells.forEach(cell => headers.push(cell.textContent.trim()));
          } else {
            // 如果没有 thead，尝试从第一行获取表头
            const firstRow = table.querySelector('tr');
            if (firstRow) {
              const headerCells = firstRow.querySelectorAll('th, td');
              headerCells.forEach(cell => headers.push(cell.textContent.trim()));
            }
          }

          // 提取数据行
          const tbody = table.querySelector('tbody');
          const bodyRows = tbody ? tbody.querySelectorAll('tr') : table.querySelectorAll('tr');

          bodyRows.forEach((row, rowIndex) => {
            // 如果没有 thead 且是第一行，跳过
            if (!thead && rowIndex === 0) return;

            const cells = row.querySelectorAll('td, th');
            if (cells.length > 0) {
              const rowData = {};
              const rowArray = [];

              cells.forEach((cell, cellIndex) => {
                const cellText = cell.textContent.trim();
                rowArray.push(cellText);

                const headerName = headers[cellIndex] || `column_${cellIndex}`;
                rowData[headerName] = cellText;

                // 提取链接
                const link = cell.querySelector('a');
                if (link) {
                  rowData[`${headerName}_link`] = link.href;
                }
              });

              // 如果有表头，使用对象格式；否则使用数组格式
              rows.push(headers.length > 0 ? rowData : rowArray);
            }
          });

          if (rows.length > 0) {
            result.routes.push({
              index,
              headers,
              rows,
              caption: table.querySelector('caption')?.textContent.trim() || ''
            });
          }
        });

        // 提取代码块
        const codeBlocks = contentContainer.querySelectorAll('pre code, pre');
        codeBlocks.forEach(block => {
          const code = block.textContent.trim();
          if (code && code.length > 5) {
            let language = 'text';
            const classList = block.className || '';

            // 尝试从 class 中提取语言
            const langMatch = classList.match(/language-(\w+)/);
            if (langMatch) {
              language = langMatch[1];
            } else if (code.startsWith('{') || code.startsWith('[')) {
              language = 'json';
            } else if (code.startsWith('<')) {
              language = 'html';
            } else if (code.includes('curl') || code.startsWith('http') || code.startsWith('GET') || code.startsWith('POST')) {
              language = 'bash';
            } else if (code.includes('function') || code.includes('const ') || code.includes('let ')) {
              language = 'javascript';
            }

            result.codeBlocks.push({ language, code });
          }
        });

        // 提取原始内容
        result.rawContent = contentContainer.innerText;

        return result;
      }, routePath);

      // 构建返回结果
      const result = {
        type: 'rsshub-route',
        url,
        routePath,
        title: data.title,
        description: data.description,
        routes: data.routes,
        parameters: data.parameters || [],
        routeInfo: data.routeInfo || {},
        codeBlocks: data.codeBlocks,
        headings: data.headings,
        paragraphs: data.paragraphs,
        lists: data.lists,
        rawContent: data.rawContent,
        suggestedFilename: this.generateFilename(url)
      };

      console.log(`Parsed RSSHub route: ${data.title || 'Untitled'}, ${data.routes.length} tables, ${data.parameters?.length || 0} parameters, ${data.codeBlocks.length} code blocks`);

      return result;
    } catch (error) {
      console.error('Failed to parse RSSHub route page:', error.message);
      return {
        type: 'rsshub-route',
        url,
        routePath: this.extractRoutePath(url),
        title: '',
        description: '',
        routes: [],
        codeBlocks: [],
        headings: [],
        paragraphs: [],
        lists: [],
        rawContent: '',
        suggestedFilename: this.generateFilename(url)
      };
    }
  }
}

export default RsshubParser;