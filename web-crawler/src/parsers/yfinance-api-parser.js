import BaseParser from './base-parser.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * YFinance API Parser - 专门解析 yfinance API 文档页面
 * YFinance 是一个用于获取 Yahoo Finance 数据的 Python 库
 * URL 格式: https://www.aidoczh.com/yfinance/...
 * 支持类页面（包含多个属性/方法）和单独的 API 页面
 */
class YfinanceApiParser extends BaseParser {
  /**
   * 匹配 YFinance API 文档页面
   * @param {string} url - 页面URL
   * @returns {boolean} 是否匹配
   */
  matches(url) {
    return /^https?:\/\/www\.aidoczh\.com\/yfinance\//.test(url);
  }

  /**
   * 获取优先级
   * @returns {number} 优先级
   */
  getPriority() {
    return 100;
  }

  /**
   * 清理标题，移除 Sphinx 文档中的 permalink 符号 (#)
   * @param {string} title - 原始标题
   * @returns {string} 清理后的标题
   */
  cleanTitle(title) {
    if (!title) return '';
    // 移除 Sphinx 文档标题末尾的 # 符号（permalink）
    return title.replace(/#+$/, '').trim();
  }

  /**
   * 根据 URL 生成有意义的文件名
   * @param {string} url - 页面URL
   * @param {string} apiName - API 名称
   * @returns {string} 文件名
   */
  generateFilename(url, apiName = '') {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(p => p);

      // 优先使用 apiName（从标题提取的类名/方法名）
      if (apiName) {
        // 保持原有的大小写和点号结构
        return apiName.replace(/[^a-zA-Z0-9._]/g, '');
      }

      // 从路径生成文件名 - 使用完整路径结构
      if (pathParts.length > 1) {
        // 移除 .html 后缀
        const processedParts = pathParts.map(part => part.replace('.html', ''));

        // 对于 API 文档页面，构建有意义的文件名
        // 例如: /yfinance/reference/yfinance.ticker.history.html -> yfinance.Ticker.history
        // 例如: /yfinance/reference/api/yfinance.Ticker.html -> api_yfinance.Ticker
        if (processedParts.length >= 3) {
          // 获取最后有意义的部分
          const lastPart = processedParts[processedParts.length - 1];

          // 如果最后部分是 index，使用倒数第二部分
          if (lastPart === 'index' && processedParts.length >= 4) {
            return processedParts[processedParts.length - 2];
          }

          return lastPart;
        }

        return processedParts[processedParts.length - 1] || 'yfinance_doc';
      }

      return 'yfinance_doc';
    } catch (e) {
      return 'yfinance_doc';
    }
  }

  /**
   * 从页面提取更有意义的标题
   * 优先使用 URL 路径中的类名/方法名
   * @param {string} url - 页面URL
   * @param {string} extractedTitle - 从页面提取的原始标题
   * @param {string} apiName - 从页面提取的 API 名称
   * @returns {string} 最终使用的标题
   */
  generateTitle(url, extractedTitle, apiName) {
    // 如果提取到了 API 名称（如 yfinance.Ticker.history），直接使用
    if (apiName && apiName.includes('.')) {
      return apiName;
    }

    // 如果标题有意义且不是通用的"API参考"，使用原标题
    if (extractedTitle &&
        extractedTitle !== 'API参考' &&
        extractedTitle !== 'API Reference' &&
        !extractedTitle.match(/^[A-Za-z\s]{1,10}$/)) {
      return extractedTitle;
    }

    // 从 URL 路径提取有意义的标题
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const pathParts = pathname.split('/').filter(p => p && p !== 'reference' && p !== 'api');

      if (pathParts.length > 0) {
        const lastPart = pathParts[pathParts.length - 1].replace('.html', '');
        if (lastPart && lastPart !== 'index') {
          // 将路径转换为标题格式 (yfinance.ticker.history -> yfinance.Ticker.history)
          return lastPart;
        }
      }
    } catch {
      // URL 解析失败，返回默认标题
    }

