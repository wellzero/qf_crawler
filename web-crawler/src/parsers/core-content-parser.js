import BaseParser from './base-parser.js';
import GenericParser from './generic-parser.js';

/**
 * Core Content Parser - 仅提取页面核心正文
 */
class CoreContentParser extends BaseParser {
  /**
   * 当配置为核心正文模式时匹配
   * @param {string} url - 页面URL
   * @param {Object} options - 解析选项
   * @returns {boolean} 是否匹配
   */
  matches(url, options = {}) {
    if (options.parserMode === 'core-content') {
      return true;
    }

    return options.classification?.type === 'article_page';
  }

  /**
   * 获取优先级
   * @returns {number} 优先级
   */
  getPriority() {
    return 200;
  }

  /**
   * 解析核心正文
   * 如果页面不是典型文章型页面，则自动回退到通用解析器
   * @param {Page} page - Playwright页面对象
   * @param {string} url - 页面URL
   * @param {Object} options - 解析选项
   * @returns {Promise<Object>} 核心正文数据或通用数据
   */
  async parse(page, url, options = {}) {
    try {
      const title = await this.extractTitle(page);
      const coreResult = await this.extractCoreContent(page);

      if (!this.isArticleLike(coreResult)) {
        const genericParser = new GenericParser();
        const genericData = await genericParser.parse(page, url, options);
        return {
          ...genericData,
          parserFallback: 'core-content->generic',
          coreContentRejectedReason: this.getRejectReason(coreResult)
        };
      }

      const mainContent = coreResult.blocks;
      const contentText = mainContent
        .map(item => item.content || '')
        .filter(Boolean)
        .join('\n\n');

      return {
        type: 'core-content',
        url,
        title,
        mainContent,
        contentText,
        coreContentMeta: coreResult.meta
      };
    } catch (error) {
      console.error('Failed to parse core content page:', error.message);
      return {
        type: 'core-content',
        url,
        title: '',
        mainContent: [],
        contentText: ''
      };
    }
  }

  /**
   * 判定是否为文章型页面
   * @param {Object} coreResult - 提取结果
   * @returns {boolean} 是否文章型
   */
  isArticleLike(coreResult) {
    if (!coreResult || !coreResult.meta) return false;

    const { meta } = coreResult;

    if (meta.paragraphCount < 3) return false;
    if (meta.totalParagraphChars < 400) return false;
    if (meta.averageParagraphChars < 60) return false;
    if (meta.tableCount > 2) return false;
    if (meta.formCount > 0) return false;

    // 链接文本占比过高通常意味着导航/索引页
    if (meta.linkDensity > 0.35) return false;

    // 列表项远超段落，通常不是长文正文
    if (meta.listItemCount > meta.paragraphCount * 3) return false;

    return coreResult.blocks && coreResult.blocks.length > 0;
  }

  /**
   * 获取排除原因
   * @param {Object} coreResult - 提取结果
   * @returns {string} 原因
   */
  getRejectReason(coreResult) {
    if (!coreResult || !coreResult.meta) return 'no-core-content-meta';

    const { meta } = coreResult;
    if (meta.paragraphCount < 3) return 'paragraphs-too-few';
    if (meta.totalParagraphChars < 400) return 'content-too-short';
    if (meta.averageParagraphChars < 60) return 'paragraphs-too-short';
    if (meta.tableCount > 2) return 'too-many-tables';
    if (meta.formCount > 0) return 'form-like-page';
    if (meta.linkDensity > 0.35) return 'link-density-too-high';
    if (meta.listItemCount > meta.paragraphCount * 3) return 'list-heavy-page';
    return 'unknown';
  }

