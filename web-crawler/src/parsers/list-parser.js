import BaseParser from './base-parser.js';

/**
 * List Parser - 列表页解析器
 */
class ListParser extends BaseParser {
  matches(url, options = {}) {
    const classificationType = options.classification?.type;
    if (classificationType === 'list_page') return true;

    return /\/list|\/category|page=\d+/.test(String(url).toLowerCase());
  }

  getPriority() {
    return 85;
  }

  async parse(page, url) {
    const title = await this.extractTitle(page);

    const { items, pagination } = await page.evaluate(() => {
      const clean = (text = '') => text.replace(/\s+/g, ' ').trim();
      const candidates = Array.from(document.querySelectorAll('article, li, .item, .list-item'));

      const items = candidates
        .map((node) => {
          const link = node.querySelector('a[href]');
          const titleNode = node.querySelector('h1,h2,h3,h4,.title') || link;
          const summaryNode = node.querySelector('p,.summary,.desc');
          const dateNode = node.querySelector('time,.date,[class*="time"]');

          const title = clean(titleNode?.textContent || '');
          const href = link?.getAttribute('href') || '';
          const summary = clean(summaryNode?.textContent || '');
          const date = clean(dateNode?.textContent || '');

          return { title, url: href, summary, date };
        })
        .filter(item => item.title && item.url)
        .slice(0, 200);

      const current = document.querySelector('.pagination .active, .pager .active, [aria-current="page"]')?.textContent?.trim() || '';
      const next = document.querySelector('.pagination a[rel="next"], .pager a.next, a.next')?.getAttribute('href') || '';

      return {
        items,
        pagination: {
          current,
          next,
          paginationDetected: !!(current || next || document.querySelector('.pagination, .pager'))
        }
      };
    });

    return {
      type: 'list-page',
      url,
      title,
      items,
      pagination,
      listMeta: {
        totalItems: items.length
      }
    };
  }
}

export default ListParser;
