/**
 * Page Classifier - 页面分类器
 * 输出标准化分类结果：type + confidence + reasons + features
 *
 * 支持的页面类型：
 * - portal_page: 门户首页（链接密集，多区块，多导航）
 * - api_doc_page: API文档页面
 * - table_content_page: 表格内容页（数据表格为主）
 * - article_page: 文章详情页（长段落为主）
 * - list_page: 列表页（新闻列表、商品列表等）
 * - directory_page: 目录页（导航式链接集合）
 * - search_result_page: 搜索结果页
 * - login_page: 登录/注册页
 * - generic_page: 通用页面（兜底）
 */
class PageClassifier {
  /**
   * 分类页面
   * @param {Page} page - Playwright页面对象
   * @param {string} url - 页面URL
   * @returns {Promise<Object>} 分类结果
   */
  async classify(page, url) {
    const urlFeatures = this.extractUrlFeatures(url);

    if (urlFeatures.apiPattern) {
      return this.buildResult('api_doc_page', 0.95, ['url-api-pattern'], urlFeatures);
    }

    let domFeatures = {};
    try {
      domFeatures = await this.extractDomFeatures(page);
    } catch (error) {
      return this.buildResult('generic_page', 0.2, ['dom-features-failed'], {
        ...urlFeatures,
        domError: error.message
      });
    }

    return this.classifyByRules({ ...urlFeatures, ...domFeatures });
  }

  extractUrlFeatures(url = '') {
    const normalized = String(url).toLowerCase();
    return {
      url,
      apiPattern: /\/api\/(doc|docs|reference)?/.test(normalized),
      listHint: /(\/list|\/category|\/catalog|page=\d+|\/news)/.test(normalized),
      directoryHint: /(\/directory|\/index|\/menu|\/guide|\/docs)/.test(normalized),
      detailHint: /(\/detail|\/article|\/post|id=\d+)/.test(normalized),
      searchHint: /(\/search|\/s\?|q=|keyword=|query=)/.test(normalized),
      loginHint: /(\/login|\/signin|\/register|\/signup)/.test(normalized),
      isHomepage: /^https?:\/\/[^\/]+\/?$/.test(normalized) || /^https?:\/\/[^\/]+\/index/.test(normalized)
    };
  }

  async extractDomFeatures(page) {
    return await page.evaluate(() => {
      const clean = (text = '') => text.replace(/\s+/g, ' ').trim();
      const body = document.body;

      const totalText = clean(body?.innerText || '');
      const totalTextLength = totalText.length;

      const paragraphs = Array.from(document.querySelectorAll('p'))
        .map(p => clean(p.innerText || p.textContent || ''))
        .filter(t => t.length >= 30);
      const paragraphCount = paragraphs.length;
      const avgParagraphLength = paragraphCount
        ? paragraphs.reduce((sum, t) => sum + t.length, 0) / paragraphCount
        : 0;

      const tables = Array.from(document.querySelectorAll('table'));
      const tableCount = tables.length;
      const maxTableRows = tables.reduce((max, table) => {
        const rows = table.querySelectorAll('tr').length;
        return Math.max(max, rows);
      }, 0);

      const links = Array.from(document.querySelectorAll('a'));
      const linkCount = links.length;
      const linkTextLength = links
        .map(a => clean(a.innerText || a.textContent || '').length)
        .reduce((sum, len) => sum + len, 0);
      const linkDensity = totalTextLength > 0 ? linkTextLength / totalTextLength : 0;

      const listItems = document.querySelectorAll('li').length;
      const headingCount = document.querySelectorAll('h1,h2,h3,h4').length;
      const paginationDetected = !!document.querySelector('.pagination, .pager, [class*="page"], [aria-label*="page"]');

      const repeatedListBlocks = (() => {
        const containers = Array.from(document.querySelectorAll('ul, ol, .list, .news-list, .article-list'));
        let max = 0;
        containers.forEach((el) => {
          const count = el.querySelectorAll('li, .item, article').length;
          if (count > max) max = count;
        });
        return max;
      })();

      const navLinks = document.querySelectorAll('nav a, aside a, [role="navigation"] a').length;
      const hasTreeStyle = !!document.querySelector('.tree, .directory, [class*="catalog"]');

      // 新增：门户页面特征
      const navCount = document.querySelectorAll('nav, .nav, .navigation, .menu, #nav').length;
      const sectionCount = document.querySelectorAll('section, .section, .module, .mod, .block').length;
      const hasMultipleNavs = navCount >= 2;
      const hasMultipleSections = sectionCount >= 3;

      // 检测是否有多个内容区块（新闻门户特征）
      const contentBlocks = (() => {
        const blocks = document.querySelectorAll('[class*="news"], [class*="article"], [class*="content"], [class*="recommend"]');
        return blocks.length;
      })();

      // 检测热门/热搜区域
      const hasHotArea = !!document.querySelector('[class*="hot"], [class*="trend"], [class*="rank"]');

      // 检测快捷入口
      const hasQuickLinks = !!document.querySelector('[class*="quick"], [class*="fast"], [class*="service"]');

      // 检测侧边栏
      const sidebarCount = document.querySelectorAll('aside, .sidebar, .side').length;

      return {
        totalTextLength,
        paragraphCount,
        avgParagraphLength,
        tableCount,
        maxTableRows,
        linkCount,
        linkDensity,
        listItems,
        headingCount,
        paginationDetected,
        repeatedListBlocks,
        navLinks,
        hasTreeStyle,
        // 门户页面特征
        navCount,
        sectionCount,
        hasMultipleNavs,
        hasMultipleSections,
        contentBlocks,
        hasHotArea,
        hasQuickLinks,
        sidebarCount
      };
    });
  }

