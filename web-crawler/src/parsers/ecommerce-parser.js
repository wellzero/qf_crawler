import BaseParser from './base-parser.js';

/**
 * E-commerce Parser - 电商商品页解析器
 * 专门处理电商商品详情页、商品列表页
 *
 * 支持的页面类型：
 * - 商品详情页（淘宝、京东、拼多多等）
 * - 商品列表页
 * - 商品分类页
 */
class EcommerceParser extends BaseParser {
  /**
   * 匹配电商页类型
   * @param {string} url - 页面URL
   * @returns {boolean} 是否匹配
   */
  matches(url) {
    // 电商域名和URL特征
    const ecommercePatterns = [
      /taobao\.com/i, /tmall\.com/i, /jd\.com/i, /pinduoduo\.com/i,
      /yangkeduo\.com/i, /suning\.com/i, /gome\.com\.cn/i,
      /dangdang\.com/i, /vip\.com/i, /mi\.com/i, /1688\.com/i,
      /amazon\.com/i, /amazon\.cn/i, /\/dp\/[A-Z0-9]+/i,  // Amazon
      /ebay\.com/i, /shopify\.com/i,
      /\/item\//i, /\/product\//i, /\/goods\//i, /\/offer\//i,
      /[?&]id=\d+/i, /[?&]spu=\d+/i
    ];

    const normalized = url.toLowerCase();

    for (const pattern of ecommercePatterns) {
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
   * 解析电商页
   * @param {Page} page - Playwright页面对象
   * @param {string} url - 页面URL
   * @param {Object} options - 解析选项
   * @returns {Promise<Object>} 解析后的页面数据
   */
  async parse(page, url, options = {}) {
    try {
      // 在提取前尝试滚动到底部以触发懒加载图片
      await this.scrollToBottom(page);

      // 判断是商品详情页还是列表页
      const isDetailPage = await this.detectDetailPage(page, url);

      if (isDetailPage) {
        return await this.parseProductDetail(page, url, options);
      } else {
        return await this.parseProductList(page, url, options);
      }
    } catch (error) {
      console.error('Failed to parse ecommerce page:', error.message);
      return {
        type: 'ecommerce',
        url,
        title: '',
        products: []
      };
    }
  }

  /**
   * 滚动到底部触发懒加载
   */
  async scrollToBottom(page) {
    try {
      await page.evaluate(async () => {
        await new Promise((resolve) => {
          let totalHeight = 0;
          const distance = 500;
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;

            if (totalHeight >= scrollHeight || totalHeight > 15000) {
              clearInterval(timer);
              window.scrollTo(0, 0); // 回到顶部
              resolve();
            }
          }, 200);
        });
      });
      // 给一点时间让最后的图片加载
      await page.waitForTimeout(1000);
    } catch (e) {
      // 忽略滚动错误
    }
  }

  /**
   * 检测是否为商品详情页
   */
  async detectDetailPage(page, url) {
    return await page.evaluate((currentUrl) => {
      // URL特征
      if (/\/item\//.test(currentUrl) || /\/product\//.test(currentUrl) ||
          /\/goods\//.test(currentUrl) || /[?&]id=\d+/.test(currentUrl)) {
        return true;
      }

      // 页面元素特征
      const priceEl = document.querySelector('.price, [class*="price"]');
      const buyBtn = document.querySelector('.buy, [class*="buy"], .add-cart, [class*="cart"]');
      const skuEl = document.querySelector('.sku, [class*="sku"], .spec, [class*="spec"]');

      return !!(priceEl && buyBtn);
    }, url);
  }

  /**
   * 解析商品详情页
   */
  async parseProductDetail(page, url, options) {
    const productInfo = await this.extractProductInfo(page);
    const priceInfo = await this.extractPriceInfo(page);
    const skuInfo = await this.extractSkuInfo(page);
    const description = await this.extractProductDescription(page);
    const reviews = await this.extractReviewSummary(page);
    const sellerInfo = await this.extractSellerInfo(page);
    const images = await this.extractProductImages(page, options.filepath, options.pagesDir);

    return {
      type: 'ecommerce-product',
      url,
      ...productInfo,
      price: priceInfo,
      sku: skuInfo,
      description,
      reviews,
      seller: sellerInfo,
      images
    };
  }

  /**
   * 解析商品列表页
   */
  async parseProductList(page, url, options) {
    const pageInfo = await this.extractPageInfo(page);
    const products = await this.extractProductList(page);
    const filters = await this.extractFilters(page);
    const pagination = await this.extractPagination(page);

    return {
      type: 'ecommerce-list',
      url,
      ...pageInfo,
      products,
      filters,
      pagination
    };
  }

