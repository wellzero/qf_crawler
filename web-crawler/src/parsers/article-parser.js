import BaseParser from './base-parser.js';

/**
 * Article Parser - 文章详情页解析器
 * 专门处理新闻文章、博客文章、详情页等
 *
 * 支持的页面类型：
 * - 新闻文章页
 * - 博客文章页
 * - 产品详情页
 * - 帖子详情页
 */
class ArticleParser extends BaseParser {
  /**
   * 匹配文章页类型
   * @param {string} url - 页面URL
   * @returns {boolean} 是否匹配
   */
  matches(url) {
    // 文章页URL特征
    const articlePatterns = [
      /\/article\//i, /\/articles?\//i, /\/news\//i, /\/post\//i, /\/blog\//i,
      /\/detail\//i, /\/content\//i, /\/story\//i, /\/a\/\d+/i,  // /a/20240315/...
      /\/\d{4}\/\d{2}\/\d{2}\//i, // 日期格式 /2024/01/15/
      /\/\d{4}-\d{2}-\d{2}\//i, // 日期格式 /2024-01-15/
      /\/c\/\d{4}-\d{2}-\d{2}/i, // 新浪文章 /c/2024-01-15/
      /\/w\/\d{4}-\d{2}-\d{2}/i, // 新浪国际文章 /w/2024-01-15/
      /\/[a-z]+\/\d+\.html$/i, // /news/123456.html
      /\/\d+\.html$/i, // /123456.html
      /\/\d+\.htm$/i, // /123456.htm
      /\/doc-[a-z0-9]+\.shtml$/i, // 新浪文章 /doc-xxx.shtml
      /id=\d+/i, /p=\d+/i
    ];

    // 排除API文档页面和列表页
    const excludePatterns = [
      /\/api\//i, /\/docs?\//i, /\/reference\//i,
      /\/documentation\//i,
      /\/list/i, /\/category\//i, /page=\d+/i, /p=\d+/i  // 列表页特征
    ];

    const normalized = url.toLowerCase();

    for (const pattern of excludePatterns) {
      if (pattern.test(normalized)) {
        return false;
      }
    }

    for (const pattern of articlePatterns) {
      if (pattern.test(normalized)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 获取优先级（高于 GenericParser 和 ListPageParser）
   * @returns {number} 优先级
   */
  getPriority() {
    return 5;
  }

  /**
   * 通过页面内容特征检测是否为文章详情页
   * @param {Page} page - Playwright页面对象
   * @returns {Promise<number>} 置信度 0-100
   */
  async detectByContent(page) {
    return await page.evaluate(() => {
      let score = 0;

      // H1 标题（文章页通常有明确的标题）
      const h1 = document.querySelector('h1');
      if (h1) {
        const h1Text = h1.textContent.trim();
        if (h1Text.length >= 10 && h1Text.length <= 100) score += 25;
        else if (h1Text.length >= 5) score += 15;
      }

      // 发布时间
      const timeSelectors = ['time', '.time', '.date', '.publish-time', '.post-time', '[datetime]', '[class*="time"]'];
      for (const sel of timeSelectors) {
        if (document.querySelector(sel)) {
          score += 25;
          break;
        }
      }

      // 文章正文区域
      const articleSelectors = ['article', '.article-content', '.post-content', '.entry-content', '.news-content', '.story-content'];
      for (const sel of articleSelectors) {
        const article = document.querySelector(sel);
        if (article) {
          const paragraphs = article.querySelectorAll('p');
          if (paragraphs.length >= 5) score += 30;
          else if (paragraphs.length >= 3) score += 20;
          else if (paragraphs.length >= 1) score += 10;
          break;
        }
      }

      // 作者信息
      const authorSelectors = ['.author', '.writer', '[class*="author"]', '[rel="author"]'];
      for (const sel of authorSelectors) {
        if (document.querySelector(sel)) {
          score += 20;
          break;
        }
      }

      // 来源信息
      const sourceEl = document.querySelector('.source, .from, .origin, [class*="source"]');
      if (sourceEl) score += 10;

      return score;
    });
  }

  /**
   * 解析文章页
   * @param {Page} page - Playwright页面对象
   * @param {string} url - 页面URL
   * @param {Object} options - 解析选项
   * @returns {Promise<Object>} 解析后的页面数据
   */
  async parse(page, url, options = {}) {
    try {
      // 提取文章基本信息
      const articleInfo = await this.extractArticleInfo(page);

      // 提取文章正文
      const content = await this.extractContent(page);

      // 提取作者信息
      const author = await this.extractAuthor(page);

      // 提取相关文章
      const relatedArticles = await this.extractRelatedArticles(page);

      // 提取标签
      const tags = await this.extractTags(page);

      // 提取评论信息
      const comments = await this.extractCommentsInfo(page);

      // 提取图片
      const images = await this.extractContentImages(page, options.filepath, options.pagesDir);

      return {
        type: 'article',
        url,
        ...articleInfo,
        content,
        author,
        relatedArticles,
        tags,
        comments,
        images
      };
    } catch (error) {
      console.error('Failed to parse article page:', error.message);
      return {
        type: 'article',
        url,
        title: '',
        publishTime: '',
        source: '',
        content: '',
        author: {},
        relatedArticles: [],
        tags: [],
        comments: {},
        images: []
      };
    }
  }

  /**
   * 提取文章基本信息
   */
  async extractArticleInfo(page) {
    return await page.evaluate(() => {
      const title = document.title || '';
      const description = document.querySelector('meta[name="description"]')?.content || '';
      const keywords = document.querySelector('meta[name="keywords"]')?.content || '';

      // 尝试提取文章标题（去除网站名称后缀）
      let articleTitle = '';
      const h1 = document.querySelector('h1');
      if (h1) {
        articleTitle = h1.textContent.trim();
      } else {
        // 从title中提取
        const titleParts = title.split(/[-_|]/);
        articleTitle = titleParts[0].trim();
      }

      // 提取发布时间
      let publishTime = '';
      const timeSelectors = [
        'time', '.time', '.date', '.publish-time', '.post-time',
        '[class*="time"]', '[class*="date"]', '[datetime]'
      ];
      for (const selector of timeSelectors) {
        const timeEl = document.querySelector(selector);
        if (timeEl) {
          publishTime = timeEl.getAttribute('datetime') || timeEl.textContent.trim();
          if (publishTime) break;
        }
      }

      // 提取来源
      let source = '';
      const sourceSelectors = [
        '.source', '.from', '.origin', '[class*="source"]',
        '.author', '.writer'
      ];
      for (const selector of sourceSelectors) {
        const sourceEl = document.querySelector(selector);
        if (sourceEl) {
          source = sourceEl.textContent.trim();
          if (source && !source.includes('时间')) break;
        }
      }

      // 提取阅读量
      let views = '';
      const viewsEl = document.querySelector('.views, .read-count, [class*="view"]');
      if (viewsEl) {
        views = viewsEl.textContent.trim();
      }

      return {
        title: articleTitle,
        description,
        keywords,
        publishTime,
        source,
        views
      };
    });
  }

  /**
   * 提取文章正文
   */
  async extractContent(page) {
    return await page.evaluate(() => {
      // 尝试多种内容选择器
      const contentSelectors = [
        'article', '.article-content', '.post-content', '.entry-content',
        '.content', '.article-body', '.news-content', '.story-content',
        '.text-content', '#content', '#article', '.main-content'
      ];

      for (const selector of contentSelectors) {
        const contentEl = document.querySelector(selector);
        if (contentEl) {
          // 清理内容
          // 移除广告、推荐等无关元素
          const cloneEl = contentEl.cloneNode(true);
          const removeSelectors = [
            '.ad', '.advertisement', '.recommend', '.related',
            '.share', '.social', '.comment', '[class*="ad-"]',
            'script', 'style', 'iframe'
          ];
          removeSelectors.forEach(sel => {
            cloneEl.querySelectorAll(sel).forEach(el => el.remove());
          });

          // 提取段落
          const paragraphs = [];
          cloneEl.querySelectorAll('p').forEach(p => {
            const text = p.textContent.trim();
            if (text.length >= 10) {
              paragraphs.push(text);
            }
          });

          if (paragraphs.length >= 2) {
            return paragraphs.join('\n\n');
          }
        }
      }

      // 备选：提取所有长段落
      const allParagraphs = [];
      document.querySelectorAll('p').forEach(p => {
        const text = p.textContent.trim();
        if (text.length >= 30) {
          allParagraphs.push(text);
        }
      });

      return allParagraphs.join('\n\n');
    });
  }

  /**
   * 提取作者信息
   */
  async extractAuthor(page) {
    return await page.evaluate(() => {
      const author = {
        name: '',
        avatar: '',
        profile: '',
        bio: ''
      };

      // 作者名
      const nameSelectors = [
        '.author-name', '.author', '.writer', '[class*="author"]',
        '[rel="author"]'
      ];
      for (const selector of nameSelectors) {
        const nameEl = document.querySelector(selector);
        if (nameEl) {
          author.name = nameEl.textContent.trim();
          if (author.name) break;
        }
      }

      // 作者头像
      const avatarEl = document.querySelector('.author img, .avatar, [class*="avatar"]');
      if (avatarEl) {
        author.avatar = avatarEl.src || '';
      }

      // 作者主页
      const profileEl = document.querySelector('.author a, [class*="author"] a');
      if (profileEl) {
        author.profile = profileEl.href || '';
      }

      // 作者简介
      const bioEl = document.querySelector('.author-bio, .author-desc');
      if (bioEl) {
        author.bio = bioEl.textContent.trim();
      }

      return author;
    });
  }

  /**
   * 提取相关文章
   */
  async extractRelatedArticles(page) {
    return await page.evaluate(() => {
      const articles = [];

      const selectors = [
        '.related', '.recommend', '.similar', '[class*="related"]',
        '[class*="recommend"]', '.read-more'
      ];

      const processedUrls = new Set();

      for (const selector of selectors) {
        const containerEl = document.querySelector(selector);
        if (!containerEl) continue;

        const links = containerEl.querySelectorAll('a[href]');
        links.forEach(link => {
          const text = link.textContent.trim();
          const href = link.href;

          if (text && text.length >= 5 && text.length <= 100 && href &&
              !processedUrls.has(href) && !href.includes('javascript:')) {
            processedUrls.add(href);
            articles.push({ title: text, href });
          }
        });

        if (articles.length >= 10) break;
      }

      return articles.slice(0, 10);
    });
  }

  /**
   * 提取标签
   */
  async extractTags(page) {
    return await page.evaluate(() => {
      const tags = [];

      const selectors = [
        '.tags', '.tag-list', '.keywords', '[class*="tag"]'
      ];

      for (const selector of selectors) {
        const containerEl = document.querySelector(selector);
        if (!containerEl) continue;

        const tagEls = containerEl.querySelectorAll('a, span');
        tagEls.forEach(el => {
          const text = el.textContent.trim();
          if (text && text.length >= 1 && text.length <= 20) {
            tags.push(text);
          }
        });

        if (tags.length >= 2) break;
      }

      return [...new Set(tags)].slice(0, 10);
    });
  }

  /**
   * 提取评论信息
   */
  async extractCommentsInfo(page) {
    return await page.evaluate(() => {
      const comments = {
        count: 0,
        enabled: false
      };

      // 评论数
      const countSelectors = [
        '.comment-count', '.comments-count', '[class*="comment"] .count'
      ];
      for (const selector of countSelectors) {
        const countEl = document.querySelector(selector);
        if (countEl) {
          const match = countEl.textContent.match(/\d+/);
          if (match) {
            comments.count = parseInt(match[0]);
            break;
          }
        }
      }

      // 是否有评论区
      comments.enabled = !!document.querySelector('.comments, #comments, [class*="comment"]');

      return comments;
    });
  }

  /**
   * 提取内容图片
   */
  async extractContentImages(page, filepath, pagesDir) {
    return await page.evaluate(() => {
      const images = [];

      const imgEls = document.querySelectorAll('article img, .content img, .article-content img');

      imgEls.forEach((img, index) => {
        const src = img.src || img.dataset.src;
        const alt = img.alt || '';

        if (src && !src.startsWith('data:') && !src.includes('avatar') && !src.includes('icon')) {
          images.push({
            src,
            alt,
            index: index + 1
          });
        }
      });

      return images.slice(0, 20);
    });
  }
}

export default ArticleParser;