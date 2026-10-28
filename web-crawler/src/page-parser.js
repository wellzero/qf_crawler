import ParserManager from './parsers/parser-manager.js';

/**
 * Page Parser - 负责解析页面内容
 * 使用解析器管理器根据URL类型选择合适的解析器
 */
class PageParser {
  constructor() {
    this.parserManager = new ParserManager();
  }

  /**
   * 解析页面内容
   * @param {Page} page - Playwright页面对象
   * @param {string} url - 页面URL
   * @param {Object} options - 解析选项
   * @returns {PageData} 解析后的页面数据
   */
  async parsePage(page, url, options = {}) {
    return await this.parserManager.parse(page, url, options);
  }
}

export default PageParser;
