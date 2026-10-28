import CrawlerBootstrapService from '../../src/application/crawler-bootstrap-service.js';

describe('CrawlerBootstrapService', () => {
  describe('module structure', () => {
    test('should export CrawlerBootstrapService class', () => {
      expect(CrawlerBootstrapService).toBeDefined();
    });

    test('should be a class/constructor function', () => {
      expect(typeof CrawlerBootstrapService).toBe('function');
    });

    test('should have initialize method on prototype', () => {
      expect(CrawlerBootstrapService.prototype.initialize).toBeDefined();
      expect(typeof CrawlerBootstrapService.prototype.initialize).toBe('function');
    });
  });

  describe('constructor', () => {
    test('should be instantiable without arguments', () => {
      const service = new CrawlerBootstrapService();
      expect(service).toBeInstanceOf(CrawlerBootstrapService);
    });

    test('should create instance with initialize method', () => {
      const service = new CrawlerBootstrapService();
      expect(service.initialize).toBeDefined();
      expect(typeof service.initialize).toBe('function');
    });
  });

  describe('initialize method signature', () => {
    test('should be an async function', () => {
      const service = new CrawlerBootstrapService();
      expect(service.initialize.constructor.name).toBe('AsyncFunction');
    });

    test('should accept config path argument', () => {
      const service = new CrawlerBootstrapService();
      expect(service.initialize.length).toBe(1);
    });
  });
});