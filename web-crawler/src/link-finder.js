/**
 * Link Finder模块
 * 负责从页面中发现和提取符合规则的链接
 */

import { toAbsoluteUrl, filterLinks } from './url-utils.js';

/**
 * Link Finder类
 */
class LinkFinder {
  /**
   * 展开页面中的折叠内容
   * @param {Page} page - Playwright页面对象
   */
  async expandCollapsibles(page) {
      try {
        // 展开所有<details>元素
        await page.evaluate(() => {
          const details = document.querySelectorAll('details');
          details.forEach(detail => {
            detail.open = true;
          });
        });

        // 更激进的展开策略 - 点击所有可能的展开元素
        await page.evaluate(() => {
          // 点击所有可能的折叠菜单（排除details和summary，因为已经处理过了）
          // 同时排除 a 标签，避免点击导航链接导致页面跳转
          document.querySelectorAll('[class*="collapse"]:not(details):not(summary):not(a), [class*="expand"]:not(details):not(summary):not(a)').forEach((el) => {
            try {
              el.click();
            } catch {
              // 点击可能因元素不可见/不可交互而失败，忽略继续
            }
          });

          // 点击所有包含展开文本的按钮、span、div（排除 a 标签）
          document.querySelectorAll('button, span, div').forEach((el) => {
            const text = el.textContent || '';
            const className = el.className || '';
            // 排除包含单个 > 的情况（通常是导航箭头），只匹配明确的展开文本
            if (text.includes('展开') || text.includes('▶') ||
                className.includes('expand') || className.includes('collapse')) {
              try {
                el.click();
              } catch {
                // 点击可能因元素不可见/不可交互而失败，忽略继续
              }
            }
          });
        });

        // 短暂等待让 DOM 更新
        await page.waitForTimeout(300);

        // 再次尝试展开（排除 a 标签）
        await page.evaluate(() => {
          document.querySelectorAll('[class*="collapse"]:not(details):not(summary):not(a), [class*="expand"]:not(details):not(summary):not(a)').forEach((el) => {
            try {
              el.click();
            } catch {
              // 点击可能因元素不可见/不可交互而失败，忽略继续
            }
          });
        });

        await page.waitForTimeout(100);
      } catch (error) {
        // 展开失败不影响后续流程
        console.warn('Failed to expand collapsibles:', error.message);
      }
    }
  
