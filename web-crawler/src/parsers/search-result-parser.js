import BaseParser from './base-parser.js';

/**
 * Search Result Parser - 搜索结果页解析器
 * 专门处理搜索引擎结果、站内搜索结果等
 *
 * 支持的页面类型：
 * - 搜索引擎结果页（百度、Google、Bing等）
 * - 站内搜索结果页
 * - 商品搜索结果页
 */
class SearchResultParser extends BaseParser {
  /**
   * 匹配搜索结果页类型
   * @param {string} url - 页面URL
   * @returns {boolean} 是否匹配
   */
  matches(url) {
    // 搜索结果页URL特征
    const searchPatterns = [
      /\/search/i, /\/s\?/i, /\/result/i,
      /[?&]q=/i, /[?&]query=/i, /[?&]keyword=/i,
      /[?&]wd=/i, /[?&]word=/i,
      /google\..*\/search/i, /baidu\.com\/s/i,
      /bing\.com\/search/i, /so\.com\/s/i,
      /sogou\.com\/web/i, /yahoo\.com\/search/i
    ];

    const normalized = url.toLowerCase();

    for (const pattern of searchPatterns) {
      if (pattern.test(normalized)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 获取优先级（高于 GenericParser 和 ListPageParser）
   * @returns {number} 优先级
   */
  getPriority() {
    return 5;
  }

  /**
   * 解析搜索结果页
   * @param {Page} page - Playwright页面对象
   * @param {string} url - 页面URL
   * @param {Object} options - 解析选项
   * @returns {Promise<Object>} 解析后的页面数据
   */
  async parse(page, url, options = {}) {
    try {
      // 提取搜索信息
      const searchInfo = await this.extractSearchInfo(page, url);

      // 提取搜索结果
      const results = await this.extractResults(page);

      // 提取相关搜索
      const relatedSearches = await this.extractRelatedSearches(page);

      // 提取分页信息
      const pagination = await this.extractPagination(page);

      // 提取广告/推广
      const ads = await this.extractAds(page);

      return {
        type: 'search-result',
        url,
        ...searchInfo,
        results,
        relatedSearches,
        pagination,
        ads
      };
    } catch (error) {
      console.error('Failed to parse search result page:', error.message);
      return {
        type: 'search-result',
        url,
        query: '',
        results: [],
        relatedSearches: [],
        pagination: {},
        ads: []
      };
    }
  }

  /**
   * 提取搜索信息
   */
  async extractSearchInfo(page, url) {
    return await page.evaluate((currentUrl) => {
      const info = {
        query: '',
        totalResults: 0,
        searchTime: ''
      };

      // 从URL提取搜索词
      try {
        const urlObj = new URL(currentUrl);
        const queryParams = ['q', 'query', 'keyword', 'wd', 'word', 'text'];
        for (const param of queryParams) {
          const q = urlObj.searchParams.get(param);
          if (q) {
            info.query = decodeURIComponent(q);
            break;
          }
        }
      } catch {
        // URL 解析失败，继续尝试其他方式获取查询词
      }

      // 从页面提取搜索词
      if (!info.query) {
        const searchInput = document.querySelector('input[type="search"], input[name="q"], input[name="wd"], input[name="query"]');
        if (searchInput && searchInput.value) {
          info.query = searchInput.value;
        }
      }

      // 提取结果总数
      const totalSelectors = [
        '.result-count', '.nums_text', '#resultStats',
        '[class*="result"] [class*="count"]', '.total-count'
      ];
      for (const selector of totalSelectors) {
        const totalEl = document.querySelector(selector);
        if (totalEl) {
          const match = totalEl.textContent.match(/[\d,]+/);
          if (match) {
            info.totalResults = parseInt(match[0].replace(/,/g, ''));
            break;
          }
        }
      }

      // 提取搜索耗时
      const timeSelectors = [
        '.search-time', '.took', '#resultStats',
        '[class*="time"] [class*="second"]'
      ];
      for (const selector of timeSelectors) {
        const timeEl = document.querySelector(selector);
        if (timeEl) {
          const match = timeEl.textContent.match(/[\d.]+\s*(秒|seconds?)/i);
          if (match) {
            info.searchTime = match[0];
            break;
          }
        }
      }

      return info;
    }, url);
  }

  /**
   * 提取搜索结果
   */
  async extractResults(page) {
    return await page.evaluate(() => {
      const results = [];
      const processedUrls = new Set();

      // 搜索结果项选择器（适配多种搜索引擎）
      const resultSelectors = [
        // 百度
        '.result', '.c-container', '#content_left .result',
        // Google
        '.g', '#search .g', '[data-sokoban-container] .g',
        // Bing
        '.b_algo', '#b_results .b_algo',
        // 通用
        '.search-result', '.result-item', 'article'
      ];

      for (const selector of resultSelectors) {
        const resultEls = document.querySelectorAll(selector);

        if (resultEls.length >= 3) {
          resultEls.forEach((el, index) => {
            // 提取标题和链接
            const titleEl = el.querySelector('h3, h2, .title, a[href]');
            if (!titleEl) return;

            let title = '';
            let href = '';

            if (titleEl.tagName === 'A') {
              title = titleEl.textContent.trim();
              href = titleEl.href;
            } else {
              title = titleEl.textContent.trim();
              const linkEl = el.querySelector('a[href]');
              if (linkEl) {
                href = linkEl.href;
              }
            }

            if (!title || !href || processedUrls.has(href)) return;
            if (href.includes('javascript:') || href.startsWith('#')) return;

            processedUrls.add(href);

            // 提取摘要
            let snippet = '';
            const snippetSelectors = [
              '.c-abstract', '.c-span9', '.c-color-text',
              '[data-sncf]', '.IsZvec', '.b_caption p',
              '.snippet', '.desc', '.summary', 'p'
            ];
            for (const sel of snippetSelectors) {
              const snippetEl = el.querySelector(sel);
              if (snippetEl && snippetEl.textContent.trim().length > 20) {
                snippet = snippetEl.textContent.trim();
                break;
              }
            }

            // 提取显示URL
            let displayUrl = '';
            const urlSelectors = [
              '.c-showurl', '.c-url', '.TbwUpd',
              '.b_attribution cite', '.display-url', 'cite'
            ];
            for (const sel of urlSelectors) {
              const urlEl = el.querySelector(sel);
              if (urlEl) {
                displayUrl = urlEl.textContent.trim();
                break;
              }
            }

            // 判断是否是广告
            const isAd = el.classList.contains('ec_wise_ad') ||
                        el.querySelector('[class*="ad"]') ||
                        el.querySelector('[data-tuiguang]');

            results.push({
              rank: results.length + 1,
              title,
              href,
              snippet: snippet.slice(0, 300),
              displayUrl,
              isAd: !!isAd
            });
          });

          if (results.length >= 3) break;
        }
      }

      return results.slice(0, 100);
    });
  }

  /**
   * 提取相关搜索
   */
  async extractRelatedSearches(page) {
    return await page.evaluate(() => {
      const related = [];

      const selectors = [
        // 百度
        '#rs', '.rs', '.c-recommend', '[id*="rs"]',
        // Google
        '#bres', '.A7LReb', '[data-hveid*="rs"]',
        // Bing
        '#b_context .b_ans', '.b_rs',
        // 通用
        '.related-searches', '[class*="related"]', '.recommend'
      ];

      for (const selector of selectors) {
        const containerEl = document.querySelector(selector);
        if (!containerEl) continue;

        const linkEls = containerEl.querySelectorAll('a');
        linkEls.forEach(link => {
          const text = link.textContent.trim();
          if (text && text.length >= 2 && text.length <= 50) {
            related.push({
              text,
              href: link.href
            });
          }
        });

        if (related.length >= 5) break;
      }

      return related.slice(0, 20);
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
        pages: []
      };

      // 分页选择器
      const selectors = [
        '#page', '.page', '.pagination', '#b_results .sb_pag',
        '[class*="page"]', '[class*="pagination"]'
      ];

      for (const selector of selectors) {
        const paginationEl = document.querySelector(selector);
        if (!paginationEl) continue;

        // 当前页
        const currentEl = paginationEl.querySelector('.pc, .active, [class*="active"], strong');
        if (currentEl) {
          pagination.current = parseInt(currentEl.textContent) || 1;
        }

        // 所有页码
        const pageEls = paginationEl.querySelectorAll('a, span');
        pageEls.forEach(el => {
          const num = parseInt(el.textContent);
          if (!isNaN(num) && num > 0) {
            pagination.pages.push(num);
          }
        });

        // 计算总页数
        if (pagination.pages.length > 0) {
          pagination.total = Math.max(...pagination.pages);
        }

        break;
      }

      return pagination;
    });
  }

  /**
   * 提取广告/推广
   */
  async extractAds(page) {
    return await page.evaluate(() => {
      const ads = [];

      // 广告容器选择器
      const adSelectors = [
        '#content_left .ec_wise_ad', '#content_right .ec_wise_ad',
        '.ec_ad_results', '.EC_result', '[data-tuiguang]',
        '.ads', '.ad', '[class*="ads-"]', '[class*="advert"]'
      ];

      for (const selector of adSelectors) {
        const adEls = document.querySelectorAll(selector);
        adEls.forEach(el => {
          const titleEl = el.querySelector('a, h3, .title');
          const title = titleEl ? titleEl.textContent.trim() : '';
          const href = titleEl?.href || '';

          if (title && href) {
            ads.push({ title, href });
          }
        });
      }

      return ads.slice(0, 10);
    });
  }
}

export default SearchResultParser;