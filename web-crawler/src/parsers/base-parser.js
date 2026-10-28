/**
 * Base Parser - 所有解析器的基类
 */
class BaseParser {
  constructor() {
    this.extractors = [];
    this.interactors = [];
  }

  /**
   * 注册提取器 (只读 DOM 分析)
   * @param {Object} extractor - 提取器实例
   */
  useExtractor(extractor) {
    this.extractors.push(extractor);
    return this;
  }

  /**
   * 注册交互器 (DOM 操作，如滚动、点击)
   * @param {Object} interactor - 交互器实例
   */
  useInteractor(interactor) {
    this.interactors.push(interactor);
    return this;
  }

  /**
   * 检查此解析器是否适用于给定的URL
   * @param {string} url - 页面URL
   * @returns {boolean} 是否匹配
   */
  matches(url) {
    throw new Error('matches() must be implemented by subclass');
  }

  /**
   * 通过页面内容特征检测页面类型
   * 子类可重写此方法实现基于内容的检测
   * @param {Page} page - Playwright页面对象
   * @returns {Promise<number>} 置信度 0-100，0表示不匹配
   */
  async detectByContent(page) {
    return 0; // 默认不检测
  }

  /**
   * 解析页面内容
   * 实现了基于组合的生命周期：beforeLoad -> waitForContent -> interact -> extract -> afterExtract
   * 子类可以选择重写此方法（传统模式），或使用 useExtractor/useInteractor 进行组合（新模式）
   * @param {Page} page - Playwright页面对象
   * @param {string} url - 页面URL
   * @param {Object} options - 解析选项
   * @returns {Promise<Object>} 解析后的页面数据
   */
  async parse(page, url, options = {}) {
    // 如果没有注册任何提取器且子类没有重写 parse 方法，则抛出异常（向后兼容）
    if (this.extractors.length === 0 && this.interactors.length === 0) {
      throw new Error('parse() must be implemented by subclass or configured with extractors/interactors');
    }

    const context = { page, url, options, data: {} };

    try {
      // 1. 预加载钩子 (可选)
      if (typeof this.beforeLoad === 'function') {
        await this.beforeLoad(context);
      }

      // 尝试关闭常见的弹窗/登录框
      await this.closePopups(page);

      // 2. 等待内容加载 (使用现有的 waitForContent 逻辑)
      await this.waitForContent(page, {
        timeout: options.timeout || 30000,
        minContentLength: options.minContentLength || 500,
        minLinkCount: options.minLinkCount || 10
      });

      // 再次尝试关闭弹窗
      await this.closePopups(page);

      // 3. 加载后钩子 (可选)
      if (typeof this.onLoad === 'function') {
        await this.onLoad(context);
      }

      // 4. 交互阶段 (点击展开、无限滚动等)
      for (const interactor of this.interactors) {
        if (typeof interactor.execute === 'function') {
          await interactor.execute(context);
        }
      }

      // 5. 提取阶段 (文本、表格、图片、图表等)
      for (const extractor of this.extractors) {
        if (typeof extractor.extract === 'function') {
          const result = await extractor.extract(context);
          if (result && typeof result === 'object') {
            Object.assign(context.data, result);
          }
        }
      }

      // 6. 提取后处理钩子 (可选)
      if (typeof this.afterExtract === 'function') {
        return await this.afterExtract(context);
      }

      return context.data;
    } catch (error) {
      console.error(`[BaseParser] parse error on ${url}:`, error.message);
      return context.data;
    }
  }

  /**
   * 获取解析器优先级（数字越大优先级越高）
   * @returns {number} 优先级
   */
  getPriority() {
    return 0;
  }