    // 最后使用原标题
    return extractedTitle || 'Untitled';
  }

  /**
   * 从 URL 提取页面类型
   * @param {string} url - 页面URL
   * @returns {string} 页面类型
   */
  extractPageType(url) {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;

      if (pathname.includes('/reference/')) return 'reference';
      if (pathname.includes('/tutorial/')) return 'tutorial';
      if (pathname.includes('/guide/')) return 'guide';

      return 'doc';
    } catch (e) {
      return 'doc';
    }
  }

  /**
   * 解析 YFinance API 文档页面
   * @param {Page} page - Playwright页面对象
   * @param {string} url - 页面URL
   * @param {Object} options - 解析选项
   * @returns {Promise<Object>} 解析后的页面数据
   */
  async parse(page, url, options = {}) {
    try {
      // 等待页面加载完成
      await this.waitForContent(page);

      // 从页面提取内容
      const data = await page.evaluate(() => {
        const result = {
          title: '',
          apiName: '',
          description: '',
          signature: '',
          parameters: [],
          returns: [],
          attributes: [],
          examples: [],
          codeExamples: [],
          notes: [],
          seeAlso: [],
          category: '',
          sidebarLinks: [],
          tables: [],
          rawContent: ''
        };

        // 提取主要内容区域 - PyData Sphinx Theme 优先
        const mainContent = document.querySelector('.bd-article, article.bd-article, .wy-nav-content, .document, main, article, .content');

        // 提取标题 - 优先从主内容区域获取 h1
        let h1 = null;
        if (mainContent) {
          h1 = mainContent.querySelector('h1');
        }
        // 如果主内容区域没有 h1，尝试从整个文档获取
        if (!h1) {
          h1 = document.querySelector('main h1, article h1, .bd-content h1, .wy-nav-content h1, h1');
        }
        if (h1) {
          let titleText = h1.textContent.trim();
          // 移除 Sphinx 文档标题末尾的 # 符号（permalink）
          titleText = titleText.replace(/#+$/, '').trim();
          result.title = titleText;

          // 从标题提取 API 名称 (如 yfinance.market, Ticker 等)
          const titleMatch = result.title.match(/^([a-zA-Z_]\w*(?:\.\w+)*)/);
          if (titleMatch) {
            result.apiName = titleMatch[1];
          }
        }

        // 提取侧边栏导航链接
        const sidebarLinks = document.querySelectorAll('.bd-sidebar a, .wy-menu-vertical a, .sidebar a, nav.bd-links a');
        sidebarLinks.forEach(link => {
          const href = link.getAttribute('href');
          if (href) {
            result.sidebarLinks.push({
              title: link.textContent.trim(),
              url: href.startsWith('http') ? href : `https://www.aidoczh.com${href}`
            });
          }
        });

        if (mainContent) {
          // 检测页面类型：类页面、方法页面、属性页面
          const classDl = mainContent.querySelector('dl.py.class');
          const methodDl = mainContent.querySelector('dl.py.method, dl.py.function');
          const propertyDl = mainContent.querySelector('dl.py.property');
          const isClassPage = !!classDl;

          // 存储所有 API 成员（属性和方法）
          result.apiMembers = [];
          result.isClassPage = isClassPage;

          if (isClassPage) {
            // 类页面：提取所有属性和方法
            const classSignature = classDl.querySelector('dt.sig');
            if (classSignature) {
              result.signature = classSignature.textContent.replace(/#+$/, '').trim();
            }

            // 提取所有成员（属性、方法、属性装饰器）
            // 改进提取逻辑，支持更多选择器
            const memberDls = mainContent.querySelectorAll('dl.py.attribute, dl.py.method, dl.py.property, dl.py.function');
            
            memberDls.forEach(dl => {
              const dt = dl.querySelector('dt.sig');
              const dd = dl.querySelector('dd');
              if (dt) {
                // 确定类型
                let type = 'attribute';
                if (dl.classList.contains('method') || dl.classList.contains('function')) {
                  type = 'method';
                } else if (dl.classList.contains('property')) {
                  type = 'property';
                }

                // 提取名称
                const nameEl = dt.querySelector('.sig-name .pre, .descname');
                let name = '';
                if (nameEl) {
                  name = nameEl.textContent.trim();
                } else {
                  // 回退策略：从 dt 文本中提取
                  const fullSig = dt.textContent.split('#')[0].trim();
                  // 移除括号和参数
                  name = fullSig.split('(')[0].trim().split('.').pop();
                }

                if (!name) return;

                const sig = dt.textContent.replace(/#+$/, '').trim();
                
                // 提取描述：在 dd 中排除嵌套的 dl (子成员)
                let desc = '';
                if (dd) {
                  // 克隆 dd 以便在不影响原始 DOM 的情况下移除子成员
                  const ddClone = dd.cloneNode(true);
                  ddClone.querySelectorAll('dl').forEach(childDl => childDl.remove());
                  desc = ddClone.textContent.trim();
                }

                const memberData = {
                  type: type,
                  name: name,
                  signature: sig,
                  description: desc
                };

                // 避免重复成员（Sphinx 有时会列出两次，一次在摘要，一次在详细描述）
                // 优先保留有详细签名的版本
                const existingIndex = result.apiMembers.findIndex(m => m.name === name);
                if (existingIndex !== -1) {
                  const existing = result.apiMembers[existingIndex];
                  // 如果新成员有更长的签名或更长的描述，替换旧的
                  if (sig.length > existing.signature.length || desc.length > existing.description.length) {
                    result.apiMembers[existingIndex] = memberData;
                  }
                  return;
                }

                // 提取方法参数
                if (type === 'method') {
                  const params = [];
                  const paramEls = dt.querySelectorAll('.sig-param');
                  paramEls.forEach(p => {
                    params.push(p.textContent.trim());
                  });
                  memberData.parameters = params;
                }

                result.apiMembers.push(memberData);
              }
            });
          } else {
            // 单独的 API 页面
          const sigElement = mainContent.querySelector('.sig, dl.class > dt, dl.method > dt, dl.function > dt, dl.py-method > dt, dl.py-function > dt, dl.py-property > dt, dl.py-attribute > dt');
          if (sigElement) {
            let sig = sigElement.textContent.trim();
            sig = sig.replace(/#+$/, '').trim();
            result.signature = sig;
          }
        }

        // 提取描述（第一个有意义的段落）
        // 避免提取页脚、侧边栏或版权声明中的段落
        const paragraphs = mainContent.querySelectorAll('p');
        for (const p of paragraphs) {
          // 排除包含在页脚或版权声明中的段落
          if (p.closest('footer') || p.closest('.bd-footer-content') || p.closest('.wy-footer') || p.closest('.copyright')) {
            continue;
          }
          
          const text = p.textContent.trim();
          // 排除已知的无用样板文本
          if (text.includes('Yahoo!') && text.includes('注册商标')) {
            continue;
          }
          
          if (text.length > 10 && !text.startsWith('>>>') && !text.startsWith('Copy to clipboard')) {
            if (!result.description) {
              result.description = text;
            }
            if (text !== result.description && text.length > 20) {
              result.examples.push(text);
            }
          }
        }

        // 提取所有表格
        const tables = mainContent.querySelectorAll('table');
          tables.forEach((table, tableIndex) => {
            const headers = [];
            const rows = [];

            // 提取表头
            const headerCells = table.querySelectorAll('thead th, thead td');
            if (headerCells.length > 0) {
              headerCells.forEach(cell => {
                let headerText = cell.textContent.trim().toLowerCase();
                // 清理表头文本
                headerText = headerText.replace(/#+$/, '').trim();
                headers.push(headerText);
              });
            } else {
              // 尝试从第一行提取表头
              const firstRow = table.querySelector('tr');
              if (firstRow) {
                const cells = firstRow.querySelectorAll('th, td');
                cells.forEach(cell => {
                  let headerText = cell.textContent.trim().toLowerCase();
                  headerText = headerText.replace(/#+$/, '').trim();
                  headers.push(headerText);
                });
              }
            }

            // 提取数据行
            const bodyRows = table.querySelectorAll('tbody tr');
            const rowsToProcess = bodyRows.length > 0 ? bodyRows : table.querySelectorAll('tr');

            rowsToProcess.forEach((row, rowIndex) => {
              // 如果没有 tbody，跳过第一行（表头行）
              if (bodyRows.length === 0 && rowIndex === 0 && headers.length > 0) return;

              const cells = Array.from(row.querySelectorAll('td, th'));
              if (cells.length > 0) {
                const rowData = {};
                cells.forEach((cell, cellIndex) => {
                  const headerName = headers[cellIndex] || `col_${cellIndex}`;
                  let cellText = cell.textContent.trim();
                  // 清理单元格文本
                  cellText = cellText.replace(/#+$/, '').trim();
                  rowData[headerName] = cellText;
                });
                rows.push(rowData);
              }
            });

            // 存储表格信息
            if (headers.length > 0 || rows.length > 0) {
              result.tables.push({
                headers,
                rows,
                index: tableIndex
              });
            }

            // 判断表格类型并分配到相应字段（内联逻辑，因为在 browser context 中无法调用类方法）
            const headerText = headers.join(' ').toLowerCase();
            let tableType = 'unknown';
            if (headerText.includes('参数') || headerText.includes('parameter') || (headerText.includes('name') && headerText.includes('type'))) {
              tableType = 'parameters';
            } else if (headerText.includes('返回') || headerText.includes('return') || headerText.includes('response')) {
              tableType = 'returns';
            } else if (headerText.includes('属性') || headerText.includes('attribute') || headerText.includes('field')) {
              tableType = 'attributes';
            }

            if (tableType === 'parameters') {
              result.parameters = rows;
            } else if (tableType === 'returns') {
              result.returns = rows;
            } else if (tableType === 'attributes') {
              result.attributes = rows;
            }
          });

          // 提取代码示例 - PyData Sphinx Theme 使用 pre 标签
          // 排除侧边栏中的代码示例，避免所有页面提取到一样的通用示例
          const codeBlocks = mainContent.querySelectorAll('pre');
          codeBlocks.forEach(block => {
            // 排除在侧边栏、页脚等无关区域的代码块
            if (block.closest('.bd-sidebar') || block.closest('.bd-toc') || block.closest('.sidebar') || block.closest('footer')) {
              return;
            }
            
            const code = block.textContent.trim();
            // 过滤掉太短的代码和 "Copy to clipboard" 文本
            if (code.length > 10 && !code.includes('Copy to clipboard')) {
              let language = 'python';
              const classList = block.className || '';
              const langMatch = classList.match(/language-(\w+)/);
              if (langMatch) {
                language = langMatch[1];
              } else if (code.includes('import ') || code.includes('def ') || code.includes('class ')) {
                language = 'python';
              }

              result.codeExamples.push({
                language,
                code
              });
            }
          });

          // 提取注意事项
          const notes = mainContent.querySelectorAll('.admonition, .note, .warning, .attention');
          notes.forEach(note => {
            const titleEl = note.querySelector('.admonition-title, .title');
            const title = titleEl ? titleEl.textContent.trim() : 'Note';
            const content = note.textContent.replace(title, '').trim();
            result.notes.push({
              type: title.toLowerCase(),
              content
            });
          });

          // 提取 "See Also" 部分
          const seeAlsoSection = mainContent.querySelector('.see-also, #see-also');
          if (seeAlsoSection) {
            const links = seeAlsoSection.querySelectorAll('a');
            links.forEach(link => {
              result.seeAlso.push({
                title: link.textContent.trim(),
                url: link.getAttribute('href')
              });
            });
          }

          // 提取原始文本内容（作为备份）
          result.rawContent = mainContent.textContent.trim().substring(0, 10000);
        }

        return result;
      });

      // 生成有意义的标题（优先使用 API 名称或 URL 路径，而非通用的"API参考"）
      const finalTitle = this.generateTitle(url, data.title, data.apiName);

      // 如果是类页面且有多个成员，且有输出目录，则为每个成员单独写 Markdown
      if (data.isClassPage && data.apiMembers && data.apiMembers.length > 0 && options.pagesDir) {
        await this.writeApiMembersAsMarkdown(data.apiMembers, url, options.pagesDir, finalTitle, data.description, data.codeExamples);
      }

      const skipDefault = data.isClassPage && data.apiMembers && data.apiMembers.length > 0;

      return {
        type: 'yfinance-api',
        url,
        pageType: this.extractPageType(url),
        title: finalTitle,
        apiName: data.apiName,
        description: data.description,
        signature: data.signature,
        parameters: data.parameters,
        returns: data.returns,
        attributes: data.attributes,
        tables: data.tables,
        codeExamples: data.codeExamples,
        notes: data.notes,
        examples: data.examples,
        seeAlso: data.seeAlso,
        category: data.category,
        sidebarLinks: data.sidebarLinks,
        rawContent: data.rawContent,
        apiMembers: data.apiMembers,
        isClassPage: data.isClassPage,
        // 如果是类页面且已单独写入成员文件，跳过默认输出
        skipDefaultMarkdownOutput: skipDefault,
        suggestedFilename: this.generateFilename(url, data.apiName)
      };
    } catch (error) {
      console.error('Failed to parse YFinance API doc page:', error.message);
      return {
        type: 'yfinance-api',
        url,
        pageType: this.extractPageType(url),
        title: '',
        apiName: '',
        description: '',
        signature: '',
        parameters: [],
        returns: [],
        attributes: [],
        tables: [],
        codeExamples: [],
        notes: [],
        examples: [],
        seeAlso: [],
        category: '',
        sidebarLinks: [],
        rawContent: '',
        suggestedFilename: this.generateFilename(url)
      };
    }
  }

  /**
   * 判断表格类型
   * @param {Element} table - 表格元素
   * @param {string[]} headers - 表头列表
   * @returns {string} 表格类型
   */
  determineTableType(table, headers) {
    // 检查表头
    const headerText = headers.join(' ').toLowerCase();
    if (headerText.includes('参数') || headerText.includes('parameter') || headerText.includes('name') && headerText.includes('type')) {
      return 'parameters';
    }
    if (headerText.includes('返回') || headerText.includes('return') || headerText.includes('response')) {
      return 'returns';
    }
    if (headerText.includes('属性') || headerText.includes('attribute') || headerText.includes('field')) {
      return 'attributes';
    }

    // 检查表格前面的标题
    let prevElement = table.previousElementSibling;
    while (prevElement) {
      const text = prevElement.textContent.toLowerCase();
      if (text.includes('参数') || text.includes('parameter')) {
        return 'parameters';
      }
      if (text.includes('返回') || text.includes('return')) {
        return 'returns';
      }
      if (text.includes('属性') || text.includes('attribute')) {
        return 'attributes';
      }
      // 只检查最近的几个兄弟元素
      if (prevElement.tagName === 'H2' || prevElement.tagName === 'H3') {
        break;
      }
      prevElement = prevElement.previousElementSibling;
    }

    return 'unknown';
  }

  /**
   * 是否支持链接发现
   * @returns {boolean}
   */
  supportsLinkDiscovery() {
    return true;
  }

  /**
   * 从 Sphinx 文档侧边栏发现链接
   * @param {Page} page - Playwright页面对象
   * @returns {Promise<Array<string>>} 发现的链接列表
   */
  async discoverLinks(page) {
    try {
      const currentUrl = page.url();

      // Sphinx 文档的侧边栏链接是相对于文档根目录的
      // 使用当前页面的 URL 作为 base 来解析相对路径
      const baseUrl = 'https://www.aidoczh.com/yfinance/reference/';
      console.log(`YFinance parser current page URL: ${currentUrl}`);
      console.log(`YFinance parser using baseUrl: ${baseUrl}`);

      const links = await page.evaluate((base) => {
        const foundLinks = [];
        const seenUrls = new Set();

        // 使用 URL 构造器正确解析相对路径
        const addLink = (href) => {
          if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;

          try {
            // 使用 URL 构造器正确解析相对路径
            const fullUrl = new URL(href, base).href;

            // 过滤只保留 yfinance 相关链接，排除静态资源
            if (fullUrl.includes('/yfinance/') &&
                !seenUrls.has(fullUrl) &&
                !fullUrl.match(/\.(png|jpg|jpeg|gif|svg|css|js|ico|woff|woff2|ttf|eot|py|pyc|txt|pdf|zip)$/i) &&
                !fullUrl.includes('_static/') &&
                !fullUrl.includes('_sources/') &&
                !fullUrl.includes('#')) {
              seenUrls.add(fullUrl);
              foundLinks.push(fullUrl);
            }
          } catch (e) {
            // URL 解析失败，跳过
          }
        };

        // 主要侧边栏选择器 - PyData Sphinx Theme
        const sidebarSelectors = [
          '.bd-sidebar a',
          '.wy-menu-vertical a',
          '.wy-menu a',
          '.sidebar a',
          'nav.bd-links a',
          '.nav.bd-links a'
        ];

        // 从侧边栏提取链接
        for (const selector of sidebarSelectors) {
          document.querySelectorAll(selector).forEach(link => {
            addLink(link.getAttribute('href'));
          });
        }

        return foundLinks;
      }, baseUrl);

      console.log(`YFinance parser discovered ${links.length} links`);
      return links;
    } catch (error) {
      console.error('Failed to discover links:', error.message);
      return [];
    }
  }

  /**
   * 展开侧边栏折叠内容
   * @param {Page} page - Playwright页面对象
   */
  async expandSidebar(page) {
    try {
      // 滚动侧边栏以显示更多链接
      await page.evaluate(() => {
        const sidebar = document.querySelector('.wy-menu-vertical, .wy-side-scroll, .sidebar, nav');
        if (sidebar) {
          // 滚动到底部再回到顶部
          sidebar.scrollTop = sidebar.scrollHeight;
          setTimeout(() => {
            sidebar.scrollTop = 0;
          }, 500);
        }
      });

      await page.waitForTimeout(1000);

      // 展开 details 元素
      await page.evaluate(() => {
        // 展开 details 元素
        document.querySelectorAll('details').forEach(detail => {
          detail.open = true;
        });

        // 点击 Sphinx 章节展开按钮 (通常是包含 caption 的元素)
        document.querySelectorAll('.wy-menu-vertical .caption, .wy-menu-vertical .toctree-l1 > a').forEach(el => {
          try {
            el.click();
          } catch {
            // 点击可能失败（元素不可交互），忽略继续
          }
        });

        // 点击可能有子菜单的项目
        document.querySelectorAll('.wy-menu-vertical li').forEach(li => {
          if (li.querySelector('ul')) {
            const link = li.querySelector('a');
            if (link) {
              try {
                link.click();
              } catch {
                // 点击可能失败（元素不可交互），忽略继续
              }
            }
          }
        });

        // PyData Sphinx Theme 的展开
        document.querySelectorAll('.bd-links .nav-link, .nav.bd-links a').forEach(el => {
          try {
            el.click();
          } catch {
            // 点击可能失败（元素不可交互），忽略继续
          }
        });
      });

      await page.waitForTimeout(1500);

      // 再次滚动侧边栏
      await page.evaluate(() => {
        const sidebar = document.querySelector('.wy-menu-vertical, .wy-side-scroll');
        if (sidebar) {
          // 逐步滚动
          let scrollPos = 0;
          const scrollStep = 200;
          const interval = setInterval(() => {
            scrollPos += scrollStep;
            sidebar.scrollTop = scrollPos;
            if (scrollPos >= sidebar.scrollHeight) {
              clearInterval(interval);
            }
          }, 200);

          // 3秒后停止
          setTimeout(() => clearInterval(interval), 3000);
        }
      });

      await page.waitForTimeout(3500);
    } catch (error) {
      console.warn('Failed to expand sidebar:', error.message);
    }
  }

  /**
   * 等待页面内容加载完成
   */
  async waitForContent(page) {
    try {
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
      // 等待 PyData Sphinx Theme 的主内容区域
      await page.waitForSelector('.bd-article, h1, .wy-nav-content, main, article', { timeout: 15000 });
      await page.waitForTimeout(2000);
    } catch (error) {
      console.warn('Wait for content timeout, proceeding anyway:', error.message);
    }
  }

  /**
   * 清理文件名
   * @param {string} value - 原始值
   * @returns {string} 清理后的文件名
   */
  sanitizeFilename(value) {
    return (value || '')
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80);
  }

  /**
   * 构建单个 API 成员的 Markdown 内容
   * @param {Object} member - API 成员对象
   * @param {string} className - 类名
   * @param {string} sourceUrl - 源 URL
   * @returns {string} Markdown 内容
   */
  buildSingleMemberMarkdown(member, className, sourceUrl) {
    const sections = [];

    // 从签名中提取实际的类名和方法名
    let actualClassName = className;
    if (member.signature) {
      const sigMatch = member.signature.match(/([a-zA-Z_][\w.]*)\.[a-zA-Z_]\w*/);
      if (sigMatch) {
        actualClassName = sigMatch[1];
      }
    }

    const title = member.type === 'method' ? `${actualClassName}.${member.name}()` : `${actualClassName}.${member.name}`;
    sections.push(`# ${title}\n`);

    sections.push('## 源URL\n');
    sections.push(`${sourceUrl}\n`);

    sections.push('## 类型\n');
    sections.push(member.type === 'method' ? '方法 (Method)' : '属性 (Property)');
    sections.push('\n');

    if (member.signature) {
      sections.push('## 签名\n');
      sections.push(`\`\`\`python\n${member.signature}\n\`\`\`\n`);
    }

    if (member.description) {
      sections.push('## 描述\n');
      sections.push(member.description);
      sections.push('\n');
    }

    if (member.parameters && member.parameters.length > 0) {
      sections.push('## 参数\n');
      member.parameters.forEach(param => {
        sections.push(`- \`${param}\``);
      });
      sections.push('\n');
    }

    return sections.join('\n');
  }

  /**
   * 将每个 API 成员写入单独的 Markdown 文件
   * @param {Array} apiMembers - API 成员数组
   * @param {string} sourceUrl - 源 URL
   * @param {string} pagesDir - 输出目录
   * @param {string} className - 类名
   * @param {string} classDescription - 类描述
   * @param {Array} codeExamples - 代码示例
   */
  async writeApiMembersAsMarkdown(apiMembers, sourceUrl, pagesDir, className, classDescription, codeExamples) {
    // 为类创建一个子目录
    const classDirName = this.sanitizeFilename(className);
    const classDir = path.join(pagesDir, classDirName);
    await fs.mkdir(classDir, { recursive: true });

    const filenameCounter = new Map();

    // 从 URL 提取实际的类名
    let actualClassName = className;
    try {
      const urlObj = new URL(sourceUrl);
      const match = urlObj.pathname.match(/\/([a-zA-Z_][\w.]+)\.html$/);
      if (match) {
        actualClassName = match[1];
      }
    } catch {
      // URL 解析失败，使用原始类名
    }

    // 写入概览文件
    const overviewSections = [];
    overviewSections.push(`# ${actualClassName}\n`);
    overviewSections.push('## 源URL\n');
    overviewSections.push(`${sourceUrl}\n`);
    if (classDescription) {
      overviewSections.push('## 描述\n');
      overviewSections.push(`${classDescription}\n`);
    }
    overviewSections.push('## 成员列表\n');

    // 按类型分组
    const attributes = apiMembers.filter(m => m.type === 'attribute' || m.type === 'property');
    const methods = apiMembers.filter(m => m.type === 'method');

    if (attributes.length > 0) {
      overviewSections.push('\n### 属性\n');
      attributes.forEach(attr => {
        const filename = this.sanitizeFilename(attr.name);
        overviewSections.push(`- [${attr.name}](${filename}.md)${attr.description ? ` - ${attr.description.substring(0, 100)}${attr.description.length > 100 ? '...' : ''}` : ''}`);
      });
    }

    if (methods.length > 0) {
      overviewSections.push('\n### 方法\n');
      methods.forEach(method => {
        const filename = this.sanitizeFilename(method.name);
        overviewSections.push(`- [${method.name}()](${filename}.md)${method.description ? ` - ${method.description.substring(0, 100)}${method.description.length > 100 ? '...' : ''}` : ''}`);
      });
    }

    if (codeExamples && codeExamples.length > 0) {
      overviewSections.push('\n## 代码示例\n');
      codeExamples.forEach(example => {
        overviewSections.push(`\`\`\`${example.language || 'python'}\n${example.code}\n\`\`\`\n`);
      });
    }

    const overviewPath = path.join(classDir, 'README.md');
    await fs.writeFile(overviewPath, overviewSections.join('\n'), 'utf-8');
    console.log(`  Saved: ${classDirName}/README.md (${apiMembers.length} members)`);

    // 写入每个成员的单独文件
    for (const member of apiMembers) {
      const baseName = this.sanitizeFilename(member.name);
      const seen = filenameCounter.get(baseName) || 0;
      filenameCounter.set(baseName, seen + 1);
      const filename = seen === 0 ? baseName : `${baseName}_${seen + 1}`;
      const filePath = path.join(classDir, `${filename}.md`);
      const markdown = this.buildSingleMemberMarkdown(member, actualClassName, sourceUrl);
      await fs.writeFile(filePath, markdown, 'utf-8');
    }

    console.log(`  Saved ${apiMembers.length} member files to ${classDirName}/`);
  }
}

export default YfinanceApiParser;