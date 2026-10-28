import BrowserManager from '../browser-manager.js';
import LoginHandler from '../login-handler.js';

/**
 * BrowserCrawlProcessor
 *
 * Encapsulates browser lifecycle, login orchestration and per-URL crawling process.
 */
class BrowserCrawlProcessor {
  constructor(options) {
    this.config = options.config;
    this.logger = options.logger;
    this.linkFinder = options.linkFinder;
    this.pageParser = options.pageParser;
    this.markdownGenerator = options.markdownGenerator;
    this.pagesDir = options.pagesDir;
    this.statsTracker = options.statsTracker;
    this.pageStorage = options.pageStorage;
    this.llmDataExtractor = options.llmDataExtractor;
    this.urlProcessingService = options.urlProcessingService;
    this.metricsAdapter = options.metricsAdapter;
    this.discoverAndStoreLinks = options.discoverAndStoreLinks;
    this.saveTablesAsCsv = options.saveTablesAsCsv;
    this.logError = options.logError;

    this.browserManager = new BrowserManager();
    this.loginHandler = new LoginHandler();
    this.isLoggedIn = false;
  }

  async launch() {
    await this.browserManager.launch({
      headless: this.config.crawler.headless,
      userDataDir: this.config.crawler.userDataDir,
      ignoreHTTPSErrors: this.config.crawler.ignoreHTTPSErrors === true,
      fetchMethod: this.config.crawler.fetchMethod || 'playwright'
    });
  }

  async close() {
    await this.browserManager.close();
  }

  async attemptInitialLogin() {
    if (!this.config.login.required) {
      return true;
    }

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
          this.isLoggedIn = true;
          await page.waitForTimeout(2000);
          await page.close();
          return true;
        }