  /**
   * 尝试关闭常见的登录框、广告弹窗等干扰元素
   * @param {Page} page - Playwright页面对象
   */
  async closePopups(page) {
    try {
      await page.evaluate(() => {
        // 常见的关闭按钮选择器
        const closeSelectors = [
          '.close-btn', '.btn-close', '.modal-close', '.dialog-close', 
          '[class*="close"]', '[aria-label*="close"]', '[aria-label*="关闭"]',
          '.passport-login-container .close'
        ];
        
        for (const selector of closeSelectors) {
          const elements = document.querySelectorAll(selector);
          for (const el of elements) {
            try {
              // 检查是否可见并且可能是关闭按钮
              if (el.offsetWidth > 0 && el.offsetHeight > 0) {
                el.click();
              }
            } catch (e) {}
          }
        }

        // 直接移除遮罩层或登录框DOM（如果点击不管用）
        const blockingSelectors = [
          '.login-modal', '.login-dialog', '#login-bg', '[class*="login-mask"]',
          '.sufei-dialog', '#baxia-dialog-content' // 阿里系反爬弹窗
        ];
        for (const selector of blockingSelectors) {
          const elements = document.querySelectorAll(selector);
          for (const el of elements) {
            try { el.remove(); } catch (e) {}
          }
        }
      });
      // 短暂等待让弹窗关闭动画完成
      await page.waitForTimeout(500);
    } catch (e) {
      // 忽略关闭弹窗时的错误
    }
  }

  /**
   * 等待页面内容加载完成（特别是SPA页面）
   * @param {Page} page - Playwright页面对象
   * @param {Object} options - 等待选项
   */
  async waitForContent(page, options = {}) {
    const {
      timeout = 30000,
      minContentLength = 500,
      minLinkCount = 10
    } = options;

    try {
      // 等待基本加载
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});

      // 检测是否是 SPA 页面（通过框架特征）
      const isSPA = await page.evaluate(() => {
        // 检查常见的 SPA 框架
        const hasReact = document.querySelector('[data-reactroot], [data-reactid]') ||
          typeof window.__REACT_DEVTOOLS_GLOBAL_HOOK__ !== 'undefined';
        const hasVue = document.querySelector('[data-v-]') ||
          typeof window.Vue !== 'undefined';
        const hasAngular = document.querySelector('[ng-app], [ng-version]') ||
          typeof window.ng !== 'undefined';
        const hasAlibaba = document.querySelector('[data-spm]') || // 阿里系
          window.location.hostname.includes('1688.com') ||
          window.location.hostname.includes('taobao.com') ||
          window.location.hostname.includes('tmall.com');

        return hasReact || hasVue || hasAngular || hasAlibaba;
      });

