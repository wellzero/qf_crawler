import FeatureDetector from '../src/parsers/detectors/feature-detector.js';

describe('FeatureDetector', () => {
  let detector;

  beforeEach(() => {
    detector = new FeatureDetector();
  });

  describe('extract', () => {
    test('should extract page features from context', async () => {
      const mockPage = {
        evaluate: async () => ({
          suggestedType: 'article',
          confidence: 50,
          signals: ['article-like', 'has-publish-time']
        })
      };

      const context = { page: mockPage };
      const result = await detector.extract(context);

      expect(result.pageFeatures).toBeDefined();
      expect(result.pageFeatures.suggestedType).toBe('article');
      expect(result.pageFeatures.confidence).toBe(50);
    });

    test('should handle evaluate errors', async () => {
      const mockPage = {
        evaluate: async () => { throw new Error('evaluate error'); }
      };

      const context = { page: mockPage };
      const result = await detector.extract(context);

      expect(result.pageFeatures.suggestedType).toBe('unknown');
      expect(result.pageFeatures.confidence).toBe(0);
      expect(result.pageFeatures.signals).toEqual([]);
    });
  });

  describe('detectPageFeatures', () => {
    test('should detect portal-like pages', async () => {
      const mockPage = {
        evaluate: async () => ({
          suggestedType: 'portal',
          confidence: 30,
          signals: ['portal-like']
        })
      };

      const result = await detector.detectPageFeatures(mockPage);
      expect(result.suggestedType).toBe('portal');
    });

    test('should detect article pages', async () => {
      const mockPage = {
        evaluate: async () => ({
          suggestedType: 'article',
          confidence: 65,
          signals: ['article-like', 'article-content', 'has-publish-time']
        })
      };

      const result = await detector.detectPageFeatures(mockPage);
      expect(result.suggestedType).toBe('article');
      expect(result.signals).toContain('article-like');
    });

    test('should detect list pages', async () => {
      const mockPage = {
        evaluate: async () => ({
          suggestedType: 'list',
          confidence: 50,
          signals: ['list-like', 'has-pagination']
        })
      };

      const result = await detector.detectPageFeatures(mockPage);
      expect(result.suggestedType).toBe('list');
    });

    test('should detect api-doc pages', async () => {
      const mockPage = {
        evaluate: async () => ({
          suggestedType: 'api-doc',
          confidence: 50,
          signals: ['api-doc-like', 'api-endpoints']
        })
      };

      const result = await detector.detectPageFeatures(mockPage);
      expect(result.suggestedType).toBe('api-doc');
    });

    test('should detect ecommerce pages', async () => {
      const mockPage = {
        evaluate: async () => ({
          suggestedType: 'ecommerce',
          confidence: 40,
          signals: ['ecommerce-like']
        })
      };

      const result = await detector.detectPageFeatures(mockPage);
      expect(result.suggestedType).toBe('ecommerce');
    });

    test('should detect search result pages', async () => {
      const mockPage = {
        evaluate: async () => ({
          suggestedType: 'search-result',
          confidence: 30,
          signals: ['search-result']
        })
      };

      const result = await detector.detectPageFeatures(mockPage);
      expect(result.suggestedType).toBe('search-result');
    });

    test('should return unknown for unrecognized pages', async () => {
      const mockPage = {
        evaluate: async () => ({
          suggestedType: 'unknown',
          confidence: 0,
          signals: []
        })
      };

      const result = await detector.detectPageFeatures(mockPage);
      expect(result.suggestedType).toBe('unknown');
    });

    test('should handle errors gracefully', async () => {
      const mockPage = {
        evaluate: async () => { throw new Error('error'); }
      };

      const result = await detector.detectPageFeatures(mockPage);
      expect(result.suggestedType).toBe('unknown');
      expect(result.confidence).toBe(0);
      expect(result.signals).toEqual([]);
    });
  });
});