  /**
   * 提取核心正文块
   * @param {Page} page - Playwright页面对象
   * @returns {Promise<{blocks: Array, meta: Object}>} 正文块和统计信息
   */
  async extractCoreContent(page) {
    try {
      return await page.evaluate(() => {
        const removeSelectors = [
          'script', 'style', 'noscript', 'iframe',
          'nav', 'header', 'footer',
          'aside', '.sidebar', '.menu', '.breadcrumb',
          '[role="navigation"]', '[role="complementary"]',
          '.advertisement', '.ads', '.ad', '.popup',
          '.toc', '.table-of-contents', '.pagination', '.pager',
          '[class*="comment"]', '[id*="comment"]'
        ];

        const candidateSelectors = [
          'main article',
          'article',
          '[itemprop="articleBody"]',
          '.post-content',
          '.article-content',
          '.entry-content',
          'main',
          '[role="main"]',
          '#content',
          '.content'
        ];

        const scoreCandidate = (el) => {
          if (!el) return -Infinity;

          const paragraphElements = Array.from(el.querySelectorAll('p'));
          const paragraphs = paragraphElements
            .map(p => (p.textContent || '').replace(/\s+/g, ' ').trim())
            .filter(text => text.length >= 40);

          const paragraphCount = paragraphs.length;
          const totalParagraphChars = paragraphs.reduce((sum, t) => sum + t.length, 0);
          const headingCount = el.querySelectorAll('h1, h2, h3').length;
          const tableCount = el.querySelectorAll('table').length;
          const formCount = el.querySelectorAll('form, input, select, textarea, button').length;
          const listItemCount = el.querySelectorAll('li').length;

          const allText = (el.textContent || '').replace(/\s+/g, ' ').trim();
          const totalTextChars = allText.length;
          const linkTextChars = Array.from(el.querySelectorAll('a'))
            .map(a => (a.textContent || '').replace(/\s+/g, ' ').trim().length)
            .reduce((sum, len) => sum + len, 0);
          const linkDensity = totalTextChars > 0 ? linkTextChars / totalTextChars : 0;

          let score = 0;
          score += paragraphCount * 30;
          score += Math.min(totalParagraphChars, 6000) * 0.04;
          score += headingCount * 10;
          score -= tableCount * 40;
          score -= formCount * 50;
          score -= Math.max(0, listItemCount - paragraphCount * 2) * 2;
          score -= linkDensity * 120;

          return score;
        };

        const candidates = [];
        candidateSelectors.forEach(selector => {
          document.querySelectorAll(selector).forEach(el => candidates.push(el));
        });
        candidates.push(document.body);

        let best = null;
        let bestScore = -Infinity;
        candidates.forEach(candidate => {
          const score = scoreCandidate(candidate);
          if (score > bestScore) {
            bestScore = score;
            best = candidate;
          }
        });

        const container = best || document.body;
        const working = container.cloneNode(true);
        removeSelectors.forEach(selector => {
          working.querySelectorAll(selector).forEach(el => el.remove());
        });

        const headingNodes = Array.from(working.querySelectorAll('h1, h2, h3, h4'));
        const paragraphNodes = Array.from(working.querySelectorAll('p'));
        const listNodes = Array.from(working.querySelectorAll('li'));

        const blocks = [];
        const processNodes = Array.from(working.querySelectorAll('h1, h2, h3, h4, p'));
        processNodes.forEach(node => {
          const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
          if (!text) return;

          if (/^h[1-4]$/i.test(node.tagName)) {
            blocks.push({
              type: 'heading',
              level: Number(node.tagName.substring(1)),
              content: text
            });
            return;
          }

          // 正文段落尽量保留相对完整的语义单元，过滤短噪音
          if (text.length < 40) return;

          blocks.push({
            type: 'paragraph',
            content: text
          });
        });

        const paragraphTexts = paragraphNodes
          .map(node => (node.textContent || '').replace(/\s+/g, ' ').trim())
          .filter(text => text.length >= 40);

        const totalParagraphChars = paragraphTexts.reduce((sum, t) => sum + t.length, 0);
        const allText = (working.textContent || '').replace(/\s+/g, ' ').trim();
        const totalTextChars = allText.length;
        const linkTextChars = Array.from(working.querySelectorAll('a'))
          .map(a => (a.textContent || '').replace(/\s+/g, ' ').trim().length)
          .reduce((sum, len) => sum + len, 0);

        return {
          blocks,
          meta: {
            paragraphCount: paragraphTexts.length,
            headingCount: headingNodes.length,
            listItemCount: listNodes.length,
            tableCount: working.querySelectorAll('table').length,
            formCount: working.querySelectorAll('form, input, select, textarea, button').length,
            totalParagraphChars,
            averageParagraphChars: paragraphTexts.length > 0 ? totalParagraphChars / paragraphTexts.length : 0,
            totalTextChars,
            linkDensity: totalTextChars > 0 ? linkTextChars / totalTextChars : 0,
            bestScore
          }
        };
      });
    } catch (error) {
      console.error('Failed to extract core content:', error.message);
      return { blocks: [], meta: null };
    }
  }
}

export default CoreContentParser;
