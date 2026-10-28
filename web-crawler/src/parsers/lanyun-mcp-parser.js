import GenericParser from './generic-parser.js';

/**
 * Lanyun MCP Parser - 解析蓝耘 MCP 控制台页面
 * 站点为前端 SPA（hash/history 混合路由）
 */
class LanyunMcpParser extends GenericParser {
  /**
   * 匹配 mcp.lanyun.net 页面
   * @param {string} url
   * @returns {boolean}
   */
  matches(url) {
    return /^https?:\/\/mcp\.lanyun\.net\/?/i.test(url);
  }

  /**
   * 比 GenericParser 更高优先级
   * @returns {number}
   */
  getPriority() {
    return 110;
  }

  /**
   * 解析页面并补充路由信息
   * @param {Page} page
   * @param {string} url
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async parse(page, url, options = {}) {
    const data = await super.parse(page, url, options);

    const routeInfo = await page.evaluate(() => {
      const href = window.location.href;
      const hash = window.location.hash || '';
      const hashRoute = hash.startsWith('#') ? hash.slice(1) : hash;
      const pathRoute = window.location.pathname || '/';

      const links = Array.from(document.querySelectorAll('a[href]'))
        .map(a => a.getAttribute('href') || '')
        .filter(Boolean)
        .map(h => {
          try {
            return new URL(h, window.location.origin).href;
          } catch {
            return null;
          }
        })
        .filter(Boolean)
        .filter(h => h.startsWith('https://mcp.lanyun.net/'));

      return {
        currentUrl: href,
        hashRoute,
        pathRoute,
        internalLinks: Array.from(new Set(links)).sort()
      };
    });

    return {
      ...data,
      type: 'lanyun-mcp',
      routeInfo
    };
  }
}

export default LanyunMcpParser;