        this.logger.warn('Login failed on target page');
      } else {
        this.logger.info('No login form found, may already be logged in or page is accessible');
        this.isLoggedIn = true;
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
          this.isLoggedIn = true;
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

            const needsLoginAfterClick = await this.loginHandler.needsLogin(page);
            if (needsLoginAfterClick) {
              this.logger.info('Login form appeared after clicking link');
              const success = await this.loginHandler.login(page, {
                username: this.config.login.username,
                password: this.config.login.password
              });

              if (success) {
                this.logger.info('Login successful');
                this.isLoggedIn = true;
                await page.waitForTimeout(2000);
                await page.close();
                return true;
              }
            }
          }
        } catch {
          continue;
        }
      }

      this.logger.info('Strategy 3: Trying common login URL patterns');
      const baseUrl = new URL(mainUrl).origin;
      const commonLoginPaths = ['/login', '/signin', '/user/login', '/account/login', '/auth/login', '/member/login'];

      for (const path of commonLoginPaths) {
        try {
          const loginUrl = baseUrl + path;
          this.logger.info(`Trying: ${loginUrl}`);

          if (!page || page.isClosed()) {
            page = await this.browserManager.newPage();
          }

          await this.browserManager.goto(page, loginUrl, this.config.crawler.timeout, { forcePlaywright: true });
          await page.waitForTimeout(2000);

          const needsLoginAtPath = await this.loginHandler.needsLogin(page);
          if (needsLoginAtPath) {
            this.logger.info(`Found login form at: ${loginUrl}`);
            const success = await this.loginHandler.login(page, {
              username: this.config.login.username,
              password: this.config.login.password
            });

            if (success) {
              this.logger.info('Login successful');
              this.isLoggedIn = true;
              await page.waitForTimeout(2000);
              await page.close();
              return true;
            }
          }
        } catch {
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
        } catch {
          // ignore
        }
      }
      return false;
    }
  }

  async processUrl(url) {
    const startTime = Date.now();

    try {
      this.logger.info(`Processing: ${url}`);
      const page = await this.browserManager.newPage();

      await this.browserManager.goto(page, url, this.config.crawler.timeout);
      this.logger.info(`Loaded: ${url}`);

      if (this.config.login.required && !this.isLoggedIn) {
        const needsLogin = await this.loginHandler.needsLogin(page);
        if (needsLogin) {
          this.logger.info('Login required on this page, attempting to log in...');
          const loginSuccess = await this.loginHandler.login(page, {
            username: this.config.login.username,
            password: this.config.login.password
          });

          if (loginSuccess) {
            this.logger.info('Login successful');
            this.isLoggedIn = true;
            if (page.url() !== url) {
              await this.browserManager.goto(page, url, this.config.crawler.timeout);
            }
          } else {
            this.logger.warn('Login failed on this page');
          }
        }
      }

      await this.browserManager.waitForLoad(page, this.config.crawler.timeout);
      
      // If we're in request mode, we can optionally skip some JS-heavy wait logic in linkFinder
      if (this.config.crawler.fetchMethod !== 'request') {
        await this.linkFinder.expandCollapsibles(page);
      }
      
      await this.discoverAndStoreLinks(page);

      let filename = null;
      let filepath = null;
      let isFirstChunk = true;
      const pageTitle = await page.evaluate(() => document.title || '');

      const fs = await import('fs');
      const crypto = await import('crypto');

      filename = this.markdownGenerator.safeFilename(pageTitle || 'untitled', url);
      filepath = `${this.pagesDir}/${filename}.md`;

      if (fs.existsSync(filepath)) {
        const urlHash = crypto.createHash('md5').update(url).digest('hex').substring(0, 8);
        filename = `${filename}_${urlHash}`;
        filepath = `${this.pagesDir}/${filename}.md`;
      }

      const onDataChunk = async (chunk) => {
        try {
          const localFs = await import('fs');

          if (isFirstChunk) {
            const header = `# ${pageTitle || 'Untitled'}\n\n## 源URL\n\n${url}\n\n`;
            localFs.writeFileSync(filepath, header, 'utf-8');
            isFirstChunk = false;
          }

          if (chunk.type === 'table') {
            if (chunk.isFirstPage) {
              let tableContent = '\n';

              // 输出表格前的标题和说明文字
              if (chunk.precedingContent && chunk.precedingContent.length > 0) {
                chunk.precedingContent.forEach(item => {
                  if (item.type === 'heading') {
                    tableContent += `${'#'.repeat(item.level)} ${item.content}\n\n`;
                  } else if (item.type === 'paragraph') {
                    tableContent += `${item.content}\n\n`;
                  }
                });
              }

              tableContent += `## 表格 ${chunk.tableIndex + 1}\n\n`;
              if (chunk.headers && chunk.headers.length > 0) {
                tableContent += '| ' + chunk.headers.join(' | ') + ' |\n';
                tableContent += '| ' + chunk.headers.map(() => '---').join(' | ') + ' |\n';
              }
              if (chunk.rows && chunk.rows.length > 0) {
                chunk.rows.forEach(row => {
                  tableContent += '| ' + row.join(' | ') + ' |\n';
                });
              }
              localFs.appendFileSync(filepath, tableContent, 'utf-8');
              this.logger.debug(`Appended table ${chunk.tableIndex + 1}, page ${chunk.page}`);
            } else if (!chunk.isLastPage && chunk.rows && chunk.rows.length > 0) {
              let rowsContent = '';
              chunk.rows.forEach(row => {
                rowsContent += '| ' + row.join(' | ') + ' |\n';
              });
              localFs.appendFileSync(filepath, rowsContent, 'utf-8');
              this.logger.debug(`Appended ${chunk.rows.length} rows to table ${chunk.tableIndex + 1}, page ${chunk.page}`);
            }
          } else if (chunk.type === 'table-new') {
            let tableContent = `\n## 表格 ${chunk.tableIndex + 1} (结构变化)\n\n`;
            if (chunk.headers && chunk.headers.length > 0) {
              tableContent += '| ' + chunk.headers.join(' | ') + ' |\n';
              tableContent += '| ' + chunk.headers.map(() => '---').join(' | ') + ' |\n';
            }
            if (chunk.rows && chunk.rows.length > 0) {
              chunk.rows.forEach(row => {
                tableContent += '| ' + row.join(' | ') + ' |\n';
              });
            }
            localFs.appendFileSync(filepath, tableContent, 'utf-8');
            this.logger.info(`Started new table ${chunk.tableIndex + 1} due to structure change`);
          } else if (chunk.type === 'tab') {
            let tabContent = `\n## Tab页: ${chunk.name}\n\n`;
            if (chunk.data.paragraphs && chunk.data.paragraphs.length > 0) {
              chunk.data.paragraphs.forEach(p => {
                if (p.trim()) tabContent += p + '\n\n';
              });
            }
            if (chunk.data.lists && chunk.data.lists.length > 0) {
              chunk.data.lists.forEach(list => {
                list.items.forEach((item, i) => {
                  tabContent += list.type === 'ol' ? `${i + 1}. ${item}\n` : `- ${item}\n`;
                });
                tabContent += '\n';
              });
            }
            if (chunk.data.tables && chunk.data.tables.length > 0) {
              chunk.data.tables.forEach(table => {
                if (table.headers && table.headers.length > 0) {
                  tabContent += '| ' + table.headers.join(' | ') + ' |\n';
                  tabContent += '| ' + table.headers.map(() => '---').join(' | ') + ' |\n';
                  if (table.rows && table.rows.length > 0) {
                    table.rows.forEach(row => {
                      tabContent += '| ' + row.join(' | ') + ' |\n';
                    });
                  }
                  tabContent += '\n';
                }
              });
            }
            if (chunk.data.codeBlocks && chunk.data.codeBlocks.length > 0) {
              chunk.data.codeBlocks.forEach(block => {
                tabContent += `\`\`\`${block.language}\n${block.code}\n\`\`\`\n\n`;
              });
            }
            localFs.appendFileSync(filepath, tabContent, 'utf-8');
            this.logger.debug(`Appended tab content: ${chunk.name}`);
          } else if (chunk.type === 'dropdown-option') {
            let dropdownContent = `\n## 下拉框: ${chunk.dropdown} - 选项: ${chunk.option}\n\n`;
            if (chunk.data.paragraphs && chunk.data.paragraphs.length > 0) {
              chunk.data.paragraphs.forEach(p => {
                if (p.trim()) dropdownContent += p + '\n\n';
              });
            }
            if (chunk.data.lists && chunk.data.lists.length > 0) {
              chunk.data.lists.forEach(list => {
                list.items.forEach((item, i) => {
                  dropdownContent += list.type === 'ol' ? `${i + 1}. ${item}\n` : `- ${item}\n`;
                });
                dropdownContent += '\n';
              });
            }
            if (chunk.data.tables && chunk.data.tables.length > 0) {
              chunk.data.tables.forEach(table => {
                if (table.headers && table.headers.length > 0) {
                  dropdownContent += '| ' + table.headers.join(' | ') + ' |\n';
                  dropdownContent += '| ' + table.headers.map(() => '---').join(' | ') + ' |\n';
                  if (table.rows && table.rows.length > 0) {
                    table.rows.forEach(row => {
                      dropdownContent += '| ' + row.join(' | ') + ' |\n';
                    });
                  }
                  dropdownContent += '\n';
                }
              });
            }
            if (chunk.data.codeBlocks && chunk.data.codeBlocks.length > 0) {
              chunk.data.codeBlocks.forEach(block => {
                dropdownContent += `\`\`\`${block.language}\n${block.code}\n\`\`\`\n\n`;
              });
            }
            localFs.appendFileSync(filepath, dropdownContent, 'utf-8');
            this.logger.debug(`Appended dropdown option: ${chunk.dropdown} - ${chunk.option}`);
          } else if (chunk.type === 'date-filter') {
            let dateFilterContent = `\n## 时间筛选: ${chunk.range}\n\n`;
            dateFilterContent += `时间范围: ${chunk.startDate} 至 ${chunk.endDate}\n\n`;
            if (chunk.tables && chunk.tables.length > 0) {
              chunk.tables.forEach((table, idx) => {
                dateFilterContent += `### 表格 ${idx + 1}\n\n`;
                if (table.headers && table.headers.length > 0) {
                  dateFilterContent += '| ' + table.headers.join(' | ') + ' |\n';
                  dateFilterContent += '| ' + table.headers.map(() => '---').join(' | ') + ' |\n';
                  if (table.rows && table.rows.length > 0) {
                    table.rows.forEach(row => {
                      dateFilterContent += '| ' + row.join(' | ') + ' |\n';
                    });
                  }
                  dateFilterContent += '\n';
                }
              });
            }
            localFs.appendFileSync(filepath, dateFilterContent, 'utf-8');
            this.logger.debug(`Appended date filter data: ${chunk.range}`);
          }
        } catch (error) {
          this.logger.error(`Failed to write data chunk: ${error.message}`);
        }
      };

      const pageData = await this.pageParser.parsePage(page, url, {
        onDataChunk,
        filepath,
        pagesDir: this.pagesDir,
        parserMode: this.config.parser?.mode
      });
      this.logger.info(`Parsed page: ${pageData.title || 'Untitled'}`);

      if (this.llmDataExtractor?.isEnabled()) {
        const llmExtraction = await this.llmDataExtractor.extract(pageData, { url });
        if (llmExtraction) {
          pageData.llmExtraction = llmExtraction;
          this.logger.info(`LLM数据抽取完成: ${llmExtraction.records.length} 条记录`);
        }
      }

      if (pageData.type === 'table-only') {
        const savedCsvFiles = await this.saveTablesAsCsv(pageData, url);
        this.logger.info(`Saved ${savedCsvFiles.length} CSV file(s) for table-only page`);
      } else if (isFirstChunk) {
        const markdown = this.markdownGenerator.generate(pageData);
        filename = this.markdownGenerator.safeFilename(pageData.title || 'untitled', url);

        filepath = `${this.pagesDir}/${filename}.md`;
        if (fs.existsSync(filepath)) {
          const duplicateHash = crypto.createHash('md5').update(url).digest('hex').substring(0, 8);
          filename = `${filename}_${duplicateHash}`;
          this.logger.info(`File exists, using unique filename: ${filename}.md`);
        }

        filepath = this.markdownGenerator.saveToFile(markdown, filename, this.pagesDir);
      }

      if (pageData.llmExtraction && filepath) {
        const llmSection = `\n## LLM结构化抽取\n\n模型: ${pageData.llmExtraction.model}\n\n\`\`\`json\n${JSON.stringify(pageData.llmExtraction, null, 2)}\n\`\`\`\n`;
        fs.appendFileSync(filepath, llmSection, 'utf-8');
      }

      if (pageData.type !== 'table-only' && filepath) {
        const savedPath = await this.pageStorage.persistMarkdown({
          filepath,
          url,
          title: pageData.title || pageTitle,
          filename
        });

        if (this.pageStorage.isLanceDb()) {
          this.logger.info(`Persisted page content to ${savedPath}`);
        }
      }

      this.statsTracker.incrementFilesGenerated();

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      if (pageData.type === 'table-only') {
        this.logger.success(`Saved table CSV output (${duration}s)`);
      } else {
        this.logger.success(`Saved: ${filename}.md (${duration}s)`);
      }

      await page.close();
      this.urlProcessingService.markFetched(url);
      this.metricsAdapter.increment('crawl_success_total');
      return true;
    } catch (error) {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      this.logError(url, error, duration);
      this.urlProcessingService.handleFailure(url, error);
      this.metricsAdapter.increment('crawl_failed_total');
      return false;
    }
  }
}

export default BrowserCrawlProcessor;