  /**
   * 提取商品基本信息
   */
  async extractProductInfo(page) {
    return await page.evaluate(() => {
      const info = {
        title: '',
        subtitle: '',
        brand: '',
        category: ''
      };

      // 商品标题
      const titleSelectors = [
        '.tb-main-title', '.item-title', '.product-title',
        'h1', '.title', '[class*="title"]'
      ];
      for (const selector of titleSelectors) {
        const titleEl = document.querySelector(selector);
        if (titleEl) {
          const text = titleEl.textContent.trim();
          if (text.length >= 5 && text.length <= 200) {
            info.title = text;
            break;
          }
        }
      }

      // 副标题
      const subtitleEl = document.querySelector('.subtitle, .sub-title, [class*="subtitle"]');
      if (subtitleEl) {
        info.subtitle = subtitleEl.textContent.trim();
      }

      // 品牌
      const brandSelectors = [
        '.brand', '[class*="brand"]', '.tb-brand',
        'a[data-brandid]'
      ];
      for (const selector of brandSelectors) {
        const brandEl = document.querySelector(selector);
        if (brandEl) {
          info.brand = brandEl.textContent.trim();
          break;
        }
      }

      // 分类
      const breadcrumbEl = document.querySelector('.breadcrumb, .crumb, [class*="crumb"]');
      if (breadcrumbEl) {
        const crumbs = breadcrumbEl.querySelectorAll('a, span');
        const categories = [];
        crumbs.forEach(crumb => {
          const text = crumb.textContent.trim();
          if (text && text.length <= 20) {
            categories.push(text);
          }
        });
        info.category = categories.join(' > ');
      }

      return info;
    });
  }

  /**
   * 提取价格信息
   */
  async extractPriceInfo(page) {
    return await page.evaluate(() => {
      const price = {
        current: '',
        original: '',
        discount: '',
        currency: '¥'
      };

      // 当前价格
      const currentPriceSelectors = [
        '.tb-price', '.price-current', '.current-price',
        '[class*="price"]', '.p-price'
      ];
      for (const selector of currentPriceSelectors) {
        const priceEl = document.querySelector(selector);
        if (priceEl) {
          const text = priceEl.textContent;
          const match = text.match(/[\d,.]+/);
          if (match) {
            price.current = match[0];
            break;
          }
        }
      }

      // 原价
      const originalPriceEl = document.querySelector('.original-price, .del-price, [class*="original"], del');
      if (originalPriceEl) {
        const match = originalPriceEl.textContent.match(/[\d,.]+/);
        if (match) {
          price.original = match[0];
        }
      }

      // 折扣
      const discountEl = document.querySelector('.discount, [class*="discount"], .zhe');
      if (discountEl) {
        price.discount = discountEl.textContent.trim();
      }

      return price;
    });
  }

  /**
   * 提取SKU信息
   */
  async extractSkuInfo(page) {
    return await page.evaluate(() => {
      const sku = {
        options: [],
        selected: []
      };

      // SKU选择器
      const skuContainerSelectors = [
        '.tb-sku', '.sku-list', '.specs', '[class*="sku"]', '[class*="spec"]'
      ];

      for (const selector of skuContainerSelectors) {
        const containerEl = document.querySelector(selector);
        if (!containerEl) continue;

        // SKU组
        const skuGroups = containerEl.querySelectorAll('.sku-group, .spec-group, dl, [class*="group"]');
        skuGroups.forEach(group => {
          const nameEl = group.querySelector('dt, .name, .label');
          const name = nameEl ? nameEl.textContent.trim().replace(/[:：]$/, '') : '';

          const values = [];
          const valueEls = group.querySelectorAll('dd a, .value a, li, button');
          valueEls.forEach(val => {
            const text = val.textContent.trim();
            if (text) {
              values.push(text);
            }
          });

          if (name && values.length > 0) {
            sku.options.push({ name, values });
          }
        });

        if (sku.options.length > 0) break;
      }

      return sku;
    });
  }

  /**
   * 提取商品描述
   */
  async extractProductDescription(page) {
    return await page.evaluate(() => {
      let description = '';

      const selectors = [
        '#description', '.desc-content', '.detail-content',
        '.product-detail', '#details', '[class*="detail"]'
      ];

      for (const selector of selectors) {
        const descEl = document.querySelector(selector);
        if (descEl) {
          description = descEl.textContent.trim().slice(0, 2000);
          break;
        }
      }

      return description;
    });
  }

  /**
   * 提取评价摘要
   */
  async extractReviewSummary(page) {
    return await page.evaluate(() => {
      const reviews = {
        count: 0,
        avgScore: 0,
        goodRate: ''
      };

      // 评价数
      const countSelectors = [
        '.rate-count', '.review-count', '[class*="count"]',
        '[class*="review"] span'
      ];
      for (const selector of countSelectors) {
        const countEl = document.querySelector(selector);
        if (countEl) {
          const match = countEl.textContent.match(/[\d,]+/);
          if (match) {
            reviews.count = parseInt(match[0].replace(/,/g, ''));
            break;
          }
        }
      }

      // 评分
      const scoreEl = document.querySelector('.rate-score, .rating, [class*="score"]');
      if (scoreEl) {
        const match = scoreEl.textContent.match(/[\d.]+/);
        if (match) {
          reviews.avgScore = parseFloat(match[0]);
        }
      }

      // 好评率
      const rateEl = document.querySelector('.good-rate, [class*="percent"]');
      if (rateEl) {
        reviews.goodRate = rateEl.textContent.trim();
      }

      return reviews;
    });
  }

