import BaseParser from './base-parser.js';

/**
 * 60s API Docs Parser - 解析 Apifox 托管的 60s API 文档
 * URL: https://docs.60s-api.viki.moe/*
 */
class Api60sDocsParser extends BaseParser {
  /**
   * 匹配 60s API 文档站点
   * @param {string} url - 页面URL
   * @returns {boolean}
   */
  matches(url) {
    return /^https?:\/\/docs\.60s-api\.viki\.moe\/.*/.test(url);
  }

  /**
   * 优先级高于通用解析器
   * @returns {number}
   */
  getPriority() {
    return 110;
  }

  /**
   * 解析文档页面
   * @param {Page} page
   * @param {string} url
   * @returns {Promise<Object>}
   */
  async parse(page, url) {
    try {
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await page.waitForFunction(
        () => (document.body?.innerText || '').trim().length > 300,
        { timeout: 20000 }
      ).catch(() => {});
      await page.waitForTimeout(1200);

      const data = await page.evaluate(() => {
        const result = {
          title: '',
          description: '',
          sections: [],
          codeBlocks: [],
          links: []
        };

        const main =
          document.querySelector('main') ||
          document.querySelector('article') ||
          document.querySelector('[class*="markdown"]') ||
          document.body;

        const h1 = document.querySelector('h1');
        if (h1) {
          result.title = h1.textContent.trim();
        }

        if (!result.title) {
          const titleEl = document.querySelector('title');
          if (titleEl) {
            result.title = titleEl.textContent.split('|')[0].trim();
          }
        }

        const metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc) {
          result.description = metaDesc.getAttribute('content') || '';
        }

        const elements = main.querySelectorAll('h2, h3, h4, p, li, table');
        elements.forEach((el) => {
          const text = el.textContent?.trim();
          if (!text) return;

          if (/^H[2-4]$/.test(el.tagName)) {
            result.sections.push({ type: 'heading', content: text });
            return;
          }

          if (el.tagName === 'P') {
            if (text.length > 8) {
              result.sections.push({ type: 'text', content: text });
            }
            return;
          }

          if (el.tagName === 'LI') {
            result.sections.push({ type: 'list-item', content: text });
            return;
          }

          if (el.tagName === 'TABLE') {
            const rows = Array.from(el.querySelectorAll('tr')).map((tr) =>
              Array.from(tr.querySelectorAll('th,td')).map((cell) => cell.textContent?.trim() || '')
            ).filter((row) => row.length > 0);

            if (rows.length > 0) {
              result.sections.push({ type: 'table', rows });
            }
          }
        });

        // Apifox 文档部分页面没有语义化 p/li 结构，回退为按行提取可读文本
        if (result.sections.length === 0) {
          const lines = (main.innerText || '')
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length >= 2)
            .filter(line => !['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(line))
            .slice(0, 400);

          lines.forEach((line) => {
            if (line.length <= 40 && /^[\u4e00-\u9fa5A-Za-z0-9\s\-_/()【】]+$/.test(line)) {
              result.sections.push({ type: 'heading', content: line });
            } else {
              result.sections.push({ type: 'text', content: line });
            }
          });
        }

        // 提取文档内链接（用于调试和后续扩展）
        result.links = Array.from(document.querySelectorAll('a[href]'))
          .map(a => a.getAttribute('href') || '')
          .filter(Boolean)
          .map(href => href.startsWith('http') ? href : new URL(href, window.location.origin).href)
          .filter(href => href.startsWith('https://docs.60s-api.viki.moe/'));

        document.querySelectorAll('pre code, pre').forEach((codeEl) => {
          const code = codeEl.textContent?.trim();
          if (code && code.length > 10) {
            result.codeBlocks.push({
              language: (codeEl.className.match(/language-(\w+)/) || [])[1] || '',
              code
            });
          }
        });

        return result;
      });

      return {
        type: '60s-api-doc',
        url,
        title: data.title,
        description: data.description,
        content: data.sections,
        codeBlocks: data.codeBlocks,
        links: [...new Set(data.links)]
      };
    } catch (error) {
      console.error('[Api60sDocsParser] Parse error:', error.message);
      return {
        type: '60s-api-doc',
        url,
        title: '',
        description: '',
        content: [],
        codeBlocks: [],
        error: error.message
      };
    }
  }
}

export default Api60sDocsParser;
