import BaseParser from './base-parser.js';

/**
 * 302.AI 文档站解析器（Apifox Docs）
 * 入口示例: https://doc.302.ai/218999863e0
 */
class Ai302DocsParser extends BaseParser {
  matches(url) {
    return /^https?:\/\/doc\.302\.ai(?:\/.*)?$/.test(url);
  }

  getPriority() {
    return 115;
  }

  supportsLinkDiscovery() {
    return true;
  }

  async discoverLinks(page) {
    try {
      await page.waitForSelector('a[href]', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1200);

      const links = await page.evaluate(() => {
        const results = new Set();

        const addIfDocUrl = (candidate) => {
          if (!candidate) return;

          let absolute = candidate;
          if (!candidate.startsWith('http')) {
            absolute = new URL(candidate, window.location.origin).href;
          }

          let parsed;
          try {
            parsed = new URL(absolute);
          } catch {
            return;
          }

          if (parsed.hostname !== 'doc.302.ai') return;

          const normalized = `${parsed.origin}${parsed.pathname}`;
          if (parsed.pathname === '/' || /^\/\d+[de]0$/.test(parsed.pathname)) {
            results.add(normalized);
          }
        };

        document.querySelectorAll('a[href]').forEach((anchor) => {
          addIfDocUrl(anchor.getAttribute('href') || '');
        });

        const html = document.documentElement?.innerHTML || '';
        const matches = html.match(/\/\d+[de]0/g) || [];
        matches.forEach((path) => addIfDocUrl(path));

        return Array.from(results);
      });

      return links;
    } catch (error) {
      console.warn('[Ai302DocsParser] discoverLinks failed:', error.message);
      return [];
    }
  }

  async parse(page, url, options = {}) {
    try {
      await page.waitForSelector('main, h1, article, [class*="content"]', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1000).catch(() => {});

      const [title, html, domExtracted] = await Promise.all([
        this.extractTitle(page),
        page.content().catch(() => ''),
        this.extractFromDom(page)
      ]);

      const htmlExtracted = this.extractFromHtml(html, url);
      const merged = this.mergeExtracted(domExtracted, htmlExtracted, title, url);

      return {
        type: 'ai302-api-doc',
        parser: 'Ai302DocsParser',
        url,
        title: merged.title,
        description: merged.description,
        api: {
          method: merged.method,
          endpoint: merged.endpoint,
          baseUrl: merged.baseUrl
        },
        authentication: merged.authentication,
        requestHeaders: merged.requestHeaders,
        parameters: merged.parameters,
        requestBody: merged.requestBody,
        responseStatuses: merged.responseStatuses,
        responseFields: merged.responseFields,
        codeExamples: merged.codeExamples,
        requestExamples: merged.requestExamples,
        responseExamples: merged.responseExamples,
        relatedLinks: merged.relatedLinks,
        rawContent: merged.rawContent,
        extractionTime: new Date().toISOString(),
        metadata: options.metadata || {}
      };
    } catch (error) {
      return {
        type: 'ai302-api-doc',
        parser: 'Ai302DocsParser',
        url,
        title: '',
        description: '',
        api: { method: '', endpoint: '', baseUrl: '' },
        authentication: '',
        requestHeaders: [],
        parameters: [],
        requestBody: {},
        responseStatuses: [],
        responseFields: [],
        codeExamples: [],
        requestExamples: [],
        responseExamples: [],
        relatedLinks: [],
        rawContent: '',
        extractionTime: new Date().toISOString(),
        metadata: options.metadata || {},
        error: error.message
      };
    }
  }

