import LoginOrchestrationService from '../../src/application/login-orchestration-service.js';
import { jest } from '@jest/globals';

describe('LoginOrchestrationService', () => {
  let mockBrowserManager;
  let mockLoginHandler;
  let mockLogger;
  let mockConfig;
  let mockPage;
  let loginOrchestrationService;

  beforeEach(() => {
    mockPage = {
      url: jest.fn().mockReturnValue('https://example.com'),
      locator: jest.fn().mockReturnValue({
        first: jest.fn().mockReturnThis(),
        count: jest.fn().mockResolvedValue(0),
        click: jest.fn().mockResolvedValue(undefined)
      }),
      waitForTimeout: jest.fn().mockResolvedValue(undefined),
      isClosed: jest.fn().mockReturnValue(false),
      close: jest.fn().mockResolvedValue(undefined)
    };

    mockBrowserManager = {
      newPage: jest.fn().mockResolvedValue(mockPage),
      goto: jest.fn().mockResolvedValue(undefined)
    };

    mockLoginHandler = {
      login: jest.fn().mockResolvedValue(true),
      needsLogin: jest.fn().mockResolvedValue(false)
    };

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    mockConfig = {
      login: {
        loginUrl: 'https://example.com/login',
        username: 'testuser',
        password: 'testpass',
        required: true
      },
      seedUrls: ['https://example.com'],
      crawler: {
        timeout: 30000
      }
    };

    loginOrchestrationService = new LoginOrchestrationService({
      browserManager: mockBrowserManager,
      loginHandler: mockLoginHandler,
      logger: mockLogger,
      config: mockConfig
    });
  });

  describe('constructor', () => {
    test('should initialize with all dependencies', () => {
      expect(loginOrchestrationService.browserManager).toBe(mockBrowserManager);
      expect(loginOrchestrationService.loginHandler).toBe(mockLoginHandler);
      expect(loginOrchestrationService.logger).toBe(mockLogger);
      expect(loginOrchestrationService.config).toBe(mockConfig);
    });
  });

  describe('attemptLogin', () => {
    test('should return true when no password field detected', async () => {
      mockPage.url.mockReturnValue('https://example.com/dashboard');
      mockPage.locator.mockReturnValue({
        first: jest.fn().mockReturnThis(),
        count: jest.fn().mockResolvedValue(0),
        click: jest.fn().mockResolvedValue(undefined)
      });

      const result = await loginOrchestrationService.attemptLogin();

      expect(result).toBe(true);
      expect(mockPage.close).toHaveBeenCalled();
    });

    test('should attempt login when password field detected', async () => {
      mockPage.url.mockReturnValue('https://example.com/login');
      mockPage.locator.mockReturnValue({
        first: jest.fn().mockReturnThis(),
        count: jest.fn().mockResolvedValue(1),
        click: jest.fn().mockResolvedValue(undefined)
      });
      mockLoginHandler.needsLogin.mockResolvedValue(true);
      mockLoginHandler.login.mockResolvedValue(true);

      const result = await loginOrchestrationService.attemptLogin();

      expect(mockLoginHandler.login).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    test('should return false when login fails', async () => {
      mockPage.url.mockReturnValue('https://example.com/login');
      mockPage.locator.mockReturnValue({
        first: jest.fn().mockReturnThis(),
        count: jest.fn().mockResolvedValue(1),
        click: jest.fn().mockResolvedValue(undefined)
      });
      mockLoginHandler.needsLogin.mockResolvedValue(true);
      mockLoginHandler.login.mockResolvedValue(false);

      const result = await loginOrchestrationService.attemptLogin();

      expect(result).toBe(false);
    });

    test('should handle browser error gracefully', async () => {
      mockBrowserManager.newPage.mockRejectedValue(new Error('Browser error'));

      const result = await loginOrchestrationService.attemptLogin();

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    test('should close page on error', async () => {
      mockBrowserManager.goto.mockRejectedValue(new Error('Navigation error'));

      const result = await loginOrchestrationService.attemptLogin();

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    test('should create new page at start', async () => {
      mockPage.locator.mockReturnValue({
        first: jest.fn().mockReturnThis(),
        count: jest.fn().mockResolvedValue(0),
        click: jest.fn().mockResolvedValue(undefined)
      });

      await loginOrchestrationService.attemptLogin();

      expect(mockBrowserManager.newPage).toHaveBeenCalled();
    });

    test('should close page on success', async () => {
      mockPage.locator.mockReturnValue({
        first: jest.fn().mockReturnThis(),
        count: jest.fn().mockResolvedValue(0),
        click: jest.fn().mockResolvedValue(undefined)
      });
      mockPage.url.mockReturnValue('https://example.com/dashboard');

      await loginOrchestrationService.attemptLogin();

      expect(mockPage.close).toHaveBeenCalled();
    });

    test('should use loginUrl from config', async () => {
      mockPage.locator.mockReturnValue({
        first: jest.fn().mockReturnThis(),
        count: jest.fn().mockResolvedValue(0),
        click: jest.fn().mockResolvedValue(undefined)
      });

      await loginOrchestrationService.attemptLogin();

      expect(mockBrowserManager.goto).toHaveBeenCalledWith(
        mockPage,
        'https://example.com/login',
        30000,
        { forcePlaywright: true }
      );
    });

    test('should use seedUrls[0] when loginUrl not defined', async () => {
      mockConfig.login.loginUrl = undefined;
      mockPage.locator.mockReturnValue({
        first: jest.fn().mockReturnThis(),
        count: jest.fn().mockResolvedValue(0),
        click: jest.fn().mockResolvedValue(undefined)
      });

      await loginOrchestrationService.attemptLogin();

      expect(mockBrowserManager.goto).toHaveBeenCalledWith(
        mockPage,
        'https://example.com',
        30000,
        { forcePlaywright: true }
      );
    });

    test('should pass timeout from config', async () => {
      mockPage.locator.mockReturnValue({
        first: jest.fn().mockReturnThis(),
        count: jest.fn().mockResolvedValue(0),
        click: jest.fn().mockResolvedValue(undefined)
      });

      await loginOrchestrationService.attemptLogin();

      expect(mockBrowserManager.goto).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        30000,
        expect.anything()
      );
    });

    test('should handle page close error gracefully', async () => {
      mockPage.locator.mockReturnValue({
        first: jest.fn().mockReturnThis(),
        count: jest.fn().mockResolvedValue(0),
        click: jest.fn().mockResolvedValue(undefined)
      });
      mockPage.url.mockReturnValue('https://example.com/dashboard');
      mockPage.close.mockRejectedValue(new Error('Close error'));

      const result = await loginOrchestrationService.attemptLogin();

      expect(mockLogger.error).toHaveBeenCalled();
    });

    test('should close already closed page', async () => {
      mockPage.isClosed.mockReturnValue(true);
      mockPage.locator.mockReturnValue({
        first: jest.fn().mockReturnThis(),
        count: jest.fn().mockResolvedValue(0),
        click: jest.fn().mockResolvedValue(undefined)
      });

      await loginOrchestrationService.attemptLogin();

      expect(mockPage.close).toHaveBeenCalled();
    });
  });
});