  classifyByRules(features) {
    // 1. 登录页面（最高优先级）
    if (features.loginHint && features.linkCount < 30) {
      return this.buildResult('login_page', 0.85, ['login-url-pattern'], features);
    }

    // 2. 搜索结果页
    if (features.searchHint && (features.repeatedListBlocks >= 5 || features.listItems >= 10)) {
      return this.buildResult('search_result_page', 0.80, ['search-url-with-list'], features);
    }

    // 3. 门户首页（链接密集，多导航，多区块）
    if ((features.isHomepage || features.hasMultipleNavs || features.linkCount >= 100) &&
        (features.hasMultipleSections || features.contentBlocks >= 3 || features.sectionCount >= 3) &&
        (features.navCount >= 2 || features.hasHotArea || features.hasQuickLinks)) {
      return this.buildResult('portal_page', 0.85, ['portal-signals'], features);
    }

    // 备选门户判断
    if (features.linkCount >= 80 && features.linkDensity >= 0.4 &&
        (features.hasMultipleNavs || features.hasHotArea || features.sidebarCount >= 1)) {
      return this.buildResult('portal_page', 0.75, ['link-dense-portal'], features);
    }

    // 4. 表格内容页
    if (features.tableCount >= 1 && features.maxTableRows >= 8 && features.paragraphCount <= 8) {
      return this.buildResult('table_content_page', 0.82, ['table-dominant'], features);
    }

    // 5. 文章详情页
    if (features.paragraphCount >= 5 && features.avgParagraphLength >= 80 && features.linkDensity < 0.3) {
      return this.buildResult('article_page', 0.8, ['long-article-signals'], features);
    }

    // 6. 列表页
    if ((features.repeatedListBlocks >= 10 || features.listItems >= 20 || features.paginationDetected) && features.linkDensity >= 0.15) {
      return this.buildResult('list_page', 0.76, ['list-structure-signals'], features);
    }

    // 7. 目录页
    if ((features.navLinks >= 15 || features.hasTreeStyle || features.directoryHint) && features.linkDensity >= 0.2) {
      return this.buildResult('directory_page', 0.72, ['directory-navigation-signals'], features);
    }

    // 8. 文章页（备选）
    if (features.detailHint && features.paragraphCount >= 3) {
      return this.buildResult('article_page', 0.65, ['detail-url-with-content'], features);
    }

    return this.buildResult('generic_page', 0.4, ['fallback-generic'], features);
  }

  buildResult(type, confidence, reasons, features) {
    return {
      type,
      confidence,
      reasons,
      features
    };
  }
}

export default PageClassifier;
