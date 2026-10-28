import BaseParser from './base-parser.js';

/**
 * Massive API Parser - 专门解析 massive.com/docs API 文档页面
 * Massive 使用 Next.js SPA 架构，文档页面通过动态加载渲染
 * 支持 REST API、WebSocket、Flat Files 等多种文档类型
 */
class MassiveApiParser extends BaseParser {
  /**
   * 匹配 Massive API 文档页面
   * @param {string} url - 页面URL
   * @returns {boolean} 是否匹配
   */
  matches(url) {
    return /^https?:\/\/massive\.com\/docs/.test(url);
  }

  /**
   * 获取优先级
   * @returns {number} 优先级
   */
  getPriority() {
    return 100;
  }

  /**
   * 根据 URL 生成有意义的文件名
   * @param {string} url - 页面URL
   * @returns {string} 文件名
   */
  generateFilename(url) {
    try {
      const urlObj = new URL(url);
      let pathname = urlObj.pathname;
      // 移除 /docs 前缀
      pathname = pathname.replace(/^\/docs\/?/, '');
      pathname = pathname.replace(/\/$/, '');
      const filename = pathname.replace(/\//g, '_') || 'overview';
      return filename;
    } catch (e) {
      return 'api_doc';
    }
  }

  /**
   * 从 URL 提取文档路径
   * @param {string} url - 页面URL
   * @returns {string} 文档路径
   */
  extractDocPath(url) {
    try {
      const urlObj = new URL(url);
      let pathname = urlObj.pathname;
      // 移除 /docs 前缀
      pathname = pathname.replace(/^\/docs\/?/, '');
      return pathname;
    } catch (e) {
      return '';
    }
  }

  /**
   * 解析 Massive API 文档页面
   * @param {Page} page - Playwright页面对象
   * @param {string} url - 页面URL
   * @param {Object} options - 解析选项
   * @returns {Promise<Object>} 解析后的页面数据
   */
  async parse(page, url, options = {}) {
    try {
      // 等待 SPA 内容加载完成
      await this.waitForContent(page);

      // 从页面提取内容
      const data = await page.evaluate(() => {
        const result = {
          title: '',
          description: '',
          endpoint: '',
          method: 'GET',
          parameters: [],
          responseAttributes: [],
          requestBody: null,
          responses: [],
          codeExamples: [],
          rawContent: ''
        };

        // 获取主内容区域
        const mainContent = document.querySelector('main') ||
                           document.querySelector('[class*="content"]') ||
                           document.querySelector('article') ||
                           document.body;

        // 提取标题
        const h1 = mainContent.querySelector('h1');
        if (h1) {
          result.title = h1.textContent.trim();
        }

        // 提取描述（标题后的第一个段落或描述性div）
        const paragraphs = mainContent.querySelectorAll('p');
        for (const p of paragraphs) {
          const text = p.textContent.trim();
          if (text.length > 20 && !text.startsWith('Parameters') && !text.startsWith('Response')) {
            result.description = text;
            break;
          }
        }

        // 如果没有找到段落描述，尝试查找描述性 div
        if (!result.description) {
          const descDivs = mainContent.querySelectorAll('[class~="text-base"], [class*="text-base"]');
          for (const div of descDivs) {
            const text = div.textContent.trim();
            // 描述通常是50-400字符的文本，不包含特殊关键词
            if (text.length > 50 && text.length < 500 &&
                !text.includes('Parameters') && !text.includes('Response') &&
                !text.includes('Docs Home') && !text.includes('Create account') &&
                !text.includes('.csv.gz') && !text.includes('File Browser') &&
                !div.querySelector('input') && !div.querySelector('button')) {
              result.description = text;
              break;
            }
          }
        }

        // 查找 API endpoint 和 method
        const codeBlocks = mainContent.querySelectorAll('pre, code, [class*="code"]');
        for (const block of codeBlocks) {
          const text = block.textContent.trim();
          // 匹配 HTTP 方法 + URL 格式
          const methodMatch = text.match(/^(GET|POST|PUT|DELETE|PATCH)\s+(\/[^\s\n]+)/im);
          if (methodMatch) {
            result.method = methodMatch[1];
            result.endpoint = methodMatch[2];
            break;
          }
          // 匹配纯 URL 路径
          if (!result.endpoint && text.match(/^\/v\d+\/[^\s\n]+/m)) {
            const urlMatch = text.match(/^(\/v\d+\/[^\s\n]+)/m);
            if (urlMatch) {
              result.endpoint = urlMatch[1];
            }
          }
        }

        // 使用改进的方法提取参数
        // 找到 Query Parameters 和 Response Attributes 的标题位置
        const allDivs = mainContent.querySelectorAll('div');
        let responseStartIndex = -1;
        let queryStartIndex = -1;
        let hasQueryParams = false;
        let hasResponseAttrs = false;

        for (let i = 0; i < allDivs.length; i++) {
          const text = allDivs[i].textContent.trim();
          if (text === 'Query Parameters') {
            queryStartIndex = i;
            hasQueryParams = true;
          }
          if (text === 'Response Attributes') {
            responseStartIndex = i;
            hasResponseAttrs = true;
          }
        }

        // 只有当页面有 Query Parameters 或 Response Attributes 标题时才提取参数
        // 避免把 Flat Files 页面的文件链接当作参数
        if (hasQueryParams || hasResponseAttrs) {
          // 提取所有参数名
          const allNames = mainContent.querySelectorAll('.font-mono.font-bold');
          const responseTitleDiv = allDivs[responseStartIndex];

          allNames.forEach(nameEl => {
            // 判断是在 Response Attributes 之前还是之后
            const isInResponse = responseTitleDiv && nameEl.compareDocumentPosition(responseTitleDiv) & Node.DOCUMENT_POSITION_PRECEDING;

            // 找到包含此参数的容器
            const container = nameEl.closest('[class*="border-gray-200"]') || nameEl.closest('[class*="border"]');

            // 提取类型
            const typeEl = container?.querySelector('[class*="rounded-xl"][class*="border-gray-200"]') ||
                           container?.querySelector('[class*="rounded-xl"]');

            // 提取描述
            let description = '';
            const descContainer = container?.querySelector('.text-gray-500:not([class*="rounded"])');
            if (descContainer) {
              const firstDiv = descContainer.querySelector('div');
              description = firstDiv ? firstDiv.textContent.trim() : descContainer.textContent.trim();
            }

            const param = {
              name: nameEl.textContent.trim(),
              type: typeEl?.textContent?.trim() || '',
              required: false,
              description: description
            };

            if (isInResponse) {
              result.responseAttributes.push(param);
            } else {
              result.parameters.push(param);
            }
          });
        }

        // 提取代码示例
        const preElements = mainContent.querySelectorAll('pre');
        for (const pre of preElements) {
          const code = pre.textContent.trim();
          if (code.length < 10) continue;

          let language = 'text';
          const classList = pre.className || '';

          // 检测语言
          if (classList.includes('json') || code.startsWith('{') || code.startsWith('[')) {
            language = 'json';
          } else if (classList.includes('python') || code.includes('import ') || code.includes('def ')) {
            language = 'python';
          } else if (classList.includes('javascript') || code.includes('const ') || code.includes('fetch(')) {
            language = 'javascript';
          } else if (classList.includes('curl') || code.startsWith('curl ')) {
            language = 'bash';
          } else if (classList.includes('typescript') || code.includes(': string') || code.includes(': number')) {
            language = 'typescript';
          }

          // 检测示例类型
          let exampleType = 'code';
          if (code.startsWith('curl ') || code.includes('fetch(')) {
            exampleType = 'request';
          } else if (code.startsWith('{') && code.includes('"status"')) {
            exampleType = 'response';
          } else if (code.includes('wss://') || code.includes('WebSocket')) {
            exampleType = 'websocket';
          }

          result.codeExamples.push({
            language,
            code,
            type: exampleType
          });
        }

        // 提取原始内容（用于 Markdown 生成）
        result.rawContent = mainContent.innerText;

        return result;
      });

      return {
        type: 'massive-api',
        url,
        title: data.title,
        description: data.description,
        requestMethod: data.method,
        endpoint: data.endpoint,
        parameters: data.parameters,
        responseAttributes: data.responseAttributes,
        requestBody: data.requestBody,
        responses: data.responses,
        codeExamples: data.codeExamples,
        rawContent: data.rawContent,
        suggestedFilename: this.generateFilename(url)
      };
    } catch (error) {
      console.error('Failed to parse Massive API doc page:', error.message);
      return {
        type: 'massive-api',
        url,
        title: '',
        description: '',
        requestMethod: '',
        endpoint: '',
        parameters: [],
        responseAttributes: [],
        requestBody: null,
        responses: [],
        codeExamples: [],
        rawContent: '',
        suggestedFilename: this.generateFilename(url)
      };
    }
  }

  /**
   * 等待 SPA 内容加载完成
   */
  async waitForContent(page) {
    try {
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
      // 等待主内容区域出现
      await page.waitForSelector('main, article, [class*="content"]', { timeout: 15000 });
      // 额外等待动态内容
      await page.waitForTimeout(2000);
    } catch (error) {
      console.warn('Wait for content timeout, proceeding anyway:', error.message);
    }
  }
}

export default MassiveApiParser;