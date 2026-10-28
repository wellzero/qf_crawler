/**
 * Tests for Login Handler Module
 * 
 * Includes both property-based tests and unit tests for login detection and handling.
 */

import fc from 'fast-check';
import LoginHandler from '../src/login-handler.js';

describe('LoginHandler', () => {
  let loginHandler;

  beforeEach(() => {
    loginHandler = new LoginHandler();
  });

  // ============================================================================
  // PROPERTY-BASED TESTS
  // ============================================================================

  describe('Property 9: 登录表单检测准确性', () => {
    /**
     * **Validates: Requirements 3.1**
     * 
     * Property: For any HTML page containing a password input field and a submit button,
     * the Login Handler should correctly identify it as a login page.
     */
    test('should detect login forms with password fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            hasPasswordField: fc.constant(true),
            buttonText: fc.constantFrom('登录', '登錄', 'Login', 'Sign in', '提交'),
            usernameFieldType: fc.constantFrom('text', 'tel', 'email'),
            urlPath: fc.constantFrom('/login', '/signin', '/auth', '/account')
          }),
          async ({ hasPasswordField, buttonText, usernameFieldType, urlPath }) => {
            // Generate HTML with login form
            const html = `
              <!DOCTYPE html>
              <html>
              <head><title>Login Page</title></head>
              <body>
                <form>
                  <input type="${usernameFieldType}" name="username" placeholder="用户名" />
                  <input type="password" name="password" placeholder="密码" />
                  <button type="submit">${buttonText}</button>
                </form>
              </body>
              </html>
            `;

            // Create mock page object
            const mockPage = createMockPage(html, `https://example.com${urlPath}`);

            // Test: Should detect as login page
            const needsLogin = await loginHandler.needsLogin(mockPage);
            expect(needsLogin).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    test('should not detect non-login pages as login pages', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            hasPasswordField: fc.constant(false),
            urlPath: fc.constantFrom('/home', '/about', '/products', '/contact')
          }),
          async ({ hasPasswordField, urlPath }) => {
            // Generate HTML without login form
            const html = `
              <!DOCTYPE html>
              <html>
              <head><title>Regular Page</title></head>
              <body>
                <h1>Welcome</h1>
                <p>This is a regular page without login form.</p>
                <form>
                  <input type="text" name="search" placeholder="Search" />
                  <button type="submit">Search</button>
                </form>
              </body>
              </html>
            `;

            // Create mock page object
            const mockPage = createMockPage(html, `https://example.com${urlPath}`);

            // Test: Should NOT detect as login page
            const needsLogin = await loginHandler.needsLogin(mockPage);
            expect(needsLogin).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 10: 多格式登录表单识别', () => {
    /**
     * **Validates: Requirements 3.3**
     * 
     * Property: For any login form using different input field types (phone, email, username),
     * the Login Handler should correctly identify and locate the username input field.
     */
    test('should recognize username fields with different placeholders', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            placeholder: fc.constantFrom(
              '手机号', '電話', '账号', '帳號', '用户名', '用戶名', 
              '邮箱', '郵箱', 'phone', 'Phone', 'username', 'Username', 
              'email', 'Email'
            ),
            inputType: fc.constantFrom('text', 'tel', 'email'),
            username: fc.string({ minLength: 5, maxLength: 20 })
          }),
          async ({ placeholder, inputType, username }) => {
            // Generate HTML with different username field formats
            const html = `
              <!DOCTYPE html>
              <html>
              <head><title>Login Page</title></head>
              <body>
                <form>
                  <input type="${inputType}" placeholder="${placeholder}" />
                  <input type="password" name="password" />
                  <button type="submit">登录</button>
                </form>
              </body>
              </html>
            `;

            // Create mock page object
            const mockPage = createMockPage(html, 'https://example.com/login');

            // Test: Should successfully fill username field
            await expect(loginHandler.fillUsername(mockPage, username)).resolves.not.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    test('should recognize username fields with different name attributes', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            nameAttr: fc.constantFrom('phone', 'mobile', 'username', 'email', 'account'),
            inputType: fc.constantFrom('text', 'tel', 'email'),
            username: fc.string({ minLength: 5, maxLength: 20 })
          }),
          async ({ nameAttr, inputType, username }) => {
            // Generate HTML with different name attributes
            const html = `
              <!DOCTYPE html>
              <html>
              <head><title>Login Page</title></head>
              <body>
                <form>
                  <input type="${inputType}" name="${nameAttr}" />
                  <input type="password" name="password" />
                  <button type="submit">登录</button>
                </form>
              </body>
              </html>
            `;

            // Create mock page object
            const mockPage = createMockPage(html, 'https://example.com/login');

            // Test: Should successfully fill username field
            await expect(loginHandler.fillUsername(mockPage, username)).resolves.not.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    test('should recognize username fields by input type', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            inputType: fc.constantFrom('tel', 'email'),
            username: fc.string({ minLength: 5, maxLength: 20 })
          }),
          async ({ inputType, username }) => {
            // Generate HTML with specific input types
            const html = `
              <!DOCTYPE html>
              <html>
              <head><title>Login Page</title></head>
              <body>
                <form>
                  <input type="${inputType}" />
                  <input type="password" name="password" />
                  <button type="submit">登录</button>
                </form>
              </body>
              </html>
            `;

            // Create mock page object
            const mockPage = createMockPage(html, 'https://example.com/login');

            // Test: Should successfully fill username field
            await expect(loginHandler.fillUsername(mockPage, username)).resolves.not.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ============================================================================
  // UNIT TESTS
  // ============================================================================

  describe('Unit Tests - needsLogin()', () => {
    test('should detect login page by URL containing "login"', async () => {
      const html = '<html><body><h1>Login</h1></body></html>';
      const mockPage = createMockPage(html, 'https://example.com/login');
      
      const result = await loginHandler.needsLogin(mockPage);
      expect(result).toBe(true);
    });

    test('should detect login page by password input field', async () => {
      const html = `
        <html><body>
          <form>
            <input type="text" name="username" />
            <input type="password" name="password" />
            <button>Submit</button>
          </form>
        </body></html>
      `;
      const mockPage = createMockPage(html, 'https://example.com/auth');
      
      const result = await loginHandler.needsLogin(mockPage);
      expect(result).toBe(true);
    });

    test('should detect login page by login button text', async () => {
      const html = `
        <html><body>
          <button>登录</button>
        </body></html>
      `;
      const mockPage = createMockPage(html, 'https://example.com/page');
      
      const result = await loginHandler.needsLogin(mockPage);
      expect(result).toBe(true);
    });

    test('should not detect regular page as login page', async () => {
      const html = `
        <html><body>
          <h1>Welcome</h1>
          <p>This is a regular page.</p>
        </body></html>
      `;
      const mockPage = createMockPage(html, 'https://example.com/home');
      
      const result = await loginHandler.needsLogin(mockPage);
      expect(result).toBe(false);
    });

    test('should handle errors gracefully and return false', async () => {
      const mockPage = {
        url: () => { throw new Error('Page error'); },
        $: () => { throw new Error('Selector error'); }
      };
      
      const result = await loginHandler.needsLogin(mockPage);
      expect(result).toBe(false);
    });
  });

  describe('Unit Tests - fillUsername()', () => {
    test('should fill username with phone placeholder', async () => {
      const html = `
        <html><body>
          <input type="text" placeholder="手机号" />
        </body></html>
      `;
      const mockPage = createMockPage(html, 'https://example.com/login');
      
      await expect(loginHandler.fillUsername(mockPage, '13800138000')).resolves.not.toThrow();
    });

    test('should fill username with email type input', async () => {
      const html = `
        <html><body>
          <input type="email" name="email" />
        </body></html>
      `;
      const mockPage = createMockPage(html, 'https://example.com/login');
      
      await expect(loginHandler.fillUsername(mockPage, 'user@example.com')).resolves.not.toThrow();
    });

    test('should throw error when no username field found', async () => {
      const html = '<html><body><p>No input fields</p></body></html>';
      const mockPage = createMockPage(html, 'https://example.com/login');
      
      await expect(loginHandler.fillUsername(mockPage, 'user')).rejects.toThrow('Could not find username input field');
    });
  });

  describe('Unit Tests - fillPassword()', () => {
    test('should fill password field', async () => {
      const html = `
        <html><body>
          <input type="password" name="password" />
        </body></html>
      `;
      const mockPage = createMockPage(html, 'https://example.com/login');
      
      await expect(loginHandler.fillPassword(mockPage, 'secret123')).resolves.not.toThrow();
    });

    test('should throw error when no password field found', async () => {
      const html = '<html><body><p>No password field</p></body></html>';
      const mockPage = createMockPage(html, 'https://example.com/login');
      
      await expect(loginHandler.fillPassword(mockPage, 'secret')).rejects.toThrow('Could not find password input field');
    });
  });

  describe('Unit Tests - clickLoginButton()', () => {
    test('should click login button with Chinese text', async () => {
      const html = `
        <html><body>
          <button>登录</button>
        </body></html>
      `;
      const mockPage = createMockPage(html, 'https://example.com/login');
      
      await expect(loginHandler.clickLoginButton(mockPage)).resolves.not.toThrow();
    });

    test('should click submit button', async () => {
      const html = `
        <html><body>
          <button type="submit">Submit</button>
        </body></html>
      `;
      const mockPage = createMockPage(html, 'https://example.com/login');
      
      await expect(loginHandler.clickLoginButton(mockPage)).resolves.not.toThrow();
    });

    test('should throw error when no login button found', async () => {
      const html = '<html><body><p>No buttons</p></body></html>';
      const mockPage = createMockPage(html, 'https://example.com/login');
      
      await expect(loginHandler.clickLoginButton(mockPage)).rejects.toThrow('Could not find login button');
    });
  });

  describe('Unit Tests - login()', () => {
    test('should return false on login failure', async () => {
      const html = '<html><body><p>No form</p></body></html>';
      const mockPage = createMockPage(html, 'https://example.com/login');
      
      const result = await loginHandler.login(mockPage, { username: 'user', password: 'pass' });
      expect(result).toBe(false);
    });
  });
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create a mock Playwright page object for testing
 * @param {string} html - HTML content
 * @param {string} url - Page URL
 * @returns {Object} Mock page object
 */
function createMockPage(html, url) {
  // Parse HTML to simulate DOM
  const elements = parseHTML(html);
  
  return {
    url: () => url,
    $: async (selector) => {
      // Find element matching selector
      const element = findElement(elements, selector);
      if (!element) return null;
      
      return {
        fill: async (value) => {
          element.value = value;
        },
        click: async () => {
          element.clicked = true;
        }
      };
    },
    locator: (selector) => {
      // Return a locator object
      return {
        first: () => ({
          count: async () => {
            const element = findElement(elements, selector);
            return element ? 1 : 0;
          },
          fill: async (value) => {
            const element = findElement(elements, selector);
            if (element) {
              element.value = value;
            }
          },
          click: async () => {
            const element = findElement(elements, selector);
            if (element) {
              element.clicked = true;
            }
          }
        }),
        count: async () => {
          const element = findElement(elements, selector);
          return element ? 1 : 0;
        }
      };
    },
    waitForTimeout: async (ms) => {
      // Mock timeout
      return Promise.resolve();
    },
    waitForNavigation: async (options) => {
      // Mock navigation
      return Promise.resolve();
    },
    waitForLoadState: async (state, options) => {
      // Mock load state
      return Promise.resolve();
    }
  };
}

/**
 * Simple HTML parser for testing
 * @param {string} html - HTML string
 * @returns {Array} Array of element objects
 */
function parseHTML(html) {
  const elements = [];
  
  // Extract input elements
  const inputRegex = /<input\s+([^>]+)>/gi;
  let match;
  while ((match = inputRegex.exec(html)) !== null) {
    const attrs = parseAttributes(match[1]);
    elements.push({ tag: 'input', attrs });
  }
  
  // Extract button elements
  const buttonRegex = /<button\s*([^>]*)>([^<]+)<\/button>/gi;
  while ((match = buttonRegex.exec(html)) !== null) {
    const attrs = parseAttributes(match[1]);
    const text = match[2];
    elements.push({ tag: 'button', attrs, text });
  }
  
  return elements;
}

/**
 * Parse HTML attributes
 * @param {string} attrString - Attribute string
 * @returns {Object} Attributes object
 */
function parseAttributes(attrString) {
  const attrs = {};
  const attrRegex = /(\w+)=["']([^"']+)["']/g;
  let match;
  while ((match = attrRegex.exec(attrString)) !== null) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

/**
 * Find element matching selector
 * @param {Array} elements - Array of elements
 * @param {string} selector - CSS selector
 * @returns {Object|null} Matching element or null
 */
function findElement(elements, selector) {
  // Handle input[type="..."] selectors
  const typeMatch = selector.match(/input\[type=["'](\w+)["']\]/);
  if (typeMatch) {
    const type = typeMatch[1];
    return elements.find(el => el.tag === 'input' && el.attrs.type === type);
  }
  
  // Handle input[name="..."] selectors
  const nameMatch = selector.match(/input\[name=["'](\w+)["']\]/);
  if (nameMatch) {
    const name = nameMatch[1];
    return elements.find(el => el.tag === 'input' && el.attrs.name === name);
  }
  
  // Handle input[placeholder*="..."] selectors
  const placeholderMatch = selector.match(/input\[placeholder\*=["']([^"']+)["']\]/);
  if (placeholderMatch) {
    const placeholder = placeholderMatch[1];
    return elements.find(el => 
      el.tag === 'input' && 
      el.attrs.placeholder && 
      el.attrs.placeholder.includes(placeholder)
    );
  }
  
  // Handle button:has-text("...") selectors
  const buttonTextMatch = selector.match(/button:has-text\(["']([^"']+)["']\)/);
  if (buttonTextMatch) {
    const text = buttonTextMatch[1];
    return elements.find(el => el.tag === 'button' && el.text && el.text.includes(text));
  }
  
  // Handle button[type="..."] selectors
  const buttonTypeMatch = selector.match(/button\[type=["'](\w+)["']\]/);
  if (buttonTypeMatch) {
    const type = buttonTypeMatch[1];
    return elements.find(el => el.tag === 'button' && el.attrs.type === type);
  }
  
  // Handle generic input[type="text"] selector
  if (selector === 'input[type="text"]') {
    return elements.find(el => el.tag === 'input' && el.attrs.type === 'text');
  }
  
  return null;
}
