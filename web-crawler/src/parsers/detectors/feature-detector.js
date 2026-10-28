/**
 * 页面特征检测器
 * 分析 DOM 结构，推断页面的大概类型 (portal, article, list, api-doc, ecommerce 等)
 */
class FeatureDetector {
  async extract(context) {
    const { page } = context;
    const pageFeatures = await this.detectPageFeatures(page);
    return { pageFeatures };
  }

  async detectPageFeatures(page) {
    try {
      return await page.evaluate(() => {
        const features = {
          suggestedType: 'unknown',
          confidence: 0,
          signals: []
        };

        const navCount = document.querySelectorAll('nav, .nav, .navigation, .header-nav').length;
        const linkCount = document.querySelectorAll('a').length;
        const contentBlocks = document.querySelectorAll('.news-list, .content-block, .channel, .section, .module').length;

        if (navCount >= 2 && linkCount >= 100) {
          features.signals.push('portal-like');
          features.suggestedType = 'portal';
          features.confidence += 30;
        }
        if (contentBlocks >= 3) {
          features.signals.push('multiple-content-blocks');
          if (features.suggestedType === 'unknown') features.suggestedType = 'portal';
          features.confidence += 20;
        }

        const h1 = document.querySelector('h1');
        const article = document.querySelector('article, .article-content, .post-content, .news-content');
        const timeEl = document.querySelector('time, .time, .date, .publish-time');

        if (h1 && h1.textContent.trim().length >= 10) {
          features.signals.push('article-like');
          if (features.suggestedType === 'unknown') features.suggestedType = 'article';
          features.confidence += 25;
        }
        if (article) {
          const paragraphs = article.querySelectorAll('p');
          if (paragraphs.length >= 3) {
            features.signals.push('article-content');
            features.confidence += 25;
          }
        }
        if (timeEl) {
          features.signals.push('has-publish-time');
          features.confidence += 15;
        }

        const listItems = document.querySelectorAll('.item, .list-item, article, .news-item, .article-item');
        if (listItems.length >= 5) {
          features.signals.push('list-like');
          if (features.suggestedType === 'unknown') features.suggestedType = 'list';
          features.confidence += 30;
        }

        const pagination = document.querySelector('.pagination, .pager, .page-nav');
        if (pagination) {
          features.signals.push('has-pagination');
          if (features.suggestedType === 'unknown') features.suggestedType = 'list';
          features.confidence += 20;
        }

        const codeBlocks = document.querySelectorAll('pre, code, .code');
        if (codeBlocks.length >= 3) {
          features.signals.push('api-doc-like');
          if (features.suggestedType === 'unknown') features.suggestedType = 'api-doc';
          features.confidence += 20;
        }

        const endpointHints = document.querySelectorAll('[class*="endpoint"], [class*="api"], .method, .http-method');
        if (endpointHints.length >= 2) {
          features.signals.push('api-endpoints');
          features.suggestedType = 'api-doc';
          features.confidence += 30;
        }

        const priceEl = document.querySelector('.price, [class*="price"]');
        const addToCart = document.querySelector('.add-to-cart, [class*="buy"], [class*="cart"]');
        if (priceEl && addToCart) {
          features.signals.push('ecommerce-like');
          features.suggestedType = 'ecommerce';
          features.confidence += 40;
        }

        const searchInput = document.querySelector('input[type="search"], input[name="q"], input[name="query"]');
        const resultCount = document.querySelector('.result-count, [class*="result"], .search-info');
        if (searchInput && resultCount) {
          features.signals.push('search-result');
          if (features.suggestedType === 'unknown') features.suggestedType = 'search-result';
          features.confidence += 30;
        }

        return features;
      });
    } catch (error) {
      return { suggestedType: 'unknown', confidence: 0, signals: [] };
    }
  }
}

export default FeatureDetector;
