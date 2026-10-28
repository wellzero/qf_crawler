import BaseParser from './base-parser.js';

/**
 * Kuaishou Apifox Parser - 解析快手 Apifox 文档页面
 */
class KuaishouApifoxParser extends BaseParser {
  matches(url) {
    return /^https?:\/\/kuaishou\.apifox\.cn\//.test(url);
  }

  getPriority() {
    return 110;
  }

  supportsLinkDiscovery() {
    return true;
  }

  async discoverLinks(page) {
    await page.waitForTimeout(1500);

    const domLinks = await page.evaluate(() => {
      const set = new Set();
      const nodes = Array.from(document.querySelectorAll('a[href]'));
      for (const a of nodes) {
        const href = a.getAttribute('href') || '';
        if (!href) continue;

        let absolute = href;
        if (href.startsWith('/')) {
          absolute = `${window.location.origin}${href}`;
        }

        if (/^https?:\/\/kuaishou\.apifox\.cn\/(api|doc)-\d+\/?$/.test(absolute)) {
          set.add(absolute);
        }
      }
      return Array.from(set);
    });

    const html = await page.content();
    const htmlLinks = [];
    const matches = html.match(/\/(api|doc)-\d+/g) || [];
    for (const m of matches) {
      htmlLinks.push(`https://kuaishou.apifox.cn${m}`);
    }

    return Array.from(new Set([...domLinks, ...htmlLinks]));
  }

  async parse(page, url, options = {}) {
    try {
      await page.waitForFunction(() => (document.body?.innerText || '').length > 200, { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(1500);

      const title = await this.extractTitle(page);
      const parsed = await page.evaluate(() => {
        const result = {
          description: '',
          method: '',
          endpoint: '',
          baseUrl: '',
          parameters: [],
          responseFields: [],
          codeExamples: [],
          rawContent: ''
        };

        const textOf = (el) => (el?.textContent || '').trim();

        const body = document.body || document.documentElement;
        const contentRoot = body;

        // 描述
        const descCandidate = contentRoot.querySelector('h1 + p, h1 + div p, [class*="markdown"] p');
        if (descCandidate) {
          result.description = textOf(descCandidate);
        }

        // 方法 + 路径（优先从连续文本，其次从行内相邻行）
        const methodPathNodes = Array.from(contentRoot.querySelectorAll('code, pre, span, div'));
        for (const node of methodPathNodes) {
          const text = textOf(node);
          const match = text.match(/\b(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b\s+(\/[^\s"'`]+)/i);
          if (match) {
            result.method = match[1].toUpperCase();
            result.endpoint = match[2];
            break;
          }
        }

        const allText = contentRoot.innerText || '';
        if (!result.method || !result.endpoint) {
          const lines = allText.split(/\n+/).map((l) => l.trim()).filter(Boolean);
          for (let i = 0; i < lines.length; i++) {
            const m = lines[i].match(/^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)$/i);
            if (!m) continue;

            const next = lines[i + 1] || '';
            if (/^\/[a-zA-Z0-9_\-\/{}:.?=&]+$/.test(next)) {
              result.method = m[1].toUpperCase();
              result.endpoint = next;
              break;
            }
          }
        }

        // baseUrl
        const baseUrlMatch = allText.match(/(?:Base\s*URL|请求地址|服务地址|接口地址)\s*[:：]?\s*(https?:\/\/[^\s\n]+)/i);
        if (baseUrlMatch) {
          result.baseUrl = baseUrlMatch[1].trim();
        }

        const collectTableRows = (table) => {
          const rows = Array.from(table.querySelectorAll('tr'));
          if (rows.length < 2) return [];

          const headers = Array.from(rows[0].querySelectorAll('th,td')).map((c) => textOf(c).toLowerCase());
          const bodyRows = rows.slice(1);
          return bodyRows
            .map((row) => Array.from(row.querySelectorAll('th,td')).map((c) => textOf(c)))
            .filter((cells) => cells.some(Boolean))
            .map((cells) => ({ headers, cells }));
        };

        const tables = Array.from(contentRoot.querySelectorAll('table'));
        for (const table of tables) {
          const tableRows = collectTableRows(table);
          if (tableRows.length === 0) continue;

          const headers = tableRows[0].headers;
          const headerText = headers.join(' ');

          const isParamTable =
            /参数|parameter|name/.test(headerText) &&
            /类型|type/.test(headerText);
          const isResponseTable =
            /返回|response|字段|field/.test(headerText) &&
            /类型|type/.test(headerText);

          if (!isParamTable && !isResponseTable) continue;

          const nameIdx = headers.findIndex((h) => /参数|name|parameter|字段|field/.test(h));
          const typeIdx = headers.findIndex((h) => /类型|type/.test(h));
          const requiredIdx = headers.findIndex((h) => /必填|必选|required/.test(h));
          const descIdx = headers.findIndex((h) => /说明|描述|description|desc/.test(h));

          for (const row of tableRows) {
            const name = row.cells[nameIdx] || row.cells[0] || '';
            if (!name) continue;

            const entry = {
              name,
              type: row.cells[typeIdx] || '',
              required: /true|yes|是|必填|必选/i.test(row.cells[requiredIdx] || ''),
              description: row.cells[descIdx] || ''
            };

            if (isParamTable) {
              result.parameters.push(entry);
            } else if (isResponseTable) {
              result.responseFields.push(entry);
            }
          }
        }

        // 代码块
        const codeNodes = Array.from(contentRoot.querySelectorAll('pre code, pre, textarea'));
        for (const node of codeNodes) {
          const code = (node.value || node.textContent || '').trim();
          if (!code || code.length < 10) continue;

          let language = 'text';
          const cls = node.className || '';
          const langMatch = cls.match(/language-([\w-]+)/);
          if (langMatch) language = langMatch[1];
          else if (/^\s*[{\[]/.test(code)) language = 'json';
          else if (/\bcurl\b/.test(code)) language = 'bash';

          result.codeExamples.push({ language, code });
        }

        result.rawContent = (contentRoot.innerText || '').trim();
        return result;
      });

      return {
        type: 'kuaishou-apifox-api',
        title,
        url,
        description: parsed.description,
        api: {
          method: parsed.method,
          endpoint: parsed.endpoint,
          baseUrl: parsed.baseUrl
        },
        parameters: parsed.parameters,
        responseFields: parsed.responseFields,
        codeExamples: parsed.codeExamples,
        rawContent: parsed.rawContent,
        extractionTime: new Date().toISOString(),
        parser: 'KuaishouApifoxParser',
        metadata: options.metadata || {}
      };
    } catch (error) {
      return {
        type: 'kuaishou-apifox-api',
        title: '',
        url,
        description: '',
        api: {},
        parameters: [],
        responseFields: [],
        codeExamples: [],
        rawContent: '',
        extractionTime: new Date().toISOString(),
        parser: 'KuaishouApifoxParser',
        metadata: options.metadata || {},
        error: error.message
      };
    }
  }
}

export default KuaishouApifoxParser;
