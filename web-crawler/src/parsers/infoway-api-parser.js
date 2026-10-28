import BaseParser from './base-parser.js';

/**
 * Infoway API Parser - 专门解析 docs.infoway.io API 文档页面
 * Infoway 是一个金融市场数据 API 提供商，支持 A股、港股、美股、加密货币、外汇、期货等实时行情
 * 文档基于 GitBook 平台构建，是 SPA 应用
 */
class InfowayApiParser extends BaseParser {
  /**
   * 匹配 Infoway API 文档页面
   * @param {string} url - 页面URL
   * @returns {boolean} 是否匹配
   */
  matches(url) {
    return /^https?:\/\/docs\.infoway\.io/.test(url);
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
   * @returns {boolean}
   */
  supportsLinkDiscovery() {
    return true;
  }

  /**
   * 从 GitBook 侧边栏提取所有文档链接
   * @param {Page} page - Playwright页面对象
   * @returns {Promise<string[]>} 发现的URL列表
   */
  async discoverLinks(page) {
    const discoveredUrls = new Set();
    const baseUrl = 'https://docs.infoway.io';
    const sidebarSelector = [
      '[class*="Sidebar"]',
      '[class*="sidebar"]',
      'aside',
      'main a[href^="/"]'
    ].join(', ');

    try {
      // 等待导航/正文链接加载（GitBook 在不同主题下 class 命名不同）
      await page.waitForSelector(sidebarSelector, { timeout: 15000 });

      // 提取文档导航中的所有链接
      const links = await page.evaluate(() => {
        const urls = [];
        const navSelectors = [
          '[class*="Sidebar"] a[href]',
          '[class*="sidebar"] a[href]',
          'aside a[href]',
          'main a[href^="/"]'
        ].join(', ');

        const sidebarLinks = document.querySelectorAll(navSelectors);

        sidebarLinks.forEach(link => {
          const href = link.getAttribute('href');
          if (
            href &&
            !href.includes('~gitbook') &&
            !href.includes('~image') &&
            !href.startsWith('#')
          ) {
            urls.push(href);
          }
        });

        // 也尝试从页面脚本中提取结构化数据
        const scripts = document.querySelectorAll('script');
        scripts.forEach(script => {
          const content = script.textContent || '';
          // 匹配 JSON 中的 URL 路径
          const matches = content.matchAll(/"path"\s*:\s*"([^"]+)"/g);
          for (const match of matches) {
            if (match[1] && !match[1].includes('~')) {
              urls.push(match[1]);
            }
          }
        });

        return [...new Set(urls)];
      });

      // 转换为完整 URL
      for (const link of links) {
        if (link.startsWith('/')) {
          discoveredUrls.add(baseUrl + link);
        } else if (link.startsWith(baseUrl)) {
          discoveredUrls.add(link);
        } else if (/^[a-z0-9][a-z0-9\-_/]+$/i.test(link)) {
          discoveredUrls.add(`${baseUrl}/${link.replace(/^\//, '')}`);
        } else if (link.startsWith('http')) {
          if (link.includes('docs.infoway.io')) {
            discoveredUrls.add(link);
          }
        }
      }

      console.log(`[InfowayParser] Discovered ${discoveredUrls.size} URLs`);
    } catch (error) {
      console.warn('[InfowayParser] Link discovery failed:', error.message);
    }

    return Array.from(discoveredUrls);
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
      // 用下划线替换斜杠
      const filename = pathname.replace(/\//g, '_') || 'overview';
      return filename;
    } catch (e) {
      return 'api_doc';
    }
  }

  /**
   * 从 URL 提取文档路径
   * @param {string} url - 页面URL
   * @returns {string} 文档路径
   */
  extractDocPath(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.pathname.replace(/^\//, '');
    } catch (e) {
      return '';
    }
  }

