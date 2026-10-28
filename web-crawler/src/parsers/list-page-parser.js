import BaseParser from './base-parser.js';

/**
 * List Page Parser - 列表页解析器
 * 专门处理新闻列表、商品列表、文章列表等
 *
 * 支持的页面类型：
 * - 新闻列表页
 * - 商品列表页
 * - 文章列表页
 * - 搜索结果列表页
 */
class ListPageParser extends BaseParser {
  /**
   * 匹配列表页类型
   * @param {string} url - 页面URL
   * @returns {boolean} 是否匹配
   */
  matches(url) {
    // 列表页URL特征
    const listPatterns = [
      /\/list/i, /\/news$/i, /\/articles?$/i, /\/products?$/i,
      /\/category\//i, /\/catalog\//i, /\/tag\//i,
      /page=\d+/i, /p=\d+/i, /pn=\d+/i,
      /\/\d+\.html$/, /\/\d+\/\d+\.shtml$/,
      // 新闻频道页
      /\/world\/$/i, /\/china\/$/i, /\/society\/$/i, /\/tech\/$/i, /\/finance\/$/i,
      /\/ent\/$/i, /\/sports\/$/i, /\/military\/$/i, /\/auto\/$/i, /\/international\/$/i,
      // 常见频道模式
      /news\.[a-z]+\.com\/[a-z]+\/$/i
    ];

    const normalized = url.toLowerCase();

    for (const pattern of listPatterns) {
      if (pattern.test(normalized)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 获取优先级（高于 GenericParser）
   * @returns {number} 优先级
   */
  getPriority() {
    return 4;
  }

  /**
   * 通过页面内容特征检测是否为列表页
   * @param {Page} page - Playwright页面对象
   * @returns {Promise<number>} 置信度 0-100
   */
  async detectByContent(page) {
    return await page.evaluate(() => {
      let score = 0;

      // 检测列表项（多个结构相似的条目）
      const listSelectors = ['.news-item', '.article-item', '.list-item', '.product-item', 'article', '.item', '.entry', '.post', '.card'];
      for (const sel of listSelectors) {
        const items = document.querySelectorAll(sel);
        if (items.length >= 10) {
          score += 40;
          break;
        } else if (items.length >= 5) {
          score += 30;
          break;
        } else if (items.length >= 3) {
          score += 20;
          break;
        }
      }

      // 分页控件
      const paginationSelectors = ['.pagination', '.pager', '.page-nav', '.pages', '[class*="pagination"]', '[class*="pager"]'];
      for (const sel of paginationSelectors) {
        if (document.querySelector(sel)) {
          score += 30;
          break;
        }
      }

      // 筛选器/侧边栏分类
      const filterSelectors = ['.filter', '.filters', '.sidebar-filter', '.screen', '[class*="filter"]', '.category-nav', '.sub-nav'];
      for (const sel of filterSelectors) {
        if (document.querySelector(sel)) {
          score += 20;
          break;
        }
      }

      // 侧边栏
      const sidebar = document.querySelector('aside, .sidebar, .side');
      if (sidebar) score += 10;

      return score;
    });
  }

  /**
   * 解析列表页
   * @param {Page} page - Playwright页面对象
   * @param {string} url - 页面URL
   * @param {Object} options - 解析选项
   * @returns {Promise<Object>} 解析后的页面数据
   */
  async parse(page, url, options = {}) {
    try {
      // 提取页面基本信息
      const pageInfo = await this.extractPageInfo(page);

      // 提取列表项
      const listItems = await this.extractListItems(page);

      // 提取分页信息
      const pagination = await this.extractPagination(page);

      // 提取筛选器/分类
      const filters = await this.extractFilters(page);

      // 提取侧边栏
      const sidebar = await this.extractSidebar(page);

      return {
        type: 'list-page',
        url,
        ...pageInfo,
        listItems,
        pagination,
        filters,
        sidebar
      };
    } catch (error) {
      console.error('Failed to parse list page:', error.message);
      return {
        type: 'list-page',
        url,
        title: '',
        description: '',
        listItems: [],
        pagination: {},
        filters: [],
        sidebar: {}
      };
    }
  }

  /**
   * 提取页面基本信息
   */
  async extractPageInfo(page) {
    return await page.evaluate(() => {
      const title = document.title || '';
      const description = document.querySelector('meta[name="description"]')?.content || '';

      // 尝试提取列表标题
      let listTitle = '';
      const h1 = document.querySelector('h1');
      if (h1) {
        listTitle = h1.textContent.trim();
      }

      return { title, description, listTitle };
    });
  }

  /**
   * 提取列表项
   */
  async extractListItems(page) {
    return await page.evaluate(() => {
      const items = [];

      // 常见列表项选择器
      const itemSelectors = [
        '.news-item', '.article-item', '.list-item', '.product-item',
        'article', '.item', '.entry', '.post', '.card',
        'li[data-id]', 'tr[data-id]', '.row'
      ];

      for (const selector of itemSelectors) {
        const elements = document.querySelectorAll(selector);

        if (elements.length >= 3) {
          elements.forEach((el, index) => {
            // 提取标题和链接
            const linkEl = el.querySelector('a[href]');
            if (!linkEl) return;

            const title = linkEl.textContent.trim() ||
                         el.querySelector('h2, h3, h4, .title')?.textContent.trim() || '';
            const href = linkEl.href;

            if (!title || title.length < 2 || title.length > 200) return;

            // 提取摘要
            let summary = '';
            const summaryEl = el.querySelector('.summary, .desc, .intro, .abstract, p');
            if (summaryEl && summaryEl !== linkEl) {
              summary = summaryEl.textContent.trim().slice(0, 300);
            }

            // 提取时间
            let time = '';
            const timeEl = el.querySelector('time, .time, .date, [class*="time"], [class*="date"]');
            if (timeEl) {
              time = timeEl.textContent.trim();
            }

            // 提取来源/作者
            let source = '';
            const sourceEl = el.querySelector('.source, .author, .from');
            if (sourceEl) {
              source = sourceEl.textContent.trim();
            }

            // 提取标签
            const tags = [];
            const tagEls = el.querySelectorAll('.tag, .label, [class*="tag"]');
            tagEls.forEach(tag => {
              const tagText = tag.textContent.trim();
              if (tagText && tagText.length <= 20) {
                tags.push(tagText);
              }
            });

            // 提取图片
            let img = null;
            const imgEl = el.querySelector('img');
            if (imgEl && imgEl.src && !imgEl.src.startsWith('data:')) {
              img = {
                src: imgEl.src,
                alt: imgEl.alt || ''
              };
            }

            // 提取价格（商品列表）
            let price = '';
            const priceEl = el.querySelector('.price, [class*="price"]');
            if (priceEl) {
              price = priceEl.textContent.trim();
            }

            items.push({
              title,
              href,
              summary,
              time,
              source,
              tags,
              img,
              price,
              index: index + 1
            });
          });

          if (items.length >= 3) {
            break; // 找到足够多的列表项，停止搜索
          }
        }
      }

      return items.slice(0, 100); // 最多100条
    });
  }

  /**
   * 提取分页信息
   */
  async extractPagination(page) {
    return await page.evaluate(() => {
      const pagination = {
        current: 1,
        total: 1,
        hasNext: false,
        hasPrev: false,
        pages: []
      };

      // 分页选择器
      const paginationSelectors = [
        '.pagination', '.pager', '.page-nav', '.pages',
        '[class*="pagination"]', '[class*="pager"]'
      ];

      for (const selector of paginationSelectors) {
        const paginationEl = document.querySelector(selector);
        if (paginationEl) {
          // 提取当前页
          const currentPageEl = paginationEl.querySelector('.current, .active, [class*="current"]');
          if (currentPageEl) {
            pagination.current = parseInt(currentPageEl.textContent) || 1;
          }

          // 提取所有页码
          const pageLinks = paginationEl.querySelectorAll('a, span');
          const pageNums = new Set();
          pageLinks.forEach(link => {
            const num = parseInt(link.textContent);
            if (!isNaN(num) && num > 0) {
              pageNums.add(num);
            }
          });
          pagination.pages = Array.from(pageNums).sort((a, b) => a - b);
          if (pagination.pages.length > 0) {
            pagination.total = Math.max(...pagination.pages);
          }

          // 检测上下页
          pagination.hasNext = !!paginationEl.querySelector('.next, [class*="next"], a[rel="next"]');
          pagination.hasPrev = !!paginationEl.querySelector('.prev, [class*="prev"], a[rel="prev"]');

          break;
        }
      }

      return pagination;
    });
  }

  /**
   * 提取筛选器/分类
   */
  async extractFilters(page) {
    return await page.evaluate(() => {
      const filters = [];

      // 筛选器选择器
      const filterSelectors = [
        '.filter', '.filters', '.sidebar-filter', '.screen',
        '[class*="filter"]', '.category-nav', '.sub-nav'
      ];

      for (const selector of filterSelectors) {
        const filterEls = document.querySelectorAll(selector);
        filterEls.forEach(filterEl => {
          const titleEl = filterEl.querySelector('h3, .title, .hd');
          const title = titleEl ? titleEl.textContent.trim() : '筛选';

          const options = [];
          const optionEls = filterEls.querySelectorAll('a, li, label');
          optionEls.forEach(opt => {
            const text = opt.textContent.trim();
            const href = opt.href || opt.querySelector('a')?.href || '';
            if (text && text.length <= 30) {
              options.push({ text, href });
            }
          });

          if (options.length >= 2) {
            filters.push({ title, options: options.slice(0, 20) });
          }
        });

        if (filters.length >= 3) break;
      }

      return filters;
    });
  }

  /**
   * 提取侧边栏
   */
  async extractSidebar(page) {
    return await page.evaluate(() => {
      const sidebar = {};
      const sidebarEl = document.querySelector('aside, .sidebar, .side');

      if (sidebarEl) {
        // 提取热门推荐
        const hotItems = [];
        const hotEls = sidebarEl.querySelectorAll('.hot, .recommend, [class*="hot"] a, [class*="recommend"] a');
        hotEls.forEach(el => {
          const text = el.textContent.trim();
          const href = el.href;
          if (text && text.length <= 100 && href) {
            hotItems.push({ text, href });
          }
        });
        if (hotItems.length > 0) {
          sidebar.hotItems = hotItems.slice(0, 10);
        }

        // 提取相关分类
        const categories = [];
        const catEls = sidebarEl.querySelectorAll('.category a, .cat a, [class*="category"] a');
        catEls.forEach(el => {
          const text = el.textContent.trim();
          const href = el.href;
          if (text && text.length <= 30 && href) {
            categories.push({ text, href });
          }
        });
        if (categories.length > 0) {
          sidebar.categories = categories.slice(0, 20);
        }
      }

      return sidebar;
    });
  }
}

export default ListPageParser;