  /**
   * 执行无限滚动，加载所有内容
   * @param {Page} page - Playwright页面对象
   * @param {Object} options - 滚动选项
   */
  async performInfiniteScroll(page, options = {}) {
    const {
      scrollSelector = null,  // 要滚动的元素选择器，null表示滚动整个页面
      maxScrolls = 50,        // 最大滚动次数
      scrollDelay = 1000,     // 滚动后的等待时间(ms)
      stabilityChecks = 3     // 连续多少次没有新内容才停止
    } = options;

    try {
      let previousCount = 0;
      let stableCount = 0;

      for (let i = 0; i < maxScrolls; i++) {
        // 执行滚动
        if (scrollSelector) {
          // 滚动特定元素
          await page.evaluate((selector) => {
            const element = document.querySelector(selector);
            if (element) {
              element.scrollTop = element.scrollHeight;
            }
          }, scrollSelector);
        } else {
          // 滚动整个页面
          await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
          });
        }

        // 等待新内容加载
        await page.waitForTimeout(scrollDelay);

        // 检查是否有新内容（通过链接数量判断）
        const currentCount = await page.evaluate(() => {
          return document.querySelectorAll('a[href]').length;
        });

        if (currentCount === previousCount) {
          stableCount++;
          if (stableCount >= stabilityChecks) {
            console.log(`Infinite scroll completed after ${i + 1} scrolls, no new content`);
            break;
          }
        } else {
          stableCount = 0;
          previousCount = currentCount;
        }
      }
    } catch (error) {
      console.warn('Infinite scroll failed:', error.message);
    }
  }

  /**
   * 提取页面中的所有链接
   * @param {Page} page - Playwright页面对象
   * @param {Object} urlRules - URL过滤规则
   * @param {Object} options - 额外选项
   * @returns {string[]} URL数组
   */
  async extractLinks(page, urlRules, options = {}) {
    try {
      // 获取当前页面的URL作为基础URL
      const baseUrl = page.url();

      // 针对动态站点，等待链接元素渲染
      if (options.fetchMethod !== 'request') {
        await page.waitForFunction(
          () => document.querySelectorAll('a[href]').length > 0 || (document.body?.innerText || '').length > 400,
          { timeout: 12000 }
        ).catch(() => {});
      }

      // 检查是否需要无限滚动（针对 finnhub 等 SPA 页面）
      if (baseUrl.includes('finnhub.io/docs/api') && options.fetchMethod !== 'request') {
        // 对 finnhub 的侧边栏进行无限滚动 (#side-bar 是滚动容器)
        await this.performInfiniteScroll(page, {
          scrollSelector: '#side-bar',
          maxScrolls: 100,
          scrollDelay: 500,
          stabilityChecks: 5
        });

        // 也尝试滚动整个页面
        await this.performInfiniteScroll(page, {
          maxScrolls: 20,
          scrollDelay: 500,
          stabilityChecks: 3
        });
      }

      // 从页面中提取所有链接
      // 优先查找包含 api-key 的链接（针对 lixinger.com 等API文档站点）
      const links = await page.evaluate(() => {
        const allLinks = new Set();

        // 查找所有包含 api-key 的链接
        document.querySelectorAll('a[href*="api-key="]').forEach((a) => {
          const href = a.getAttribute('href');
          if (href) {
            try {
              const url = href.startsWith('http') ? href : new URL(href, window.location.origin).href;

              // 验证 api-key 参数的有效性
              const urlObj = new URL(url);
              const apiKey = urlObj.searchParams.get('api-key');

              // 过滤掉无效的 api-key
              if (!apiKey || apiKey === 'undefined' || apiKey === 'null' || apiKey.trim() === '') {
                console.warn(`Skipped invalid api-key in URL: ${url}`);
                return; // 跳过这个链接
              }

              // 只保留 doc?api-key= 格式的链接
              if (url.includes('/open/api/doc') && url.includes('api-key=')) {
                allLinks.add(url);
              }
            } catch {
              // URL 解析失败，跳过无效链接
            }
          }
        });

        // 如果没有找到 api-key 链接，则提取所有普通链接
        if (allLinks.size === 0) {
          // 提取普通 href 链接
          const anchors = document.querySelectorAll('a[href]');

          anchors.forEach(a => {
            const href = a.getAttribute('href');
            if (!href) return;

            // 过滤掉 javascript: 链接和空链接
            if (href.startsWith('javascript:')) return;
            if (href === '#' || href === '') return;

            // 过滤掉看起来像广告的链接（onclick 中包含跳转逻辑）
            const onclick = a.getAttribute('onclick') || '';
            if (onclick.includes('track') || onclick.includes('adclick')) return;

            try {
              // 转换为绝对URL
              const absoluteUrl = href.startsWith('http')
                ? href
                : new URL(href, window.location.origin).href;
              allLinks.add(absoluteUrl);
            } catch {
              // URL 解析失败，跳过
            }
          });

          // 提取 Angular routerLink 属性
          document.querySelectorAll('[routerlink]').forEach(el => {
            const routerLink = el.getAttribute('routerlink');
            if (routerLink) {
              try {
                // routerLink 可能是相对路径，需要转换为绝对URL
                const url = routerLink.startsWith('http')
                  ? routerLink
                  : new URL(routerLink, window.location.origin).href;
                allLinks.add(url);
              } catch {
                // routerLink 解析失败，跳过无效链接
              }
            }
          });

          // 也检查 routerLink 的 camelCase 写法
          document.querySelectorAll('[routerLink]').forEach(el => {
            const routerLink = el.getAttribute('routerLink');
            if (routerLink) {
              try {
                const url = routerLink.startsWith('http')
                  ? routerLink
                  : new URL(routerLink, window.location.origin).href;
                allLinks.add(url);
              } catch {
                // routerLink 解析失败，跳过无效链接
              }
            }
          });
        }

        return Array.from(allLinks);
      });

      // 转换为绝对URL
      const absoluteLinks = links.map(link => toAbsoluteUrl(link, baseUrl));

      // 去重
      const uniqueLinks = [...new Set(absoluteLinks)];

      // 过滤链接（包含广告过滤）
      const filteredLinks = filterLinks(uniqueLinks, urlRules);

      return filteredLinks;
    } catch (error) {
      console.error('Failed to extract links:', error.message);
      return [];
    }
  }
}

export default LinkFinder;