  /**
   * 解析 Infoway API 文档页面
   * @param {Page} page - Playwright页面对象
   * @param {string} url - 页面URL
   * @param {Object} options - 解析选项
   * @returns {Promise<Object>} 解析后的页面数据
   */
  async parse(page, url, options = {}) {
    try {
      // 等待页面加载完成
      await this.waitForContent(page);

      // 从 URL 提取文档路径
      const docPath = this.extractDocPath(url);

      // 提取 GitBook 页面内容
      const data = await page.evaluate(() => {
        const result = {
          title: '',
          description: '',
          sections: [],
          codeExamples: [],
          tables: [],
          parameters: [],
          endpoints: [],
          rawContent: ''
        };

        // GitBook 主内容区域选择器
        const mainContent = document.querySelector(
          '[class*="Content"] article, [class*="PageContent"], main article, [data-testid="page.contentEditor"], main'
        );

        if (!mainContent) {
          // 回退方案：获取整个页面的文本
          result.title = document.title;
          result.rawContent = document.body.innerText;
          if (result.rawContent?.trim()) {
            result.sections.push({ type: 'text', value: result.rawContent.trim() });
          }
          return result;
        }

        // 提取标题
        const h1 = mainContent.querySelector('h1');
        if (h1) {
          result.title = h1.textContent.trim();
        } else {
          result.title = document.title.split('|')[0].trim();
        }

        // 提取描述（标题后的第一段）
        if (h1) {
          let nextEl = h1.nextElementSibling;
          while (nextEl) {
            if (nextEl.tagName === 'P') {
              const text = nextEl.textContent.trim();
              if (text.length > 20) {
                result.description = text;
                break;
              }
            }
            nextEl = nextEl.nextElementSibling;
          }
        }

        // 遍历所有内容块
        const contentElements = mainContent.querySelectorAll('h1, h2, h3, h4, p, pre, table, ul, ol, [class*="CodeBlock"]');

        let currentSection = null;
        const processedCodeHashes = new Set(); // 用于代码块去重

        // 需要过滤的无用标题
        const skipTitles = ['Authorizations', 'Query Parameters', 'Path Parameters', 'Headers', 'Request Body', 'Responses'];

        contentElements.forEach(el => {
          const tagName = el.tagName.toLowerCase();
          const className = el.className || '';

          // 标题处理
          if (tagName === 'h2' || tagName === 'h3' || tagName === 'h4') {
            const titleText = el.textContent.trim();
            // 跳过无用的标题
            if (skipTitles.some(skip => titleText.includes(skip))) {
              return;
            }
            if (currentSection) {
              result.sections.push(currentSection);
            }
            currentSection = {
              type: 'heading',
              level: parseInt(tagName.charAt(1)),
              title: titleText,
              content: []
            };
          }
          // 段落处理
          else if (tagName === 'p') {
            const text = el.textContent.trim();
            // 过滤交互按钮文本和无意义内容
            if (text && text.length > 3 &&
                !text.match(/^Hide\s+(child\s+)?attributes?$/i) &&
                !text.match(/^Show\s+(child\s+)?attributes?$/i) &&
                !text.match(/^"[^"]*"$/) && // 排除纯引号包裹的值
                text !== 'Successful response' &&
                text !== 'Error response') {
              if (currentSection) {
                currentSection.content.push({ type: 'text', value: text });
              } else {
                result.sections.push({ type: 'text', value: text });
              }
            }
          }
          // 代码块处理
          else if (tagName === 'pre' || className.includes('CodeBlock') || className.includes('code')) {
            const code = el.textContent.trim();
            if (code && code.length > 10) {
              // 代码块去重
              const codeHash = code.replace(/\s+/g, '').substring(0, 100);
              if (processedCodeHashes.has(codeHash)) {
                return;
              }
              processedCodeHashes.add(codeHash);

              // 尝试识别代码语言
              let language = 'text';
              if (code.includes('curl') || code.includes('http')) {
                language = 'bash';
              } else if (code.startsWith('{') || code.startsWith('[')) {
                language = 'json';
              } else if (code.includes('import ') || code.includes('def ') || code.includes('class ')) {
                language = 'python';
              } else if (code.includes('const ') || code.includes('function') || code.includes('=>')) {
                language = 'javascript';
              }

              const codeBlock = { type: 'code', language, value: code };
              result.codeExamples.push(codeBlock);

              if (currentSection) {
                currentSection.content.push(codeBlock);
              } else {
                result.sections.push(codeBlock);
              }
            }
          }
          // 表格处理
          else if (tagName === 'table') {
            const rows = [];
            el.querySelectorAll('tr').forEach(tr => {
              const cells = Array.from(tr.querySelectorAll('th, td')).map(cell => cell.textContent.trim());
              if (cells.length > 0 && cells.some(c => c)) {
                rows.push(cells);
              }
            });

            if (rows.length > 0) {
              const table = { type: 'table', data: rows };
              result.tables.push(table);

              // 检测是否为参数表格
              const firstRow = rows[0] || [];
              if (firstRow.some(h => h.toLowerCase().includes('param') || h.toLowerCase().includes('name') || h.toLowerCase().includes('field'))) {
                table.isParameterTable = true;
                result.parameters.push(rows);
              }

              if (currentSection) {
                currentSection.content.push(table);
              } else {
                result.sections.push(table);
              }
            }
          }
          // 列表处理
          else if (tagName === 'ul' || tagName === 'ol') {
            const items = Array.from(el.querySelectorAll('li')).map(li => li.textContent.trim()).filter(t => t);
            if (items.length > 0) {
              const list = { type: 'list', ordered: tagName === 'ol', items };
              if (currentSection) {
                currentSection.content.push(list);
              } else {
                result.sections.push(list);
              }
            }
          }
        });

        // 添加最后一个 section
        if (currentSection) {
          result.sections.push(currentSection);
        }

        // 提取原始内容
        result.rawContent = (mainContent.innerText || '').trim();

        // 若主内容过短，使用 body 文本兜底（避免 SPA 延迟导致正文缺失）
        if (result.rawContent.length < 120) {
          const bodyText = (document.body?.innerText || '').trim();
          if (bodyText.length > result.rawContent.length) {
            result.rawContent = bodyText;
          }
        }

        // 兜底：若结构化提取为空但原文存在，则保留正文全文
        if (result.sections.length === 0 && result.rawContent?.trim()) {
          result.sections.push({ type: 'text', value: result.rawContent.trim() });
        }

        return result;
      });

      // 生成 Markdown
      const markdown = this.convertToMarkdown(data);

      return {
        type: 'infoway-api',
        url,
        title: data.title,
        description: data.description,
        sections: data.sections,
        codeExamples: data.codeExamples,
        tables: data.tables,
        parameters: data.parameters,
        markdownContent: markdown,
        rawContent: data.rawContent,
        suggestedFilename: this.generateFilename(url)
      };
    } catch (error) {
      console.error('Failed to parse Infoway API doc page:', error.message);
      return {
        type: 'infoway-api',
        url,
        title: '',
        description: '',
        sections: [],
        codeExamples: [],
        tables: [],
        parameters: [],
        markdownContent: '',
        rawContent: '',
        suggestedFilename: this.generateFilename(url)
      };
    }
  }

