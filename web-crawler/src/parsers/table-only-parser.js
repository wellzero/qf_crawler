import BaseParser from './base-parser.js';
import GenericParser from './generic-parser.js';

/**
 * Table Only Parser - 当页面主体为单个大表格时，仅提取表格并输出CSV
 */
class TableOnlyParser extends BaseParser {
  constructor() {
    super();
    this.genericParser = new GenericParser();
  }

  matches(url, options = {}) {
    if (options.classification?.type === 'table_content_page') {
      return true;
    }

    return true;
  }

  getPriority() {
    return 5;
  }

  async parse(page, url, options = {}) {
    const isTableOnlyPage = await this.isTableOnlyPage(page);

    if (!isTableOnlyPage) {
      return this.genericParser.parse(page, url, options);
    }

    const title = await this.extractTitle(page);
    const tables = await this.genericParser.extractTablesWithPaginationAndVirtual(page);

    if (!tables.length) {
      return this.genericParser.parse(page, url, options);
    }

    return {
      type: 'table-only',
      url,
      title,
      description: '',
      headings: [],
      mainContent: [],
      paragraphs: [],
      lists: [],
      tables,
      codeBlocks: [],
      images: [],
      charts: [],
      chartData: [],
      blockquotes: [],
      definitionLists: [],
      horizontalRules: [],
      videos: [],
      audios: [],
      tabsAndDropdowns: [],
      dateFilters: [],
      apiData: 0
    };
  }

  async isTableOnlyPage(page) {
    try {
      const metrics = await page.evaluate(() => {
        const getTextLength = (el) => (el?.innerText || '').replace(/\s+/g, ' ').trim().length;

        const tables = Array.from(document.querySelectorAll('table'));
        if (!tables.length) {
          return { qualifies: false };
        }

        const tableWithRows = tables.map((table) => {
          const rows = table.querySelectorAll('tr').length;
          const cells = table.querySelectorAll('th, td').length;
          const textLength = getTextLength(table);
          return { rows, cells, textLength };
        });

        const largestTable = tableWithRows.sort((a, b) => b.rows - a.rows)[0];
        if (!largestTable || largestTable.rows < 15 || largestTable.cells < 40) {
          return { qualifies: false };
        }

        const nonTableTextLength = getTextLength(document.body) - tables.reduce((sum, table) => sum + getTextLength(table), 0);
        const paragraphs = document.querySelectorAll('p').length;
        const headings = document.querySelectorAll('h1,h2,h3,h4,h5,h6').length;

        const textRatio = nonTableTextLength / Math.max(largestTable.textLength, 1);
        const qualifies = tables.length <= 2 && paragraphs <= 8 && headings <= 8 && textRatio < 0.35;

        return { qualifies };
      });

      return !!metrics.qualifies;
    } catch (error) {
      return false;
    }
  }
}

export default TableOnlyParser;
