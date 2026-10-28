import BaseParser from './base-parser.js';

/**
 * EODHD API Parser - 专门解析 eodhd.com/financial-apis API 文档页面
 * EODHD 使用 WordPress 架构，API 文档以文章形式组织
 */
class EodhdApiParser extends BaseParser {
  /**
   * 匹配 EODHD API 文档页面和博客文章页面
   * @param {string} url - 页面URL
   * @returns {boolean} 是否匹配
   */
  matches(url) {
    // 匹配 /financial-apis/ API 文档页面
    // 和 /financial-apis-blog/ 博客文章页面
    return /^https?:\/\/eodhd\.com\/financial-apis(\/|$|-blog)/.test(url);
  }

  /**
   * 检测是否为博客页面
   * @param {string} url - 页面URL
   * @returns {boolean} 是否为博客页面
   */
  isBlogPage(url) {
    return url.includes('/financial-apis-blog/');
  }

  /**
   * 检测是否为 Marketplace 页面（第三方 API 产品）
   * 检查 URL 或页面内容特征
   * @param {string} url - 页面URL
   * @returns {boolean} 是否为 Marketplace 页面
   */
  isMarketplacePage(url) {
    return url.includes('/marketplace/') || url.includes('esg-data-api');
  }

  /**
   * 检测页面是否具有 Marketplace 特征（运行时检测）
   * @param {Page} page - Playwright页面对象
   * @returns {Promise<boolean>} 是否为 Marketplace 页面
   */
  async detectMarketplacePage(page) {
    try {
      return await page.evaluate(() => {
        // 检查是否有 post_content 容器但没有 entry-content
        const hasPostContent = !!document.querySelector('.post_content');
        const hasEntryContent = !!document.querySelector('.entry-content');
        // 检查是否有 Marketplace 特征
        const bodyText = document.body.innerText;
        const hasMarketplaceText = bodyText.includes('Marketplace') ||
                                    bodyText.includes('$') && bodyText.includes('/mo');
        // 如果有 post_content 但没有 entry-content，很可能是 Marketplace 页面
        return hasPostContent && !hasEntryContent;
      });
    } catch {
      return false;
    }
  }

  /**
   * 检测页面是否为博客列表/归档页面
   * @param {string} url - 页面URL
   * @returns {boolean} 是否为列表页面
   */
  isListPage(url) {
    // 博客列表页
    if (url.match(/\/financial-apis-blog\/?$/)) return true;
    // API 文档分类页、标签页、分页
    if (url.includes('/category/') || url.includes('/tag/') || url.includes('/page/')) return true;
    // 检查是否为 API 根目录（概览页可能是一个列表）
    const urlObj = new URL(url);
    if (urlObj.pathname === '/financial-apis/' || urlObj.pathname === '/financial-apis') return true;
    return false;
  }

  /**
   * 获取优先级
   * @returns {number} 优先级
   */
  getPriority() {
    return 100;
  }

