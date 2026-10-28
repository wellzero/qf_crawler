class LoginOrchestrationService {
  constructor({ browserManager, loginHandler, logger, config }) {
    this.browserManager = browserManager;
    this.loginHandler = loginHandler;
    this.logger = logger;
    this.config = config;
  }

  async attemptLogin() {
    let page = null;
    try {
      page = await this.browserManager.newPage();

      const targetUrl = this.config.login.loginUrl || this.config.seedUrls[0];
      this.logger.info(`Strategy 1: Visiting target URL: ${targetUrl}`);

      await this.browserManager.goto(page, targetUrl, this.config.crawler.timeout, { forcePlaywright: true });
      await page.waitForTimeout(3000);

      const currentUrl = page.url();
      this.logger.info(`Current URL after navigation: ${currentUrl}`);

      const needsLogin = currentUrl.includes('login') || (await page.locator('input[type="password"]').count()) > 0;

      if (!needsLogin) {
        this.logger.info('Not on login page, looking for login link...');
        const loginLink = page.locator('text=登录').first();
        if (await loginLink.count() > 0) {
          this.logger.info('Found login link, clicking...');
          await loginLink.click();
          await page.waitForTimeout(2000);
        }
      }

      const hasPasswordField = await page.locator('input[type="password"]').count() > 0;

      if (hasPasswordField) {
        this.logger.info('Login form detected, attempting to log in...');
        const success = await this.loginHandler.login(page, {
          username: this.config.login.username,
          password: this.config.login.password
        });

        if (success) {
          this.logger.info('Login successful');
          await page.waitForTimeout(2000);
          await page.close();
          return true;
        }

        this.logger.warn('Login failed on target page');
      } else {
        this.logger.info('No login form found, may already be logged in or page is accessible');
        await page.close();
        return true;
      }

      this.logger.info('Strategy 2: Looking for login link on main page');
      const mainUrl = this.config.seedUrls[0];

      if (!page || page.isClosed()) {
        page = await this.browserManager.newPage();
      }

      await this.browserManager.goto(page, mainUrl, this.config.crawler.timeout, { forcePlaywright: true });
      await page.waitForTimeout(2000);

      const needsLoginNow = await this.loginHandler.needsLogin(page);
      if (needsLoginNow) {
        this.logger.info('Login form found on main page');
        const success = await this.loginHandler.login(page, {
          username: this.config.login.username,
          password: this.config.login.password
        });

        if (success) {
          this.logger.info('Login successful');
          await page.waitForTimeout(2000);
          await page.close();
          return true;
        }
      }

      const loginLinkSelectors = [
        'text=登录',
        'text=登錄',
        'text=Login',
        'text=Sign in',
        'a[href*="login"]',
        'a[href*="signin"]',
        'button:has-text("登录")',
        'button:has-text("登錄")'
      ];

      for (const selector of loginLinkSelectors) {
        try {
          const loginLink = page.locator(selector).first();
          const count = await loginLink.count();
          if (count > 0) {
            this.logger.info(`Found login link with selector: ${selector}`);
            await loginLink.click();
            await page.waitForTimeout(2000);

            const formNeedsLogin = await this.loginHandler.needsLogin(page);
            if (formNeedsLogin) {
              this.logger.info('Login form appeared after clicking link');
              const success = await this.loginHandler.login(page, {
                username: this.config.login.username,
                password: this.config.login.password
              });

              if (success) {
                this.logger.info('Login successful');
                await page.waitForTimeout(2000);
                await page.close();
                return true;
              }
            }
          }
        } catch (error) {
          continue;
        }
      }

      this.logger.info('Strategy 3: Trying common login URL patterns');
      const baseUrl = new URL(mainUrl).origin;
      const commonLoginPaths = [
        '/login',
        '/signin',
        '/user/login',
        '/account/login',
        '/auth/login',
        '/member/login'
      ];

      for (const path of commonLoginPaths) {
        try {
          const loginUrl = baseUrl + path;
          this.logger.info(`Trying: ${loginUrl}`);

          if (!page || page.isClosed()) {
            page = await this.browserManager.newPage();
          }

          await this.browserManager.goto(page, loginUrl, this.config.crawler.timeout, { forcePlaywright: true });
          await page.waitForTimeout(2000);

          const formNeedsLogin = await this.loginHandler.needsLogin(page);
          if (formNeedsLogin) {
            this.logger.info(`Found login form at: ${loginUrl}`);
            const success = await this.loginHandler.login(page, {
              username: this.config.login.username,
              password: this.config.login.password
            });

            if (success) {
              this.logger.info('Login successful');
              await page.waitForTimeout(2000);
              await page.close();
              return true;
            }
          }
        } catch (error) {
          continue;
        }
      }

      if (page && !page.isClosed()) {
        await page.close();
      }
      this.logger.warn('All login strategies failed');
      return false;
    } catch (error) {
      this.logger.error('Error during login attempt', error);
      if (page && !page.isClosed()) {
        try {
          await page.close();
        } catch (e) {
          // Ignore close errors
        }
      }
      return false;
    }
  }
}

export default LoginOrchestrationService;
