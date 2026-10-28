import BrowserCrawlProcessor from '../../src/application/browser-crawl-processor.js';
import { jest } from '@jest/globals';

describe('BrowserCrawlProcessor', () => {
  let mockBrowserManager;
  let mockLoginHandler;
  let mockConfig;
  let mockLogger;
  let mockLinkFinder;
  let mockPageParser;
  let mockMarkdownGenerator;
  let mockStatsTracker;
  let mockPageStorage;
  let mockLLMDataExtractor;
  let mockUrlProcessingService;
  let mockMetricsAdapter;
  let mockDiscoverAndStoreLinks;
  let mockSaveTablesAsCsv;
  let mockLogError;
  let mockPage;
  let browserCrawlProcessor;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockPage = {
      url: jest.fn().mockReturnValue('https://example.com/page'),
      locator: jest.fn().mockReturnValue({
        count: jest.fn().mockResolvedValue(0)
      }),
      evaluate: jest.fn().mockResolvedValue('Page Title'),
      waitForTimeout: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      isClosed: jest.fn().mockReturnValue(false)
    };

    mockBrowserManager = {
      launch: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      newPage: jest.fn().mockResolvedValue(mockPage),
      goto: jest.fn().mockResolvedValue(undefined),
      waitForLoad: jest.fn().mockResolvedValue(undefined)
    };
    
    mockLoginHandler = {
      login: jest.fn().mockResolvedValue(true),
      needsLogin: jest.fn().mockResolvedValue(false)
    };

    mockConfig = {
      crawler: {
        headless: true,
        userDataDir: '/tmp/user-data',
        ignoreHTTPSErrors: false,
        fetchMethod: 'playwright',
        timeout: 30000,
        maxRetries: 3,
        logLevel: 'INFO'
      },
      login: {
        required: false,
        username: 'user',
        password: 'pass',
        loginUrl: 'https://example.com/login'
      },
      seedUrls: ['https://example.com'],
      parser: { mode: 'default' },
      output: { directory: '/tmp/output' },
      name: 'test-crawler'
    };

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      success: jest.fn(),
      debug: jest.fn()
    };

    mockLinkFinder = {
      expandCollapsibles: jest.fn().mockResolvedValue(undefined)
    };

    mockPageParser = {
      parsePage: jest.fn().mockResolvedValue({
        title: 'Test Page',
        type: 'article',
        tables: [],
        codeBlocks: [],
        paragraphs: []
      })
    };

    mockMarkdownGenerator = {
      safeFilename: jest.fn().mockReturnValue('test-page'),
      generate: jest.fn().mockReturnValue('# Test Page'),
      saveToFile: jest.fn().mockReturnValue('/tmp/pages/test-page.md')
    };

    mockStatsTracker = {
      incrementFilesGenerated: jest.fn()
    };

    mockPageStorage = {
      persistMarkdown: jest.fn().mockResolvedValue('/tmp/pages/test-page.md'),
      isLanceDb: jest.fn().mockReturnValue(false)
    };

    mockLLMDataExtractor = {
      isEnabled: jest.fn().mockReturnValue(false),
      extract: jest.fn().mockResolvedValue(null)
    };

    mockUrlProcessingService = {
      markFetched: jest.fn(),
      handleFailure: jest.fn()
    };

    mockMetricsAdapter = {
      increment: jest.fn()
    };

    mockDiscoverAndStoreLinks = jest.fn().mockResolvedValue(undefined);
    mockSaveTablesAsCsv = jest.fn().mockResolvedValue([]);
    mockLogError = jest.fn();

    browserCrawlProcessor = new BrowserCrawlProcessor({
      config: mockConfig,
      logger: mockLogger,
      linkFinder: mockLinkFinder,
      pageParser: mockPageParser,
      markdownGenerator: mockMarkdownGenerator,
      pagesDir: '/tmp/pages',
      statsTracker: mockStatsTracker,
      pageStorage: mockPageStorage,
      llmDataExtractor: mockLLMDataExtractor,
      urlProcessingService: mockUrlProcessingService,
      metricsAdapter: mockMetricsAdapter,
      discoverAndStoreLinks: mockDiscoverAndStoreLinks,
      saveTablesAsCsv: mockSaveTablesAsCsv,
      logError: mockLogError
    });

    browserCrawlProcessor.browserManager = mockBrowserManager;
    browserCrawlProcessor.loginHandler = mockLoginHandler;
  });

  describe('constructor', () => {
    test('should initialize with all options', () => {
      expect(browserCrawlProcessor.config).toBe(mockConfig);
      expect(browserCrawlProcessor.logger).toBe(mockLogger);
      expect(browserCrawlProcessor.linkFinder).toBe(mockLinkFinder);
      expect(browserCrawlProcessor.pageParser).toBe(mockPageParser);
      expect(browserCrawlProcessor.markdownGenerator).toBe(mockMarkdownGenerator);
      expect(browserCrawlProcessor.pagesDir).toBe('/tmp/pages');
      expect(browserCrawlProcessor.statsTracker).toBe(mockStatsTracker);
      expect(browserCrawlProcessor.pageStorage).toBe(mockPageStorage);
      expect(browserCrawlProcessor.llmDataExtractor).toBe(mockLLMDataExtractor);
      expect(browserCrawlProcessor.urlProcessingService).toBe(mockUrlProcessingService);
      expect(browserCrawlProcessor.metricsAdapter).toBe(mockMetricsAdapter);
      expect(browserCrawlProcessor.discoverAndStoreLinks).toBe(mockDiscoverAndStoreLinks);
      expect(browserCrawlProcessor.saveTablesAsCsv).toBe(mockSaveTablesAsCsv);
      expect(browserCrawlProcessor.logError).toBe(mockLogError);
    });

    test('should initialize isLoggedIn as false', () => {
      expect(browserCrawlProcessor.isLoggedIn).toBe(false);
    });
  });

  describe('launch', () => {
    test('should call browserManager.launch with config options', async () => {
      await browserCrawlProcessor.launch();

      expect(mockBrowserManager.launch).toHaveBeenCalledWith({
        headless: true,
        userDataDir: '/tmp/user-data',
        ignoreHTTPSErrors: false,
        fetchMethod: 'playwright'
      });
    });

    test('should pass ignoreHTTPSErrors as true when configured', async () => {
      browserCrawlProcessor.config.crawler.ignoreHTTPSErrors = true;

      await browserCrawlProcessor.launch();

      expect(mockBrowserManager.launch).toHaveBeenCalledWith(
        expect.objectContaining({ ignoreHTTPSErrors: true })
      );
    });

    test('should use default fetchMethod when not specified', async () => {
      browserCrawlProcessor.config.crawler.fetchMethod = undefined;

      await browserCrawlProcessor.launch();

      expect(mockBrowserManager.launch).toHaveBeenCalledWith(
        expect.objectContaining({ fetchMethod: 'playwright' })
      );
    });
  });

  describe('close', () => {
    test('should call browserManager.close', async () => {
      await browserCrawlProcessor.close();

      expect(mockBrowserManager.close).toHaveBeenCalled();
    });
  });

  describe('attemptInitialLogin', () => {
    test('should return true when login not required', async () => {
      browserCrawlProcessor.config.login.required = false;

      const result = await browserCrawlProcessor.attemptInitialLogin();

      expect(result).toBe(true);
      expect(mockBrowserManager.newPage).not.toHaveBeenCalled();
    });

    test('should attempt login when login is required', async () => {
      browserCrawlProcessor.config.login.required = true;
      mockPage.url.mockReturnValue('https://example.com/login');
      mockPage.locator.mockReturnValue({
        count: jest.fn().mockResolvedValue(1)
      });
      mockLoginHandler.needsLogin.mockResolvedValue(true);
      mockLoginHandler.login.mockResolvedValue(true);

      const result = await browserCrawlProcessor.attemptInitialLogin();

      expect(mockBrowserManager.newPage).toHaveBeenCalled();
      expect(mockLoginHandler.login).toHaveBeenCalled();
      expect(browserCrawlProcessor.isLoggedIn).toBe(true);
      expect(result).toBe(true);
    });

    test('should return false when login strategies fail', async () => {
      browserCrawlProcessor.config.login.required = true;
      mockPage.url.mockReturnValue('https://example.com');
      mockPage.locator.mockReturnValue({
        count: jest.fn().mockResolvedValue(0)
      });
      mockLoginHandler.needsLogin.mockResolvedValue(false);

      const result = await browserCrawlProcessor.attemptInitialLogin();

      expect(result).toBe(false);
    });

    test('should handle browser errors', async () => {
      browserCrawlProcessor.config.login.required = true;
      mockBrowserManager.newPage.mockRejectedValue(new Error('Browser error'));

      const result = await browserCrawlProcessor.attemptInitialLogin();

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    test('should close page on error', async () => {
      browserCrawlProcessor.config.login.required = true;
      mockBrowserManager.goto.mockRejectedValue(new Error('Navigation error'));

      const result = await browserCrawlProcessor.attemptInitialLogin();

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('processUrl', () => {
    beforeEach(() => {
      browserCrawlProcessor.config.login.required = false;
    });

    test('should process URL successfully', async () => {
      const url = 'https://example.com/page';
      mockPageParser.parsePage.mockResolvedValue({
        title: 'Test Page',
        type: 'article',
        tables: []
      });

      const result = await browserCrawlProcessor.processUrl(url);

      expect(result).toBe(true);
      expect(mockBrowserManager.newPage).toHaveBeenCalled();
      expect(mockBrowserManager.goto).toHaveBeenCalled();
      expect(mockLinkFinder.expandCollapsibles).toHaveBeenCalled();
      expect(mockDiscoverAndStoreLinks).toHaveBeenCalled();
      expect(mockPageParser.parsePage).toHaveBeenCalled();
      expect(mockStatsTracker.incrementFilesGenerated).toHaveBeenCalled();
      expect(mockUrlProcessingService.markFetched).toHaveBeenCalledWith(url);
      expect(mockMetricsAdapter.increment).toHaveBeenCalledWith('crawl_success_total');
      expect(mockPage.close).toHaveBeenCalled();
    });

    test('should handle login requirement during URL processing', async () => {
      const url = 'https://example.com/page';
      browserCrawlProcessor.config.login.required = true;
      browserCrawlProcessor.isLoggedIn = false;
      mockLoginHandler.needsLogin.mockResolvedValue(true);
      mockLoginHandler.login.mockResolvedValue(true);

      mockPageParser.parsePage.mockResolvedValue({
        title: 'Test Page',
        type: 'article'
      });

      const result = await browserCrawlProcessor.processUrl(url);

      expect(mockLoginHandler.needsLogin).toHaveBeenCalled();
      expect(mockLoginHandler.login).toHaveBeenCalled();
      expect(browserCrawlProcessor.isLoggedIn).toBe(true);
      expect(result).toBe(true);
    });

    test('should skip expandCollapsibles in request mode', async () => {
      browserCrawlProcessor.config.crawler.fetchMethod = 'request';

      mockPageParser.parsePage.mockResolvedValue({
        title: 'Test Page',
        type: 'article'
      });

      await browserCrawlProcessor.processUrl('https://example.com/page');

      expect(mockLinkFinder.expandCollapsibles).not.toHaveBeenCalled();
    });

    test('should handle table-only pages', async () => {
      mockPageParser.parsePage.mockResolvedValue({
        title: 'Data Table',
        type: 'table-only',
        tables: [{ headers: ['A', 'B'], rows: [['1', '2']] }]
      });
      mockSaveTablesAsCsv.mockResolvedValue(['/tmp/table.csv']);

      const result = await browserCrawlProcessor.processUrl('https://example.com/data');

      expect(mockSaveTablesAsCsv).toHaveBeenCalled();
      expect(mockLogger.success).toHaveBeenCalledWith(expect.stringContaining('CSV'));
      expect(result).toBe(true);
    });

    test('should handle LLM extraction when enabled', async () => {
      mockLLMDataExtractor.isEnabled.mockReturnValue(true);
      mockLLMDataExtractor.extract.mockResolvedValue({
        model: 'gpt-4',
        records: [{ name: 'value' }]
      });

      mockPageParser.parsePage.mockResolvedValue({
        title: 'Test Page',
        type: 'article'
      });

      await browserCrawlProcessor.processUrl('https://example.com/page');

      expect(mockLLMDataExtractor.extract).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('LLM'));
    });

    test('should handle URL processing errors', async () => {
      const url = 'https://example.com/error';
      mockBrowserManager.newPage.mockRejectedValue(new Error('Network error'));

      const result = await browserCrawlProcessor.processUrl(url);

      expect(result).toBe(false);
      expect(mockLogError).toHaveBeenCalled();
      expect(mockUrlProcessingService.handleFailure).toHaveBeenCalledWith(url, expect.any(Error));
      expect(mockMetricsAdapter.increment).toHaveBeenCalledWith('crawl_failed_total');
    });

    test('should handle page parse errors', async () => {
      const url = 'https://example.com/page';
      mockPageParser.parsePage.mockRejectedValue(new Error('Parse error'));

      const result = await browserCrawlProcessor.processUrl(url);

      expect(result).toBe(false);
      expect(mockLogError).toHaveBeenCalled();
      expect(mockUrlProcessingService.handleFailure).toHaveBeenCalled();
    });

    test('should log duration after processing', async () => {
      mockPageParser.parsePage.mockResolvedValue({
        title: 'Test Page',
        type: 'article'
      });

      await browserCrawlProcessor.processUrl('https://example.com/page');

      expect(mockLogger.success).toHaveBeenCalledWith(
        expect.stringMatching(/\(\d+\.\d+s\)/)
      );
    });

    test('should handle onDataChunk callback', async () => {
      mockPageParser.parsePage.mockImplementation(async (page, url, options) => {
        if (options.onDataChunk) {
          await options.onDataChunk({
            type: 'table',
            isFirstPage: true,
            tableIndex: 0,
            page: 1,
            headers: ['Header'],
            rows: [['Data']],
            precedingContent: []
          });
        }
        return { title: 'Test', type: 'article' };
      });

      await browserCrawlProcessor.processUrl('https://example.com/page');

      expect(mockPageParser.parsePage).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ onDataChunk: expect.any(Function) })
      );
    });
  });

  describe('integration scenarios', () => {
    test('should complete full crawl cycle', async () => {
      browserCrawlProcessor.config.login.required = false;
      
      await browserCrawlProcessor.launch();
      await browserCrawlProcessor.attemptInitialLogin();
      
      mockPageParser.parsePage.mockResolvedValue({
        title: 'Test Page',
        type: 'article'
      });
      
      const result = await browserCrawlProcessor.processUrl('https://example.com/page');
      
      await browserCrawlProcessor.close();

      expect(result).toBe(true);
      expect(mockBrowserManager.launch).toHaveBeenCalled();
      expect(mockBrowserManager.close).toHaveBeenCalled();
    });

    test('should handle multiple URLs', async () => {
      browserCrawlProcessor.config.login.required = false;
      
      mockPageParser.parsePage.mockResolvedValue({
        title: 'Test Page',
        type: 'article'
      });

      await browserCrawlProcessor.processUrl('https://example.com/page1');
      await browserCrawlProcessor.processUrl('https://example.com/page2');

      expect(mockUrlProcessingService.markFetched).toHaveBeenCalledTimes(2);
      expect(mockStatsTracker.incrementFilesGenerated).toHaveBeenCalledTimes(2);
    });
  });
});