  /**
   * 根据 URL 生成有意义的文件名
   * @param {string} url - 页面URL
   * @returns {string} 文件名
   */
  generateFilename(url) {
    try {
      const urlObj = new URL(url);
      let pathname = urlObj.pathname;
      // 移除 /financial-apis 前缀
      pathname = pathname.replace(/^\/financial-apis\/?/, '');
      pathname = pathname.replace(/\/$/, '');

      // 分类页面
      if (pathname.startsWith('category/')) {
        return 'category_' + pathname.replace('category/', '').replace(/\//g, '_');
      }

      // API 文档页面
      const filename = pathname.replace(/\//g, '_') || 'api_overview';
      return filename;
    } catch (e) {
      return 'api_doc';
    }
  }

  /**
   * 解析 EODHD API 文档页面或博客文章
   * @param {Page} page - Playwright页面对象
   * @param {string} url - 页面URL
   * @param {Object} options - 解析选项
   * @returns {Promise<Object>} 解析后的页面数据
   */
  async parse(page, url, options = {}) {
    const isBlog = this.isBlogPage(url);
    const isList = this.isListPage(url);
    let isMarketplace = this.isMarketplacePage(url);

    try {
      // 等待页面加载完成
      await this.waitForContent(page);

      // 运行时检测是否为 Marketplace 页面（基于页面内容特征）
      if (!isMarketplace && !isBlog) {
        isMarketplace = await this.detectMarketplacePage(page);
      }

      if (isList) {
        // 列表/归档页面解析
        return await this.parseListPage(page, url);
      } else if (isBlog && !isList) {
        // 博客文章解析
        return await this.parseBlogArticle(page, url);
      } else if (isMarketplace) {
        // Marketplace 产品页面解析
        return await this.parseMarketplacePage(page, url);
      } else {
        // API 文档解析
        return await this.parseApiDoc(page, url);
      }
    } catch (error) {
      console.error('Failed to parse EODHD page:', error.message);
      const type = isList ? 'eodhd-list' : (isBlog ? 'eodhd-blog' : (isMarketplace ? 'eodhd-marketplace' : 'eodhd-api'));
      return {
        type,
        url,
        title: '',
        description: '',
        endpoint: '',
        parameters: [],
        markdownContent: '',
        rawContent: '',
        suggestedFilename: this.generateFilename(url)
      };
    }
  }

  /**
   * 解析列表/归档页面（如博客列表、分类页面）
   */
  async parseListPage(page, url) {
    const data = await page.evaluate(() => {
      const result = {
        title: '',
        items: []
      };

      // 提取标题
      const h1 = document.querySelector('h1');
      if (h1) {
        result.title = h1.textContent.trim();
      }

      // 提取博客文章列表
      const articles = document.querySelectorAll('article, .post, .blog-post, .entry');
      const seenLinks = new Set();
      
      for (const article of articles) {
        const titleEl = article.querySelector('h2 a, h3 a, .entry-title a, a[rel="bookmark"]');
        const title = titleEl?.textContent?.trim() || '';
        const link = titleEl?.href || '';
        const dateEl = article.querySelector('time, .published, .post-date');
        const date = dateEl?.textContent?.trim() || dateEl?.getAttribute('datetime') || '';
        const excerptEl = article.querySelector('.entry-summary, .excerpt, p');
        const excerpt = excerptEl?.textContent?.trim()?.substring(0, 200) || '';

        if (title && link && !seenLinks.has(link)) {
          seenLinks.add(link);
          result.items.push({ title, link, date, excerpt });
        }
      }

      // 如果没找到文章，尝试其他选择器
      if (result.items.length === 0) {
        const links = document.querySelectorAll('a[href*="/financial-apis-blog/"], a[href*="/financial-apis/"]');
        for (const link of links) {
          const title = link.textContent.trim();
          const href = link.href;
          // 排除导航链接和分类标签链接
          if (title && href && 
              !href.endsWith('/financial-apis-blog/') && 
              !href.endsWith('/financial-apis/') &&
              !href.includes('/category/') &&
              !href.includes('/tag/') &&
              title.length > 5 &&
              !seenLinks.has(href)) {
            seenLinks.add(href);
            result.items.push({ title, link: href });
          }
        }
      }

      return result;
    });

    const markdown = this.convertListToMarkdown(data);

    return {
      type: 'eodhd-list',
      url,
      title: data.title,
      description: `共 ${data.items.length} 篇文章`,
      endpoint: '',
      parameters: [],
      markdownContent: markdown,
      rawContent: '',
      suggestedFilename: this.generateFilename(url)
    };
  }

  /**
   * 解析博客文章
   */
  async parseBlogArticle(page, url) {
    const data = await page.evaluate(() => {
      const result = {
        title: '',
        content: '',
        publishDate: '',
        author: '',
        tags: [],
        categories: []
      };

      // 提取标题
      const h1 = document.querySelector('h1.page-title, h1');
      if (h1) {
        result.title = h1.textContent.trim();
      }

      // 提取文章内容
      const entryContent = document.querySelector('.entry-content');
      if (entryContent) {
        // 提取所有段落、列表、引用等
        const contentParts = [];

        // 处理段落
        const paragraphs = entryContent.querySelectorAll('p');
        for (const p of paragraphs) {
          const text = p.textContent.trim();
          if (text && text.length > 10) {
            contentParts.push({ type: 'paragraph', text });
          }
        }

        // 处理引用
        const blockquotes = entryContent.querySelectorAll('blockquote');
        for (const bq of blockquotes) {
          const text = bq.textContent.trim();
          if (text) {
            contentParts.push({ type: 'blockquote', text });
          }
        }

        // 处理代码块
        const preBlocks = entryContent.querySelectorAll('pre');
        for (const pre of preBlocks) {
          const code = pre.textContent.trim();
          if (code) {
            contentParts.push({ type: 'code', code });
          }
        }

        // 处理图片
        const images = entryContent.querySelectorAll('img');
        for (const img of images) {
          const src = img.getAttribute('src');
          const alt = img.getAttribute('alt') || '';
          if (src) {
            contentParts.push({ type: 'image', src, alt });
          }
        }

        result.contentParts = contentParts;
      }

      // 提取发布日期
      const timeEl = document.querySelector('time.entry-date, .posted-on time');
      if (timeEl) {
        result.publishDate = timeEl.getAttribute('datetime') || timeEl.textContent.trim();
      }

      // 提取作者
      const authorEl = document.querySelector('.author-name, .byline a');
      if (authorEl) {
        result.author = authorEl.textContent.trim();
      }

      // 提取标签
      const tags = document.querySelectorAll('.tags-links a, a[rel="tag"]');
      for (const tag of tags) {
        result.tags.push(tag.textContent.trim());
      }

      // 提取分类
      const categories = document.querySelectorAll('.cat-links a, a[rel="category"]');
      for (const cat of categories) {
        result.categories.push(cat.textContent.trim());
      }

      return result;
    });

    const markdown = this.convertBlogToMarkdown(data);

    return {
      type: 'eodhd-blog',
      url,
      title: data.title,
      description: data.contentParts?.[0]?.text || '',
      endpoint: '',
      parameters: [],
      markdownContent: markdown,
      rawContent: '',
      suggestedFilename: this.generateFilename(url),
      publishDate: data.publishDate,
      author: data.author,
      tags: data.tags,
      categories: data.categories
    };
  }

  /**
   * 解析 Marketplace 产品页面（第三方 API 产品）
   */
  async parseMarketplacePage(page, url) {
    const data = await page.evaluate(() => {
      const result = {
        title: '',
        provider: '',
        providerUrl: '',
        description: '',
        price: '',
        features: [],
        sections: [],
        apiDocLink: ''
      };

      // 提取标题
      const h1 = document.querySelector('h1');
      if (h1) {
        result.title = h1.textContent.trim();
      }

      // 提取提供商信息
      const providerEl = document.querySelector('.provider__description');
      if (providerEl) {
        result.provider = providerEl.textContent.trim();
      }

      // 提取提供商网址
      const providerLink = document.querySelector('.provider a[href]');
      if (providerLink) {
        result.providerUrl = providerLink.href;
      }

      // 提取主要内容
      const postContent = document.querySelector('.post_content');
      if (postContent) {
        result.description = postContent.innerText.trim();
      }

      // 提取价格
      const priceEl = document.querySelector('[class*="price"]');
      if (priceEl) {
        result.price = priceEl.textContent.trim();
      }

      // 查找 API 文档链接
      const docLinks = document.querySelectorAll('a');
      for (const link of docLinks) {
        const text = link.textContent.toLowerCase();
        const href = link.href;
        if ((text.includes('documentation') || text.includes('api doc')) && href) {
          result.apiDocLink = href;
          break;
        }
      }

      return result;
    });

    const markdown = this.convertMarketplaceToMarkdown(data);

    return {
      type: 'eodhd-marketplace',
      url,
      title: data.title,
      description: data.description.substring(0, 200),
      endpoint: data.apiDocLink,
      parameters: [],
      markdownContent: markdown,
      rawContent: '',
      suggestedFilename: this.generateFilename(url),
      provider: data.provider,
      providerUrl: data.providerUrl,
      price: data.price
    };
  }

  /**
   * 解析 API 文档页面
   */
  async parseApiDoc(page, url) {
    // 提取结构化的 API 文档内容
    const data = await page.evaluate(() => {
      const result = {
        title: '',
        description: '',
        endpoint: '',
        parameters: [],
        sections: [],
        codeExamples: [],
        relatedApis: [],
        isCategoryPage: false
      };

      // 检测是否为分类页面
      const categoryContent = document.querySelector('.category-list, .archive-content');
      if (categoryContent) {
        result.isCategoryPage = true;
      }

      // 提取标题
      const h1 = document.querySelector('h1.article-header__title, h1');
      if (h1) {
        result.title = h1.textContent.trim();
      }

      // 提取描述（标题后的第一段有意义的文本）
      // 过滤掉按钮文本、导航链接等 UI 元素
      const skipTextPatterns = [
        /^sign\s*up/i,
        /^get\s*data/i,
        /^subscribe/i,
        /^learn\s*more/i,
        /^read\s*more/i,
        /^click\s*here/i,
        /^\d+\s*(min|hour|day|week|month|year)/i,
        /^by\s+/i,
        /^posted\s+on/i,
        /^last\s+updated/i
      ];

      if (h1) {
        const articleContent = h1.closest('article') || document.querySelector('.article-content, .entry-content');
        if (articleContent) {
          const allParagraphs = articleContent.querySelectorAll('p');
          for (const p of allParagraphs) {
            const text = p.textContent.trim();
            // 跳过空文本和太短的文本
            if (!text || text.length < 20) continue;
            // 跳过匹配跳过模式的文本
            if (skipTextPatterns.some(pattern => pattern.test(text))) continue;
            // 跳过在按钮内的段落
            if (p.closest('button, .btn, .button, [role="button"]')) continue;
            // 跳过包含太多链接的段落（通常是导航）
            const links = p.querySelectorAll('a');
            if (links.length > 2) continue;

            result.description = text;
            break;
          }
        }
      }

      // 提取 API 端点
      const apiUrls = document.querySelectorAll('pre.api_url_text');
      for (const urlEl of apiUrls) {
        const urlText = urlEl.textContent.trim();
        if (urlText && urlText.startsWith('https://')) {
          result.codeExamples.push({
            type: 'endpoint',
            code: urlText
          });
          // 第一个端点作为主端点
          if (!result.endpoint) {
            // 清理 URL，移除示例参数
            const cleanUrl = urlText
              .replace(/<span[^>]*>/g, '')
              .replace(/<\/span>/g, '')
              .split('?')[0];
            result.endpoint = cleanUrl;
          }
        }
      }

      // 提取其他代码块
      const preBlocks = document.querySelectorAll('pre:not(.api_url_text)');
      for (const pre of preBlocks) {
        const code = pre.textContent.trim();
        if (code && code.length > 10) {
          let language = 'text';
          if (code.startsWith('curl')) language = 'bash';
          else if (code.startsWith('{') || code.startsWith('[')) language = 'json';
          else if (code.startsWith('<')) language = 'html';

          result.codeExamples.push({
            type: 'code',
            language,
            code
          });
        }
      }

      // 提取参数表格
      const tables = document.querySelectorAll('table');
      for (const table of tables) {
        const params = [];
        const rows = table.querySelectorAll('tr');
        let isParamTable = false;

        for (const row of rows) {
          const cells = row.querySelectorAll('th, td');
          if (cells.length >= 2) {
            const headerText = cells[0].textContent.trim().toLowerCase();
            // 检测是否为参数表格
            if (headerText === 'parameter' || headerText === 'name' || headerText === 'param') {
              isParamTable = true;
              continue;
            }
            if (isParamTable || cells[0].textContent.includes('(')) {
              const paramName = cells[0].textContent.trim();
              const paramDesc = cells[1]?.textContent.trim() || '';
              if (paramName && !paramName.toLowerCase().includes('parameter')) {
                params.push({
                  name: paramName,
                  description: paramDesc
                });
              }
            }
          }
        }

        if (params.length > 0) {
          result.parameters = params;
        }
      }

      // 提取主要章节内容
      const articleContent = document.querySelector('.article-content, .entry-content, article, main, .page-content, .post-content');
      if (articleContent) {
        const headings = articleContent.querySelectorAll('h2, h3');
        for (const heading of headings) {
          const sectionTitle = heading.textContent.trim();
          // 跳过目录标题
          if (sectionTitle.toLowerCase().includes('quick jump') || sectionTitle.toLowerCase().includes('table of contents')) {
            continue;
          }

          // 提取章节内容 - 过滤 UI 元素
          let content = '';
          let sibling = heading.nextElementSibling;
          while (sibling && sibling.tagName.toLowerCase() !== 'h2' && sibling.tagName.toLowerCase() !== 'h3') {
            if (sibling.tagName.toLowerCase() === 'p') {
              const text = sibling.textContent.trim();
              // 跳过 UI 按钮文本
              if (text.length > 15 &&
                  !text.match(/^(sign\s*up|get\s*data|subscribe|learn\s*more)/i) &&
                  !sibling.closest('button, .btn, .button, [role="button"]')) {
                content += text + '\n\n';
              }
            }
            sibling = sibling.nextElementSibling;
          }

          if (content.trim()) {
            result.sections.push({
              title: sectionTitle,
              content: content.trim()
            });
          }
        }
      }

      // 提取侧边栏 API 列表（用于导航）
      const sideMenu = document.querySelector('.side-menu, .sidebar');
      if (sideMenu) {
        const apiLinks = sideMenu.querySelectorAll('a[href*="/financial-apis/"]');
        for (const link of apiLinks) {
          const title = link.textContent.trim();
          const href = link.getAttribute('href');
          if (title && href && !href.includes('category')) {
            result.relatedApis.push({
              title,
              url: href.startsWith('http') ? href : `https://eodhd.com${href}`
            });
          }
        }
      }

      return result;
    });

    // 将结构化数据转换为 Markdown
    const markdown = this.convertToMarkdown(data);

    return {
      type: 'eodhd-api',
      url,
      title: data.title,
      description: data.description,
      endpoint: data.endpoint,
      parameters: data.parameters,
      markdownContent: markdown,
      rawContent: '',
      suggestedFilename: this.generateFilename(url)
    };
  }

  /**
   * 将列表数据转换为 Markdown
   */
  convertListToMarkdown(data) {
    const lines = [];

    // 主标题
    if (data.title) {
      lines.push(`# ${data.title}`, '');
    }

    // 文章列表
    if (data.items && data.items.length > 0) {
      lines.push(`## 文章列表 (${data.items.length} 篇)`, '');
      for (const item of data.items) {
        if (item.link) {
          lines.push(`- [${item.title}](${item.link})`);
        } else {
          lines.push(`- ${item.title}`);
        }
        if (item.date) {
          lines.push(`  - 日期: ${item.date}`);
        }
        if (item.excerpt) {
          lines.push(`  - 摘要: ${item.excerpt}`);
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * 将 Marketplace 数据转换为 Markdown
   */
  convertMarketplaceToMarkdown(data) {
    const lines = [];

    // 主标题
    if (data.title) {
      lines.push(`# ${data.title}`, '');
    }

    // 提供商信息
    if (data.provider || data.providerUrl || data.price) {
      lines.push('## 产品信息', '');
      if (data.provider) {
        lines.push(`- 提供商: ${data.provider}`);
      }
      if (data.providerUrl) {
        lines.push(`- 提供商网址: ${data.providerUrl}`);
      }
      if (data.price) {
        lines.push(`- 价格: ${data.price}`);
      }
      lines.push('');
    }

    // 描述内容
    if (data.description) {
      lines.push('## 产品描述', '');
      lines.push(data.description, '');
    }

    // API 文档链接
    if (data.apiDocLink) {
      lines.push('## API 文档', '');
      lines.push(`- [查看 API 文档](${data.apiDocLink})`, '');
    }

    return lines.join('\n');
  }

  /**
   * 将博客数据转换为 Markdown
   */
  convertBlogToMarkdown(data) {
    const lines = [];

    // 主标题
    if (data.title) {
      lines.push(`# ${data.title}`, '');
    }

    // 元信息
    if (data.publishDate || data.author) {
      lines.push('## 文章信息', '');
      if (data.publishDate) {
        lines.push(`- 发布日期: ${data.publishDate}`);
      }
      if (data.author) {
        lines.push(`- 作者: ${data.author}`);
      }
      if (data.categories && data.categories.length > 0) {
        lines.push(`- 分类: ${data.categories.join(', ')}`);
      }
      if (data.tags && data.tags.length > 0) {
        lines.push(`- 标签: ${data.tags.join(', ')}`);
      }
      lines.push('');
    }

    // 正文内容
    if (data.contentParts && data.contentParts.length > 0) {
      lines.push('## 正文', '');

      for (const part of data.contentParts) {
        switch (part.type) {
          case 'paragraph':
            lines.push(part.text, '');
            break;
          case 'blockquote':
            lines.push('> ' + part.text.split('\n').join('\n> '), '');
            break;
          case 'code':
            lines.push('```text');
            lines.push(part.code);
            lines.push('```', '');
            break;
          case 'image':
            lines.push(`![${part.alt}](${part.src})`, '');
            break;
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * 将 API 文档结构化数据转换为 Markdown
   */
  convertToMarkdown(data) {
    const lines = [];

    // 主标题
    if (data.title) {
      lines.push(`# ${data.title}`, '');
    }

    // 描述
    if (data.description) {
      lines.push(data.description, '');
    }

    // API 端点
    const endpoints = data.codeExamples.filter(e => e.type === 'endpoint');
    if (endpoints.length > 0) {
      lines.push('## API Endpoint', '');
      for (const ep of endpoints.slice(0, 3)) { // 最多显示3个端点示例
        lines.push('```text');
        lines.push(ep.code);
        lines.push('```', '');
      }
    }

    // 参数
    if (data.parameters && data.parameters.length > 0) {
      lines.push('## Parameters', '');
      lines.push('| Parameter | Description |');
      lines.push('|-----------|-------------|');
      for (const param of data.parameters) {
        lines.push(`| ${param.name} | ${param.description} |`);
      }
      lines.push('');
    }

    // 章节
    for (const section of data.sections) {
      lines.push('', `## ${section.title}`, '');
      if (section.content) {
        lines.push(section.content);
      }
    }

    // 代码示例
    const codeExamples = data.codeExamples.filter(e => e.type === 'code');
    if (codeExamples.length > 0) {
      lines.push('', '## Code Examples', '');
      for (const example of codeExamples.slice(0, 5)) { // 最多显示5个示例
        lines.push(`\`\`\`${example.language}`);
        lines.push(example.code);
        lines.push('```', '');
      }
    }

    // 相关 API
    if (data.relatedApis && data.relatedApis.length > 0) {
      lines.push('', '## Related APIs', '');
      for (const api of data.relatedApis.slice(0, 10)) {
        lines.push(`- [${api.title}](${api.url})`);
      }
    }

    return lines.join('\n');
  }

  /**
   * 等待页面内容加载完成
   */
  async waitForContent(page) {
    try {
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
      await page.waitForSelector('h1', { timeout: 15000 });
      // 等待内容区域加载（API 文档用 entry-content，Marketplace 用 post_content）
      await page.waitForSelector('.entry-content, .post_content', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(3000); // 额外等待动态内容
    } catch (error) {
      console.warn('Wait for content timeout, proceeding anyway:', error.message);
    }
  }
}

export default EodhdApiParser;