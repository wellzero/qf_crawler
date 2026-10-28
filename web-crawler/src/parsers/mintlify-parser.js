import BaseParser from './base-parser.js';

/**
 * Mintlify Parser - 专门解析 Mintlify 文档平台
 * Mintlify 使用 .mdx-content 类包含主要内容
 */
class MintlifyParser extends BaseParser {
  /**
   * 匹配 Mintlify 文档站点
   * @param {string} url - 页面URL
   * @returns {boolean} 是否匹配
   */
  matches(url) {
    // 通过 URL 模式匹配常见的 Mintlify 文档站点
    // 或者在运行时检测页面是否使用 Mintlify
    return url.includes('docs.polyrouter.io') ||
           url.includes('mintlify') ||
           url.includes('/docs/');
  }

  /**
   * 获取优先级（高于 generic）
   * @returns {number} 优先级
   */
  getPriority() {
    return 50;
  }

  /**
   * 解析 Mintlify 页面
   * @param {Page} page - Playwright页面对象
   * @param {string} url - 页面URL
   * @param {Object} options - 解析选项
   * @returns {Promise<Object>} 解析后的页面数据
   */
  async parse(page, url, options = {}) {
    try {
      // 等待页面加载
      await page.waitForSelector('.mdx-content, .prose', { timeout: 10000 }).catch(() => {});

      const data = await page.evaluate(() => {
        const result = {
          title: '',
          subtitle: '',
          description: '',
          sections: [],
          codeBlocks: [],
          warnings: [],
          notes: []
        };

        // 1. 提取标题 (h1)
        const h1 = document.querySelector('h1');
        if (h1) {
          result.title = h1.textContent.trim();
        }

        // 2. 提取副标题 (通常是 .prose 的第一个段落)
        const subtitleEl = document.querySelector('.mt-2.text-lg.prose, [class*="text-lg"][class*="prose"]');
        if (subtitleEl) {
          result.subtitle = subtitleEl.textContent.trim();
        }

        // 3. 提取主要内容 (.mdx-content)
        const mainContent = document.querySelector('.mdx-content');
        if (mainContent) {
          // 提取所有段落、标题、列表等
          const processContent = (container) => {
            const sections = [];
            let currentSection = null;

            const walkElements = (el) => {
              for (const child of el.children) {
                const tag = child.tagName;
                const classList = child.className || '';

                // 跳过导航和侧边栏
                if (classList.includes('sidebar') ||
                    classList.includes('nav') ||
                    classList.includes('hidden')) {
                  continue;
                }

                // 标题
                if (/^H[1-6]$/.test(tag)) {
                  const level = parseInt(tag[1]);
                  const text = child.textContent.trim();
                  if (text && !text.startsWith('​')) {
                    currentSection = {
                      type: 'heading',
                      level,
                      content: text,
                      items: []
                    };
                    sections.push(currentSection);
                  }
                }
                // 段落
                else if (tag === 'P') {
                  const text = child.textContent.trim();
                  if (text && text.length > 10) {
                    if (currentSection && currentSection.type === 'heading') {
                      currentSection.items.push({ type: 'paragraph', content: text });
                    } else {
                      sections.push({ type: 'paragraph', content: text });
                    }
                  }
                }
                // 列表
                else if (tag === 'UL' || tag === 'OL') {
                  const items = [];
                  child.querySelectorAll('li').forEach(li => {
                    const text = li.textContent.trim();
                    if (text) items.push(text);
                  });
                  if (items.length > 0) {
                    const listSection = {
                      type: 'list',
                      listType: tag.toLowerCase(),
                      items
                    };
                    if (currentSection && currentSection.type === 'heading') {
                      currentSection.items.push(listSection);
                    } else {
                      sections.push(listSection);
                    }
                  }
                }
                // 表格
                else if (tag === 'TABLE') {
                  const headers = [];
                  const rows = [];

                  child.querySelectorAll('thead th, thead td').forEach(th => {
                    headers.push(th.textContent.trim());
                  });

                  child.querySelectorAll('tbody tr').forEach(tr => {
                    const row = [];
                    tr.querySelectorAll('td').forEach(td => {
                      row.push(td.textContent.trim());
                    });
                    if (row.length > 0) rows.push(row);
                  });

                  if (headers.length > 0 || rows.length > 0) {
                    const tableSection = { type: 'table', headers, rows };
                    if (currentSection && currentSection.type === 'heading') {
                      currentSection.items.push(tableSection);
                    } else {
                      sections.push(tableSection);
                    }
                  }
                }
                // 引用块/警告
                else if (tag === 'DIV' || tag === 'ASIDE') {
                  const classStr = classList.toString();

                  // 警告/提示框
                  if (classStr.includes('yellow') || classStr.includes('warning') || classStr.includes('caution')) {
                    const text = child.textContent.trim();
                    if (text) {
                      result.warnings.push(text);
                    }
                  }
                  // 信息提示
                  else if (classStr.includes('blue') || classStr.includes('info') || classStr.includes('note')) {
                    const text = child.textContent.trim();
                    if (text) {
                      result.notes.push(text);
                    }
                  }
                  // 递归处理嵌套内容
                  else if (!classStr.includes('code-block') && !classStr.includes('not-prose')) {
                    walkElements(child);
                  }
                }
              }
            };

            walkElements(container);
            return sections;
          };

          result.sections = processContent(mainContent);
        }

        // 4. 提取代码块
        document.querySelectorAll('.code-block, pre code, pre').forEach((codeEl, index) => {
          let code = '';
          let language = '';

          if (codeEl.tagName === 'CODE') {
            code = codeEl.textContent.trim();
            const langMatch = codeEl.className.match(/language-(\w+)/);
            if (langMatch) language = langMatch[1];
          } else if (codeEl.tagName === 'PRE') {
            const codeChild = codeEl.querySelector('code');
            code = codeChild ? codeChild.textContent.trim() : codeEl.textContent.trim();
          } else {
            code = codeEl.textContent.trim();
          }

          // 清理 "Copy" 和 "Ask AI" 等按钮文本
          code = code.replace(/^(Copy|Ask AI)\n?/gm, '').trim();

          if (code && code.length > 20) {
            result.codeBlocks.push({ language, code, index });
          }
        });

        // 5. 提取 meta description
        const metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc) {
          result.description = metaDesc.getAttribute('content') || '';
        }

        return result;
      });

      // 构建结构化内容
      const content = [];

      // 添加副标题作为描述
      if (data.subtitle) {
        content.push({ type: 'text', content: data.subtitle });
      }

      // 添加各部分内容
      data.sections.forEach(section => {
        if (section.type === 'heading') {
          content.push({ type: 'heading', content: section.content });
          if (section.items) {
            section.items.forEach(item => {
              content.push(item);
            });
          }
        } else if (section.type === 'paragraph') {
          content.push({ type: 'text', content: section.content });
        } else if (section.type === 'list') {
          content.push({ type: 'list', items: section.items });
        } else if (section.type === 'table') {
          content.push({ type: 'table', data: [section.headers, ...section.rows] });
        }
      });

      // 添加警告和提示
      data.warnings.forEach(warning => {
        content.push({ type: 'warning', content: warning });
      });
      data.notes.forEach(note => {
        content.push({ type: 'note', content: note });
      });

      return {
        type: 'mintlify-doc',
        url,
        title: data.title,
        description: data.description || data.subtitle,
        content,
        codeBlocks: data.codeBlocks,
        warnings: data.warnings,
        notes: data.notes
      };

    } catch (error) {
      console.error('[MintlifyParser] Parse error:', error.message);
      return {
        type: 'mintlify-doc',
        url,
        title: '',
        description: '',
        content: [],
        codeBlocks: [],
        warnings: [],
        notes: [],
        error: error.message
      };
    }
  }
}

export default MintlifyParser;