  /**
   * 将结构化数据转换为 Markdown
   * @param {Object} data - 解析后的数据
   * @returns {string} Markdown 内容
   */
  convertToMarkdown(data) {
    const lines = [];

    // 主标题
    if (data.title) {
      lines.push(`# ${data.title}`, '');
    }

    // 描述
    if (data.description) {
      lines.push(data.description, '');
    }

    // 处理各部分
    for (const section of data.sections) {
      if (section.type === 'heading') {
        const prefix = '#'.repeat(section.level);
        lines.push('', `${prefix} ${section.title}`, '');

        // 处理该标题下的内容
        for (const content of section.content || []) {
          if (content.type === 'text') {
            lines.push(content.value, '');
          } else if (content.type === 'code') {
            lines.push('```' + content.language, content.value, '```', '');
          } else if (content.type === 'table') {
            this._formatTable(lines, content.data);
          } else if (content.type === 'list') {
            for (const item of content.items) {
              lines.push(`${content.ordered ? '1.' : '-'} ${item}`);
            }
            lines.push('');
          }
        }
      } else if (section.type === 'text') {
        lines.push(section.value, '');
      } else if (section.type === 'code') {
        lines.push('```' + section.language, section.value, '```', '');
      } else if (section.type === 'table') {
        this._formatTable(lines, section.data);
      } else if (section.type === 'list') {
        for (const item of section.items) {
          lines.push(`${section.ordered ? '1.' : '-'} ${item}`);
        }
        lines.push('');
      }
    }

    // 最终兜底：如果没有提取到结构化内容，至少保留正文文本
    const hasBodyContent = lines.some(line => line && !line.startsWith('#'));
    if (!hasBodyContent && data.rawContent?.trim()) {
      lines.push('## 正文', '');
      const paragraphs = data.rawContent
        .split(/\n{2,}/)
        .map(p => p.trim())
        .filter(p => p.length > 0);

      for (const paragraph of paragraphs) {
        lines.push(paragraph, '');
      }
    }

    return lines.join('\n');
  }

  /**
   * 格式化表格为 Markdown
   * @param {string[]} lines - 输出行数组
   * @param {string[][]} tableData - 表格数据
   */
  _formatTable(lines, tableData) {
    if (!tableData || tableData.length === 0) return;

    // 表头
    const headers = tableData[0];
    lines.push('| ' + headers.join(' | ') + ' |');
    lines.push('| ' + headers.map(() => '---').join(' | ') + ' |');

    // 数据行
    for (let i = 1; i < tableData.length; i++) {
      const row = tableData[i];
      // 确保每行的列数与表头一致
      while (row.length < headers.length) {
        row.push('');
      }
      lines.push('| ' + row.slice(0, headers.length).join(' | ') + ' |');
    }
    lines.push('');
  }

  /**
   * 等待页面内容加载完成
   * @param {Page} page - Playwright页面对象
   */
  async waitForContent(page) {
    try {
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
      // 等待 GitBook 内容区域加载
      await page.waitForSelector('[class*="Content"] article, [class*="PageContent"], main, h1', { timeout: 20000 });
      // 等待正文文本稳定
      await page.waitForFunction(() => {
        const main = document.querySelector('main');
        if (!main) return false;
        const text = (main.innerText || '').trim();
        return text.length > 120 || document.querySelectorAll('main a[href]').length > 10;
      }, { timeout: 15000 });
      // GitBook 是 SPA，需要额外等待渲染
      await page.waitForTimeout(2000);
    } catch (error) {
      console.warn('Wait for content timeout, proceeding anyway:', error.message);
    }
  }
}

export default InfowayApiParser;
