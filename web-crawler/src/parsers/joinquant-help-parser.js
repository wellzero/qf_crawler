import BaseParser from './base-parser.js';

class JoinquantHelpParser extends BaseParser {
  matches(url) {
    return /^https?:\/\/www\.joinquant\.com\/help\/api\/(?:help|doc)(?:[?#].*)?$/i.test(url);
  }

  getPriority() {
    return 130;
  }

  supportsLinkDiscovery() {
    return true;
  }

  async waitForJoinquantContent(page) {
    await page.waitForSelector('#jq-api-content, .help-api-right, #jq-api-tree', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1200);
  }

  normalizeHelpUrl(candidate) {
    try {
      const parsed = new URL(candidate);
      if (parsed.hostname !== 'www.joinquant.com') return null;
      if (!/^\/help\/api\/(?:help|doc)$/.test(parsed.pathname)) return null;
      parsed.hash = parsed.hash || '';
      return parsed.toString();
    } catch {
      return null;
    }
  }

  async discoverLinks(page) {
    await this.waitForJoinquantContent(page);

    const currentUrl = page.url();
    const discovered = await page.evaluate((pageUrl) => {
      const text = (value) => (value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
      const results = new Set();

      const add = (href) => {
        if (!href) return;
        const normalizedHref = href.trim();
        if (!normalizedHref || normalizedHref.startsWith('javascript:')) return;
        if (/^#name:/i.test(normalizedHref)) return;

        try {
          const absolute = new URL(normalizedHref, pageUrl);
          if (absolute.hostname !== 'www.joinquant.com') return;
          if (!/^\/help\/api\/(?:help|doc)$/.test(absolute.pathname)) return;
          results.add(absolute.toString());
        } catch {
          // ignore invalid urls
        }
      };

      Array.from(document.querySelectorAll('a[href]')).forEach((anchor) => {
        const href = anchor.getAttribute('href') || '';
        const anchorText = text(anchor.textContent || anchor.innerText || '');

        if (!href) return;

        if (href.startsWith('#')) {
          if (anchor.closest('#jq-api-tree')) {
            add(href);
          }
          return;
        }

        if (href.includes('/help/api/') || href.startsWith('?name=')) {
          add(href);
          return;
        }

        if (anchorText && /JQData|API|因子|聚宽数据|试用|购买|用户协议/.test(anchorText) && anchor.closest('#jq-api-content')) {
          add(href);
        }
      });

      return Array.from(results);
    }, currentUrl);

    return discovered
      .map((link) => this.normalizeHelpUrl(link))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  }

  sanitizeFilename(value) {
    return (value || '')
      .replace(/[#?&=:%]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 120);
  }

  buildSuggestedFilename(url, title, metadata = {}) {
    try {
      const parsed = new URL(url);
      const pageKind = parsed.pathname.endsWith('/help') ? 'help' : 'doc';
      const pageName = parsed.searchParams.get('name') || metadata.pageName || 'root';
      const pageId = parsed.searchParams.get('id') || metadata.pageId || '';
      const hash = decodeURIComponent(parsed.hash.replace(/^#/, '')).trim();
      const hashPart = hash && !/^name:/i.test(hash) ? hash : 'overview';
      const titlePart = title || hashPart || pageName;
      const base = [pageKind, pageName, pageId, hashPart, titlePart].filter(Boolean).join('_');
      return this.sanitizeFilename(base) || `${pageKind}_${pageName}`;
    } catch {
      return this.sanitizeFilename(title || 'joinquant_help');
    }
  }

  async parse(page, url) {
    await this.waitForJoinquantContent(page);

    const actualUrl = page.url() || url;
    const extracted = await page.evaluate(({ requestedUrl, actualPageUrl }) => {
      const normalizeWhitespace = (value) => (value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
      const normalizeKey = (value) => normalizeWhitespace(value).replace(/[：:]+$/g, '').toLowerCase();
      const root = document.querySelector('#jq-api-content') || document.querySelector('.help-api-right') || document.body;
      const docTitle = normalizeWhitespace(document.title.split(' - ')[0] || document.title);
      const requested = new URL(requestedUrl, location.origin);
      const actual = new URL(actualPageUrl || location.href, location.origin);
      const pageKind = requested.pathname.endsWith('/help') ? 'help' : 'doc';
      const hash = decodeURIComponent((requested.hash || actual.hash).replace(/^#/, '')).trim();
      const queryName = requested.searchParams.get('name') || actual.searchParams.get('name') || '';
      const queryId = requested.searchParams.get('id') || actual.searchParams.get('id') || '';

      const allHeadingElements = Array.from(root.querySelectorAll('h1, h2, h3, h4, h5, h6'))
        .filter((el) => normalizeWhitespace(el.textContent));

      const getHeadingLevel = (el) => {
        const match = el?.tagName?.match(/^H([1-6])$/i);
        return match ? Number(match[1]) : 6;
      };

      const findTargetHeading = () => {
        if (!hash || /^name:/i.test(hash)) return null;

        const candidateSelectors = [];
        if (window.CSS && typeof window.CSS.escape === 'function') {
          candidateSelectors.push(`#${window.CSS.escape(hash)}`);
        }
        candidateSelectors.push(`[name=\"${hash.replace(/\"/g, '\\\"')}\"]`);

        for (const selector of candidateSelectors) {
          try {
            const matched = root.querySelector(selector);
            if (matched) {
              return matched.closest('h1, h2, h3, h4, h5, h6') || matched;
            }
          } catch {
            // ignore selector issue
          }
        }

        const normalizedHash = normalizeKey(hash);
        const exact = allHeadingElements.find((heading) => normalizeKey(heading.textContent) === normalizedHash);
        if (exact) return exact;

        return allHeadingElements.find((heading) => {
          const headingText = normalizeKey(heading.textContent);
          return headingText.includes(normalizedHash) || normalizedHash.includes(headingText);
        }) || null;
      };

      const targetHeading = findTargetHeading();

      const buildContainer = () => {
        if (!targetHeading) return root;

        const targetLevel = getHeadingLevel(targetHeading);
        const targetIndex = allHeadingElements.indexOf(targetHeading);
        const nextHeading = allHeadingElements.slice(targetIndex + 1).find((heading) => getHeadingLevel(heading) <= targetLevel);
        const range = document.createRange();
        range.setStartBefore(targetHeading);

        if (nextHeading) {
          range.setEndBefore(nextHeading);
        } else if (root.lastChild) {
          range.setEndAfter(root.lastChild);
        } else {
          range.setEndAfter(root);
        }

        const wrapper = document.createElement('div');
        wrapper.appendChild(range.cloneContents());
        return wrapper;
      };

      const container = buildContainer();

      const isHidden = (el) => {
        if (!(el instanceof Element)) return false;
        if (el.closest('#jq-api-tree')) return true;
        if (el.closest('#jq-api-subcontent.hidden')) return true;
        const style = window.getComputedStyle(el);
        return style.display === 'none' || style.visibility === 'hidden';
      };

      const parseTable = (table) => {
        const rawRows = Array.from(table.querySelectorAll('tr'))
          .map((row) => Array.from(row.querySelectorAll('th, td')).map((cell) => normalizeWhitespace(cell.textContent)))
          .filter((row) => row.some(Boolean));

        if (rawRows.length === 0) return null;

        let headers = Array.from(table.querySelectorAll('thead tr:first-child th, thead tr:first-child td'))
          .map((cell) => normalizeWhitespace(cell.textContent))
          .filter(Boolean);

        let rows = rawRows;
        if (headers.length === 0 && rawRows.length > 1) {
          headers = rawRows[0];
          rows = rawRows.slice(1);
        } else if (headers.length > 0) {
          rows = rawRows.slice(1);
        }

        return {
          caption: normalizeWhitespace(table.querySelector('caption')?.textContent || ''),
          headers,
          rows
        };
      };

      const parseCodeBlock = (pre) => {
        const codeNode = pre.matches('code') ? pre : pre.querySelector('code');
        const raw = codeNode?.textContent || pre.textContent || '';
        const code = raw.replace(/\u00a0/g, ' ').trim();
        if (!code) return null;

        const className = `${pre.className || ''} ${codeNode?.className || ''}`;
        const languageMatch = className.match(/language-([\w-]+)/i);
        let language = languageMatch ? languageMatch[1].toLowerCase() : '';

        if (!language) {
          if (/^\s*[\[{]/.test(code)) language = 'json';
          else if (/\bcurl\b/i.test(code)) language = 'bash';
          else if (/\b(def|import|from)\b/.test(code)) language = 'python';
          else language = 'text';
        }

        return { language, code };
      };

      const mainContent = [];
      const paragraphs = [];
      const headings = [];
      const lists = [];
      const tables = [];
      const codeBlocks = [];
      const blockquotes = [];
      const seenParagraphs = new Set();
      const seenLists = new Set();
      const seenTables = new Set();
      const seenCode = new Set();

      Array.from(container.querySelectorAll('h1, h2, h3, h4, h5, h6, p, pre, table, ul, ol, blockquote, hr')).forEach((el) => {
        if (isHidden(el)) return;
        if (el.closest('pre') && el.tagName !== 'PRE') return;
        if (el.closest('table') && el.tagName !== 'TABLE') return;
        if (el.closest('ul, ol') && !['UL', 'OL'].includes(el.tagName)) return;

        if (/^H[1-6]$/.test(el.tagName)) {
          const content = normalizeWhitespace(el.textContent);
          if (!content) return;
          const level = getHeadingLevel(el);
          headings.push({ level, text: content, id: el.id || '' });
          mainContent.push({ type: 'heading', level, content });
          return;
        }

        if (el.tagName === 'P') {
          const content = normalizeWhitespace(el.textContent);
          if (!content) return;
          const signature = content.slice(0, 200);
          if (seenParagraphs.has(signature)) return;
          seenParagraphs.add(signature);
          paragraphs.push(content);
          mainContent.push({ type: 'paragraph', content });
          return;
        }

        if (el.tagName === 'PRE') {
          const codeBlock = parseCodeBlock(el);
          if (!codeBlock) return;
          const signature = `${codeBlock.language}:${codeBlock.code.slice(0, 200)}`;
          if (seenCode.has(signature)) return;
          seenCode.add(signature);
          codeBlocks.push(codeBlock);
          mainContent.push({ type: 'codeblock', language: codeBlock.language, content: codeBlock.code });
          return;
        }

        if (el.tagName === 'TABLE') {
          const table = parseTable(el);
          if (!table) return;
          const signature = JSON.stringify([table.caption, table.headers, table.rows.slice(0, 3)]);
          if (seenTables.has(signature)) return;
          seenTables.add(signature);
          tables.push(table);
          mainContent.push({ type: 'table', headers: table.headers, rows: table.rows });
          return;
        }

        if (el.tagName === 'UL' || el.tagName === 'OL') {
          const items = Array.from(el.querySelectorAll(':scope > li'))
            .map((item) => normalizeWhitespace(item.textContent))
            .filter(Boolean);
          if (items.length === 0) return;
          const signature = items.join('|').slice(0, 200);
          if (seenLists.has(signature)) return;
          seenLists.add(signature);
          const listType = el.tagName.toLowerCase();
          lists.push({ type: listType, items });
          mainContent.push({ type: 'list', listType, items });
          return;
        }

        if (el.tagName === 'BLOCKQUOTE') {
          const content = normalizeWhitespace(el.textContent);
          if (!content) return;
          blockquotes.push(content);
          mainContent.push({ type: 'blockquote', content });
          return;
        }

        if (el.tagName === 'HR') {
          mainContent.push({ type: 'hr' });
        }
      });

      if (mainContent.length === 0) {
        const fallbackText = normalizeWhitespace(container.textContent || root.textContent || '');
        if (fallbackText) {
          paragraphs.push(fallbackText);
          mainContent.push({ type: 'paragraph', content: fallbackText });
        }
      }

      const firstHeading = headings[0]?.text || '';
      const treeRootTitle = normalizeWhitespace(
        document.querySelector(`#jq-api-tree a[href=\"#name:${queryName}\"]`)?.textContent ||
        document.querySelector('#jq-api-tree a[href^="#name:"]')?.textContent ||
        ''
      );
      const title = normalizeWhitespace(
        (targetHeading && targetHeading.textContent) ||
        firstHeading ||
        treeRootTitle ||
        docTitle
      );
      const description = paragraphs.find((paragraph) => paragraph.length >= 20) || paragraphs[0] || '';

      return {
        url: requested.toString(),
        actualUrl: actual.toString(),
        pageKind,
        pageName: queryName,
        pageId: queryId,
        hash,
        title,
        description,
        headings,
        paragraphs,
        lists,
        tables,
        codeBlocks,
        blockquotes,
        mainContent,
        sourceTitle: docTitle,
        treeRootTitle
      };
    }, { requestedUrl: url, actualPageUrl: actualUrl });

    return {
      type: 'generic',
      parser: 'JoinquantHelpParser',
      url: extracted.url || url,
      actualUrl: extracted.actualUrl || actualUrl,
      title: extracted.title || 'JoinQuant Help',
      description: extracted.description || '',
      headings: extracted.headings || [],
      paragraphs: extracted.paragraphs || [],
      lists: extracted.lists || [],
      tables: extracted.tables || [],
      codeBlocks: extracted.codeBlocks || [],
      blockquotes: extracted.blockquotes || [],
      mainContent: extracted.mainContent || [],
      suggestedFilename: this.buildSuggestedFilename(extracted.url || url, extracted.title, extracted),
      pageKind: extracted.pageKind,
      pageName: extracted.pageName,
      pageId: extracted.pageId,
      sectionHash: extracted.hash,
      sourceTitle: extracted.sourceTitle,
      treeRootTitle: extracted.treeRootTitle
    };
  }
}

export default JoinquantHelpParser;
