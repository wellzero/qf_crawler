import BaseParser from './base-parser.js';

/**
 * Directory Parser - 目录页解析器
 */
class DirectoryParser extends BaseParser {
  matches(url, options = {}) {
    const classificationType = options.classification?.type;
    if (classificationType === 'directory_page') return true;

    return /\/directory|\/index|\/guide|\/catalog/.test(String(url).toLowerCase());
  }

  getPriority() {
    return 80;
  }

  async parse(page, url) {
    const title = await this.extractTitle(page);

    const tree = await page.evaluate(() => {
      const clean = (text = '') => text.replace(/\s+/g, ' ').trim();
      const toNode = (link) => ({
        name: clean(link.textContent || ''),
        url: link.getAttribute('href') || '',
        children: []
      });

      const navContainers = Array.from(document.querySelectorAll('nav, .directory, .catalog, .menu, aside'));
      const container = navContainers.find(el => el.querySelectorAll('a[href]').length >= 5) || document.body;

      const nodes = [];
      const rootLists = Array.from(container.querySelectorAll(':scope > ul, :scope > ol'));
      const lists = rootLists.length ? rootLists : Array.from(container.querySelectorAll('ul,ol')).slice(0, 1);

      const parseList = (listEl) => {
        const result = [];
        const children = Array.from(listEl.children).filter(child => child.tagName === 'LI');
        children.forEach((li) => {
          const directLink = li.querySelector(':scope > a[href]') || li.querySelector('a[href]');
          if (!directLink) return;
          const node = toNode(directLink);

          const subList = li.querySelector(':scope > ul, :scope > ol');
          if (subList) {
            node.children = parseList(subList);
          }

          result.push(node);
        });
        return result;
      };

      lists.forEach((listEl) => {
        nodes.push(...parseList(listEl));
      });

      if (nodes.length === 0) {
        return Array.from(container.querySelectorAll('a[href]')).slice(0, 100).map(toNode).filter(node => node.name && node.url);
      }

      return nodes;
    });

    return {
      type: 'directory-page',
      url,
      title,
      tree,
      directoryMeta: {
        nodeCount: this.countNodes(tree)
      }
    };
  }

  countNodes(nodes = []) {
    return nodes.reduce((sum, node) => sum + 1 + this.countNodes(node.children || []), 0);
  }
}

export default DirectoryParser;
