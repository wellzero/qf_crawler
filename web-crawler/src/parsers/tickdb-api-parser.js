import BaseParser from './base-parser.js';

/**
 * TickDB API Parser - 专门解析 docs.tickdb.ai/en 文档页面
 * TickDB 提供金融市场数据 API
 * 文档使用 Mintlify 框架
 */
class TickdbApiParser extends BaseParser {
  /**
   * 匹配 TickDB API 文档页面
   * @param {string} url - 页面URL
   * @returns {boolean} 是否匹配
   */
  matches(url) {
    return /^https?:\/\/docs\.tickdb\.ai\/en\/?/.test(url);
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
      // 移除 /en 前缀
      pathname = pathname.replace(/^\/en\/?/, '');
      pathname = pathname.replace(/\/$/, '');

      // 如果有 hash，使用 hash 作为文件名
      const hash = urlObj.hash.replace('#', '');
      if (hash) {
        return hash.replace(/\//g, '_');
      }

      const filename = pathname.replace(/\//g, '_') || 'api_overview';
      return filename;
    } catch (e) {
      return 'api_doc';
    }
  }

  /**
   * 解析 TickDB API 文档页面
   * @param {Page} page - Playwright页面对象
   * @param {string} url - 页面URL
   * @param {Object} options - 解析选项
   * @returns {Promise<Object>} 解析后的页面数据
   */
  async parse(page, url, options = {}) {
    try {
      // 等待页面内容加载完成
      await this.waitForContent(page);

      // 直接在页面中提取结构化内容并转换为 Markdown
      const data = await page.evaluate(() => {
        const result = {
          title: '',
          markdownContent: '',
          apiPath: '',
          httpMethod: '',
          codeExamples: []
        };

        // Mintlify 文档结构
        // 1. 查找主内容区域（排除侧边栏）
        const h1 = document.querySelector('h1');
        if (h1) {
          result.title = h1.textContent.trim();
        }

        // 收集所有内容元素
        const markdownLines = [];

        // Mintlify 的侧边栏通常有特定的 class 或结构
        const sidebarSelectors = [
          '[class*="sidebar"]',
          '[class*="Sidebar"]',
          'aside',
          'nav',
          '[class*="nav"]',
          '[class*="Nav"]',
          '[class*="menu"]',
          '[class*="toc"]'
        ];

        const isSidebarElement = (el) => {
          for (const sel of sidebarSelectors) {
            if (el.matches && el.matches(sel)) return true;
            if (el.closest && el.closest(sel)) return true;
          }
          return false;
        };

        // 获取所有内容元素
        const contentSelectors = 'h1, h2, h3, h4, h5, h6, p, pre, ul, ol, table, blockquote, hr, dl';
        const allElements = document.querySelectorAll(contentSelectors);

        // 用于去重
        const processedCode = new Set();

        allElements.forEach(el => {
          // 跳过侧边栏中的元素
          if (isSidebarElement(el)) return;

          const tagName = el.tagName.toLowerCase();
          let line = '';

          switch (tagName) {
            case 'h1':
              const h1Text = el.textContent.trim().replace(/[​\u200B]/g, '');
              if (h1Text && !markdownLines.some(l => l.includes(`# ${h1Text}`))) {
                line = `# ${h1Text}`;
              }
              break;

            case 'h2':
              const h2Text = el.textContent.trim().replace(/[​\u200B]/g, '');
              // 过滤掉侧边栏的标题
              if (h2Text && !['Introduction', 'Getting Started', 'REST API', 'WebSocket Docs', 'Reference'].includes(h2Text)) {
                line = `\n## ${h2Text}`;
              }
              break;

            case 'h3':
              const h3Text = el.textContent.trim().replace(/[​\u200B]/g, '');
              // 过滤掉无用的标题
              if (h3Text && !['Authorizations', 'Query Parameters', 'Response', 'Path Parameters', 'Headers', 'Request Body'].includes(h3Text)) {
                line = `\n### ${h3Text}`;
              }
              break;

            case 'h4':
            case 'h5':
            case 'h6':
              const hText = el.textContent.trim().replace(/[​\u200B]/g, '');
              const level = parseInt(tagName.charAt(1));
              // 过滤掉无用的标题
              if (hText && !['Authorizations', 'Query Parameters', 'Response', 'Path Parameters', 'Headers', 'Request Body'].includes(hText)) {
                line = `\n${'#'.repeat(level)} ${hText}`;
              }
              break;

            case 'p':
              const pText = el.textContent.trim();
              // 过滤导航相关文本和交互按钮文本
              if (pText && pText.length > 3 &&
                  !pText.includes('Skip to main content') &&
                  !pText.includes('Search') &&
                  !pText.match(/^(GET|POST|PUT|DELETE)\s+[A-Z]/) && // 排除导航中的 API 标签
                  !el.closest('nav') &&
                  !el.closest('[class*="sidebar"]') &&
                  // 过滤交互按钮文本
                  !pText.match(/^Hide\s+(child\s+)?attributes?$/i) &&
                  !pText.match(/^Show\s+(child\s+)?attributes?$/i) &&
                  // 过滤无意义的示例值
                  !pText.match(/^"[^"]*"$/) && // 排除纯引号包裹的值如 "700.HK"
                  pText !== 'Stock symbol' &&
                  pText !== 'Successful response') {
                line = '\n' + processInlineElements(el);
              }
              break;

            case 'pre':
              const code = el.textContent.trim();
              // 去重
              const codeHash = code.substring(0, 100); // 增加哈希长度
              if (code && !processedCode.has(codeHash)) {
                processedCode.add(codeHash);

                let lang = '';
                if (code.includes('curl') || code.includes('--url') || code.includes('--request')) {
                  lang = 'bash';
                  // 提取 API 路径 (支持单引号和双引号)
                  const urlMatch = code.match(/--url\s+['"]?(https?:\/\/[^\s'"]+)['"]?/);
                  if (urlMatch) {
                    try {
                      const urlObj = new URL(urlMatch[1]);
                      result.apiPath = urlObj.pathname;
                    } catch {
                      // URL 解析失败，跳过
                    }
                  }
                } else if (code.startsWith('{') || code.startsWith('[')) {
                  lang = 'json';
                  // 检查是否与已有代码块重复（比较去掉空格后的内容）
                  const normalizedCode = code.replace(/\s+/g, '');
                  const isDuplicate = result.codeExamples.some(existing => {
                    return existing.code.replace(/\s+/g, '') === normalizedCode;
                  });
                  if (isDuplicate) break; // 跳过重复的 JSON
                } else if (code.includes('import ') || code.includes('def ')) {
                  lang = 'python';
                }

                line = `\n\`\`\`${lang}\n${code}\n\`\`\``;
                result.codeExamples.push({ language: lang, code });
              }
              break;

            case 'ul':
              if (!isSidebarElement(el)) {
                const ulItems = el.querySelectorAll(':scope > li');
                if (ulItems.length > 0) {
                  line = '\n';
                  let hasContent = false;
                  ulItems.forEach(li => {
                    const itemText = li.textContent.trim();
                    // 过滤导航项和顶部链接（Dashboard, Telegram, Support 等）
                    if (itemText &&
                        !itemText.match(/^(GET|POST|PUT|DELETE)/) &&
                        !['Dashboard', 'Telegram', 'Support', 'Documentation'].includes(itemText)) {
                      line += `- ${itemText}\n`;
                      hasContent = true;
                    }
                  });
                  if (!hasContent) line = '';
                }
              }
              break;

            case 'ol':
              if (!isSidebarElement(el)) {
                const olItems = el.querySelectorAll(':scope > li');
                if (olItems.length > 0) {
                  line = '\n';
                  olItems.forEach((li, i) => {
                    line += `${i + 1}. ${li.textContent.trim()}\n`;
                  });
                }
              }
              break;

            case 'table':
              if (!isSidebarElement(el)) {
                line = '\n' + processTable(el);
              }
              break;

            case 'blockquote':
              const quoteLines = el.textContent.trim().split('\n');
              line = '\n';
              quoteLines.forEach(q => {
                line += `> ${q.trim()}\n`;
              });
              break;

            case 'hr':
              line = '\n---\n';
              break;

            case 'dl':
              const dts = el.querySelectorAll('dt');
              const dds = el.querySelectorAll('dd');
              line = '\n';
              dts.forEach((dt, i) => {
                line += `**${dt.textContent.trim()}**`;
                if (dds[i]) {
                  line += `: ${dds[i].textContent.trim()}`;
                }
                line += '\n';
              });
              break;
          }

          if (line) {
            markdownLines.push(line);
          }
        });

        // 处理行内元素
        function processInlineElements(element) {
          let result = '';
          element.childNodes.forEach(child => {
            if (child.nodeType === Node.TEXT_NODE) {
              result += child.textContent;
            } else if (child.nodeType === Node.ELEMENT_NODE) {
              const tag = child.tagName.toLowerCase();
              switch (tag) {
                case 'strong':
                case 'b':
                  result += `**${child.textContent.trim()}**`;
                  break;
                case 'em':
                case 'i':
                  result += `*${child.textContent.trim()}*`;
                  break;
                case 'code':
                  const codeText = child.textContent;
                  if (!codeText.includes('\n')) {
                    result += `\`${codeText}\``;
                  } else {
                    result += codeText;
                  }
                  break;
                case 'a':
                  const href = child.getAttribute('href') || '';
                  const text = child.textContent.trim();
                  if (href && text && !href.startsWith('#') && !href.startsWith('javascript')) {
                    result += `[${text}](${href})`;
                  } else {
                    result += text;
                  }
                  break;
                case 'br':
                  result += '\n';
                  break;
                default:
                  result += child.textContent;
              }
            }
          });
          return result.trim();
        }

        // 处理表格
        function processTable(table) {
          let result = '';
          const rows = table.querySelectorAll('tr');

          rows.forEach((row, rowIndex) => {
            const cells = row.querySelectorAll('th, td');
            const cellTexts = Array.from(cells).map(cell => {
              return cell.textContent.trim().replace(/\|/g, '\\|').replace(/\n/g, ' ');
            });

            if (cellTexts.length > 0) {
              result += '| ' + cellTexts.join(' | ') + ' |\n';

              if (rowIndex === 0) {
                result += '| ' + cellTexts.map(() => '---').join(' | ') + ' |\n';
              }
            }
          });

          return result;
        }

        // 合并并清理
        let markdown = markdownLines.join('\n');
        // 清理多余空行
        markdown = markdown.replace(/\n{3,}/g, '\n\n');
        // 移除零宽字符
        markdown = markdown.replace(/[​\u200B\u200C\u200D]/g, '');

        result.markdownContent = markdown.trim();

        return result;
      });

      return {
        type: 'tickdb-api',
        url,
        title: data.title,
        apiPath: data.apiPath,
        codeExamples: data.codeExamples,
        markdownContent: data.markdownContent,
        rawContent: data.markdownContent,
        suggestedFilename: this.generateFilename(url)
      };
    } catch (error) {
      console.error('Failed to parse TickDB API doc page:', error.message);
      return {
        type: 'tickdb-api',
        url,
        title: '',
        apiPath: '',
        codeExamples: [],
        markdownContent: '',
        rawContent: '',
        suggestedFilename: this.generateFilename(url)
      };
    }
  }

  /**
   * 等待页面内容加载完成
   */
  async waitForContent(page) {
    try {
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
      await page.waitForSelector('h1', { timeout: 15000 });
      // 额外等待动态内容加载
      await page.waitForTimeout(2000);
    } catch (error) {
      console.warn('Wait for content timeout, proceeding anyway:', error.message);
    }
  }
}

export default TickdbApiParser;