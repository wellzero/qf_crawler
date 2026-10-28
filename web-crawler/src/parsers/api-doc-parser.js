import BaseParser from './base-parser.js';

/**
 * API Documentation Parser - 专门解析API文档页面
 * 匹配包含 /api/doc 的URL
 */
class ApiDocParser extends BaseParser {
  /**
   * 检查是否匹配API文档页面
   * @param {string} url - 页面URL
   * @returns {boolean} 是否匹配
   */
  matches(url, options = {}) {
    if (options.classification?.type === 'api_doc_page') {
      return true;
    }

    return /\/api\/doc/.test(url);
  }

  /**
   * 获取优先级
   * @returns {number} 优先级（专用解析器优先级较高）
   */
  getPriority() {
    return 100;
  }

  /**
   * 解析API文档页面
   * @param {Page} page - Playwright页面对象
   * @param {string} url - 页面URL
   * @param {Object} options - 解析选项
   * @returns {Promise<Object>} 解析后的页面数据
   */
  async parse(page, url, options = {}) {
    try {
      const title = await this.extractTitle(page);
      const briefDesc = await this.extractBriefDescription(page);
      const requestUrl = await this.extractRequestUrl(page);
      const requestMethod = await this.extractRequestMethod(page);
      const params = await this.extractParameters(page);
      const apiExamples = await this.extractApiExamples(page);
      const responseData = await this.extractResponseData(page);
      const tables = await this.extractTables(page);
      const codeBlocks = await this.extractCodeBlocks(page);

      return {
        type: 'api-doc',
        url,
        title,
        briefDesc,
        requestUrl,
        requestMethod,
        params,
        apiExamples,
        responseData,
        tables,
        codeBlocks
      };
    } catch (error) {
      console.error('Failed to parse API doc page:', error.message);
      return {
        type: 'api-doc',
        url,
        title: '',
        briefDesc: '',
        requestUrl: '',
        requestMethod: '',
        params: [],
        apiExamples: [],
        responseData: { description: '', table: [] },
        tables: [],
        codeBlocks: []
      };
    }
  }

  async extractBriefDescription(page) {
    try {
      const briefDesc = await page.evaluate(() => {
        const root = document.querySelector('main') || document.querySelector('[class*="doc"]') || 
                     document.querySelector('[class*="content"]') || document.querySelector('#app') || document.body;
        
        const briefEl = Array.from(root.querySelectorAll('p, div')).find((el) => 
          el.innerText.trim().startsWith('获取') && el.innerText.length < 500
        );
        if (briefEl) return briefEl.innerText.trim();

        const text = root.innerText || '';
        if (/简要描述/.test(text)) {
          const m = text.match(/简要描述[：:]\s*\n?([^\n]+(?:\n(?!请求URL)[^\n]+)*)/);
          if (m) return m[1].replace(/\s+/g, ' ').trim();
        }

        return '';
      });
      return briefDesc;
    } catch (error) {
      return '';
    }
  }

  async extractRequestUrl(page) {
    try {
      const requestUrl = await page.evaluate(() => {
        const root = document.querySelector('main') || document.querySelector('[class*="doc"]') || 
                     document.querySelector('[class*="content"]') || document.querySelector('#app') || document.body;
        
        const urlEl = root.querySelector('code, pre, [class*="url"]');
        if (urlEl) {
          const firstToken = urlEl.innerText.trim().split(/\s/)[0];
          if (/^https?:\/\//.test(firstToken) || /^\//.test(firstToken)) {
            return firstToken;
          }
        }

        const text = root.innerText || '';
        if (/请求URL/.test(text)) {
          const m = text.match(/请求URL[：:]\s*\n?([^\s\n]+)/);
          if (m) return m[1].trim();
        }

        return '';
      });
      return requestUrl;
    } catch (error) {
      return '';
    }
  }

  async extractRequestMethod(page) {
    try {
      const requestMethod = await page.evaluate(() => {
        const root = document.querySelector('main') || document.querySelector('[class*="doc"]') || 
                     document.querySelector('[class*="content"]') || document.querySelector('#app') || document.body;
        const text = root.innerText || '';
        
        if (/请求方式/.test(text)) {
          const m = text.match(/请求方式[：:]\s*\n?(\w+)/);
          if (m) return m[1].trim();
        }

        return '';
      });
      return requestMethod;
    } catch (error) {
      return '';
    }
  }