  async extractFromDom(page) {
    try {
      return await page.evaluate(() => {
        const result = {
          title: '',
          description: '',
          method: '',
          endpoint: '',
          baseUrl: '',
          authentication: '',
          requestHeaders: [],
          parameters: [],
          requestBody: {},
          responseStatuses: [],
          responseFields: [],
          codeExamples: [],
          requestExamples: [],
          responseExamples: [],
          relatedLinks: [],
          rawContent: ''
        };

        const textOf = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
        const root = document.querySelector('main') || document.body || document.documentElement;

        const h1 = root.querySelector('h1');
        if (h1) result.title = textOf(h1);

        const descCandidate = root.querySelector('h1 + p, h1 + div p, main p');
        if (descCandidate) result.description = textOf(descCandidate);

        result.rawContent = (root.innerText || '').replace(/\u00a0/g, ' ').trim();

        const methodPattern = /(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+(https?:\/\/[\w.-]+(?:\/[\w./?%&=:#-]*)?|\/[\w./?%&=:#{}-]+)/i;

        const headerTexts = Array.from(root.querySelectorAll('code, pre, span, p, div'))
          .map((el) => textOf(el))
          .filter(Boolean)
          .slice(0, 1000);

        for (const text of headerTexts) {
          const m = text.match(methodPattern);
          if (m) {
            result.method = m[1].toUpperCase();
            result.endpoint = m[2].trim();
            break;
          }
        }

        const baseUrlMatch = result.rawContent.match(/https?:\/\/(?:api\.302\.ai|api\.302ai\.cn)\/v\d+/i);
        if (baseUrlMatch) {
          result.baseUrl = baseUrlMatch[0];
        }

        const authMatch = result.rawContent.match(/(Bearer\s+YOUR_API_KEY|Authorization[^\n]{0,120}Bearer[^\n]{0,120})/i);
        if (authMatch) {
          result.authentication = authMatch[1].trim();
        }

        const parseBoolean = (v) => /^(true|yes|y|1|是|必填|必选)$/i.test((v || '').trim());
        const normalizeName = (v) => (v || '').replace(/\s+/g, ' ').trim();

        const tables = Array.from(root.querySelectorAll('table'));
        for (const table of tables) {
          const rows = Array.from(table.querySelectorAll('tr'));
          if (rows.length < 2) continue;

          const headers = Array.from(rows[0].querySelectorAll('th,td')).map((c) => textOf(c).toLowerCase());
          const nameIdx = headers.findIndex((h) => /参数|name|field|字段|header/.test(h));
          const typeIdx = headers.findIndex((h) => /类型|type|format/.test(h));
          const requiredIdx = headers.findIndex((h) => /必填|必选|required/.test(h));
          const descIdx = headers.findIndex((h) => /说明|描述|description|desc/.test(h));

          const headerText = headers.join(' ');
          const isHeaderTable = /header/.test(headerText) || /请求头/.test(headerText);
          const isParamTable = /参数|query|path|body/.test(headerText);
          const isResponseTable = /返回|response|字段|result/.test(headerText);
          const isStatusTable = /状态码|status/.test(headerText);

          for (const row of rows.slice(1)) {
            const cells = Array.from(row.querySelectorAll('th,td')).map((c) => textOf(c));
            const name = normalizeName(cells[nameIdx] || cells[0] || '');
            if (!name) continue;

            if (isStatusTable) {
              result.responseStatuses.push({
                code: name,
                description: normalizeName(cells[descIdx] || cells[1] || '')
              });
              continue;
            }

            const entry = {
              name,
              type: normalizeName(cells[typeIdx] || ''),
              required: parseBoolean(cells[requiredIdx] || ''),
              description: normalizeName(cells[descIdx] || cells[cells.length - 1] || '')
            };

            if (isHeaderTable) {
              result.requestHeaders.push(entry);
            } else if (isResponseTable) {
              result.responseFields.push({
                name: entry.name,
                type: entry.type,
                description: entry.description
              });
            } else if (isParamTable) {
              result.parameters.push(entry);
            }
          }
        }

        const codeNodes = Array.from(root.querySelectorAll('pre code, pre, textarea'));
        for (const node of codeNodes) {
          const code = (node.value || node.textContent || '').trim();
          if (!code || code.length < 8) continue;

          let language = 'text';
          const className = node.className || '';
          const langMatch = className.match(/language-([\w-]+)/i);
          if (langMatch) language = langMatch[1].toLowerCase();
          else if (/^\s*[\[{]/.test(code)) language = 'json';
          else if (/\bcurl\b/i.test(code)) language = 'bash';

          const block = { language, code };
          result.codeExamples.push(block);

          if (/\bcurl\b/i.test(code) || /\b(GET|POST|PUT|PATCH|DELETE)\b/.test(code)) {
            result.requestExamples.push(block);
          }
          if (language === 'json' && /^\s*[{[]/.test(code)) {
            result.responseExamples.push(block);
          }
        }

        const links = Array.from(root.querySelectorAll('a[href]'));
        for (const link of links) {
          const href = link.getAttribute('href') || '';
          const text = textOf(link);
          if (!href || !text) continue;

          let absolute = href;
          if (!href.startsWith('http')) {
            absolute = new URL(href, window.location.origin).href;
          }

          if (/^https?:\/\/(doc\.302\.ai|api\.302\.ai|api\.302ai\.cn)/.test(absolute)) {
            result.relatedLinks.push({ title: text, url: absolute });
          }
        }

        return result;
      });
    } catch {
      return {
        title: '',
        description: '',
        method: '',
        endpoint: '',
        baseUrl: '',
        authentication: '',
        requestHeaders: [],
        parameters: [],
        requestBody: {},
        responseStatuses: [],
        responseFields: [],
        codeExamples: [],
        requestExamples: [],
        responseExamples: [],
        relatedLinks: [],
        rawContent: ''
      };
    }
  }

  extractFromHtml(html, url) {
    const data = {
      method: '',
      endpoint: '',
      baseUrl: '',
      authentication: '',
      responseStatuses: [],
      rawContent: '',
      relatedLinks: []
    };

    if (!html) return data;

    data.rawContent = html.slice(0, 120000);

    const methodEndpointRegexes = [
      /(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+(https?:\/\/[\w.-]+(?:\/[\w./?%&=:#-]*)?|\/[\w./?%&=:#{}-]+)/i,
      /"(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)"\s*,\s*"(\/[^"]+)"/i
    ];

    for (const reg of methodEndpointRegexes) {
      const m = html.match(reg);
      if (m) {
        data.method = m[1].toUpperCase();
        data.endpoint = m[2].trim();
        break;
      }
    }

    const baseUrlMatch = html.match(/https?:\/\/(?:api\.302\.ai|api\.302ai\.cn)\/v\d+/i);
    if (baseUrlMatch) {
      data.baseUrl = baseUrlMatch[0];
    }

    const authMatch = html.match(/Bearer\s+YOUR_API_KEY|Authorization[^<\n]{0,150}Bearer[^<\n]{0,150}/i);
    if (authMatch) {
      data.authentication = authMatch[0].trim();
    }

    const statusRegex = /\b([1-5]\d\d)\b\s*(?:-|:|–)?\s*([^<\n]{2,80})/g;
    const statusMap = new Map();
    let sm;
    while ((sm = statusRegex.exec(html)) !== null) {
      const code = sm[1];
      const description = (sm[2] || '').trim();
      if (!statusMap.has(code) && description && !/px|width|height|ms/.test(description)) {
        statusMap.set(code, { code, description });
      }
      if (statusMap.size >= 12) break;
    }
    data.responseStatuses = Array.from(statusMap.values());

    const linkRegex = /href="(https?:\/\/(?:doc\.302\.ai|api\.302\.ai|api\.302ai\.cn)[^"]*)"[^>]*>([^<]{1,120})</gi;
    let lm;
    const links = [];
    while ((lm = linkRegex.exec(html)) !== null) {
      links.push({ title: lm[2].trim(), url: lm[1] });
      if (links.length >= 30) break;
    }
    data.relatedLinks = links;

    if (!data.endpoint) {
      const pathMatch = /^https?:\/\/doc\.302\.ai(\/\d+[de]0)\/?$/i.exec(url);
      if (pathMatch) data.endpoint = pathMatch[1];
    }

    return data;
  }

  mergeExtracted(dom, html, fallbackTitle, url) {
    const pick = (...values) => values.find((v) => {
      if (Array.isArray(v)) return v.length > 0;
      return typeof v === 'string' ? v.trim() : v;
    });

    const uniqueBy = (items, keyBuilder) => {
      const seen = new Set();
      const result = [];
      for (const item of items || []) {
        const key = keyBuilder(item);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        result.push(item);
      }
      return result;
    };

    const endpointFromUrl = (() => {
      const m = /^https?:\/\/doc\.302\.ai(\/\d+[de]0)\/?$/i.exec(url);
      return m ? m[1] : '';
    })();

    const merged = {
      title: pick(dom.title, fallbackTitle, ''),
      description: pick(dom.description, ''),
      method: (pick(dom.method, html.method, '') || '').toUpperCase(),
      endpoint: pick(dom.endpoint, html.endpoint, endpointFromUrl, ''),
      baseUrl: pick(dom.baseUrl, html.baseUrl, ''),
      authentication: pick(dom.authentication, html.authentication, ''),
      requestHeaders: uniqueBy(dom.requestHeaders || [], (item) => `${item.name}|${item.type}`),
      parameters: uniqueBy(dom.parameters || [], (item) => `${item.name}|${item.type}`),
      requestBody: dom.requestBody || {},
      responseStatuses: uniqueBy([...(dom.responseStatuses || []), ...(html.responseStatuses || [])], (item) => `${item.code}|${item.description}`),
      responseFields: uniqueBy(dom.responseFields || [], (item) => `${item.name}|${item.type}`),
      codeExamples: uniqueBy(dom.codeExamples || [], (item) => `${item.language}|${item.code.slice(0, 80)}`),
      requestExamples: uniqueBy(dom.requestExamples || [], (item) => `${item.language}|${item.code.slice(0, 80)}`),
      responseExamples: uniqueBy(dom.responseExamples || [], (item) => `${item.language}|${item.code.slice(0, 80)}`),
      relatedLinks: uniqueBy([...(dom.relatedLinks || []), ...(html.relatedLinks || [])], (item) => item.url),
      rawContent: pick(dom.rawContent, html.rawContent, '')
    };

    // 兜底：若仍未识别 method 且 endpoint 是 OpenAI 兼容路径，默认 POST
    if (!merged.method && /\/chat\/completions|\/responses|\/embeddings|\/images\//i.test(merged.endpoint)) {
      merged.method = 'POST';
    }

    return merged;
  }
}

export default Ai302DocsParser;
