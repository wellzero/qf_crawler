import BaseParser from './base-parser.js';

/**
 * Apify Actor Parser - 解析 Apify Actor 页面与 API 参考文档
 * 目标：尽可能提取后续 API 调用所需信息（端点、参数、示例）
 */
class ApifyActorParser extends BaseParser {
  /**
   * 匹配 Apify Actor 页面与 docs.apify.com API 文档页面
   * @param {string} url
   * @returns {boolean}
   */
  matches(url) {
    return /^https?:\/\/(apify\.com|docs\.apify\.com)\//.test(url);
  }

  /**
   * 优先级（高于 GenericParser）
   * @returns {number}
   */
  getPriority() {
    return 95;
  }

  /**
   * 生成文件名
   * @param {string} url
   * @returns {string}
   */
  generateFilename(url) {
    try {
      const { hostname, pathname } = new URL(url);
      const cleaned = pathname.replace(/^\/+|\/+$/g, '').replace(/\//g, '_') || 'home';
      return `${hostname.replace(/\./g, '_')}_${cleaned}`;
    } catch (e) {
      return 'apify_doc';
    }
  }

  /**
   * 等待页面内容加载
   * @param {Page} page
   */
  async waitForContent(page) {
    try {
      await page.waitForLoadState('networkidle', { timeout: 15000 });
    } catch (error) {
      // 忽略超时，继续进行尽力提取
    }

    try {
      await page.waitForFunction(() => {
        const main = document.querySelector('main');
        const hasText = (main?.innerText || document.body?.innerText || '').trim().length > 80;
        return hasText;
      }, { timeout: 10000 });
    } catch (error) {
      // 忽略，兜底依然会做通用提取
    }
  }

  /**
   * 解析页面
   * @param {Page} page
   * @param {string} url
   * @returns {Promise<Object>}
   */
  async parse(page, url) {
    await this.waitForContent(page);

    const data = await page.evaluate((pageUrl) => {
      const normalize = (text = '') => text.replace(/\s+/g, ' ').trim();
      const unique = (arr) => Array.from(new Set(arr.filter(Boolean)));

      const result = {
        type: 'apify-actor',
        url: pageUrl,
        title: '',
        description: '',
        api: {
          method: 'POST',
          endpoint: '',
          baseUrl: 'https://api.apify.com/v2'
        },
        parameters: [],
        responseFields: [],
        codeExamples: [],
        importantNotes: [],
        relatedPages: [],
        rawContent: ''
      };

      result.title = normalize(
        document.querySelector('h1')?.textContent ||
        document.querySelector('title')?.textContent ||
        ''
      );

      result.description = normalize(
        document.querySelector('meta[name="description"]')?.getAttribute('content') ||
        document.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
        ''
      );

      // 从 URL 推断 actor 名称，优先构造可调用的 run-sync-get-dataset-items 端点
      try {
        const parsed = new URL(pageUrl);
        const actorMatch = parsed.pathname.match(/^\/([^/]+)\/([^/]+)/);
        if (parsed.hostname === 'apify.com' && actorMatch) {
          const username = actorMatch[1];
          const actor = actorMatch[2];
          result.api.endpoint = `https://api.apify.com/v2/acts/${username}~${actor}/run-sync-get-dataset-items`;
        }
      } catch (e) {
        // ignore
      }

      // 代码示例
      const codeBlocks = Array.from(document.querySelectorAll('pre code, pre'));
      codeBlocks.forEach((block) => {
        const code = (block.textContent || '').trim();
        if (!code || code.length < 20) return;
        const cls = block.className || '';
        const langMatch = cls.match(/language-([a-zA-Z0-9]+)/);
        const language = langMatch?.[1]?.toLowerCase() ||
          (code.startsWith('{') || code.startsWith('[') ? 'json' : 'text');

        result.codeExamples.push({ language, code: code.slice(0, 5000) });

        // 自动发现 API endpoint
        if (!result.api.endpoint) {
          const endpointMatch = code.match(/https:\/\/api\.apify\.com\/v2\/[^\s"'`]+/);
          if (endpointMatch) {
            result.api.endpoint = endpointMatch[0];
          }
        }
      });

      // 参数提取：优先读带 key/type/description 的表格
      const tables = Array.from(document.querySelectorAll('table'));
      tables.forEach((table) => {
        const rows = Array.from(table.querySelectorAll('tr'));
        if (rows.length < 2) return;

        const headerCells = Array.from(rows[0].querySelectorAll('th,td'));
        const headers = headerCells.map((cell) => normalize(cell.textContent).toLowerCase());

        const nameIdx = headers.findIndex((h) => /(name|key|field|parameter|参数)/.test(h));
        const typeIdx = headers.findIndex((h) => /(type|类型)/.test(h));
        const requiredIdx = headers.findIndex((h) => /(required|mandatory|必填|必需)/.test(h));
        const descIdx = headers.findIndex((h) => /(description|desc|说明|描述)/.test(h));

        if (nameIdx === -1) return;

        for (let i = 1; i < rows.length; i += 1) {
          const cells = Array.from(rows[i].querySelectorAll('td,th'));
          if (cells.length < 2) continue;

          const name = normalize(cells[nameIdx]?.textContent || '');
          if (!name || /^(name|key|field|parameter)$/i.test(name)) continue;

          const type = normalize(cells[typeIdx]?.textContent || 'string') || 'string';
          const requiredRaw = normalize(cells[requiredIdx]?.textContent || '');
          const description = normalize(cells[descIdx]?.textContent || cells[cells.length - 1]?.textContent || '');

          result.parameters.push({
            name,
            type,
            required: /^(yes|true|required|必填|必需)$/i.test(requiredRaw),
            description
          });
        }
      });

      // JSON-LD / Next.js 脚本中抽取补充信息
      const ldScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
      ldScripts.forEach((s) => {
        try {
          const json = JSON.parse(s.textContent || '{}');
          if (!result.description && typeof json.description === 'string') {
            result.description = normalize(json.description);
          }
        } catch (e) {
          // ignore malformed json
        }
      });

      // 重点提示（token / dataset / webhook / limits 等关键词）
      const noteCandidates = Array.from(document.querySelectorAll('li, p'))
        .map((el) => normalize(el.textContent || ''))
        .filter((t) => /(token|api key|dataset|webhook|rate limit|pricing|credit|timeout|proxy)/i.test(t))
        .slice(0, 30);
      result.importantNotes = unique(noteCandidates);

      // 相关页面（同账号下 actor + docs api）
      const links = Array.from(document.querySelectorAll('a[href]'))
        .map((a) => a.getAttribute('href'))
        .filter(Boolean)
        .map((href) => {
          try {
            return new URL(href, window.location.origin).href;
          } catch (e) {
            return '';
          }
        })
        .filter((href) => /^https:\/\/(apify\.com|docs\.apify\.com)\//.test(href))
        .filter((href) => /\/scrapapi\//.test(href) || /docs\.apify\.com\/api\/v2/.test(href))
        .slice(0, 80);
      result.relatedPages = unique(links);

      // 原始正文兜底
      result.rawContent = (document.querySelector('main')?.innerText || document.body?.innerText || '')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .slice(0, 50000);

      // 去重 + 控制体积
      result.codeExamples = unique(result.codeExamples.map((c) => JSON.stringify(c))).map((v) => JSON.parse(v)).slice(0, 12);
      result.parameters = unique(result.parameters.map((p) => JSON.stringify(p))).map((v) => JSON.parse(v)).slice(0, 120);

      // 如果抓不到 endpoint，给 docs 默认入口
      if (!result.api.endpoint && window.location.hostname === 'docs.apify.com') {
        result.api.endpoint = 'https://api.apify.com/v2';
        result.api.method = 'GET';
      }

      return result;
    }, url);

    return data;
  }
}

export default ApifyActorParser;
