/**
 * DefuddleParser — 基于 defuddle 的通用内容提取 parser
 *
 * 使用 defuddle/node 从页面 HTML 中提取主要内容并转换为 Markdown。
 * 适合文章、文档、博客等以正文内容为主的页面。
 *
 * @see https://github.com/kepano/defuddle
 */

import { JSDOM } from 'jsdom';
import { Defuddle } from 'defuddle/node';
import BaseParser from './base-parser.js';

export class DefuddleParser extends BaseParser {
  constructor() {
    super();
    // 默认匹配所有 URL，优先级低于专用 parser
  }

  matches(url) {
    // 作为通用 fallback，匹配所有 http/https URL
    return /^https?:\/\//.test(url);
  }

  getPriority() {
    // 低优先级，让专用 parser 优先处理
    return 1;
  }

  async detectByContent(page) {
    // 检测页面是否有明显的文章/正文结构
    return await page.evaluate(() => {
      const articleSelectors = ['article', '[role="main"]', '.post-content', '.article-body', 'main'];
      return articleSelectors.some(sel => document.querySelector(sel) !== null);
    });
  }

  async parse(page, url, options = {}) {
    try {
      await this.closePopups(page);
      await this.waitForContent(page, {
        timeout: options.timeout || 30000,
        minContentLength: options.minContentLength || 200,
      });

      // 获取完整 HTML
      const html = await page.content();

      // 用 JSDOM 构建 DOM，传给 defuddle/node
      const dom = new JSDOM(html, { url });
      const result = await Defuddle(dom.window.document, url, {
        markdown: true,
        debug: false,
        ...options.defuddle,
      });

      return {
        type: 'article',
        url,
        title: result.title || '',
        author: result.author || '',
        description: result.description || '',
        published: result.published || '',
        site: result.site || '',
        domain: result.domain || '',
        language: result.language || '',
        image: result.image || '',
        favicon: result.favicon || '',
        wordCount: result.wordCount || 0,
        content: result.content || '',   // Markdown 格式正文
        parseTime: result.parseTime || 0,
      };
    } catch (error) {
      console.error(`[DefuddleParser] parse error on ${url}:`, error.message);
      return {
        type: 'article',
        url,
        title: '',
        content: '',
        error: error.message,
      };
    }
  }
}

export default DefuddleParser;
