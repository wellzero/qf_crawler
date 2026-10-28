import EcommerceParser from '../src/parsers/ecommerce-parser.js';

describe('EcommerceParser', () => {
  let parser;

  beforeEach(() => {
    parser = new EcommerceParser();
  });

  describe('matches', () => {
    test('should match ecommerce domain URLs', () => {
      expect(parser.matches('https://taobao.com/item/123')).toBe(true);
      expect(parser.matches('https://tmall.com/product/123')).toBe(true);
      expect(parser.matches('https://jd.com/item')).toBe(true);
      expect(parser.matches('https://pinduoduo.com/goods')).toBe(true);
      expect(parser.matches('https://amazon.com/dp/ABC123')).toBe(true);
    });

    test('should match URLs with item/product patterns', () => {
      expect(parser.matches('https://example.com/item/123')).toBe(true);
      expect(parser.matches('https://example.com/product/abc')).toBe(true);
      expect(parser.matches('https://example.com/goods/123')).toBe(true);
      expect(parser.matches('https://example.com?id=12345')).toBe(true);
    });

    test('should not match non-ecommerce URLs', () => {
      expect(parser.matches('https://example.com/article')).toBe(false);
      expect(parser.matches('https://example.com/api')).toBe(false);
    });
  });

  describe('getPriority', () => {
    test('should return 5', () => {
      expect(parser.getPriority()).toBe(5);
    });
  });

  describe('parse', () => {
    test('should detect and parse product detail page', async () => {
      const mockPage = {
        evaluate: async (fn, url) => {
          if (typeof fn === 'function') {
            return fn(url);
          }
          return true;
        },
        scrollToBottom: async () => {},
        detectDetailPage: async () => true,
        extractProductInfo: async () => ({ title: 'iPhone 15', brand: 'Apple', category: 'Phones' }),
        extractPriceInfo: async () => ({ current: '999', original: '1299', discount: '20%', currency: '¥' }),
        extractSkuInfo: async () => ({ options: [], selected: [] }),
        extractProductDescription: async () => 'Product description',
        extractReviewSummary: async () => ({ count: 100, avgScore: 4.5, goodRate: '98%' }),
        extractSellerInfo: async () => ({ name: 'Official Store', type: '旗舰店', rating: '4.9', location: 'Shanghai' }),
        extractProductImages: async () => [{ src: 'https://example.com/img1.jpg', alt: 'Product', index: 1 }]
      };

      parser.scrollToBottom = async () => {};
      parser.detectDetailPage = async () => true;
      parser.extractProductInfo = async () => ({ title: 'iPhone 15' });
      parser.extractPriceInfo = async () => ({ current: '999' });
      parser.extractSkuInfo = async () => ({ options: [] });
      parser.extractProductDescription = async () => 'desc';
      parser.extractReviewSummary = async () => ({ count: 100 });
      parser.extractSellerInfo = async () => ({ name: 'Store' });
      parser.extractProductImages = async () => [];

      const result = await parser.parse(mockPage, 'https://example.com/item/123');

      expect(result.type).toBe('ecommerce-product');
    });

    test('should detect and parse product list page', async () => {
      const mockPage = {
        evaluate: async () => false,
        scrollToBottom: async () => {},
        detectDetailPage: async () => false,
        extractPageInfo: async () => ({ title: 'Phones' }),
        extractProductList: async () => [{ title: 'Product 1', price: '99', href: '/item/1' }],
        extractFilters: async () => [],
        extractPagination: async () => ({ current: 1, total: 10 })
      };

      parser.scrollToBottom = async () => {};
      parser.detectDetailPage = async () => false;
      parser.extractPageInfo = async () => ({ title: 'Phones' });
      parser.extractProductList = async () => [{ title: 'Product 1' }];
      parser.extractFilters = async () => [];
      parser.extractPagination = async () => ({ current: 1 });

      const result = await parser.parse(mockPage, 'https://example.com/products');

      expect(result.type).toBe('ecommerce-list');
    });

    test('should handle parse errors gracefully', async () => {
      const mockPage = {
        scrollToBottom: async () => { throw new Error('scroll error'); }
      };

      parser.scrollToBottom = async () => { throw new Error('error'); };

      const result = await parser.parse(mockPage, 'https://example.com/item/123');

      expect(result.type).toBe('ecommerce');
    });
  });

  describe('scrollToBottom', () => {
    test('should scroll to bottom', async () => {
      const mockPage = {
        evaluate: async () => {},
        waitForTimeout: async () => {}
      };

      await parser.scrollToBottom(mockPage);
    });

    test('should handle scroll errors', async () => {
      const mockPage = {
        evaluate: async () => { throw new Error('scroll error'); },
        waitForTimeout: async () => {}
      };

      await parser.scrollToBottom(mockPage);
    });
  });

  describe('detectDetailPage', () => {
    test('should detect detail page by URL', async () => {
      const mockPage = {
        evaluate: async (fn, url) => fn(url)
      };

      const result = await parser.detectDetailPage(mockPage, 'https://example.com/item/123');
      expect(result).toBe(true);
    });

    test('should detect detail page by elements', async () => {
      const mockPage = {
        evaluate: async () => true
      };

      const result = await parser.detectDetailPage(mockPage, 'https://example.com/search');
      expect(result).toBe(true);
    });
  });

  describe('extractProductInfo', () => {
    test('should extract product info', async () => {
      const mockPage = {
        evaluate: async () => ({
          title: 'iPhone 15 Pro',
          subtitle: 'Latest model',
          brand: 'Apple',
          category: 'Electronics > Phones'
        })
      };

      const result = await parser.extractProductInfo(mockPage);
      expect(result.title).toBe('iPhone 15 Pro');
      expect(result.brand).toBe('Apple');
    });
  });

  describe('extractPriceInfo', () => {
    test('should extract price info', async () => {
      const mockPage = {
        evaluate: async () => ({
          current: '999',
          original: '1299',
          discount: '23%',
          currency: '¥'
        })
      };

      const result = await parser.extractPriceInfo(mockPage);
      expect(result.current).toBe('999');
      expect(result.original).toBe('1299');
    });
  });
});