  /**
   * 提取卖家信息
   */
  async extractSellerInfo(page) {
    return await page.evaluate(() => {
      const seller = {
        name: '',
        type: '',
        rating: '',
        location: ''
      };

      // 店铺名
      const nameSelectors = [
        '.shop-name', '.seller-name', '.store-name',
        '[class*="shop"] a', '[class*="seller"] a'
      ];
      for (const selector of nameSelectors) {
        const nameEl = document.querySelector(selector);
        if (nameEl) {
          seller.name = nameEl.textContent.trim();
          break;
        }
      }

      // 店铺类型（旗舰店、专营店等）
      const typeEl = document.querySelector('.shop-type, .store-type, [class*="type"]');
      if (typeEl) {
        seller.type = typeEl.textContent.trim();
      }

      // 店铺评分
      const ratingEl = document.querySelector('.shop-rating, .dsr, [class*="rating"]');
      if (ratingEl) {
        seller.rating = ratingEl.textContent.trim();
      }

      // 地区
      const locationEl = document.querySelector('.location, .area, [class*="location"]');
      if (locationEl) {
        seller.location = locationEl.textContent.trim();
      }

      return seller;
    });
  }

  /**
   * 提取商品图片
   */
  async extractProductImages(page, filepath, pagesDir) {
    return await page.evaluate(() => {
      const images = [];

      const imgEls = document.querySelectorAll('.main-pic img, .preview img, .product-img img, [class*="gallery"] img');

      imgEls.forEach((img, index) => {
        const src = img.src || img.dataset.src;
        if (src && !src.startsWith('data:')) {
          images.push({
            src,
            alt: img.alt || `商品图片${index + 1}`,
            index: index + 1
          });
        }
      });

      return images.slice(0, 20);
    });
  }

  /**
   * 提取商品列表
   */
  async extractProductList(page) {
    return await page.evaluate(() => {
      const products = [];
      const processedUrls = new Set();

      const itemSelectors = [
        '.item', '.product', '.goods', '[class*="item"]',
        'li[data-sku]', '.gl-item'
      ];

      for (const selector of itemSelectors) {
        const items = document.querySelectorAll(selector);

        if (items.length >= 3) {
          items.forEach((item, index) => {
            // 提取标题和链接
            const linkEl = item.querySelector('a[href]');
            if (!linkEl) return;

            const title = linkEl.title || linkEl.textContent.trim();
            const href = linkEl.href;

            if (!title || !href || processedUrls.has(href)) return;
            processedUrls.add(href);

            // 提取价格
            let price = '';
            const priceEl = item.querySelector('[class*="price"]');
            if (priceEl) {
              const match = priceEl.textContent.match(/[\d,.]+/);
              if (match) {
                price = match[0];
              }
            }

            // 提取店铺
            let shop = '';
            const shopEl = item.querySelector('[class*="shop"], [class*="store"]');
            if (shopEl) {
              shop = shopEl.textContent.trim();
            }

            // 提取图片
            let img = '';
            const imgEl = item.querySelector('img');
            if (imgEl) {
              img = imgEl.src || imgEl.dataset.src || '';
            }

            products.push({
              rank: products.length + 1,
              title,
              href,
              price,
              shop,
              img
            });
          });

          if (products.length >= 5) break;
        }
      }

      return products.slice(0, 100);
    });
  }

  /**
   * 提取筛选器
   */
  async extractFilters(page) {
    return await page.evaluate(() => {
      const filters = [];

      const containerEl = document.querySelector('.filter, [class*="filter"], .selector');
      if (!containerEl) return filters;

      const filterGroups = containerEl.querySelectorAll('dl, .filter-group, [class*="group"]');
      filterGroups.forEach(group => {
        const nameEl = group.querySelector('dt, .name');
        const name = nameEl ? nameEl.textContent.trim() : '';

        const values = [];
        const valueEls = group.querySelectorAll('dd a, .value a');
        valueEls.forEach(val => {
          values.push({
            text: val.textContent.trim(),
            href: val.href
          });
        });

        if (name && values.length > 0) {
          filters.push({ name, values });
        }
      });

      return filters;
    });
  }

  /**
   * 提取分页信息
   */
  async extractPagination(page) {
    return await page.evaluate(() => {
      const pagination = {
        current: 1,
        total: 1
      };

      const paginationEl = document.querySelector('.pagination, [class*="page"]');
      if (paginationEl) {
        const currentEl = paginationEl.querySelector('.current, .active, [class*="current"]');
        if (currentEl) {
          pagination.current = parseInt(currentEl.textContent) || 1;
        }

        const pageEls = paginationEl.querySelectorAll('a, span');
        pageEls.forEach(el => {
          const num = parseInt(el.textContent);
          if (!isNaN(num) && num > pagination.total) {
            pagination.total = num;
          }
        });
      }

      return pagination;
    });
  }

  /**
   * 提取页面基本信息
   */
  async extractPageInfo(page) {
    return await page.evaluate(() => {
      return {
        title: document.title,
        description: document.querySelector('meta[name="description"]')?.content || ''
      };
    });
  }
}

export default EcommerceParser;