  async extractParameters(page) {
    try {
      const params = await page.evaluate(() => {
        const root = document.querySelector('main') || document.querySelector('[class*="doc"]') || 
                     document.querySelector('[class*="content"]') || document.querySelector('#app') || document.body;
        const params = [];
        const tables = root.querySelectorAll('table');
        
        for (const table of tables) {
          const rows = table.querySelectorAll('tr');
          if (rows.length < 2) continue;
          
          const header = (rows[0].innerText || '').toLowerCase();
          if (!header.includes('必选') && !header.includes('参数')) continue;
          
          for (let i = 1; i < rows.length; i++) {
            const cells = rows[i].querySelectorAll('td, th');
            if (cells.length < 2) continue;
            
            const name = (cells[0] && cells[0].innerText) ? cells[0].innerText.trim() : '';
            const required = (cells[1] && cells[1].innerText) ? cells[1].innerText.trim() : '';
            const type = (cells[2] && cells[2].innerText) ? cells[2].innerText.trim() : '';
            const desc = (cells[3] && cells[3].innerText) ? cells[3].innerText.trim() : 
                        (cells[2] && cells.length === 3 ? cells[2].innerText.trim() : '');
            
            if (name && !name.includes('参数名称')) {
              params.push({ name, required, type, desc });
            }
          }
          
          if (params.length > 0) break;
        }
        
        return params;
      });
      return params;
    } catch (error) {
      return [];
    }
  }

  async extractApiExamples(page) {
    try {
      const apiExamples = [];
      
      const buttons = await page.evaluate(() => 
        Array.from(document.querySelectorAll('button, a'))
          .map((el, index) => ({ text: el.textContent.trim(), index }))
          .filter(item => item.text.startsWith('获取'))
      );
      
      for (const btn of buttons) {
        try {
          await page.evaluate((btnText) => {
            const buttons = Array.from(document.querySelectorAll('button, a'));
            const targetBtn = buttons.find(b => b.textContent.trim() === btnText);
            if (targetBtn) targetBtn.click();
          }, btn.text);
          
          await page.waitForTimeout(1000);
          
          const code = await page.evaluate(() => {
            let codeEl = document.querySelector('textarea[class*="json"], textarea');
            if (!codeEl) {
              const allCode = Array.from(document.querySelectorAll('pre code, pre, code'));
              codeEl = allCode.find(el => {
                const text = (el.textContent || '').trim();
                return text.startsWith('{') && text.includes('"');
              });
            }
            
            if (codeEl) {
              return (codeEl.value || codeEl.textContent || codeEl.innerText || '').trim();
            }
            return '';
          });
          
          if (code && code.includes('{')) {
            apiExamples.push({ name: btn.text, code });
          }
        } catch (e) {
          // 忽略错误
        }
      }
      
      if (apiExamples.length === 0) {
        const textareaCode = await page.evaluate(() => {
          const textarea = document.querySelector('textarea');
          if (textarea) {
            const value = (textarea.value || '').trim();
            if (value && value.includes('{')) return value;
          }
          return '';
        });
        
        if (textareaCode) {
          apiExamples.push({ name: 'API示例', code: textareaCode });
        }
      }
      
      return apiExamples;
    } catch (error) {
      return [];
    }
  }

  async extractResponseData(page) {
    try {
      const responseData = await page.evaluate(() => {
        const root = document.querySelector('main') || document.querySelector('[class*="doc"]') || 
                     document.querySelector('[class*="content"]') || document.querySelector('#app') || document.body;
        const text = root.innerText || '';
        
        let responseDesc = '';
        const responseHeadings = ['返回数据说明', '返回说明', '响应数据', '响应说明', '返回数据'];
        for (const h of responseHeadings) {
          const re = new RegExp(h + '[：:]?\\s*\\n([\\s\\S]*?)(?=注意事项|API试用|$)', 'i');
          const m = text.match(re);
          if (m && m[1].trim()) {
            responseDesc = m[1].trim();
            break;
          }
        }
        
        const responseTable = [];
        const tables = root.querySelectorAll('table');
        for (const table of tables) {
          const rows = table.querySelectorAll('tr');
          if (rows.length < 2) continue;
          
          const header = (rows[0].innerText || '').toLowerCase();
          if (!header.includes('返回') && !header.includes('字段') && 
              !header.includes('响应') && !header.includes('参数名称')) continue;
          if (header.includes('必选') && !header.includes('返回')) continue;
          
          const headerCells = rows[0].querySelectorAll('th, td');
          const hasThreeCols = headerCells.length >= 3;
          
          for (let i = 1; i < rows.length; i++) {
            const cells = rows[i].querySelectorAll('td, th');
            if (cells.length < 2) continue;
            
            const name = (cells[0] && cells[0].innerText) ? cells[0].innerText.trim() : '';
            const type = (cells[1] && cells[1].innerText) ? cells[1].innerText.trim() : '';
            const desc = hasThreeCols && cells[2] ? cells[2].innerText.trim() : '';
            
            if (name && !name.includes('字段') && !name.includes('参数名称')) {
              responseTable.push({ name, type, desc });
            }
          }
          
          if (responseTable.length > 0) break;
        }
        
        if (responseDesc) {
          responseDesc = responseDesc
            .replace(/\n(API试用|获取指定|执行|返回数据:)[^\n]*/g, '')
            .replace(/参数名称\s+数据类型[\s\S]*/g, '')
            .trim();
        }
        
        return { description: responseDesc, table: responseTable };
      });
      
      return responseData;
    } catch (error) {
      return { description: '', table: [] };
    }
  }
}

export default ApiDocParser;
