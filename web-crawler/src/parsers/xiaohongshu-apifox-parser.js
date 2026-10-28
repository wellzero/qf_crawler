import GenericParser from './generic-parser.js';

/**
 * 小红书 Apifox 文档解析器
 * 入口示例: https://xiaohongshu.apifox.cn/doc-2810914
 */
class XiaohongshuApifoxParser extends GenericParser {
  /**
   * 匹配小红书 Apifox 文档页面
   * @param {string} url
   * @returns {boolean}
   */
  matches(url) {
    return /^https?:\/\/xiaohongshu\.apifox\.cn\/(doc-.*|web\/project\/.*)?$/.test(url);
  }

  /**
   * 优先级高于通用解析器
   * @returns {number}
   */
  getPriority() {
    return 110;
  }

  /**
   * 支持站点定制的链接发现
   * @returns {boolean}
   */
  supportsLinkDiscovery() {
    return true;
  }

  /**
   * 从左侧目录和正文中提取文档链接
   * @param {Page} page
   * @returns {Promise<string[]>}
   */
  async discoverLinks(page) {
    try {
      await page.waitForSelector('a[href*="/doc-"]', { timeout: 15000 });
      const links = await page.evaluate(() => {
        const result = new Set();
        const anchors = document.querySelectorAll('a[href]');

        anchors.forEach(anchor => {
          const href = anchor.getAttribute('href') || '';
          if (!href) return;

          const absolute = href.startsWith('http')
            ? href
            : new URL(href, window.location.origin).href;

          if (/^https?:\/\/xiaohongshu\.apifox\.cn\/doc-/.test(absolute)) {
            result.add(absolute.split('#')[0]);
          }
        });

        return Array.from(result);
      });

      return links;
    } catch (error) {
      console.warn('[XiaohongshuApifoxParser] discoverLinks failed:', error.message);
      return [];
    }
  }

  /**
   * 等待文档内容渲染后复用 GenericParser 解析
   */
  async parse(page, url, options = {}) {
    try {
      await page.waitForSelector('h1, main', { timeout: 15000 });
      await page.waitForTimeout(1500);
    } catch (error) {
      console.warn('[XiaohongshuApifoxParser] wait content timeout:', error.message);
    }

    return super.parse(page, url, options);
  }
}

export default XiaohongshuApifoxParser;