      if (isSPA) {
        console.log('  检测到 SPA 页面，等待内容渲染...');

        // 等待网络空闲
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

        // 等待内容出现
        await page.waitForFunction(
          ({ minLen, minLinks }) => {
            const bodyText = document.body?.innerText || '';
            const links = document.querySelectorAll('a[href]');
            return bodyText.length >= minLen || links.length >= minLinks;
          },
          { minLen: minContentLength, minLinks: minLinkCount },
          { timeout: 20000 }
        ).catch(() => {});

        // 额外等待动态内容
        await page.waitForTimeout(2000);
      } else {
        // 非 SPA 页面，简单等待
        await page.waitForLoadState('load', { timeout }).catch(() => {});
      }
    } catch (error) {
      // 等待失败不阻塞
      console.warn('  waitForContent warning:', error.message);
    }
  }

  /**
   * 提取页面标题
   * @param {Page} page - Playwright页面对象
   * @returns {Promise<string>} 标题
   */
  async extractTitle(page) {
    try {
      const title = await page.evaluate(() => {
        // 辅助函数：检查文本是否像有效标题（而非价格/广告）
        const isValidTitle = (text) => {
          if (!text || text.length < 2) return false;
          const trimmed = text.trim();

          // 过滤掉价格格式 (￥123, $123, ¥123, €123 等)
          if (/^[￥$¥€£]\s*[\d,.]+$/.test(trimmed)) return false;
          if (/^[\d,.]+\s*[元美欧]$/.test(trimmed)) return false;

          // 过滤掉纯数字或纯符号
          if (/^[\d\s,.\-+]+$/.test(trimmed)) return false;

          // 过滤掉过长的内容（可能是段落而非标题）
          if (trimmed.length > 100) return false;

          // 过滤掉常见的广告/无关文本
          const invalidPatterns = [
            /^广告$/, /^推荐$/, /^热销$/, /^促销$/,
            /^\d+$/, // 纯数字
          ];
          for (const pattern of invalidPatterns) {
            if (pattern.test(trimmed)) return false;
          }

          return true;
        };

        // 优先获取 title 标签作为基准
        const titleTag = document.querySelector('title');
        const titleTagText = titleTag ? titleTag.textContent.trim() : '';

        // 尝试从 h1 获取
        const h1 = document.querySelector('h1');
        if (h1) {
          const h1Text = h1.textContent.trim();
          if (isValidTitle(h1Text)) {
            return h1Text;
          }
        }

        // 尝试从 h2 获取
        const h2 = document.querySelector('h2');
        if (h2) {
          const h2Text = h2.textContent.trim();
          if (isValidTitle(h2Text)) {
            return h2Text;
          }
        }

        // 回退到 title 标签
        if (titleTagText) {
          // 清理 title 中的网站后缀（如 " - 网站名"）
          const cleanTitle = titleTagText.split(/[|－—-]/)[0].trim();
          if (cleanTitle) return cleanTitle;
          return titleTagText;
        }

        return '';
      });
      return title;
    } catch (error) {
      return '';
    }
  }

  /**
   * 提取所有表格
   * @param {Page} page - Playwright页面对象
   * @returns {Promise<Array>} 表格数组
   */
  async extractTables(page) {
    try {
      const tables = await page.evaluate(() => {
        const tableElements = Array.from(document.querySelectorAll('table'));
        return tableElements.map((table, index) => {
          // 提取表头
          const headers = [];
          const headerCells = table.querySelectorAll('thead th, thead td');
          if (headerCells.length > 0) {
            headerCells.forEach(cell => headers.push(cell.textContent.trim()));
          } else {
            const firstRow = table.querySelector('tr');
            if (firstRow) {
              const cells = firstRow.querySelectorAll('th, td');
              cells.forEach(cell => headers.push(cell.textContent.trim()));
            }
          }

          // 提取数据行
          const rows = [];
          const bodyRows = table.querySelectorAll('tbody tr');
          const rowsToProcess = bodyRows.length > 0 ? bodyRows : table.querySelectorAll('tr');
          
          rowsToProcess.forEach((row, rowIndex) => {
            if (rowIndex === 0 && bodyRows.length === 0 && headers.length > 0) return;
            
            const cells = Array.from(row.querySelectorAll('td, th'));
            if (cells.length > 0) {
              const rowData = cells.map(cell => cell.textContent.trim());
              rows.push(rowData);
            }
          });

          return { 
            index,
            headers, 
            rows,
            caption: table.querySelector('caption')?.textContent.trim() || ''
          };
        });
      });
      return tables;
    } catch (error) {
      console.error('Failed to extract tables:', error.message);
      return [];
    }
  }

  /**
   * 提取代码块
   * @param {Page} page - Playwright页面对象
   * @returns {Promise<Array>} 代码块数组
   */
  async extractCodeBlocks(page) {
    try {
      const codeBlocks = await page.evaluate(() => {
        const blocks = [];

        const preCodeElements = document.querySelectorAll('pre code, pre');
        preCodeElements.forEach(element => {
          const code = element.textContent.trim();
          if (code) {
            let language = 'text';
            const classList = element.className;
            const langMatch = classList.match(/language-(\w+)/);
            if (langMatch) {
              language = langMatch[1];
            } else if (code.startsWith('{') || code.startsWith('[')) {
              language = 'json';
            } else if (code.startsWith('<')) {
              language = 'xml';
            }
            blocks.push({ language, code });
          }
        });

        const textareas = document.querySelectorAll('textarea[readonly]');
        textareas.forEach(textarea => {
          const code = textarea.value.trim();
          if (code) {
            let language = 'text';
            if (code.startsWith('{') || code.startsWith('[')) {
              language = 'json';
            } else if (code.startsWith('<')) {
              language = 'xml';
            }
            blocks.push({ language, code });
          }
        });

        return blocks;
      });
      return codeBlocks;
    } catch (error) {
      console.error('Failed to extract code blocks:', error.message);
      return [];
    }
  }
}

export default BaseParser;
